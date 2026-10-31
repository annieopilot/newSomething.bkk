import 'server-only';

import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { supabaseUrl, supabaseKey } from '@/lib/supabase';

// Client สาธารณะ (ไม่มี session ผู้ใช้) สำหรับอ่านข้อมูลใน Server Actions
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * สร้าง Supabase Client ที่ผูกกับ session ของผู้ใช้ (อ่านจาก cookies) สำหรับแต่ละ request
 * การเขียนข้อมูลผ่าน client นี้จะทำงานในฐานะ role `authenticated` และยังอยู่ภายใต้ RLS เสมอ
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // ถูกเรียกจาก Server Component ที่ตั้ง cookie ไม่ได้ — proxy.ts จะรีเฟรช session ให้แทน
        }
      },
    },
  });
}

/**
 * ตรวจสอบผู้ใช้กับ Supabase Auth server (ไม่เชื่อข้อมูลจาก client)
 */
export async function getAuthenticatedClient() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, user: data.user };
}
