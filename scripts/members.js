import { getSupabase } from './forum/config.js';

const state = {
  search: '',
  role: 'all',
  sort: 'newest',
};

let allMembers = [];

const elements = {
  list: null,
  search: null,
  roleSelect: null,
  sortSelect: null,
};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  setupEventListeners();
  loadMembers();
});

function cacheElements() {
  elements.list = document.getElementById('membersList');
  elements.search = document.getElementById('memberSearch');
  elements.roleSelect = document.getElementById('roleFilter');
  elements.sortSelect = document.getElementById('sortMembers');
}

function setupEventListeners() {
  if (elements.search) {
    let debounceTimer = null;
    elements.search.addEventListener('input', (event) => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        state.search = event.target.value.trim().toLowerCase();
        renderMembers();
      }, 200);
    });
  }

  if (elements.roleSelect) {
    elements.roleSelect.addEventListener('change', (event) => {
      state.role = event.target.value;
      renderMembers();
    });
  }

  if (elements.sortSelect) {
    elements.sortSelect.addEventListener('change', (event) => {
      state.sort = event.target.value;
      renderMembers();
    });
  }
}

async function loadMembers() {
  if (!elements.list) return;

  elements.list.setAttribute('aria-busy', 'true');
  elements.list.innerHTML = '<p class="loading-message">Loading members...</p>';

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('profiles')
      .select('*');

    if (error) {
      throw error;
    }

    allMembers = Array.isArray(data) ? data : [];
    renderMembers();
    elements.list.setAttribute('aria-busy', 'false');
  } catch (error) {
    console.error('Failed to load members:', error);
    elements.list.innerHTML = `
      <div class="members-error">
        <i class="fas fa-exclamation-triangle"></i>
        <div>
          <h3>Unable to load members</h3>
          <p>Please try again later. If the issue persists, let the team know.</p>
        </div>
      </div>
    `;
    elements.list.setAttribute('aria-busy', 'false');
  }
}

function renderMembers() {
  if (!elements.list) return;

  const filtered = applyFilters(allMembers);
  const sorted = applySorting(filtered);

  if (!sorted.length) {
    elements.list.innerHTML = `
      <div class="members-empty">
        <i class="fas fa-user-slash"></i>
        <h3>No members match your filters</h3>
        <p>Try adjusting your search or role filters to see more community members.</p>
      </div>
    `;
    elements.list.setAttribute('aria-busy', 'false');
    return;
  }

  elements.list.innerHTML = sorted.map(renderMemberCard).join('');
  elements.list.setAttribute('aria-busy', 'false');
}

function applyFilters(members) {
  return members.filter((member) => {
    const matchesRole = state.role === 'all' || member.role === state.role;
    const matchesSearch = !state.search || matchesMemberSearch(member, state.search);
    return matchesRole && matchesSearch;
  });
}

function matchesMemberSearch(member, query) {
  const fields = [
    member.username,
    member.bio,
    member.location,
  ].filter(Boolean);

  return fields.some((field) => field.toLowerCase().includes(query));
}

function applySorting(members) {
  const cloned = [...members];

  switch (state.sort) {
    case 'alphabetical':
      return cloned.sort((a, b) => a.username.localeCompare(b.username));
    case 'oldest':
      return cloned.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    case 'reputation':
      return cloned.sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
    case 'posts':
      return cloned.sort((a, b) => (b.post_count || 0) - (a.post_count || 0));
    case 'solutions':
      return cloned.sort((a, b) => (b.solution_count || 0) - (a.solution_count || 0));
    case 'newest':
    default:
      return cloned.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

function renderMemberCard(member) {
  const avatarUrl = member.avatar_url || '/assets/images/@default_profile.jpg';
  const role = member.role || 'member';
  const reputation = member.reputation ?? 0;
  const posts = member.post_count ?? 0;
  const solutions = member.solution_count ?? 0;
  const location = member.location ? `<span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(member.location)}</span>` : '';
  const bio = member.bio ? escapeHtml(truncateText(member.bio, 160)) : '<span class="muted">No bio yet.</span>';

  return `
    <article class="member-row">
      <div class="member-row-main">
        <img src="${avatarUrl}" alt="${escapeHtml(member.username)}" class="member-row-avatar">
        <div class="member-row-body">
          <div class="member-row-header">
            <a href="/profile.html?id=${member.id}" class="member-name">${escapeHtml(member.username)}</a>
            <span class="role-badge ${role}">${formatRoleLabel(role)}</span>
          </div>
          <div class="member-row-meta">
            <span><i class="fas fa-calendar"></i> Joined ${formatDateShort(member.created_at)}</span>
            ${location}
          </div>
          <p class="member-row-bio">${bio}</p>
        </div>
      </div>
      <div class="member-row-stats">
        <span><strong>${posts}</strong> Posts</span>
        <span><strong>${reputation}</strong> Rep</span>
        <span><strong>${solutions}</strong> Solutions</span>
      </div>
    </article>
  `;
}

function formatDateShort(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateText(text, limit) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRoleLabel(role) {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'moderator':
      return 'Moderator';
    case 'verified_modder':
      return 'Verified Modder';
    case 'member':
      return 'Member';
    case 'all':
      return 'All roles';
    default:
      return role ? role.replace(/_/g, ' ') : 'Member';
  }
}

