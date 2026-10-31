'use client';

import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Ingredient } from '@/types/ingredient';
import { formatNumber } from '@/lib/utils';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  ingredient: Ingredient | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading: boolean;
}

export function DeleteConfirmDialog({
  isOpen,
  ingredient,
  onClose,
  onConfirm,
  loading,
}: DeleteConfirmDialogProps) {
  if (!isOpen || !ingredient) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 overscroll-contain">
      <div 
        className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-5 sm:p-6 text-center">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#C62828]/10 text-[#C62828] flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Trash2 className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>

          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            ยืนยันการลบวัตถุดิบ?
          </h3>

          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            คุณกำลังจะลบรายการนี้ออกจากระบบอย่างถาวร
          </p>

          {/* Ingredient Details Card */}
          <div className="mt-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-1.5 text-xs">
            <div className="font-bold text-[#1A1A1A] text-sm">
              {ingredient.name}
            </div>
            <div className="text-slate-600 flex justify-between">
              <span>หมวดหมู่:</span>
              <span className="font-semibold">{ingredient.category || 'ทั่วไป'}</span>
            </div>
            <div className="text-slate-600 flex justify-between">
              <span>สต็อกคงเหลือ:</span>
              <span className="font-semibold text-slate-900">
                {formatNumber(ingredient.currentStock, 1)} {ingredient.unit}
              </span>
            </div>
            {ingredient.tareWeight > 0 && (
              <div className="text-[#1565C0] flex justify-between">
                <span>น้ำหนักภาชนะ (Tare):</span>
                <span className="font-semibold">{formatNumber(ingredient.tareWeight, 1)} g</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#F8F9FA] border-t border-slate-200 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-11 sm:h-12 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-sm hover:bg-slate-50 touch-press transition-colors disabled:opacity-50"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-11 sm:h-12 px-4 rounded-xl bg-[#C62828] hover:bg-[#a82222] active:bg-[#8c1c1c] text-white font-semibold text-sm flex items-center justify-center space-x-2 touch-press transition-colors disabled:opacity-50 shadow-xs"
          >
            <Trash2 className="w-4 h-4" />
            <span>{loading ? 'กำลังลบ...' : 'ลบรายการ'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
