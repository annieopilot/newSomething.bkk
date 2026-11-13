'use client';

import React from 'react';
import { Package, AlertTriangle, XCircle, Grid, Coins } from 'lucide-react';
import { InventoryStats } from '@/types/ingredient';
import { formatNumber, formatCurrency } from '@/lib/utils';

interface SummaryCardsProps {
  stats: InventoryStats;
  currentFilter: 'all' | 'low' | 'out' | 'in_stock';
  onFilterChange: (status: 'all' | 'low' | 'out' | 'in_stock') => void;
}

export function SummaryCards({ stats, currentFilter, onFilterChange }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3.5 mb-4 sm:mb-6">
      
      {/* 1. Total Items */}
      <div
        onClick={() => onFilterChange('all')}
        className={`bg-card rounded-xl border p-3 sm:p-4 cursor-pointer touch-press transition-all ${
          currentFilter === 'all'
            ? 'border-ink ring-2 ring-ink/10 shadow-xs'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">ทั้งหมด</span>
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3 flex items-baseline space-x-1">
          <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-ink">
            {formatNumber(stats.totalItems)}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500">รายการ</span>
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400 truncate hidden xs:block">แตะเพื่อดูทั้งหมด</p>
      </div>

      {/* 2. Low Stock Alert */}
      <div
        onClick={() => onFilterChange(currentFilter === 'low' ? 'all' : 'low')}
        className={`bg-card rounded-xl border p-3 sm:p-4 cursor-pointer touch-press transition-all ${
          currentFilter === 'low'
            ? 'border-warning ring-2 ring-warning/20 bg-accent-tint'
            : 'border-slate-200 hover:border-warning/40'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-warning truncate">ใกล้หมด</span>
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-warning/10 flex items-center justify-center text-warning shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3 flex items-baseline space-x-1">
          <span className={`text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight ${stats.lowStockCount > 0 ? 'text-warning' : 'text-slate-800'}`}>
            {formatNumber(stats.lowStockCount)}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500">รายการ</span>
        </div>
        <p className="mt-0.5 text-[10px] text-warning font-medium truncate hidden xs:block">
          {stats.lowStockCount > 0 ? 'ต้องสั่งเติมด่วน' : 'ปกติ'}
        </p>
      </div>

      {/* 3. Out of Stock Alert */}
      <div
        onClick={() => onFilterChange(currentFilter === 'out' ? 'all' : 'out')}
        className={`bg-card rounded-xl border p-3 sm:p-4 cursor-pointer touch-press transition-all ${
          currentFilter === 'out'
            ? 'border-danger ring-2 ring-danger/20 bg-danger-tint'
            : 'border-slate-200 hover:border-danger/40'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-danger truncate">หมดสต็อก</span>
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-danger/10 flex items-center justify-center text-danger shrink-0">
            <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3 flex items-baseline space-x-1">
          <span className={`text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight ${stats.outOfStockCount > 0 ? 'text-danger' : 'text-slate-800'}`}>
            {formatNumber(stats.outOfStockCount)}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500">รายการ</span>
        </div>
        <p className="mt-0.5 text-[10px] text-danger font-medium truncate hidden xs:block">
          {stats.outOfStockCount > 0 ? 'สินค้าหมด' : 'ไม่มีของขาด'}
        </p>
      </div>

      {/* 4. Total Categories */}
      <div className="bg-card rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">หมวดหมู่</span>
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
            <Grid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3 flex items-baseline space-x-1">
          <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-ink">
            {formatNumber(stats.categoriesCount)}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500">หมวด</span>
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400 truncate hidden xs:block">ประเภทวัตถุดิบ</p>
      </div>

      {/* 5. Total Valuation (Cost) */}
      <div className="bg-card rounded-xl border border-slate-200 p-3 sm:p-4 col-span-2 sm:col-span-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">มูลค่าคลังประเมิน</span>
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
            <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3 flex items-baseline space-x-1">
          <span className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-emerald-800">
            {formatCurrency(stats.totalEstimatedValue)}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400 truncate hidden xs:block">คิดจากราคาต้นทุน</p>
      </div>

    </div>
  );
}
