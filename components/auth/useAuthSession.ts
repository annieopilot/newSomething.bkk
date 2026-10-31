'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * ติดตามสถานะ session ของ Supabase Auth ฝั่ง browser (session เก็บใน cookies จึงคงอยู่หลัง refresh)
 * ใช้สำหรับแสดงผล UI เท่านั้น — การตรวจสิทธิ์จริงอยู่ใน Server Actions และ RLS
 */
export function useAuthSession() {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'unauthenticated');

  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session ? 'authenticated' : 'unauthenticated');
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

  return { user, status, signOut };
}
