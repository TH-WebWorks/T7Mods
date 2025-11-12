// Supabase Configuration
// IMPORTANT: Replace these with your actual Supabase credentials
export const SUPABASE_URL = 'https://phhrnnmgfguqfqbselji.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoaHJubm1nZmd1cWZxYnNlbGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MzgwODksImV4cCI6MjA3ODIxNDA4OX0.2B4Q0bFnoKFYGYgNWp6GKXZLswRNMGXt71d5wCToYkc';

// Initialize Supabase client (using CDN)
let supabase = null;

// Load Supabase from CDN
export async function initSupabase() {
  if (supabase) return supabase;

  // Load Supabase JS from CDN
  if (!window.supabase) {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

// Helper to load external scripts
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Get Supabase instance
export async function getSupabase() {
  if (!supabase) {
    await initSupabase();
  }
  return supabase;
}

// Forum Configuration
export const FORUM_CONFIG = {
  threadsPerPage: 20,
  postsPerPage: 10,
  maxImageSize: 5 * 1024 * 1024, // 5MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxTags: 3,
  minUsernameLength: 3,
  minPasswordLength: 6,
};

// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  VERIFIED_MODDER: 'verified_modder',
  CREATOR: 'creator',
  SUPPORT: 'support',
  PARTNER: 'partner',
  MEMBER: 'member',
};

// Thread status
export const THREAD_STATUS = {
  OPEN: 'open',
  SOLVED: 'solved',
  CLOSED: 'closed',
  WIP: 'wip',
  RELEASE: 'release',
};

// Notification types
export const NOTIFICATION_TYPES = {
  REPLY: 'reply',
  MENTION: 'mention',
  LIKE: 'like',
  SOLUTION: 'solution',
};

