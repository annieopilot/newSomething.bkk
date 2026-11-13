'use client';

import React from 'react';
import { Coffee, Plus, Scale, RefreshCw, Layers, BarChart3, AlertCircle, Database, LogIn, LogOut, Loader2 } from 'lucide-react';

import type { AuthStatus } from '@/components/auth/useAuthSession';
import { ThemeToggle } from '@/components/ThemeToggle';

interface HeaderProps {
  onAddNew: () => void;
  onOpenScaleModal: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  totalLowStock: number;
  isSupabaseConnected: boolean;
  onOpenSupabaseConfig: () => void;
  authStatus: AuthStatus;
  userEmail?: string | null;
  onLogin: () => void;
  onLogout: () => void;
  isLoggingOut: boolean;
}

export function Header({
  onAddNew,
  onOpenScaleModal,
  onRefresh,
  isRefreshing,
  totalLowStock,
  isSupabaseConnected,
  onOpenSupabaseConfig,
  authStatus,
  userEmail,
  onLogin,
  onLogout,
  isLoggingOut,
}: HeaderProps) {
  return (
    <header className="bg-card border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2">
          
          {/* Logo & POS Brand */}
          <div className="flex items-center space-x-2.5 sm:space-x-3.5 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm shrink-0">
              <Coffee className="w-5 h-5 sm:w-6 sm:h-6 text-latte" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="text-base sm:text-xl font-bold tracking-tight text-ink truncate">
                  BREW & CO.
                </span>
                <span className="hidden xs:inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-accent/10 text-accent shrink-0">
                  POS
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate hidden sm:block">
                ระบบจัดการสต็อก & พัสดุร้านกาแฟ พร้อมฟังก์ชันชั่งตัดภาชนะ (Tare Weight)
              </p>
            </div>
          </div>

          {/* Right Controls: Database Badge + Actions */}
          <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
            
            {/* Supabase Connection Status Badge */}
            <button
              onClick={onOpenSupabaseConfig}
              title="คลิกเพื่อดูการตั้งค่า Supabase"
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-medium touch-press transition-colors ${
                isSupabaseConnected
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Database className={`w-3.5 h-3.5 ${isSupabaseConnected ? 'text-emerald-600' : 'text-slate-500'}`} />
              <span className="hidden md:inline">{isSupabaseConnected ? 'Supabase Connected' : 'เชื่อมต่อ Supabase'}</span>
              <span className="md:hidden">{isSupabaseConnected ? 'Cloud' : 'Local'}</span>
              <span className={`w-2 h-2 rounded-full ${isSupabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            </button>

            <ThemeToggle className="h-9 w-9 sm:h-11 sm:w-11" />

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="รีเฟรชข้อมูลสต็อก"
              className="h-9 w-9 sm:h-11 sm:w-11 flex items-center justify-center rounded-lg border border-slate-200 bg-card text-slate-700 hover:bg-slate-50 active:bg-slate-100 touch-press transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isRefreshing ? 'animate-spin text-accent' : ''}`} />
            </button>

            {/* Scale Tare Quick Tool */}
            <button
              onClick={onOpenScaleModal}
              title="ชั่งตัดภาชนะ (Tare Deduction Tool)"
              className="h-9 sm:h-11 px-2.5 sm:px-3.5 rounded-lg border border-tare/30 bg-tare/5 hover:bg-tare/10 active:bg-tare/15 text-tare font-semibold text-xs sm:text-sm flex items-center space-x-1 sm:space-x-1.5 touch-press transition-colors"
            >
              <Scale className="w-4 h-4 text-tare" />
              <span className="hidden sm:inline">ชั่งตัดภาชนะ</span>
              <span className="sm:hidden">ชั่งตัด</span>
            </button>

            {/* Add New Button */}
            <button
              onClick={onAddNew}
              title="เพิ่มรายการใหม่"
              className="h-9 sm:h-11 px-3 sm:px-4 rounded-lg bg-primary hover:bg-primary-hover active:bg-primary-active text-white font-semibold text-xs sm:text-sm flex items-center space-x-1 sm:space-x-1.5 shadow-sm touch-press transition-colors"
            >
              <Plus className="w-4 h-4 text-latte" />
              <span className="hidden md:inline">เพิ่มรายการ</span>
              <span className="md:hidden">เพิ่ม</span>
            </button>
          </div>
        </div>

        {/* Supabase Real Tables Navigation Bar - Touch Friendly Segmented Tabs */}
        <div className="py-2 border-t border-slate-100 flex items-center justify-between gap-2">
          
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 min-w-0">
            <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate">คลังวัตถุดิบ อุปกรณ์ และสินค้า</span>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {totalLowStock > 0 && (
              <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-bold border border-warning/20 shrink-0">
                <AlertCircle className="w-3.5 h-3.5 text-warning" />
                <span>ใกล้หมด {totalLowStock} รายการ</span>
              </div>
            )}

            {/* Auth Session Control */}
            {authStatus === 'loading' ? (
              <div className="h-9 px-3 flex items-center rounded-lg border border-slate-200 bg-card text-slate-500 text-xs font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
            ) : authStatus === 'authenticated' ? (
              <div className="flex items-center space-x-1.5">
                <span className="hidden md:inline max-w-48 truncate text-xs font-medium text-slate-600" title={userEmail || undefined}>
                  {userEmail}
                </span>
                <button
                  onClick={onLogout}
                  disabled={isLoggingOut}
                  title="ออกจากระบบ"
                  className="h-9 px-2.5 sm:px-3 rounded-lg border border-slate-200 bg-card text-slate-700 hover:bg-slate-50 active:bg-slate-100 text-xs font-semibold flex items-center space-x-1.5 touch-press transition-colors disabled:opacity-50"
                >
                  {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isLoggingOut ? 'กำลังออก...' : 'ออกจากระบบ'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onLogin}
                title="เข้าสู่ระบบเพื่อแก้ไขข้อมูล"
                className="h-9 px-2.5 sm:px-3 rounded-lg border border-accent/30 bg-accent/5 hover:bg-accent/10 active:bg-accent/15 text-accent text-xs font-semibold flex items-center space-x-1.5 touch-press transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">เข้าสู่ระบบ</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
