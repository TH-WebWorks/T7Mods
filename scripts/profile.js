import { getSupabase } from './forum/config.js';
import { getCurrentProfile, isAuthenticated } from './forum/auth.js';

let profileUser = null;
let currentUser = null;
let viewingUserId = null;

const DOM = {
  profileUsername: () => document.getElementById('profileUsername'),
  profileRole: () => document.getElementById('profileRole'),
  joinDate: () => document.getElementById('joinDate'),
  profileBio: () => document.getElementById('profileBio'),
  locationMeta: () => document.getElementById('locationMeta'),
  location: () => document.getElementById('location'),
  websiteMeta: () => document.getElementById('websiteMeta'),
  website: () => document.getElementById('website'),
  profileSocial: () => document.getElementById('profileSocial'),
  profileHighlights: () => document.getElementById('profileHighlights'),
  threadsCount: () => document.getElementById('threadsCount'),
  postCount: () => document.getElementById('postCount'),
  solutionsCount: () => document.getElementById('solutionsCount'),
  reputation: () => document.getElementById('reputation'),
  userThreads: () => document.getElementById('userThreads'),
  userPosts: () => document.getElementById('userPosts'),
  aboutContent: () => document.getElementById('aboutContent'),
  recentActivity: () => document.getElementById('recentActivity'),
  editTabBtn: () => document.getElementById('editTabBtn'),
  openEditTabBtn: () => document.getElementById('openEditTabBtn'),
  profileTabs: () => document.getElementById('profileTabs'),
  changeAvatarBtn: () => document.getElementById('changeAvatarBtn'),
  changeBannerBtn: () => document.getElementById('changeBannerBtn'),
  avatarInput: () => document.getElementById('avatarInput'),
  bannerInput: () => document.getElementById('bannerInput'),
  profileInfoForm: () => document.getElementById('profileInfoForm'),
  profileSocialForm: () => document.getElementById('profileSocialForm'),
  editBio: () => document.getElementById('editBio'),
  editBioCount: () => document.getElementById('editBioCount'),
  editLocation: () => document.getElementById('editLocation'),
  editWebsite: () => document.getElementById('editWebsite'),
  editDiscord: () => document.getElementById('editDiscord'),
  editTwitter: () => document.getElementById('editTwitter'),
  editYoutube: () => document.getElementById('editYoutube'),
  editGithub: () => document.getElementById('editGithub'),
};

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = getCurrentProfile();

  const urlParams = new URLSearchParams(window.location.search);
  viewingUserId = urlParams.get('id');

  if (!viewingUserId) {
    if (currentUser) {
      window.location.href = `/profile.html?id=${currentUser.id}`;
    } else {
      window.location.href = '/forum.html';
    }
    return;
  }

  setupTabs();
  setupEditControls();

  await loadProfile(viewingUserId);
});

async function loadProfile(userId) {
  const supabase = await getSupabase();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    console.error('Error loading profile:', error);
    document.querySelector('.profile-layout').innerHTML = `
      <div class="profile-error">
        <i class="fas fa-exclamation-triangle"></i>
        <h2>Profile not found</h2>
        <p>The user you're looking for doesn't exist.</p>
        <a href="/forum.html" class="cta-button">Back to forum</a>
      </div>
    `;
    return;
  }

  profileUser = profile;
  renderProfile(profile);
  populateEditForms(profile);

  if (currentUser && currentUser.id === viewingUserId) {
    enableOwnerEditing();
  }

  await loadUserActivity(userId);
}

function renderProfile(profile) {
  document.getElementById('profileAvatar').src = profile.avatar_url || '/assets/default-avatar.png';
  const banner = document.getElementById('profileBanner');
  banner.style.backgroundImage = profile.banner_url ? `url(${profile.banner_url})` : '';

  DOM.profileUsername().textContent = profile.username;
  DOM.profileRole().textContent = profile.role;
  DOM.profileRole().className = `role-badge ${profile.role}`;
  DOM.joinDate().textContent = new Date(profile.created_at).toLocaleDateString();

  if (profile.bio) {
    DOM.profileBio().textContent = profile.bio;
    DOM.profileBio().style.fontStyle = 'normal';
    DOM.profileBio().style.color = 'var(--text)';
  } else {
    DOM.profileBio().textContent = 'This user has not written a bio yet.';
    DOM.profileBio().style.fontStyle = 'italic';
    DOM.profileBio().style.color = 'var(--text-muted)';
  }

  if (profile.location) {
    DOM.location().textContent = profile.location;
    DOM.locationMeta().style.display = 'flex';
  } else {
    DOM.locationMeta().style.display = 'none';
  }

  if (profile.website) {
    let url = profile.website.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    DOM.website().href = url;
    DOM.website().textContent = url.replace(/^https?:\/\//, '');
    DOM.websiteMeta().style.display = 'flex';
  } else {
    DOM.websiteMeta().style.display = 'none';
  }

  const socialLinks = [];
  if (profile.discord) socialLinks.push(`<span title="Discord: ${profile.discord}"><i class="fab fa-discord"></i></span>`);
  if (profile.twitter) socialLinks.push(`<a href="https://twitter.com/${profile.twitter.replace('@', '')}" target="_blank"><i class="fab fa-twitter"></i></a>`);
  if (profile.youtube) socialLinks.push(`<a href="${profile.youtube}" target="_blank"><i class="fab fa-youtube"></i></a>`);
  if (profile.github) socialLinks.push(`<a href="https://github.com/${profile.github}" target="_blank"><i class="fab fa-github"></i></a>`);
  DOM.profileSocial().innerHTML = socialLinks.join('') || '<span class="empty-state">No social links yet.</span>';

  DOM.postCount().textContent = profile.post_count || 0;
  DOM.reputation().textContent = profile.reputation || 0;

  buildHighlights(profile);

  DOM.aboutContent().innerHTML = profile.bio
    ? `<p>${escapeHtml(profile.bio)}</p>`
    : '<p class="empty-state">No additional information provided.</p>';
}

function populateEditForms(profile) {
  if (!DOM.editBio()) return;

  DOM.editBio().value = profile.bio || '';
  DOM.editBioCount().textContent = `${DOM.editBio().value.length}/500`;
  DOM.editLocation().value = profile.location || '';
  DOM.editWebsite().value = profile.website || '';
  DOM.editDiscord().value = profile.discord || '';
  DOM.editTwitter().value = profile.twitter || '';
  DOM.editYoutube().value = profile.youtube || '';
  DOM.editGithub().value = profile.github || '';
}

function buildHighlights(profile) {
  const highlights = [];

  if (profile.role === 'admin') highlights.push('Site Administrator');
  if (profile.role === 'moderator') highlights.push('Forum Moderator');
  if ((profile.solution_count || 0) > 0) highlights.push(`${profile.solution_count} accepted solutions`);
  if ((profile.post_count || 0) > 100) highlights.push('Top contributor');
  if ((profile.reputation || 0) > 500) highlights.push('High reputation member');

  if (highlights.length === 0) {
    highlights.push('No highlights yet. Keep engaging with the community!');
  }

  DOM.profileHighlights().innerHTML = highlights.map(item => `<li>${item}</li>`).join('');
}

async function loadUserActivity(userId) {
  await Promise.all([
    loadUserThreads(userId),
    loadUserPosts(userId),
    loadUserStats(userId),
    loadRecentActivity(userId),
  ]);
}

async function loadUserThreads(userId) {
  const supabase = await getSupabase();

  const { data: threads, error } = await supabase
    .from('threads')
    .select(`
      id,
      title,
      created_at,
      status,
      reply_count,
      view_count,
      categories (name, slug)
    `)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const container = DOM.userThreads();

  if (error || !threads || threads.length === 0) {
    container.innerHTML = '<p class="no-results">No threads yet.</p>';
    return;
  }

  container.innerHTML = threads.map(thread => `
    <div class="profile-activity-item">
      <div class="profile-activity-icon">
        <i class="fas fa-comments"></i>
      </div>
      <div class="profile-activity-content">
        <a href="/thread.html?id=${thread.id}" class="profile-activity-title">${escapeHtml(thread.title)}</a>
        <div class="profile-activity-meta">
          <span><i class="fas fa-folder"></i>${thread.categories?.name || 'General'}</span>
          <span><i class="fas fa-comment"></i>${thread.reply_count || 0} replies</span>
          <span><i class="fas fa-eye"></i>${thread.view_count || 0} views</span>
          <span><i class="fas fa-clock"></i>${formatDate(thread.created_at)}</span>
          <span><i class="fas fa-flag"></i>${thread.status || 'open'}</span>
        </div>
      </div>
    </div>
  `).join('');
}

async function loadUserPosts(userId) {
  const supabase = await getSupabase();

  const { data: posts, error } = await supabase
    .from('posts')
    .select(`
      id,
      content,
      created_at,
      like_count,
      threads (id, title)
    `)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const container = DOM.userPosts();

  if (error || !posts || posts.length === 0) {
    container.innerHTML = '<p class="no-results">No posts yet.</p>';
    return;
  }

  container.innerHTML = posts.map(post => `
    <div class="profile-activity-item">
      <div class="profile-activity-icon">
        <i class="fas fa-comment"></i>
      </div>
      <div class="profile-activity-content">
        <a href="/thread.html?id=${post.thread_id}" class="profile-activity-title">Re: ${escapeHtml(post.threads?.title || 'Thread')}</a>
        <div style="color: var(--text-muted); margin: 0.5rem 0;">${escapeHtml(post.content.substring(0, 150))}${post.content.length > 150 ? '…' : ''}</div>
        <div class="profile-activity-meta">
          <span><i class="fas fa-thumbs-up"></i>${post.like_count || 0} likes</span>
          <span><i class="fas fa-clock"></i>${formatDate(post.created_at)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

async function loadUserStats(userId) {
  const supabase = await getSupabase();

  const { count: threadsCount } = await supabase
    .from('threads')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', userId);

  const { count: solutionsCount } = await supabase
    .from('threads')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', userId)
    .eq('status', 'solved');

  DOM.threadsCount().textContent = threadsCount || 0;
  DOM.solutionsCount().textContent = solutionsCount || 0;

  if (profileUser) {
    profileUser = {
      ...profileUser,
      threads_count: threadsCount || 0,
      solution_count: solutionsCount || 0,
    };
    buildHighlights(profileUser);
  }
}

async function loadRecentActivity(userId) {
  const supabase = await getSupabase();

  const [{ data: threadActivity }, { data: postActivity }] = await Promise.all([
    supabase
      .from('threads')
      .select('id, title, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('posts')
      .select('id, content, created_at, thread_id')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const recent = [];

  (threadActivity || []).forEach(item => {
    recent.push({
      type: 'thread',
      title: item.title,
      link: `/thread.html?id=${item.id}`,
      created_at: item.created_at,
    });
  });

  (postActivity || []).forEach(item => {
    recent.push({
      type: 'post',
      title: item.content.substring(0, 80),
      link: `/thread.html?id=${item.thread_id}`,
      created_at: item.created_at,
    });
  });

  recent.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const recentContainer = DOM.recentActivity();

  if (recent.length === 0) {
    recentContainer.innerHTML = '<p class="no-results">No recent activity.</p>';
    return;
  }

  recentContainer.innerHTML = recent.slice(0, 6).map(item => `
    <div class="profile-activity-item">
      <div class="profile-activity-icon">
        <i class="fas ${item.type === 'thread' ? 'fa-comments' : 'fa-comment-dots'}"></i>
      </div>
      <div class="profile-activity-content">
        <a href="${item.link}" class="profile-activity-title">
          ${item.type === 'thread' ? 'Thread: ' : 'Reply: '}${escapeHtml(item.title)}
        </a>
        <div class="profile-activity-meta">
          <span><i class="fas fa-clock"></i>${formatDate(item.created_at)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll('.profile-tab'));
  const contents = Array.from(document.querySelectorAll('.profile-tab-content'));

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(btn => btn.classList.toggle('active', btn === tab));
      contents.forEach(section => section.classList.toggle('active', section.id === `${target}Tab`));
    });
  });
}

function setupEditControls() {
  const editBio = DOM.editBio();
  if (editBio) {
    editBio.addEventListener('input', () => {
      DOM.editBioCount().textContent = `${editBio.value.length}/500`;
    });
  }

  const openEditBtn = DOM.openEditTabBtn();
  if (openEditBtn) {
    openEditBtn.addEventListener('click', () => switchToTab('edit'));
  }

  const infoForm = DOM.profileInfoForm();
  if (infoForm) {
    infoForm.addEventListener('submit', handleProfileInfoSubmit);
  }

  const socialForm = DOM.profileSocialForm();
  if (socialForm) {
    socialForm.addEventListener('submit', handleSocialLinksSubmit);
  }

  const avatarInput = DOM.avatarInput();
  const bannerInput = DOM.bannerInput();
  const changeAvatarBtn = DOM.changeAvatarBtn();
  const changeBannerBtn = DOM.changeBannerBtn();

  if (changeAvatarBtn && avatarInput) {
    changeAvatarBtn.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', handleAvatarUpload);
  }

  if (changeBannerBtn && bannerInput) {
    changeBannerBtn.addEventListener('click', () => bannerInput.click());
    bannerInput.addEventListener('change', handleBannerUpload);
  }
}

function enableOwnerEditing() {
  const editTabBtn = DOM.editTabBtn();
  const openEditBtn = DOM.openEditTabBtn();

  if (editTabBtn) {
    editTabBtn.classList.remove('profile-tab-hidden');
  }

  if (openEditBtn) {
    openEditBtn.style.display = 'inline-flex';
  }

  const bannerEdit = DOM.changeBannerBtn();
  const avatarEdit = DOM.changeAvatarBtn();

  if (bannerEdit) bannerEdit.style.display = 'inline-flex';
  if (avatarEdit) avatarEdit.style.display = 'inline-flex';
}

function switchToTab(tabName) {
  const targetTabBtn = document.querySelector(`.profile-tab[data-tab="${tabName}"]`);
  const targetContent = document.getElementById(`${tabName}Tab`);

  if (!targetTabBtn || !targetContent) return;

  document.querySelectorAll('.profile-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.profile-tab-content').forEach(section => section.classList.remove('active'));

  targetTabBtn.classList.add('active');
  targetContent.classList.add('active');

  if (tabName === 'edit') {
    window.scrollTo({ top: DOM.profileTabs().offsetTop - 80, behavior: 'smooth' });
  }
}

async function handleProfileInfoSubmit(event) {
  event.preventDefault();
  if (!isAuthenticated() || !profileUser) return;

  const bio = DOM.editBio().value.trim();
  const location = DOM.editLocation().value.trim();
  const website = DOM.editWebsite().value.trim();

  try {
    const supabase = await getSupabase();

    const { error } = await supabase
      .from('profiles')
      .update({ bio, location, website })
      .eq('id', profileUser.id);

    if (error) throw error;

    profileUser = { ...profileUser, bio, location, website };
    renderProfile(profileUser);
    populateEditForms(profileUser);
    alert('Profile information updated successfully.');
  } catch (err) {
    console.error('Error updating profile info:', err);
    alert(`Failed to update profile info: ${err.message}`);
  }
}

async function handleSocialLinksSubmit(event) {
  event.preventDefault();
  if (!isAuthenticated() || !profileUser) return;

  const discord = DOM.editDiscord().value.trim();
  const twitter = DOM.editTwitter().value.trim();
  const youtube = DOM.editYoutube().value.trim();
  const github = DOM.editGithub().value.trim();

  try {
    const supabase = await getSupabase();

    const { error } = await supabase
      .from('profiles')
      .update({ discord, twitter, youtube, github })
      .eq('id', profileUser.id);

    if (error) throw error;

    profileUser = { ...profileUser, discord, twitter, youtube, github };
    renderProfile(profileUser);
    populateEditForms(profileUser);
    alert('Social links updated successfully.');
  } catch (err) {
    console.error('Error updating social links:', err);
    alert(`Failed to update social links: ${err.message}`);
  }
}

async function handleAvatarUpload(event) {
  const file = event.target.files?.[0];
  if (!file || !isAuthenticated()) return;

  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file.');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('Avatar must be less than 5MB.');
    return;
  }

  try {
    const supabase = await getSupabase();
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${profileUser.id}/avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('profile-images')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profileUser.id);

    if (updateError) throw updateError;

    profileUser = { ...profileUser, avatar_url: publicUrl };
    renderProfile(profileUser);
    alert('Avatar updated successfully.');
  } catch (err) {
    console.error('Error updating avatar:', err);
    alert(`Failed to update avatar: ${err.message}`);
  }
}

async function handleBannerUpload(event) {
  const file = event.target.files?.[0];
  if (!file || !isAuthenticated()) return;

  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file.');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert('Banner must be less than 10MB.');
    return;
  }

  try {
    const supabase = await getSupabase();
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${profileUser.id}/banners/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('profile-images')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ banner_url: publicUrl })
      .eq('id', profileUser.id);

    if (updateError) throw updateError;

    profileUser = { ...profileUser, banner_url: publicUrl };
    renderProfile(profileUser);
    alert('Banner updated successfully.');
  } catch (err) {
    console.error('Error updating banner:', err);
    alert(`Failed to update banner: ${err.message}`);
  }
}

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

