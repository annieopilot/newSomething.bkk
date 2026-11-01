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
 * ตรวจสอบ session ของผู้ใช้
 * getClaims() ตรวจลายเซ็น JWT ในเครื่องด้วย public key ของโปรเจกต์ (ไม่ต้องวิ่งไปถาม Auth server ทุกครั้ง
 * เหมือน getUser()) — ถ้าโปรเจกต์ยังใช้ JWT secret แบบเดิม supabase-js จะถาม Auth server ให้เองโดยอัตโนมัติ
 * สิทธิ์อ่าน/เขียนจริงยังถูกตรวจซ้ำที่ฐานข้อมูลด้วย RLS เสมอ
 */
export async function getAuthenticatedClient() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims) return null;
  return { client, claims: data.claims };
}
