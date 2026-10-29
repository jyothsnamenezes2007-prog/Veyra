import { createClient } from '@supabase/supabase-js';

// Read Supabase environment variables from Vite
const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseUrl = rawUrl ? rawUrl.trim().replace(/\/+$/, '') : '';
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

// Check if credentials have been entered in .env.local
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  supabaseUrl !== '' &&
  supabasePublishableKey !== '' &&
  supabaseUrl.startsWith('http')
);

// Create reusable Supabase client if configured, otherwise provide safe fallback
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
