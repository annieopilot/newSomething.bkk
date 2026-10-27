'use client';

import React, { useState, useEffect } from 'react';
import { Coffee, Plus, Scale, RefreshCw, Layers, ShoppingBag, BarChart3, AlertCircle, Database } from 'lucide-react';

import { InventoryTab } from '@/types/ingredient';

interface HeaderProps {
  onAddNew: () => void;
  onOpenScaleModal: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  totalLowStock: number;
  isSupabaseConnected: boolean;
  onOpenSupabaseConfig: () => void;
  activeTab: InventoryTab;
  onTabChange: (tab: InventoryTab) => void;
}

export function Header({
  onAddNew,
  onOpenScaleModal,
  onRefresh,
  isRefreshing,
  totalLowStock,
  isSupabaseConnected,
  onOpenSupabaseConfig,
  activeTab,
  onTabChange,
}: HeaderProps) {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString('th-TH', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-[#FFFFFF] border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2">
          
          {/* Logo & POS Brand */}
          <div className="flex items-center space-x-2.5 sm:space-x-3.5 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#2D2B2A] flex items-center justify-center text-[#F8F9FA] shadow-sm shrink-0">
              <Coffee className="w-5 h-5 sm:w-6 sm:h-6 text-[#D4A373]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="text-base sm:text-xl font-bold tracking-tight text-[#1A1A1A] truncate">
                  BREW & CO.
                </span>
                <span className="hidden xs:inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-[#8B5A2B]/10 text-[#8B5A2B] shrink-0">
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

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="รีเฟรชข้อมูลสต็อก"
              className="h-9 w-9 sm:h-11 sm:w-11 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 touch-press transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isRefreshing ? 'animate-spin text-[#8B5A2B]' : ''}`} />
            </button>

            {/* Scale Tare Quick Tool */}
            <button
              onClick={onOpenScaleModal}
              title="ชั่งตัดภาชนะ (Tare Deduction Tool)"
              className="h-9 sm:h-11 px-2.5 sm:px-3.5 rounded-lg border border-[#1565C0]/30 bg-[#1565C0]/5 hover:bg-[#1565C0]/10 active:bg-[#1565C0]/15 text-[#1565C0] font-semibold text-xs sm:text-sm flex items-center space-x-1 sm:space-x-1.5 touch-press transition-colors"
            >
              <Scale className="w-4 h-4 text-[#1565C0]" />
              <span className="hidden sm:inline">ชั่งตัดภาชนะ</span>
              <span className="sm:hidden">ชั่งตัด</span>
            </button>

            {/* Add New Button */}
            <button
              onClick={onAddNew}
              title="เพิ่มรายการใหม่"
              className="h-9 sm:h-11 px-3 sm:px-4 rounded-lg bg-[#2D2B2A] hover:bg-[#1f1e1d] active:bg-[#151414] text-white font-semibold text-xs sm:text-sm flex items-center space-x-1 sm:space-x-1.5 shadow-sm touch-press transition-colors"
            >
              <Plus className="w-4 h-4 text-[#D4A373]" />
              <span className="hidden md:inline">{activeTab === 'supplies' ? 'เพิ่มพัสดุ/อุปกรณ์' : 'เพิ่มสินค้า/เมนู'}</span>
              <span className="md:hidden">เพิ่ม</span>
            </button>
          </div>
        </div>

        {/* Supabase Real Tables Navigation Bar - Touch Friendly Segmented Tabs */}
        <div className="py-2 border-t border-slate-100 flex items-center justify-between gap-2">
          
          <div className="grid grid-cols-2 gap-1.5 w-full sm:w-auto p-1 bg-slate-100/90 rounded-xl">
            <button 
              onClick={() => onTabChange('supplies')}
              className={`flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all touch-press ${
                activeTab === 'supplies'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className={`w-3.5 h-3.5 ${activeTab === 'supplies' ? 'text-[#8B5A2B]' : 'text-slate-500'}`} />
              <span>พัสดุ & บรรจุภัณฑ์</span>
            </button>

            <button 
              onClick={() => onTabChange('stock')}
              className={`flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all touch-press ${
                activeTab === 'stock'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingBag className={`w-3.5 h-3.5 ${activeTab === 'stock' ? 'text-[#8B5A2B]' : 'text-slate-500'}`} />
              <span>สินค้าหน้าร้าน</span>
            </button>
          </div>

          {totalLowStock > 0 && (
            <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-[#E65100]/10 text-[#E65100] text-xs font-bold border border-[#E65100]/20 shrink-0">
              <AlertCircle className="w-3.5 h-3.5 text-[#E65100]" />
              <span>ใกล้หมด {totalLowStock} รายการ</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
