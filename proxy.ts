import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseUrl, supabaseKey, isSupabaseConfigured } from '@/lib/supabase';
import { getSafeRedirectPath } from '@/lib/auth-redirect';

/**
 * รีเฟรช session ของ Supabase Auth ใน cookies ทุก request (แนวทาง Supabase SSR)
 * และพาผู้ที่ล็อกอินแล้วออกจากหน้า /login
 * หมายเหตุ: การตรวจสิทธิ์จริงทำใน Server Actions และ RLS ไม่ได้พึ่ง proxy นี้
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // ห้ามมีโค้ดอื่นคั่นระหว่าง createServerClient กับ getClaims()
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  if (isLoggedIn && request.nextUrl.pathname === '/login') {
    const target = getSafeRedirectPath(request.nextUrl.searchParams.get('next'));
    const redirectResponse = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
