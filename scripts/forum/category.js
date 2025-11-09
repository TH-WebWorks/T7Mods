import { getSupabase, FORUM_CONFIG } from './config.js';
import { getCurrentProfile, isAuthenticated, showAuthModal } from './auth.js';
import { setupImageUploadHandler, setupPasteUpload } from './uploader.js';

let currentCategory = null;
let currentPage = 1;
let currentFilter = 'all';
let currentSort = 'latest';

// Initialize category page
async function initCategory() {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');

  if (!slug) {
    window.location.href = '/forum';
    return;
  }

  await loadCategory(slug);
  await loadThreads();
  await loadCategoryStats();
  await loadCategoryNav();
  await loadTopContributors();
  await loadTags();
  setupFilters();
  setupSort();
  setupNewThreadButton();
}

// Load category info
async function loadCategory(slug) {
  const supabase = await getSupabase();

  const { data: category, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !category) {
    console.error('Error loading category:', error);
    window.location.href = '/forum';
    return;
  }

  currentCategory = category;

  // Update UI
  document.getElementById('categoryBreadcrumb').textContent = category.name;
  document.getElementById('categoryTitle').textContent = category.name;
  document.getElementById('categoryDescription').textContent = category.description || '';
  document.getElementById('categoryIcon').className = `fas ${category.icon || 'fa-folder'}`;
  document.title = `${category.name} - T7Mods Forum`;
}

// Load category stats
async function loadCategoryStats() {
  if (!currentCategory) return;
  
  const supabase = await getSupabase();
  
  // Get thread count
  const { count: threadCount } = await supabase
    .from('threads')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', currentCategory.id);
  
  // Get post count (sum of reply counts)
  const { data: threads } = await supabase
    .from('threads')
    .select('reply_count')
    .eq('category_id', currentCategory.id);
  
  const postCount = threads ? threads.reduce((sum, t) => sum + (t.reply_count || 0), 0) + (threadCount || 0) : 0;
  
  document.getElementById('categoryThreadCount').textContent = threadCount || 0;
  document.getElementById('categoryPostCount').textContent = postCount;
}

// Load category navigation
async function loadCategoryNav() {
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
         class="category-nav-item ${currentCategory && cat.id === currentCategory.id ? 'active' : ''}">
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

// Load top contributors
async function loadTopContributors() {
  const supabase = await getSupabase();
  const container = document.getElementById('topContributors');
  
  if (!container) return;

  try {
    const { data: contributors, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, role, post_count')
      .order('post_count', { ascending: false })
      .limit(5);

    if (error || !contributors || contributors.length === 0) {
      container.innerHTML = '<p class="empty-message">No contributors yet</p>';
      return;
    }

    container.innerHTML = contributors.map((user, index) => `
      <div class="contributor-item">
        <span class="contributor-rank">#${index + 1}</span>
        <img src="${getAvatarUrl(user.avatar_url, user.username)}" 
             alt="${user.username}" 
             class="contributor-avatar">
        <div class="contributor-info">
          <div class="contributor-name">${user.username}</div>
          <div class="contributor-posts">${user.post_count || 0} posts</div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading top contributors:', error);
  }
}

// Load threads for category
async function loadThreads() {
  const supabase = await getSupabase();
  const container = document.getElementById('threadsContainer');

  if (!currentCategory) return;

  // Build query
  let query = supabase
    .from('threads')
    .select(`
      *,
      profiles:author_id (username, avatar_url, role),
      thread_tags (
        tags (name, slug, color)
      )
    `, { count: 'exact' })
    .eq('category_id', currentCategory.id);

  // Apply filters
  if (currentFilter !== 'all') {
    if (currentFilter === 'pinned') {
      query = query.eq('is_pinned', true);
    } else {
      query = query.eq('status', currentFilter);
    }
  }

  // Apply sorting
  switch (currentSort) {
    case 'latest':
      query = query.order('last_activity', { ascending: false });
      break;
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'oldest':
      query = query.order('created_at', { ascending: true });
      break;
    case 'most_replies':
      query = query.order('reply_count', { ascending: false });
      break;
    case 'most_views':
      query = query.order('view_count', { ascending: false });
      break;
  }

  // Apply pagination
  const start = (currentPage - 1) * FORUM_CONFIG.threadsPerPage;
  const end = start + FORUM_CONFIG.threadsPerPage - 1;
  query = query.range(start, end);

  const { data: threads, error, count } = await query;

  if (error) {
    console.error('Error loading threads:', error);
    container.innerHTML = '<p class="error-message">Failed to load threads</p>';
    return;
  }

  if (threads.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-comments"></i>
        <h3>No threads yet</h3>
        <p>Be the first to start a discussion in this category!</p>
        ${isAuthenticated() ? '<button class="cta-button" id="emptyNewThreadBtn"><i class="fas fa-plus"></i> Create Thread</button>' : ''}
      </div>
    `;
    
    const emptyBtn = document.getElementById('emptyNewThreadBtn');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', showNewThreadModal);
    }
    return;
  }

  // Render threads
  container.innerHTML = threads.map(thread => {
    const tags = thread.thread_tags?.map(tt => tt.tags).filter(Boolean) || [];
    
    return `
      <div class="thread-item ${thread.is_pinned ? 'pinned' : ''}" data-thread-id="${thread.id}">
        <div class="thread-status ${thread.status}">
          ${getStatusIcon(thread.status)}
          ${thread.is_pinned ? '<i class="fas fa-thumbtack pin-icon"></i>' : ''}
        </div>
        <div class="thread-content">
          <div class="thread-title">
            <a href="/thread.html?id=${thread.id}">${escapeHtml(thread.title)}</a>
          </div>
          ${tags.length > 0 ? `
            <div class="thread-tags">
              ${tags.map(tag => `
                <span class="thread-tag" style="border-color: ${tag.color}; color: ${tag.color}">
                  ${tag.name}
                </span>
              `).join('')}
            </div>
          ` : ''}
          <div class="thread-meta">
            <span class="thread-author">
              <img src="${getAvatarUrl(thread.profiles.avatar_url, thread.profiles.username)}" 
                   alt="${thread.profiles.username}" 
                   class="avatar-small">
              ${thread.profiles.username}
              ${getRoleBadge(thread.profiles.role)}
            </span>
            <span class="thread-time">
              <i class="fas fa-clock"></i>
              ${formatTimeAgo(thread.created_at)}
            </span>
          </div>
        </div>
        <div class="thread-stats">
          <div class="stat">
            <span class="stat-value">${thread.view_count}</span>
            <span class="stat-label">Views</span>
          </div>
          <div class="stat">
            <span class="stat-value">${thread.reply_count}</span>
            <span class="stat-label">Replies</span>
          </div>
        </div>
        <div class="thread-action">
          <i class="fas fa-arrow-right"></i>
        </div>
      </div>
    `;
  }).join('');

  // Setup pagination
  setupPagination(count);

  // Add click handlers
  document.querySelectorAll('.thread-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      const threadId = item.dataset.threadId;
      window.location.href = `/thread.html?id=${threadId}`;
    });
  });
}

// Load available tags
async function loadTags() {
  const supabase = await getSupabase();

  const { data: tags, error } = await supabase
    .from('tags')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error loading tags:', error);
    return;
  }

  const container = document.getElementById('tagsSelector');
  if (!container) return;

  container.innerHTML = tags.map(tag => `
    <label class="tag-checkbox">
      <input type="checkbox" name="tags" value="${tag.id}" data-slug="${tag.slug}">
      <span class="tag-label" style="border-color: ${tag.color}; color: ${tag.color}">
        ${tag.name}
      </span>
    </label>
  `).join('');

  // Limit tag selection
  container.addEventListener('change', (e) => {
    const checked = container.querySelectorAll('input:checked');
    if (checked.length > FORUM_CONFIG.maxTags) {
      e.target.checked = false;
      alert(`You can select up to ${FORUM_CONFIG.maxTags} tags`);
    }
  });
}

// Setup filters
function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      currentPage = 1;
      loadThreads();
    });
  });
}

// Setup sort
function setupSort() {
  const sortSelect = document.getElementById('sortThreads');
  if (!sortSelect) return;

  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    currentPage = 1;
    loadThreads();
  });
}

// Setup pagination
function setupPagination(totalCount) {
  const container = document.getElementById('pagination');
  if (!container) return;

  const totalPages = Math.ceil(totalCount / FORUM_CONFIG.threadsPerPage);
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="pagination-buttons">';
  
  // Previous button
  if (currentPage > 1) {
    html += `<button class="pagination-btn" data-page="${currentPage - 1}">
      <i class="fas fa-chevron-left"></i> Previous
    </button>`;
  }

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">
        ${i}
      </button>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<span class="pagination-ellipsis">...</span>';
    }
  }

  // Next button
  if (currentPage < totalPages) {
    html += `<button class="pagination-btn" data-page="${currentPage + 1}">
      Next <i class="fas fa-chevron-right"></i>
    </button>`;
  }

  html += '</div>';
  container.innerHTML = html;

  // Add click handlers
  document.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      loadThreads();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// Setup new thread button
function setupNewThreadButton() {
  const newThreadBtn = document.getElementById('newThreadBtn');
  if (!newThreadBtn) return;

  newThreadBtn.addEventListener('click', showNewThreadModal);
}

// Show new thread modal
function showNewThreadModal() {
  if (!isAuthenticated()) {
    showAuthModal('login');
    return;
  }

  const modal = document.getElementById('newThreadModal');
  modal.style.display = 'flex';

  setupNewThreadForm();
  setupEditorToolbar();
}

// Setup new thread form
function setupNewThreadForm() {
  const form = document.getElementById('newThreadForm');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    await handleCreateThread();
  };

  // Preview button
  const previewBtn = document.getElementById('previewBtn');
  if (previewBtn) {
    previewBtn.onclick = showPreview;
  }

  // Modal close
  const modal = document.getElementById('newThreadModal');
  const closeBtn = modal.querySelector('.modal-close');
  
  closeBtn.onclick = () => {
    modal.style.display = 'none';
    form.reset();
  };

  window.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      form.reset();
    }
  };
}

// Setup editor toolbar
function setupEditorToolbar() {
  document.querySelectorAll('.editor-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      const textarea = document.getElementById('threadContent');
      handleEditorAction(action, textarea);
    };
  });

  // Setup image upload
  setupImageUploadHandler('imageUpload', 'threadContent');
  setupPasteUpload('threadContent');
}

// Handle editor actions
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
      document.getElementById('imageUpload').click();
      return;
  }

  textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.focus();
  textarea.selectionStart = start + replacement.length;
  textarea.selectionEnd = start + replacement.length;
}

// Handle create thread
async function handleCreateThread() {
  const supabase = await getSupabase();
  const profile = getCurrentProfile();
  const submitBtn = document.querySelector('#newThreadForm button[type="submit"]');

  if (!profile) {
    showAuthModal('login');
    return;
  }

  const title = document.getElementById('threadTitle').value.trim();
  const content = document.getElementById('threadContent').value.trim();
  const selectedTags = Array.from(document.querySelectorAll('input[name="tags"]:checked'))
    .map(input => input.value);

  if (!title || !content) {
    alert('Please fill in both the title and content before posting.');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
    }

    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .insert({
        title,
        content,
        author_id: profile.id,
        category_id: currentCategory.id,
      })
      .select()
      .single();

    if (threadError) {
      throw threadError;
    }

    if (selectedTags.length > 0) {
      const tagInserts = selectedTags.map(tagId => ({
        thread_id: thread.id,
        tag_id: tagId,
      }));

      const { error: tagError } = await supabase.from('thread_tags').insert(tagInserts);
      if (tagError) {
        console.error('Error attaching tags:', tagError);
      }
    }

    document.getElementById('newThreadModal').style.display = 'none';
    window.location.href = `/thread.html?id=${thread.id}`;
  } catch (error) {
    console.error('Error creating thread:', error);
    alert(`Failed to create thread: ${error.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Thread';
    }
  }
}

// Show preview
function showPreview() {
  const content = document.getElementById('threadContent').value;
  const previewContent = document.getElementById('editorPreview');
  
  if (!previewContent) return;

  if (previewContent.style.display === 'none' || !previewContent.style.display) {
    previewContent.style.display = 'block';
    previewContent.innerHTML = marked.parse(content);
    document.getElementById('previewBtn').innerHTML = '<i class="fas fa-edit"></i> Edit';
  } else {
    previewContent.style.display = 'none';
    document.getElementById('previewBtn').innerHTML = '<i class="fas fa-eye"></i> Preview';
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
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=7dd3fc&color=0a0a0a&size=40`;
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

function formatTimeAgo(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCategory);
} else {
  initCategory();
}

