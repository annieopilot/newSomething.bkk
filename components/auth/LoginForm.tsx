'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { AuthError } from '@supabase/supabase-js';
import { Coffee, LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import { getSafeRedirectPath } from '@/lib/auth-redirect';

function toLoginErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    case 'email_not_confirmed':
      return 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
    case 'user_banned':
      return 'บัญชีนี้ถูกระงับการใช้งาน';
    default:
      return error.status === 0 || !error.status
        ? 'ไม่สามารถเชื่อมต่อ Supabase ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
        : `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`;
  }
}

// จำเฉพาะอีเมลล่าสุดไว้ในเครื่อง (ไม่เก็บรหัสผ่าน — ให้ password manager ของเบราว์เซอร์จำแทน)
const LAST_EMAIL_KEY = 'brewco:last-login-email';

function readLastEmail(): string {
  try {
    return typeof window === 'undefined' ? '' : window.localStorage.getItem(LAST_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

function saveLastEmail(email: string) {
  try {
    window.localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // เบราว์เซอร์ไม่อนุญาตให้ใช้ localStorage — ข้ามไป
  }
}

/**
 * ขอให้เบราว์เซอร์ (Chrome/Edge/Android) บันทึกรหัสผ่านไว้ใน password manager ทันทีหลังล็อกอินสำเร็จ
 * เบราว์เซอร์ที่ไม่รองรับ (เช่น Safari) จะตรวจจับจากฟอร์มเองตาม autocomplete
 */
async function storeBrowserCredential(form: HTMLFormElement) {
  try {
    const PasswordCredentialCtor = (window as unknown as { PasswordCredential?: new (form: HTMLFormElement) => Credential }).PasswordCredential;
    if (!PasswordCredentialCtor || !navigator.credentials?.store) return;
    await navigator.credentials.store(new PasswordCredentialCtor(form));
  } catch {
    // ผู้ใช้ปฏิเสธหรือเบราว์เซอร์ไม่รองรับ — ไม่กระทบการล็อกอิน
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeRedirectPath(searchParams.get('next'));

  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [email, setEmail] = useState(readLastEmail);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    supabase ? null : 'ยังไม่ได้ตั้งค่า Supabase (NEXT_PUBLIC_SUPABASE_URL / key) จึงยังเข้าสู่ระบบไม่ได้'
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase || loading) return;
    const form = e.currentTarget;

    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(toLoginErrorMessage(signInError));
        setLoading(false);
        return;
      }

      saveLastEmail(email.trim());
      await storeBrowserCredential(form);

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError('ไม่สามารถเชื่อมต่อ Supabase ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Brand */}
      <div className="px-6 pt-7 pb-5 flex flex-col items-center text-center border-b border-slate-100 bg-[#F8F9FA]">
        <div className="w-12 h-12 rounded-xl bg-[#2D2B2A] flex items-center justify-center shadow-sm mb-3">
          <Coffee className="w-6 h-6 text-[#D4A373]" />
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xl font-bold tracking-tight text-[#1A1A1A]">BREW & CO.</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#8B5A2B]/10 text-[#8B5A2B]">
            POS
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium mt-1">เข้าสู่ระบบเพื่อแก้ไขข้อมูลสต็อก</p>
      </div>

      <form onSubmit={handleSubmit} method="post" action="/login" className="px-6 py-6 space-y-4">
        {error && (
          <div role="alert" className="flex items-start space-x-2 px-3 py-2.5 rounded-lg bg-[#C62828]/5 border border-[#C62828]/20 text-[#C62828] text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1.5">
            อีเมล
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoFocus={!email}
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="w-full h-12 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-[#1A1A1A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent transition-all disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1.5">
            รหัสผ่าน
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoFocus={Boolean(email)}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="w-full h-12 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-[#1A1A1A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent transition-all disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !supabase}
          className="w-full h-12 rounded-xl bg-[#2D2B2A] hover:bg-[#1f1e1d] active:bg-[#151414] text-white font-semibold text-sm flex items-center justify-center space-x-2 shadow-xs touch-press transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#D4A373]" />
          ) : (
            <LogIn className="w-4 h-4 text-[#D4A373]" />
          )}
          <span>{loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</span>
        </button>

        <p className="text-[11px] text-slate-500 text-center leading-relaxed">
          ระบบนี้ไม่เปิดสมัครสมาชิก หากยังไม่มีบัญชี กรุณาติดต่อผู้ดูแลระบบเพื่อขอคำเชิญ
        </p>

        <div className="text-center">
          <Link href="/" className="text-xs font-semibold text-[#8B5A2B] hover:underline">
            กลับไปหน้าสต็อก (ดูอย่างเดียว)
          </Link>
        </div>
      </form>
    </div>
  );
}
