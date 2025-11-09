import { getSupabase, FORUM_CONFIG } from './forum/config.js';
import { getCurrentProfile, isAuthenticated } from './forum/auth.js';

let currentProfile = null;
let selectedUserId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if (!isAuthenticated()) {
    window.location.href = '/forum.html';
    return;
  }

  currentProfile = getCurrentProfile();
  await loadProfileData();
  setupEventListeners();
  
  // Show admin panel if admin
  if (currentProfile.role === 'admin') {
    document.getElementById('adminPanel').style.display = 'block';
    setupAdminPanel();
  }
});

// Load profile data
async function loadProfileData() {
  const supabase = await getSupabase();
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentProfile.id)
    .single();
  
  if (error || !profile) {
    console.error('Error loading profile:', error);
    return;
  }
  
  // Populate form fields
  document.getElementById('username').value = profile.username;
  document.getElementById('email').value = profile.email || '';
  document.getElementById('bio').value = profile.bio || '';
  document.getElementById('location').value = profile.location || '';
  document.getElementById('website').value = profile.website || '';
  document.getElementById('discord').value = profile.discord || '';
  document.getElementById('twitter').value = profile.twitter || '';
  document.getElementById('youtube').value = profile.youtube || '';
  document.getElementById('github').value = profile.github || '';

  const roleLabel = document.getElementById('currentRoleLabel');
  if (roleLabel) {
    roleLabel.textContent = profile.role || 'user';
    roleLabel.className = `role-pill ${profile.role || 'user'}`;
  }

  const makeAdminBtn = document.getElementById('makeAdminBtn');
  if (makeAdminBtn) {
    if (profile.role === 'admin') {
      makeAdminBtn.disabled = true;
      makeAdminBtn.innerHTML = '<i class="fas fa-crown"></i> You are already an admin';
      document.getElementById('roleHint').textContent = 'You already have full moderation privileges.';
    } else {
      makeAdminBtn.disabled = false;
      makeAdminBtn.innerHTML = '<i class="fas fa-crown"></i> Promote Myself to Admin';
      document.getElementById('roleHint').textContent = 'Admins can manage any thread, delete any post, assign roles to others, and access advanced moderation tools.';
    }
  }
  
  // Update bio counter
  updateBioCounter();
  
  // Set preview images
  if (profile.avatar_url) {
    document.getElementById('avatarPreview').src = profile.avatar_url;
  }
  
  if (profile.banner_url) {
    const bannerPreview = document.getElementById('bannerPreview');
    bannerPreview.style.backgroundImage = `url(${profile.banner_url})`;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Bio counter
  document.getElementById('bio').addEventListener('input', updateBioCounter);
  
  // Avatar upload
  document.getElementById('uploadAvatarBtn').addEventListener('click', () => {
    document.getElementById('avatarInput').click();
  });
  
  document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
  
  // Banner upload
  document.getElementById('uploadBannerBtn').addEventListener('click', () => {
    document.getElementById('bannerInput').click();
  });
  
  document.getElementById('bannerInput').addEventListener('change', handleBannerUpload);
  
  // Basic info form
  document.getElementById('basicInfoForm').addEventListener('submit', handleBasicInfoSubmit);
  
  // Social links form
  document.getElementById('socialLinksForm').addEventListener('submit', handleSocialLinksSubmit);
  
  // Delete account
  document.getElementById('deleteAccountBtn').addEventListener('click', handleDeleteAccount);

  const makeAdminBtn = document.getElementById('makeAdminBtn');
  if (makeAdminBtn) {
    makeAdminBtn.addEventListener('click', handleMakeAdmin);
  }
}

async function handleMakeAdmin() {
  if (!currentProfile) return;

  if (currentProfile.role === 'admin') {
    alert('You are already an admin.');
    return;
  }

  if (!confirm('Promote yourself to Admin? This grants full moderation access.')) {
    return;
  }

  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', currentProfile.id);

    if (error) throw error;

    currentProfile.role = 'admin';
    localStorage.setItem('userProfile', JSON.stringify(currentProfile));

    alert('You are now an admin! Reloading...');
    window.location.reload();
  } catch (error) {
    console.error('Error promoting to admin:', error);
    alert('Failed to promote: ' + error.message);
  }
}

// Update bio counter
function updateBioCounter() {
  const bio = document.getElementById('bio').value;
  document.getElementById('bioCount').textContent = `${bio.length}/500`;
}

// Handle avatar upload
async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // Validate file
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB
    alert('Image must be less than 5MB');
    return;
  }
  
  try {
    const supabase = await getSupabase();
    
    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${currentProfile.id}/avatars/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (uploadError) throw uploadError;
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('profile-images')
      .getPublicUrl(filePath);
    
    // Update profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', currentProfile.id);
    
    if (updateError) throw updateError;
    
    // Update preview
    document.getElementById('avatarPreview').src = publicUrl;
    
    // Update stored profile
    currentProfile.avatar_url = publicUrl;
    localStorage.setItem('userProfile', JSON.stringify(currentProfile));
    
    alert('Avatar updated successfully!');
  } catch (error) {
    console.error('Error uploading avatar:', error);
    alert('Failed to upload avatar: ' + error.message);
  }
}

// Handle banner upload
async function handleBannerUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // Validate file
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file');
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) { // 10MB
    alert('Image must be less than 10MB');
    return;
  }
  
  try {
    const supabase = await getSupabase();
    
    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${currentProfile.id}/banners/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (uploadError) throw uploadError;
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('profile-images')
      .getPublicUrl(filePath);
    
    // Update profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ banner_url: publicUrl })
      .eq('id', currentProfile.id);
    
    if (updateError) throw updateError;
    
    // Update preview
    const bannerPreview = document.getElementById('bannerPreview');
    bannerPreview.style.backgroundImage = `url(${publicUrl})`;
    
    // Update stored profile
    currentProfile.banner_url = publicUrl;
    localStorage.setItem('userProfile', JSON.stringify(currentProfile));
    
    alert('Banner updated successfully!');
  } catch (error) {
    console.error('Error uploading banner:', error);
    alert('Failed to upload banner: ' + error.message);
  }
}

// Handle basic info submit
async function handleBasicInfoSubmit(e) {
  e.preventDefault();
  
  const bio = document.getElementById('bio').value.trim();
  const location = document.getElementById('location').value.trim();
  const website = document.getElementById('website').value.trim();
  
  try {
    const supabase = await getSupabase();
    
    const { error } = await supabase
      .from('profiles')
      .update({
        bio,
        location,
        website
      })
      .eq('id', currentProfile.id);
    
    if (error) throw error;
    
    alert('Profile updated successfully!');
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('Failed to update profile: ' + error.message);
  }
}

// Handle social links submit
async function handleSocialLinksSubmit(e) {
  e.preventDefault();
  
  const discord = document.getElementById('discord').value.trim();
  const twitter = document.getElementById('twitter').value.trim();
  const youtube = document.getElementById('youtube').value.trim();
  const github = document.getElementById('github').value.trim();
  
  try {
    const supabase = await getSupabase();
    
    const { error } = await supabase
      .from('profiles')
      .update({
        discord,
        twitter,
        youtube,
        github
      })
      .eq('id', currentProfile.id);
    
    if (error) throw error;
    
    alert('Social links updated successfully!');
  } catch (error) {
    console.error('Error updating social links:', error);
    alert('Failed to update social links: ' + error.message);
  }
}

// Setup admin panel
function setupAdminPanel() {
  const userSearch = document.getElementById('userSearch');
  const assignRoleBtn = document.getElementById('assignRoleBtn');
  
  // Debounce search
  let searchTimeout;
  userSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchUsers(userSearch.value);
    }, 300);
  });
  
  // Assign role
  assignRoleBtn.addEventListener('click', handleAssignRole);
}

// Search users (admin)
async function searchUsers(query) {
  if (!query || query.length < 2) {
    document.getElementById('userSearchResults').innerHTML = '';
    return;
  }
  
  const supabase = await getSupabase();
  
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, username, email, role, avatar_url')
    .or(`username.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10);
  
  if (error) {
    console.error('Error searching users:', error);
    return;
  }
  
  const resultsContainer = document.getElementById('userSearchResults');
  
  if (users.length === 0) {
    resultsContainer.innerHTML = '<p class="no-results">No users found</p>';
    return;
  }
  
  resultsContainer.innerHTML = users.map(user => `
    <div class="user-search-result" data-user-id="${user.id}">
      <img src="${user.avatar_url || '/assets/default-avatar.png'}" alt="${user.username}">
      <div class="user-info">
        <strong>${user.username}</strong>
        <span class="user-role ${user.role}">${user.role}</span>
        <small>${user.email}</small>
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.user-search-result').forEach(el => {
    el.addEventListener('click', () => {
      selectUser(el.dataset.userId, users.find(u => u.id === el.dataset.userId));
    });
  });
}

// Select user for role assignment
function selectUser(userId, user) {
  selectedUserId = userId;
  
  document.getElementById('selectedUsername').textContent = user.username;
  document.getElementById('selectedUserEmail').textContent = user.email;
  document.getElementById('roleSelect').value = user.role;
  document.getElementById('selectedUserPanel').style.display = 'block';
  
  // Highlight selected
  document.querySelectorAll('.user-search-result').forEach(el => {
    el.classList.toggle('selected', el.dataset.userId === userId);
  });
}

// Handle assign role
async function handleAssignRole() {
  if (!selectedUserId) {
    alert('Please select a user first');
    return;
  }
  
  const newRole = document.getElementById('roleSelect').value;
  
  if (!confirm(`Are you sure you want to assign the role "${newRole}" to this user?`)) {
    return;
  }
  
  try {
    const supabase = await getSupabase();
    
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', selectedUserId);
    
    if (error) throw error;
    
    alert('Role assigned successfully!');
    
    // Clear selection
    document.getElementById('selectedUserPanel').style.display = 'none';
    document.getElementById('userSearch').value = '';
    document.getElementById('userSearchResults').innerHTML = '';
    selectedUserId = null;
  } catch (error) {
    console.error('Error assigning role:', error);
    alert('Failed to assign role: ' + error.message);
  }
}

// Handle delete account
async function handleDeleteAccount() {
  const confirmation = prompt('Type "DELETE" to confirm account deletion:');
  
  if (confirmation !== 'DELETE') {
    return;
  }
  
  if (!confirm('This action cannot be undone. Are you absolutely sure?')) {
    return;
  }
  
  try {
    const supabase = await getSupabase();
    
    // Delete user data (cascades will handle related data)
    const { error } = await supabase.auth.admin.deleteUser(currentProfile.id);
    
    if (error) throw error;
    
    // Sign out
    await supabase.auth.signOut();
    
    alert('Account deleted successfully');
    window.location.href = '/';
  } catch (error) {
    console.error('Error deleting account:', error);
    alert('Failed to delete account: ' + error.message);
  }
}

