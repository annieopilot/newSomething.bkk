'use client';

import { useLayoutEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

/** ค่าเริ่มต้น = มืด; เลือกสว่างแล้วจำไว้ใน localStorage "theme" (สคริปต์ใน app/layout.tsx อ่านก่อนวาดหน้า) */
export const THEME_STORAGE_KEY = 'theme';

function savedTheme(): 'light' | 'dark' {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  // ตอน dev React (Strict Mode) ล้าง attribute ที่สคริปต์ตั้งไว้บน <html> — ตั้งกลับก่อนวาดหน้า (production ไม่มีผล)
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', savedTheme());
  }, []);

  const toggle = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // โหมดส่วนตัว/ปิด storage — สลับได้แต่ไม่จำ
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title="สลับโหมดมืด/สว่าง"
      aria-label="สลับโหมดมืด/สว่าง"
      className={`flex items-center justify-center rounded-lg border border-slate-200 bg-card text-slate-700 hover:bg-slate-50 active:bg-slate-100 touch-press transition-colors ${className}`}
    >
      <Sun className="w-4 h-4 sm:w-5 sm:h-5 hidden dark:block" />
      <Moon className="w-4 h-4 sm:w-5 sm:h-5 dark:hidden" />
    </button>
  );
}
