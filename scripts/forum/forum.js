import { getSupabase } from './config.js';
import { getCurrentProfile, isAuthenticated, showAuthModal } from './auth.js';

const forumState = {
  filter: 'all',
  sort: 'recent',
  view: 'detailed',
  mode: 'threads',
  searchQuery: '',
  categories: [],
};

async function initForum() {
  const container = document.getElementById('categoriesContainer');
  if (container) {
    container.innerHTML = '<div class="loading-message">Loading categories...</div>';
  }

  try {
    await ensureCategoriesLoaded();

    await Promise.all([
      loadForumStats(),
      loadCategoryNav(),
      loadTopContributors(),
      loadAnnouncements(),
    ]);

    await loadCategories();

    setupSearchHandler();
    setupNewThreadButton();
    setupFilterButtons();
    setupSortOptions();
    setupViewOptions();
  } catch (error) {
    console.error('Forum initialization error:', error);
    if (container) {
      container.innerHTML = '<p class="error-message">Failed to load forum data.</p>';
    }
  }
}

async function loadForumThreads({ filter = forumState.filter, sort = forumState.sort, searchQuery = '' } = {}) {
  const container = document.getElementById('categoriesContainer');
  if (!container) return;

  await ensureCategoriesLoaded();

  const supabase = await getSupabase();
  forumState.filter = filter;
  forumState.sort = sort;
  forumState.searchQuery = searchQuery;
  forumState.mode = 'threads';

  let query = supabase
    .from('threads')
    .select(`
      *,
      profiles:author_id (username, avatar_url),
      categories (name, slug)
    `)
    .order('is_pinned', { ascending: false })
    .order(getSortOrder(sort).column, { ascending: getSortOrder(sort).ascending })
    .limit(30);

  if (searchQuery) {
    query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);
  } else {
    switch (filter) {
      case 'trending': {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('last_activity', weekAgo).order('reply_count', { ascending: false });
        break;
      }
      case 'unanswered':
        query = query.eq('reply_count', 0);
        break;
      case 'solved':
        query = query.eq('status', 'solved');
        break;
      case 'mine': {
        const profile = getCurrentProfile();
        if (!profile) {
          container.innerHTML = '<p class="empty-message">Sign in to view your threads.</p>';
          return;
        }
        query = query.eq('author_id', profile.id);
        break;
      }
    }
  }

  const { data: threads, error } = await query;

  if (error) {
    console.error('Error loading threads:', error);
    container.innerHTML = '<p class="error-message">Failed to load threads.</p>';
    return;
  }

  if (!threads || threads.length === 0) {
    container.innerHTML = '<p class="empty-message">No threads found.</p>';
    return;
  }

  container.innerHTML = renderThreadList(threads);
}

function renderThreadList(threads) {
  return threads.map(thread => `
    <div class="activity-item ${thread.is_pinned ? 'pinned' : ''}" data-thread-id="${thread.id}">
      <div class="activity-status ${thread.status}">
        ${getStatusIcon(thread.status)}
      </div>
      <div class="activity-content">
        <div class="activity-title">
          <a href="/thread.html?id=${thread.id}">${escapeHtml(thread.title)}</a>
          ${thread.is_pinned ? '<i class="fas fa-thumbtack pinned-icon"></i>' : ''}
        </div>
        <div class="activity-meta">
          <span class="activity-category">
            <i class="fas fa-folder"></i>
            <a href="/category.html?slug=${thread.categories.slug}">${thread.categories.name}</a>
          </span>
          <span class="activity-author">
            <i class="fas fa-user"></i>
            ${thread.profiles.username}
          </span>
          <span class="activity-time">
            <i class="fas fa-clock"></i>
            ${formatTimeAgo(thread.last_activity || thread.created_at)}
          </span>
        </div>
      </div>
      <div class="activity-stats">
        <div class="stat">
          <i class="fas fa-eye"></i>
          ${thread.view_count}
        </div>
        <div class="stat">
          <i class="fas fa-reply"></i>
          ${thread.reply_count}
        </div>
      </div>
    </div>
  `).join('');
}

async function loadForumStats() {
  try {
    const supabase = await getSupabase();

    const [{ count: threadCount }, { count: postCount }, { count: userCount }] = await Promise.all([
      supabase.from('threads').select('*', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
    ]);

    const totalThreadsEl = document.getElementById('totalThreads');
    const totalPostsEl = document.getElementById('totalPosts');
    const totalUsersEl = document.getElementById('totalUsers');
    const onlineUsersEl = document.getElementById('onlineUsers');

    if (totalThreadsEl) totalThreadsEl.textContent = threadCount ?? 0;
    if (totalPostsEl) totalPostsEl.textContent = postCount ?? 0;
    if (totalUsersEl) totalUsersEl.textContent = userCount ?? 0;
    if (onlineUsersEl) onlineUsersEl.textContent = '—';
  } catch (error) {
    console.error('Error loading forum stats:', error);
  }
}

function setupSearchHandler() {
  const searchInput = document.getElementById('forumSearch');
  if (!searchInput) return;

  let searchTimeout;
  searchInput.addEventListener('input', (event) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const query = event.target.value.trim();

      if (query.length >= 2) {
        await loadForumThreads({ searchQuery: query });
      } else if (query.length === 0) {
        if (forumState.filter === 'all') {
          await loadCategories();
        } else {
          await loadForumThreads({ filter: forumState.filter });
        }
      }
    }, 250);
  });
}

async function performSearch(query, options = {}) {
  const container = document.getElementById('categoriesContainer');
  if (!container) return;

  const supabase = await getSupabase();
  const sort = options.sort || forumState.sort;
  const { column, ascending } = getSortOrder(sort);

  let queryBuilder = supabase
    .from('threads')
    .select(`
      *,
      profiles:author_id (username, avatar_url),
      categories (name, slug)
    `)
    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
    .order(column, { ascending })
    .limit(30);

  const { data: threads, error } = await queryBuilder;

  if (error) {
    console.error('Error searching threads:', error);
    container.innerHTML = '<p class="error-message">Search failed.</p>';
    return;
  }

  forumState.mode = 'search';
  forumState.searchQuery = query;
  forumState.sort = sort;

  if (!threads || threads.length === 0) {
    container.innerHTML = `<p class="empty-message">No results for "${escapeHtml(query)}"</p>`;
    return;
  }

  renderThreads(threads, container);
}

function setupNewThreadButton() {
  const newThreadBtn = document.getElementById('newThreadBtn');
  if (!newThreadBtn) return;

  newThreadBtn.addEventListener('click', async () => {
    if (!isAuthenticated()) {
      showAuthModal('login');
      return;
    }

    await ensureCategoriesLoaded();

    if (!forumState.categories.length) {
      alert('No categories are available yet. Create a category first.');
      return;
    }

    const targetCategory = forumState.categories[0];
    window.location.href = `/category.html?slug=${targetCategory.slug}`;
  });
}

function setupFilterButtons() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  if (!filterButtons.length) return;

  filterButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const filter = btn.dataset.filter;
      setActiveFilterButton(filter);
      if (filter === 'all') {
        await loadCategories();
      } else {
        await loadForumThreads({ filter });
      }
    });
  });

  setActiveFilterButton(forumState.filter);
}

function setActiveFilterButton(filter) {
  document.querySelectorAll('.filter-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
}

function setupSortOptions() {
  const sortSelect = document.getElementById('sortSelect');
  if (!sortSelect) return;

  sortSelect.value = forumState.sort;
  sortSelect.addEventListener('change', async (event) => {
    const sortBy = event.target.value;

    if (forumState.mode === 'search' && forumState.searchQuery) {
      await performSearch(forumState.searchQuery, { sort: sortBy });
    } else {
      await loadForumThreads({ sort: sortBy });
    }
  });
}

function setupViewOptions() {
  const viewButtons = document.querySelectorAll('.view-btn');
  if (!viewButtons.length) return;

  viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      viewButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      forumState.view = btn.dataset.view;
      applyView(forumState.view);
    });
  });

  applyView(forumState.view);
}

function applyView(view) {
  const container = document.getElementById('categoriesContainer');
  if (!container) return;

  if (view === 'compact') {
    container.classList.add('compact-view');
  } else {
    container.classList.remove('compact-view');
  }
}

async function loadCategoryNav() {
  const container = document.getElementById('categoryNav');
  if (!container) return;

  try {
    await ensureCategoriesLoaded();
    const categories = forumState.categories;

    if (!categories || categories.length === 0) {
      container.innerHTML = `
        <div class="empty-message">
          <strong>No categories found</strong><br>
          <small>Run the SQL setup script in Supabase to create default categories.</small>
        </div>
      `;
      return;
    }

    container.innerHTML = categories.map(category => `
      <div class="category-nav-item" data-slug="${category.slug}">
        <div class="name">
          <i class="fas ${category.icon || 'fa-folder'}"></i>
          <span>${category.name}</span>
        </div>
        <span class="count">${category.threadCount ?? 0}</span>
      </div>
    `).join('');

    container.querySelectorAll('.category-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        window.location.href = `/category.html?slug=${item.dataset.slug}`;
      });
    });
  } catch (error) {
    console.error('Category nav error:', error);
    container.innerHTML = '<p class="empty-message">Error loading categories</p>';
  }
}

async function loadTopContributors() {
  const container = document.getElementById('topContributors');
  if (!container) return;

  try {
    const supabase = await getSupabase();
    const { data: contributors, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, post_count, reputation')
      .order('post_count', { ascending: false })
      .limit(5);

    if (error || !contributors || contributors.length === 0) {
      container.innerHTML = '<p class="empty-message">No contributors yet</p>';
      return;
    }

    container.innerHTML = contributors.map((user, index) => `
      <div class="contributor-item">
        <div class="contributor-rank">${index + 1}</div>
        <img src="${getAvatarUrl(user)}" alt="${user.username}" class="contributor-avatar">
        <div class="contributor-info">
          <div class="contributor-name">${escapeHtml(user.username)}</div>
          <div class="contributor-posts">${user.post_count || 0} posts</div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Contributors error:', error);
    container.innerHTML = '<p class="empty-message">Unable to load contributors</p>';
  }
}

async function loadAnnouncements() {
  const listEl = document.getElementById('announcementsList');
  if (!listEl) return;

  try {
    await ensureCategoriesLoaded();

    const announcementsCategory = forumState.categories.find(cat => cat.slug === 'announcements');

    const supabase = await getSupabase();
    let orClause = 'is_pinned.eq.true';
    if (announcementsCategory) {
      orClause += `,category_id.eq.${announcementsCategory.id}`;
    }

    const { data, error } = await supabase
      .from('threads')
      .select(`
        id,
        title,
        content,
        created_at,
        is_pinned,
        categories:category_id (id, name, slug),
        profiles:author_id (username, role)
      `)
      .or(orClause)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) {
      console.error('Error loading announcements:', error);
      listEl.innerHTML = '<div class="announcement-empty">Unable to load announcements.</div>';
      return;
    }

    const announcements = (data || []).filter(item => item.profiles?.role === 'admin');

    if (!announcements.length) {
      listEl.innerHTML = '<div class="announcement-empty">No announcements yet.</div>';
      return;
    }

    listEl.innerHTML = announcements.map(item => `
      <article class="announcement-card">
        <h3><a href="/thread.html?id=${item.id}">${escapeHtml(item.title)}</a></h3>
        <div class="announcement-meta">
          <span><i class="fas fa-user-shield"></i>${item.profiles?.username || 'Admin'}</span>
          <span><i class="fas fa-calendar"></i>${formatTimeAgo(item.created_at)}</span>
          ${item.categories ? `<span><i class="fas fa-folder"></i>${item.categories.name}</span>` : ''}
        </div>
        <div class="announcement-body">${escapeHtml((item.content || '').substring(0, 180))}${item.content && item.content.length > 180 ? '…' : ''}</div>
        <div>
          <a href="/thread.html?id=${item.id}" class="cta-button secondary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">View Announcement</a>
        </div>
      </article>
    `).join('');
  } catch (error) {
    console.error('Announcements error:', error);
    listEl.innerHTML = '<div class="announcement-empty">Unable to load announcements.</div>';
  }
}

async function loadCategories() {
  const container = document.getElementById('categoriesContainer');
  
  if (!container) {
    return;
  }

  forumState.mode = 'categories';
  forumState.filter = 'all';
  forumState.sort = 'recent';
  forumState.view = 'detailed';
  forumState.searchQuery = '';

  await ensureCategoriesLoaded();

  if (!forumState.categories.length) {
    container.innerHTML = `
      <div class="empty-message">
        <strong>No categories found</strong><br>
        <small>Run the SQL setup script in Supabase to create default categories.</small>
      </div>
    `;
    return;
  }

  container.innerHTML = forumState.categories.map(category => `
    <div class="category-card" data-slug="${category.slug}">
      <div class="category-icon">
        <i class="fas ${category.icon || 'fa-folder'}"></i>
      </div>
      <div class="category-info">
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.description || 'No description available.')}</p>
        <div class="category-preview">
          ${renderRecentActivityPreview(category.recentThreads)}
        </div>
      </div>
      <div class="category-stats">
        <div class="stat">
          <span class="stat-value">${category.threadCount ?? 0}</span>
          <span class="stat-label">Threads</span>
        </div>
        <div class="stat">
          <span class="stat-value">${category.postCount ?? 0}</span>
          <span class="stat-label">Posts</span>
        </div>
      </div>
      <div class="category-action">
        <span>View</span>
        <i class="fas fa-arrow-right"></i>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.category-card').forEach(item => {
    item.addEventListener('click', () => {
      window.location.href = `/category.html?slug=${item.dataset.slug}`;
    });
  });
}

async function ensureCategoriesLoaded() {
  if (forumState.categories.length) return;
  await fetchCategoriesWithCounts();
}

async function fetchCategoriesWithCounts() {
  try {
    const supabase = await getSupabase();
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name, slug, icon, description')
      .order('position', { ascending: true });

    if (error) {
      console.error('Error loading categories list:', error);
      forumState.categories = [];
      return;
    }

    if (!categories || categories.length === 0) {
      forumState.categories = [];
      return;
    }

    const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
      const [{ count: threadCount }, { data: threadList }, { data: recentThreads }] = await Promise.all([
        supabase
          .from('threads')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', category.id),
        supabase
          .from('threads')
          .select('reply_count')
          .eq('category_id', category.id),
        supabase
          .from('threads')
          .select(`id, title, created_at, reply_count, profiles:author_id (username)`)
          .eq('category_id', category.id)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      const replies = (threadList || []).reduce((sum, thread) => sum + (thread.reply_count || 0), 0);
      const postCount = (threadCount || 0) + replies;

      return {
        ...category,
        threadCount: threadCount || 0,
        postCount,
        recentThreads: recentThreads || [],
      };
    }));

    forumState.categories = categoriesWithCounts;
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    forumState.categories = [];
  }
}

function renderRecentActivityPreview(threads) {
  if (!threads || !threads.length) {
    return '<div class="category-preview-empty">No recent activity.</div>';
  }

  return `
    <div class="category-preview-list">
      ${threads.map(thread => `
        <div class="category-preview-item">
          <div class="preview-title">${escapeHtml(thread.title)}</div>
          <div class="preview-meta">
            <span><i class="fas fa-user"></i>${thread.profiles?.username || 'Unknown'}</span>
            <span><i class="fas fa-clock"></i>${formatTimeAgo(thread.created_at)}</span>
            <span><i class="fas fa-comment"></i>${thread.reply_count || 0}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

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

function getAvatarUrl(user) {
  if (user.avatar_url) return user.avatar_url;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=7dd3fc&color=0a0a0a&size=64`;
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

function getSortOrder(sort) {
  switch (sort) {
    case 'newest':
      return { column: 'created_at', ascending: false };
    case 'popular':
      return { column: 'view_count', ascending: false };
    case 'replies':
      return { column: 'reply_count', ascending: false };
    case 'views':
      return { column: 'view_count', ascending: false };
    default:
      return { column: 'last_activity', ascending: false };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initForum);
} else {
  initForum();
}



