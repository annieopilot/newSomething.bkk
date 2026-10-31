import { createBrowserClient } from '@supabase/ssr';

// ใช้เฉพาะ URL และ publishable/anon key ซึ่งเปิดเผยฝั่ง browser ได้
// ห้ามใช้ service_role / secret key ในไฟล์นี้ เพราะไฟล์นี้ถูก import จาก client component
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl !== 'https://your-project.supabase.co' &&
  !supabaseUrl.includes('your-project')
);

/**
 * Supabase Client ฝั่ง browser (เก็บ session ไว้ใน cookies เพื่อให้ฝั่ง server อ่านได้)
 * createBrowserClient คืน instance เดิมทุกครั้งในฝั่ง browser
 */
export function createBrowserSupabaseClient() {
  if (!isSupabaseConfigured) return null;
  return createBrowserClient(supabaseUrl, supabaseKey);
}
