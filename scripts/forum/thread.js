import { getSupabase, FORUM_CONFIG } from './config.js';
import { getCurrentProfile, isAuthenticated, showAuthModal } from './auth.js';
import { setupImageUploadHandler, setupPasteUpload } from './uploader.js';

let currentThread = null;
let currentPage = 1;
let currentSort = 'oldest';
let realtimeChannel = null;

// Initialize thread page
async function initThread() {
  const urlParams = new URLSearchParams(window.location.search);
  const threadId = urlParams.get('id');

  if (!threadId) {
    window.location.href = '/forum';
    return;
  }

  await loadThread(threadId);
  await loadReplies();
  await incrementViewCount(threadId);
  await loadThreadInfo();
  await loadCategoryNav();
  initEditModals(); // Initialize edit modals ONCE
  setupReplyForm();
  setupSort();
  setupActionButtons();
  setupRealtime(threadId);
}

// Load thread
async function loadThread(threadId) {
  const supabase = await getSupabase();

  const { data: thread, error } = await supabase
    .from('threads')
    .select(`
      *,
      profiles:author_id (id, username, avatar_url, role, reputation, post_count),
      categories (name, slug),
      thread_tags (
        tags (name, slug, color)
      )
    `)
    .eq('id', threadId)
    .single();

  if (error || !thread) {
    console.error('Error loading thread:', error);
    window.location.href = '/forum';
    return;
  }

  currentThread = thread;

  // Update breadcrumbs
  const categoryBreadcrumb = document.getElementById('categoryBreadcrumb');
  categoryBreadcrumb.textContent = thread.categories.name;
  categoryBreadcrumb.href = `/category.html?slug=${thread.categories.slug}`;
  document.getElementById('threadBreadcrumb').textContent = thread.title;
  const categoryQuickLink = document.getElementById('threadCategoryLink');
  if (categoryQuickLink) {
    categoryQuickLink.href = `/category.html?slug=${thread.categories.slug}`;
    const label = categoryQuickLink.querySelector('span');
    if (label) {
      label.textContent = `View ${thread.categories.name}`;
    }
  }

  // Update page title
  document.title = `${thread.title} - T7Mods Forum`;

  // Render thread header
  const headerContainer = document.getElementById('threadHeader');
  const tags = thread.thread_tags?.map(tt => tt.tags).filter(Boolean) || [];
  
  headerContainer.innerHTML = `
    <h1>${escapeHtml(thread.title)}</h1>
    <div class="thread-header-meta">
      <span class="post-time">
        <i class="fas fa-clock"></i>
        ${formatDate(thread.created_at)}
      </span>
      <span class="post-status ${thread.status}">
        ${getStatusIcon(thread.status)} ${thread.status}
      </span>
      ${thread.is_pinned ? '<span class="pinned-badge"><i class="fas fa-thumbtack"></i> Pinned</span>' : ''}
    </div>
    ${tags.length > 0 ? `
      <div class="thread-header-tags">
        ${tags.map(tag => `
          <span class="thread-tag" style="border-color: ${tag.color}; color: ${tag.color}">
            ${tag.name}
          </span>
        `).join('')}
      </div>
    ` : ''}
  `;

  // Render author card (right sidebar)
  const authorCard = document.getElementById('threadAuthorCard');
  authorCard.innerHTML = `
    <img src="${getAvatarUrl(thread.profiles.avatar_url, thread.profiles.username)}" 
         alt="${thread.profiles.username}" 
         class="avatar-large">
    <div class="author-name">${thread.profiles.username}</div>
    ${thread.profiles.role !== 'user' ? `<div class="author-role">${thread.profiles.role}</div>` : ''}
    <div class="author-stats">
      <div class="author-stat">
        <span class="author-stat-value">${thread.profiles.reputation || 0}</span>
        <span>Reputation</span>
      </div>
    </div>
  `;

  const viewerProfile = getCurrentProfile();
  const isAuthor = viewerProfile && viewerProfile.id === thread.author_id;
  const canModerate = viewerProfile && ['admin', 'moderator'].includes(viewerProfile.role);
  const isAdmin = viewerProfile && viewerProfile.role === 'admin';
  const canEdit = isAuthor || canModerate;

  if (viewerProfile) {
    document.getElementById('subscribeBtn').style.display = 'flex';
  }
  if (canEdit) {
    document.getElementById('markSolvedBtn').style.display = 'flex';
    document.getElementById('editThreadBtn').style.display = 'flex';
  }
  if (isAuthor || isAdmin) {
    document.getElementById('deleteThreadBtn').style.display = 'flex';
  }
  const pinBtn = document.getElementById('pinThreadBtn');
  if (isAdmin && pinBtn) {
    pinBtn.style.display = 'flex';
    pinBtn.classList.toggle('pinned', !!thread.is_pinned);
    pinBtn.innerHTML = thread.is_pinned
      ? '<i class="fas fa-thumbtack"></i> Unpin Thread'
      : '<i class="fas fa-thumbtack"></i> Pin Thread';
  } else if (pinBtn) {
    pinBtn.style.display = 'none';
  }

  // Render original post
  const container = document.getElementById('originalPost');
  container.innerHTML = `
    <div class="post-sidebar">
      <img src="${getAvatarUrl(thread.profiles.avatar_url, thread.profiles.username)}" 
           alt="${thread.profiles.username}" 
           class="avatar-large">
      <div class="post-author-name">${thread.profiles.username}</div>
      ${thread.profiles.role !== 'user' ? `<div class="post-author-role">${thread.profiles.role}</div>` : ''}
      <div class="post-author-stats">
        <div class="post-author-stat">
          <span class="label">Posts</span>
          <span class="value">${thread.profiles.post_count || 0}</span>
        </div>
        <div class="post-author-stat">
          <span class="label">Rep</span>
          <span class="value">${thread.profiles.reputation || 0}</span>
        </div>
      </div>
    </div>
    <div class="post-content-area">
      <div class="post-header">
        <div class="post-meta">
          <span class="post-time">
            <i class="fas fa-clock"></i>
            ${formatDate(thread.created_at)}
          </span>
        </div>
      </div>
      
      <div class="post-content markdown-content">
        ${marked.parse(thread.content)}
      </div>

      <div class="post-actions">
        <button class="post-action-btn like-btn" data-type="thread" data-id="${thread.id}">
          <i class="fas fa-heart"></i>
          <span class="like-count">${await getLikeCount('thread', thread.id)}</span>
        </button>
        <button class="post-action-btn reply-btn">
          <i class="fas fa-reply"></i>
          Reply
        </button>
        ${canEdit ? `
          <button class="post-action-btn edit-btn">
            <i class="fas fa-edit"></i>
            Edit
          </button>
        ` : ''}
        <button class="post-action-btn share-btn">
          <i class="fas fa-share"></i>
          Share
        </button>
      </div>
    </div>
  `;

  // Setup action buttons
  setupPostActions();

  // Show reply form if authenticated
  if (isAuthenticated()) {
    document.getElementById('replyFormContainer').style.display = 'block';
  }

  // Syntax highlighting
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
}

// Load replies
async function loadReplies() {
  if (!currentThread) return;

  const supabase = await getSupabase();
  const container = document.getElementById('repliesContainer');

  let query = supabase
    .from('posts')
    .select(`
      *,
      profiles:author_id (id, username, avatar_url, role, reputation, post_count)
    `, { count: 'exact' })
    .eq('thread_id', currentThread.id);

  // Apply sorting
  switch (currentSort) {
    case 'oldest':
      query = query.order('created_at', { ascending: true });
      break;
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'most_liked':
      // We'll sort by like count client-side for now
      query = query.order('created_at', { ascending: true });
      break;
  }

  // Apply pagination
  const start = (currentPage - 1) * FORUM_CONFIG.postsPerPage;
  const end = start + FORUM_CONFIG.postsPerPage - 1;
  query = query.range(start, end);

  const { data: replies, error, count } = await query;

  if (error) {
    console.error('Error loading replies:', error);
    container.innerHTML = '<p class="error-message">Failed to load replies</p>';
    return;
  }

  document.getElementById('replyCount').textContent = count || 0;

  if (replies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-comments"></i>
        <p>No replies yet. Be the first to respond!</p>
      </div>
    `;
    return;
  }

  // Render replies
  const profile = getCurrentProfile();
  container.innerHTML = await Promise.all(replies.map(async reply => {
    const isAuthor = profile && profile.id === reply.author_id;
    const canModerate = profile && ['admin', 'moderator'].includes(profile.role);
    const canEdit = isAuthor || canModerate;
    const canDelete = (profile && profile.role === 'admin') || isAuthor;
    const likeCount = await getLikeCount('post', reply.id);

    return `
      <div class="thread-post" data-post-id="${reply.id}" data-author-id="${reply.author_id}">
        <div class="post-sidebar">
          <img src="${getAvatarUrl(reply.profiles.avatar_url, reply.profiles.username)}" 
               alt="${reply.profiles.username}" 
               class="avatar-large">
          <div class="post-author-name">${reply.profiles.username}</div>
          ${reply.profiles.role !== 'user' ? `<div class="post-author-role">${reply.profiles.role}</div>` : ''}
          <div class="post-author-stats">
            <div class="post-author-stat">
              <span class="label">Posts</span>
              <span class="value">${reply.profiles.post_count || 0}</span>
            </div>
            <div class="post-author-stat">
              <span class="label">Rep</span>
              <span class="value">${reply.profiles.reputation || 0}</span>
            </div>
          </div>
        </div>
        <div class="post-content-area">
          <div class="post-header">
            <div class="post-meta">
              <span class="post-time">
                <i class="fas fa-clock"></i>
                ${formatDate(reply.created_at)}
              </span>
            </div>
            ${reply.is_solution ? '<span class="solution-badge"><i class="fas fa-check"></i> Solution</span>' : ''}
          </div>
          <div class="post-content markdown-content">
            ${marked.parse(reply.content)}
          </div>
          <div class="post-actions">
            <button class="post-action-btn like-btn ${await isLiked('post', reply.id) ? 'liked' : ''}" 
                    data-type="post" data-id="${reply.id}">
              <i class="fas fa-heart"></i>
              <span class="like-count">${likeCount}</span>
            </button>
            ${canEdit ? `
              <button class="post-action-btn edit-btn" data-post-id="${reply.id}">
                <i class="fas fa-edit"></i>
                Edit
              </button>
            ` : ''}
            ${profile && (profile.id === currentThread.author_id || profile.role === 'admin') && !reply.is_solution ? `
              <button class="post-action-btn solution-btn" data-post-id="${reply.id}">
                <i class="fas fa-check"></i>
                Mark as Solution
              </button>
            ` : ''}
            <button class="post-action-btn quote-btn" data-post-id="${reply.id}">
              <i class="fas fa-quote-left"></i>
              Quote
            </button>
            ${canDelete ? `
              <button class="post-action-btn danger delete-reply-btn" data-post-id="${reply.id}">
                <i class="fas fa-trash"></i>
                Delete
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  })).then(htmlArray => htmlArray.join(''));

  // Setup pagination
  setupPagination(count);

  // Setup action buttons
  setupPostActions();

  // Syntax highlighting
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
}

// Setup reply form
function setupReplyForm() {
  const form = document.getElementById('replyForm');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    await handleReply();
  };

  // Reply button in original post
  document.addEventListener('click', (e) => {
    if (e.target.closest('.reply-btn')) {
      if (!isAuthenticated()) {
        showAuthModal('login');
        return;
      }
      document.getElementById('replyContent').focus();
      window.scrollTo({
        top: document.getElementById('replyFormContainer').offsetTop - 80,
        behavior: 'smooth'
      });
    }
  });

  // Setup editor toolbar
  document.querySelectorAll('.editor-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      const textarea = document.getElementById('replyContent');
      handleEditorAction(action, textarea);
    };
  });

  // Setup image upload
  setupImageUploadHandler('replyImageUpload', 'replyContent');
  setupPasteUpload('replyContent');

  // Preview button
  const previewBtn = document.getElementById('replyPreviewBtn');
  if (previewBtn) {
    previewBtn.onclick = showReplyPreview;
  }
}

// Handle reply submission
async function handleReply() {
  const supabase = await getSupabase();
  const profile = getCurrentProfile();

  if (!isAuthenticated()) {
    showAuthModal('login');
    return;
  }

  const content = document.getElementById('replyContent').value.trim();
  
  if (!content) {
    alert('Please write a reply');
    return;
  }

  // Create post
  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      content,
      author_id: profile.id,
      thread_id: currentThread.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating post:', error);
    alert('Failed to post reply');
    return;
  }

  // Clear form
  document.getElementById('replyForm').reset();

  // Reload replies
  await loadReplies();

  // Scroll to new post
  setTimeout(() => {
    const newPost = document.querySelector(`[data-post-id="${post.id}"]`);
    if (newPost) {
      newPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
      newPost.classList.add('highlight');
      setTimeout(() => newPost.classList.remove('highlight'), 2000);
    }
  }, 100);

  // Create notification for thread author
  if (currentThread.author_id !== profile.id) {
    await supabase.from('notifications').insert({
      user_id: currentThread.author_id,
      type: 'reply',
      content: `${profile.username} replied to your thread "${currentThread.title}"`,
      thread_id: currentThread.id,
      post_id: post.id,
      from_user_id: profile.id,
    });
  }
}

// Setup post actions (likes, edit, etc.)
function setupPostActions() {
  // Like buttons
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!isAuthenticated()) {
        showAuthModal('login');
        return;
      }
      await handleLike(btn);
    });
  });

  // Edit buttons
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const postId = btn.dataset.postId;
      if (postId) {
        handleEditReply(postId);
      } else {
        handleEditThread();
      }
    });
  });

  // Share button
  document.querySelectorAll('.share-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    });
  });

  // Solution buttons
  document.querySelectorAll('.solution-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await markAsSolution(btn.dataset.postId);
    });
  });

  // Quote buttons
  document.querySelectorAll('.quote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.dataset.postId;
      handleQuote(postId);
    });
  });

  document.querySelectorAll('.delete-reply-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.postId;
      await handleDeleteReply(postId);
    });
  });
}

// Handle like
async function handleLike(btn) {
  const supabase = await getSupabase();
  const profile = getCurrentProfile();
  const type = btn.dataset.type; // 'thread' or 'post'
  const id = btn.dataset.id;

  const isCurrentlyLiked = btn.classList.contains('liked');

  if (isCurrentlyLiked) {
    // Unlike
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', profile.id)
      .eq(`${type}_id`, id);

    if (!error) {
      btn.classList.remove('liked');
      const countSpan = btn.querySelector('.like-count');
      countSpan.textContent = parseInt(countSpan.textContent) - 1;
    }
  } else {
    // Like
    const likeData = {
      user_id: profile.id,
    };
    likeData[`${type}_id`] = id;

    const { error } = await supabase
      .from('likes')
      .insert(likeData);

    if (!error) {
      btn.classList.add('liked');
      const countSpan = btn.querySelector('.like-count');
      countSpan.textContent = parseInt(countSpan.textContent) + 1;

      // Create notification
      const authorId = type === 'thread' ? currentThread.author_id : 
        document.querySelector(`[data-post-id="${id}"]`)?.dataset.authorId;
      
      if (authorId && authorId !== profile.id) {
        await supabase.from('notifications').insert({
          user_id: authorId,
          type: 'like',
          content: `${profile.username} liked your ${type}`,
          thread_id: currentThread.id,
          post_id: type === 'post' ? id : null,
          from_user_id: profile.id,
        });
      }
    }
  }
}

// Get like count
async function getLikeCount(type, id) {
  const supabase = await getSupabase();
  
  const { count } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq(`${type}_id`, id);

  return count || 0;
}

// Check if user has liked
async function isLiked(type, id) {
  const profile = getCurrentProfile();
  if (!profile) return false;

  const supabase = await getSupabase();
  
  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('user_id', profile.id)
    .eq(`${type}_id`, id)
    .single();

  return !!data;
}

// Mark post as solution
async function markAsSolution(postId) {
  const supabase = await getSupabase();

  // Remove existing solution
  await supabase
    .from('posts')
    .update({ is_solution: false })
    .eq('thread_id', currentThread.id);

  // Mark new solution
  const { error } = await supabase
    .from('posts')
    .update({ is_solution: true })
    .eq('id', postId);

  if (error) {
    console.error('Error marking solution:', error);
    alert('Failed to mark as solution');
    return;
  }

  // Update thread status
  await supabase
    .from('threads')
    .update({ status: 'solved' })
    .eq('id', currentThread.id);

  // Reload page
  window.location.reload();
}

// Increment view count
async function incrementViewCount(threadId) {
  const supabase = await getSupabase();
  
  // Simple increment - in production, you'd want to track unique views
  await supabase.rpc('increment_view_count', { thread_id: threadId });
}

// Load thread info stats
async function loadThreadInfo() {
  if (!currentThread) return;
  
  const container = document.getElementById('threadInfoStats');
  if (!container) return;
  
  container.innerHTML = `
    <div class="thread-info-item">
      <span class="label"><i class="fas fa-eye"></i> Views</span>
      <span class="value">${currentThread.view_count || 0}</span>
    </div>
    <div class="thread-info-item">
      <span class="label"><i class="fas fa-reply"></i> Replies</span>
      <span class="value">${currentThread.reply_count || 0}</span>
    </div>
    <div class="thread-info-item">
      <span class="label"><i class="fas fa-calendar"></i> Created</span>
      <span class="value">${formatDateShort(currentThread.created_at)}</span>
    </div>
    <div class="thread-info-item">
      <span class="label"><i class="fas fa-clock"></i> Updated</span>
      <span class="value">${formatDateShort(currentThread.last_activity || currentThread.created_at)}</span>
    </div>
  `;
}

// Load category navigation
async function loadCategoryNav() {
  if (!currentThread) return;
  
  const supabase = await getSupabase();
  const container = document.getElementById('categoryNav');
  
  if (!container) return;
  
  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name, slug, icon')
      .order('position', { ascending: true });

    if (error || !categories || categories.length === 0) {
      container.innerHTML = '<p class="empty-message">No categories</p>';
      return;
    }

    container.innerHTML = categories.map(cat => `
      <a href="/category.html?slug=${cat.slug}" 
         class="category-nav-item ${currentThread.category_id === cat.id ? 'active' : ''}">
        <div class="name">
          <i class="fas ${cat.icon || 'fa-folder'}"></i>
          <span>${cat.name}</span>
        </div>
      </a>
    `).join('');
  } catch (error) {
    console.error('Error loading category nav:', error);
  }
}

// Setup real-time updates
async function setupRealtime(threadId) {
  const supabase = await getSupabase();

  realtimeChannel = supabase
    .channel('thread-' + threadId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'posts',
      filter: `thread_id=eq.${threadId}`,
    }, () => {
      // Reload replies when new post is added
      loadReplies();
    })
    .subscribe();
}

// Setup sort
function setupSort() {
  const sortSelect = document.getElementById('sortReplies');
  if (!sortSelect) return;

  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    currentPage = 1;
    loadReplies();
  });
}

// Setup pagination
function setupPagination(totalCount) {
  const container = document.getElementById('pagination');
  if (!container) return;

  const totalPages = Math.ceil(totalCount / FORUM_CONFIG.postsPerPage);
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="pagination-buttons">';
  
  if (currentPage > 1) {
    html += `<button class="pagination-btn" data-page="${currentPage - 1}">
      <i class="fas fa-chevron-left"></i> Previous
    </button>`;
  }

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">
        ${i}
      </button>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<span class="pagination-ellipsis">...</span>';
    }
  }

  if (currentPage < totalPages) {
    html += `<button class="pagination-btn" data-page="${currentPage + 1}">
      Next <i class="fas fa-chevron-right"></i>
    </button>`;
  }

  html += '</div>';
  container.innerHTML = html;

  document.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      loadReplies();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// Editor actions
function handleEditorAction(action, textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  let replacement = '';

  switch (action) {
    case 'bold':
      replacement = `**${selectedText || 'bold text'}**`;
      break;
    case 'italic':
      replacement = `*${selectedText || 'italic text'}*`;
      break;
    case 'heading':
      replacement = `## ${selectedText || 'Heading'}`;
      break;
    case 'code':
      if (selectedText.includes('\n')) {
        replacement = `\`\`\`\n${selectedText || 'code'}\n\`\`\``;
      } else {
        replacement = `\`${selectedText || 'code'}\``;
      }
      break;
    case 'link':
      const url = prompt('Enter URL:');
      if (url) {
        replacement = `[${selectedText || 'link text'}](${url})`;
      }
      break;
    case 'image':
      document.getElementById('replyImageUpload').click();
      return;
  }

  textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.focus();
}

// Show reply preview
function showReplyPreview() {
  const content = document.getElementById('replyContent').value;
  const modal = document.getElementById('previewModal');
  const previewContent = document.getElementById('previewContent');
  
  if (!modal || !previewContent) return;

  previewContent.innerHTML = marked.parse(content);
  modal.style.display = 'flex';

  const closeBtn = modal.querySelector('.modal-close');
  closeBtn.onclick = () => {
    modal.style.display = 'none';
  };

  window.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  };

  // Syntax highlighting
  if (window.hljs) {
    previewContent.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
}

// Helper functions
function getStatusIcon(status) {
  const icons = {
    'open': '<i class="fas fa-circle"></i>',
    'solved': '<i class="fas fa-check-circle"></i>',
    'closed': '<i class="fas fa-lock"></i>',
    'wip': '<i class="fas fa-wrench"></i>',
    'release': '<i class="fas fa-download"></i>',
  };
  return icons[status] || icons.open;
}

function getAvatarUrl(avatarUrl, username) {
  if (avatarUrl) return avatarUrl;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=7dd3fc&color=0a0a0a&size=128`;
}

function getRoleBadge(role) {
  const badges = {
    'admin': '<span class="role-badge admin">Admin</span>',
    'moderator': '<span class="role-badge moderator">Mod</span>',
    'verified_modder': '<span class="role-badge verified">Verified</span>',
  };
  return badges[role] || '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function formatDateShort(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}

// Handle edit thread modal population
function handleEditThread() {
  if (!currentThread) {
    alert('Thread data not loaded yet.');
    return;
  }

  const modal = document.getElementById('editThreadModal');
  const titleInput = document.getElementById('editThreadTitle');
  const contentInput = document.getElementById('editThreadContent');

  if (!modal || !titleInput || !contentInput) {
    alert('Unable to open edit form.');
    return;
  }

  titleInput.value = currentThread.title;
  contentInput.value = currentThread.content;
  modal.style.display = 'flex';
}

async function handleEditReply(postId) {
  const supabase = await getSupabase();

  const { data: reply, error } = await supabase
    .from('posts')
    .select('content')
    .eq('id', postId)
    .single();

  if (error || !reply) {
    alert('Failed to load reply: ' + (error?.message || 'Not found'));
    return;
  }

  const modal = document.getElementById('editReplyModal');
  const contentInput = document.getElementById('editReplyContent');
  const idInput = document.getElementById('editReplyId');

  if (!modal || !contentInput || !idInput) {
    alert('Unable to open reply editor.');
    return;
  }

  idInput.value = postId;
  contentInput.value = reply.content;
  modal.style.display = 'flex';
}

async function handleDeleteReply(postId) {
  if (!postId) return;

  const profile = getCurrentProfile();
  if (!profile) {
    showAuthModal('login');
    return;
  }

  const postElement = document.querySelector(`[data-post-id="${postId}"]`);
  const authorId = postElement?.dataset.authorId;

  if (profile.role !== 'admin' && profile.id !== authorId) {
    alert('You do not have permission to delete this reply.');
    return;
  }

  if (!confirm('Delete this reply? This cannot be undone.')) {
    return;
  }

  const supabase = await getSupabase();
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  if (error) {
    console.error('Error deleting reply:', error);
    alert('Failed to delete reply: ' + error.message);
    return;
  }

  await loadReplies();
  await loadThread(currentThread.id);
  setupActionButtons();
}

function initEditModals() {
  const editThreadForm = document.getElementById('editThreadForm');
  const editThreadModal = document.getElementById('editThreadModal');
  const cancelThreadBtn = document.getElementById('cancelEditThread');
  const closeThreadBtn = document.getElementById('editThreadModalClose');

  if (editThreadForm) {
    editThreadForm.onsubmit = async (event) => {
      event.preventDefault();
      const title = document.getElementById('editThreadTitle')?.value.trim() || '';
      const content = document.getElementById('editThreadContent')?.value.trim() || '';

      if (!title || !content) {
        alert('Please fill in all fields.');
        return false;
      }

      await updateThread(title, content);
      return false;
    };
  }

  const closeThreadModal = () => {
    if (editThreadModal) editThreadModal.style.display = 'none';
  };

  if (cancelThreadBtn) cancelThreadBtn.onclick = closeThreadModal;
  if (closeThreadBtn) closeThreadBtn.onclick = closeThreadModal;

  const editReplyForm = document.getElementById('editReplyForm');
  const editReplyModal = document.getElementById('editReplyModal');
  const cancelReplyBtn = document.getElementById('cancelEditReply');
  const closeReplyBtn = document.getElementById('editReplyModalClose');

  if (editReplyForm) {
    editReplyForm.onsubmit = async (event) => {
      event.preventDefault();
      const postId = document.getElementById('editReplyId')?.value;
      const content = document.getElementById('editReplyContent')?.value.trim() || '';

      if (!content) {
        alert('Please enter reply content.');
        return false;
      }

      await updateReply(postId, content);
      return false;
    };
  }

  const closeReplyModal = () => {
    if (editReplyModal) editReplyModal.style.display = 'none';
  };

  if (cancelReplyBtn) cancelReplyBtn.onclick = closeReplyModal;
  if (closeReplyBtn) closeReplyBtn.onclick = closeReplyModal;
}

async function updateThread(title, content) {
  if (!currentThread) {
    alert('Thread data not loaded yet.');
    return;
  }

  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      showAuthModal('login');
      return;
    }

    const viewerProfile = getCurrentProfile();
    if (user.id !== currentThread.author_id && viewerProfile?.role !== 'admin') {
      alert('You can only edit your own threads unless you are an admin.');
      return;
    }

    const { error } = await supabase
      .from('threads')
      .update({ title, content })
      .eq('id', currentThread.id);

    if (error) throw error;

    const modal = document.getElementById('editThreadModal');
    if (modal) modal.style.display = 'none';

    await loadThread(currentThread.id);
    await loadReplies();
    setupActionButtons();
  } catch (error) {
    console.error('Error updating thread:', error);
    alert('Failed to update thread: ' + error.message);
  }
}

async function updateReply(postId, content) {
  if (!postId) {
    alert('Reply not found.');
    return;
  }

  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      showAuthModal('login');
      return;
    }

    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      alert('Unable to load reply for editing.');
      return;
    }

    const viewerProfile = getCurrentProfile();
    if (user.id !== post.author_id && viewerProfile?.role !== 'admin') {
      alert('You can only edit your own replies unless you are an admin.');
      return;
    }

    const { error } = await supabase
      .from('posts')
      .update({ content })
      .eq('id', postId);

    if (error) throw error;

    const modal = document.getElementById('editReplyModal');
    if (modal) modal.style.display = 'none';

    await loadReplies();
    setupActionButtons();
  } catch (error) {
    console.error('Error updating reply:', error);
    alert('Failed to update reply: ' + error.message);
  }
}

function handleQuote(postId) {
  const postElement = document.querySelector(`[data-post-id="${postId}"]`);
  if (!postElement) return;

  const contentElement = postElement.querySelector('.post-content');
  const authorElement = postElement.querySelector('.post-author-name');

  if (!contentElement || !authorElement) return;

  const author = authorElement.textContent.trim();
  const content = contentElement.textContent.trim();
  const replyTextarea = document.getElementById('replyContent');

  if (!replyTextarea) return;

  const quote = `> **${author} said:**\n> ${content.split('\n').join('\n> ')}\n\n`;
  replyTextarea.value = quote + replyTextarea.value;
  replyTextarea.focus();

  window.scrollTo({
    top: document.getElementById('replyFormContainer').offsetTop - 80,
    behavior: 'smooth'
  });
}

function setupActionButtons() {
  const editBtn = document.getElementById('editThreadBtn');
  if (editBtn && editBtn.style.display !== 'none') {
    const newBtn = editBtn.cloneNode(true);
    editBtn.parentNode.replaceChild(newBtn, editBtn);
    newBtn.addEventListener('click', (event) => {
      event.preventDefault();
      handleEditThread();
    });
  }

  const pinBtn = document.getElementById('pinThreadBtn');
  if (pinBtn && pinBtn.style.display !== 'none') {
    const newPinBtn = pinBtn.cloneNode(true);
    pinBtn.parentNode.replaceChild(newPinBtn, pinBtn);
    newPinBtn.addEventListener('click', async () => {
      await togglePinThread();
    });
  }

  const markSolvedBtn = document.getElementById('markSolvedBtn');
  if (markSolvedBtn && markSolvedBtn.style.display !== 'none') {
    markSolvedBtn.onclick = async () => {
      if (!confirm('Mark this thread as solved?')) return;
      const supabase = await getSupabase();
      await supabase
        .from('threads')
        .update({ status: 'solved' })
        .eq('id', currentThread.id);
      window.location.reload();
    };
  }

  const deleteBtn = document.getElementById('deleteThreadBtn');
  if (deleteBtn && deleteBtn.style.display !== 'none') {
    deleteBtn.onclick = async () => {
      if (!confirm('Are you sure you want to delete this thread? This cannot be undone.')) return;
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('threads')
        .delete()
        .eq('id', currentThread.id);

      if (error) {
        console.error('Error deleting thread:', error);
        alert('Failed to delete thread.');
        return;
      }

      window.location.href = '/forum';
    };
  }

  const subscribeBtn = document.getElementById('subscribeBtn');
  if (subscribeBtn && subscribeBtn.style.display !== 'none') {
    subscribeBtn.onclick = () => {
      alert('Subscription feature is coming soon.');
    };
  }
}

// Toggle pin thread
async function togglePinThread() {
  if (!currentThread) return;

  const profile = getCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    alert('Only admins can pin threads.');
    return;
  }

  const supabase = await getSupabase();
  const nextState = !currentThread.is_pinned;

  const { error } = await supabase
    .from('threads')
    .update({ is_pinned: nextState })
    .eq('id', currentThread.id);

  if (error) {
    console.error('Error updating pinned state:', error);
    alert('Failed to update pinned state: ' + error.message);
    return;
  }

  await loadThread(currentThread.id);
  await loadReplies();
  setupActionButtons();
  alert(nextState ? 'Thread pinned.' : 'Thread unpinned.');
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThread);
} else {
  initThread();
}

