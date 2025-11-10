import { getSupabase } from './config.js';

// Current user state
let currentUser = null;
let currentProfile = null;

function emitAuthChange() {
  window.dispatchEvent(new CustomEvent('profile-auth-changed', {
    detail: {
      user: currentUser,
      profile: currentProfile,
    },
  }));
}

// Initialize auth
export async function initAuth() {
  const supabase = await getSupabase();
  
  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    await loadUserProfile(session.user);
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await loadUserProfile(session.user);
      window.location.reload(); // Refresh to update UI
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      updateAuthUI();
      emitAuthChange();
    }
  });

  // Update UI based on auth state
  updateAuthUI();
  setupAuthHandlers();
  emitAuthChange();
}

// Load user profile from database
async function loadUserProfile(user) {
  const supabase = await getSupabase();
  currentUser = user;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error loading profile:', error);
    return;
  }

  currentProfile = data;
  emitAuthChange();
}

// Update UI based on auth state
function updateAuthUI() {
  const loginBtn = document.getElementById('loginBtn');
  const newThreadBtns = document.querySelectorAll('#newThreadBtn');
  const replyFormContainer = document.getElementById('replyFormContainer');

  if (currentUser && currentProfile) {
    // User is logged in
    if (loginBtn) {
      // Replace button with profile link and logout button
      loginBtn.outerHTML = `
        <a href="/profile.html?id=${currentProfile.id}" class="cta-button profile-btn">
          <img src="${getAvatarUrl(currentProfile.avatar_url)}" 
               alt="${currentProfile.username}" 
               class="nav-avatar">
          ${currentProfile.username}
        </a>
        <button class="cta-button danger" id="logoutBtn" title="Logout">
          <i class="fas fa-sign-out-alt"></i>
        </button>
      `;
      
      // Setup logout (do it in next tick so the button exists)
      setTimeout(() => {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleLogout();
          });
        }
      }, 100);
    }

    // Show create thread buttons
    newThreadBtns.forEach(btn => {
      btn.style.display = 'inline-flex';
    });

    // Show reply form on thread pages
    if (replyFormContainer) {
      replyFormContainer.style.display = 'block';
    }
  } else {
    // User is not logged in
    if (loginBtn) {
      loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
      loginBtn.classList.add('login-btn');
      loginBtn.classList.remove('profile-btn');
    }

    // Hide create thread buttons
    newThreadBtns.forEach(btn => {
      btn.style.display = 'none';
    });

    // Hide reply form
    if (replyFormContainer) {
      replyFormContainer.style.display = 'none';
    }
  }
}

// Setup auth event handlers
function setupAuthHandlers() {
  // Login button (only if user is NOT logged in)
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn && !currentUser) {
    loginBtn.addEventListener('click', () => {
      showAuthModal('login');
    });
  }

  // Modal handlers
  setupModalHandlers();
  
  // Form handlers
  setupFormHandlers();
}

// Setup modal handlers
function setupModalHandlers() {
  const authModal = document.getElementById('authModal');
  const modalCloses = document.querySelectorAll('.modal-close');
  const showSignupLink = document.getElementById('showSignup');
  const showLoginLink = document.getElementById('showLogin');

  // Close modals
  modalCloses.forEach(close => {
    close.addEventListener('click', () => {
      authModal.style.display = 'none';
    });
  });

  // Click outside to close
  window.addEventListener('click', (e) => {
    if (e.target === authModal) {
      authModal.style.display = 'none';
    }
  });

  // Switch between login and signup
  if (showSignupLink) {
    showSignupLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('signupForm').style.display = 'block';
    });
  }

  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('signupForm').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
    });
  }
}

// Setup form handlers
function setupFormHandlers() {
  // Login form
  const loginForm = document.getElementById('loginFormElement');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleLogin();
    });
  }

  // Signup form
  const signupForm = document.getElementById('signupFormElement');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSignup();
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await handleLogout();
    });
  }
}

// Handle login
async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const supabase = await getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert('Login failed: ' + error.message);
    return;
  }

  // Modal will close on auth state change
  document.getElementById('authModal').style.display = 'none';
}

// Handle signup
async function handleSignup() {
  const username = document.getElementById('signupUsername').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const supabase = await getSupabase();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username,
      }
    }
  });

  if (error) {
    alert('Signup failed: ' + error.message);
    return;
  }

  if (data.user && data.user.identities && data.user.identities.length === 0) {
    alert('This email is already registered. Please try logging in instead.');
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    return;
  }

  alert('Signup successful! Please check your email to confirm your account.');
  document.getElementById('authModal').style.display = 'none';
}

// Handle logout
async function handleLogout() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  currentUser = null;
  currentProfile = null;
  localStorage.removeItem('userProfile');
  window.location.href = '/forum.html';
}

// Show auth modal
export function showAuthModal(mode = 'login') {
  const authModal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');

  if (mode === 'login') {
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
  } else {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  }

  authModal.style.display = 'flex';
}

// Get avatar URL
function getAvatarUrl(avatarUrl) {
  if (avatarUrl) {
    return avatarUrl;
  }
  // Default avatar
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(currentProfile?.username || 'User')}&background=7dd3fc&color=0a0a0a&size=40`;
}

// Export current user getters
export function getCurrentUser() {
  return currentUser;
}

export function getCurrentProfile() {
  return currentProfile;
}

export function isAuthenticated() {
  return currentUser !== null;
}

export function hasRole(role) {
  if (!currentProfile) return false;
  return currentProfile.role === role;
}

export function isAdmin() {
  return hasRole('admin');
}

export function isModerator() {
  return hasRole('moderator') || isAdmin();
}

// Initialize auth when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}

