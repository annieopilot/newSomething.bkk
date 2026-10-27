'use client';

import React, { useState, useEffect } from 'react';
import { X, Scale, Save, AlertCircle } from 'lucide-react';
import { Ingredient, IngredientInput, InventoryTab, COMMON_CATEGORIES, COMMON_UNITS } from '@/types/ingredient';

interface IngredientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: IngredientInput) => Promise<boolean>;
  initialData?: Ingredient | null;
  loading: boolean;
  activeTab?: InventoryTab;
}

export function IngredientModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  loading,
  activeTab = 'supplies',
}: IngredientModalProps) {
  const isEditMode = Boolean(initialData);

  const [formData, setFormData] = useState<IngredientInput>({
    name: '',
    category: activeTab === 'supplies' ? 'Packaging' : 'Coffee',
    unit: activeTab === 'supplies' ? 'ใบ' : 'Cup',
    currentStock: 0,
    tareWeight: 0,
    minStockLevel: activeTab === 'supplies' ? 5 : 10,
    costPerUnit: 0,
    price: 0,
    barcode: '',
    supplier: '',
    notes: '',
    sourceTable: activeTab,
  });

  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        category: initialData.category || (activeTab === 'supplies' ? 'Packaging' : 'Coffee'),
        unit: initialData.unit,
        currentStock: initialData.currentStock,
        tareWeight: initialData.tareWeight || 0,
        minStockLevel: initialData.minStockLevel || 5,
        costPerUnit: initialData.costPerUnit || 0,
        price: initialData.price || 0,
        barcode: initialData.barcode || '',
        supplier: initialData.supplier || '',
        notes: initialData.notes || '',
        sourceTable: initialData.sourceTable || activeTab,
      });
    } else {
      setFormData({
        name: '',
        category: activeTab === 'supplies' ? 'Packaging' : 'Coffee',
        unit: activeTab === 'supplies' ? 'ใบ' : 'Cup',
        currentStock: 10,
        tareWeight: 0,
        minStockLevel: activeTab === 'supplies' ? 5 : 10,
        costPerUnit: 0,
        price: 0,
        barcode: '',
        supplier: '',
        notes: '',
        sourceTable: activeTab,
      });
    }
    setErrorMessage('');
  }, [initialData, isOpen, activeTab]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMessage('กรุณาระบุชื่อวัตถุดิบ');
      return;
    }
    if (!formData.unit) {
      setErrorMessage('กรุณาเลือกหน่วยนับ');
      return;
    }

    setErrorMessage('');
    const success = await onSubmit(formData);
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div 
        className="relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between bg-[#F8F9FA] shrink-0">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#2D2B2A] flex items-center justify-center text-white shrink-0">
              <Scale className="w-5 h-5 text-[#D4A373]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#1A1A1A]">
                {isEditMode ? 'แก้ไขข้อมูลวัตถุดิบ' : 'เพิ่มวัตถุดิบใหม่เข้าคลัง'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500">
                {isEditMode ? `กำลังแก้ไข: ${initialData?.name}` : 'กำหนดข้อมูลวัตถุดิบและค่าน้ำหนักภาชนะเปล่า (Tare Weight)'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 touch-press transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            
            {errorMessage && (
              <div className="p-3.5 rounded-lg bg-[#C62828]/10 border border-[#C62828]/20 text-[#C62828] text-sm flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Field: Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                ชื่อวัตถุดิบ <span className="text-[#C62828]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="เช่น เมล็ดกาแฟปางขอน Washed, ไซรัปวานิลลา Monin, แก้ว 16oz"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full h-12 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-[#1A1A1A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent transition-all"
              />
            </div>

            {/* Grid 2 Cols: Category & Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  หมวดหมู่วัตถุดิบ
                </label>
                <select
                  value={formData.category || 'เมล็ดกาแฟ'}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full h-12 px-3 rounded-lg border border-slate-300 bg-white text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent transition-all"
                >
                  {COMMON_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  หน่วยนับ (Unit) <span className="text-[#C62828]">*</span>
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full h-12 px-3 rounded-lg border border-slate-300 bg-white text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent transition-all"
                >
                  {COMMON_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* TARE WEIGHT (Highlighted Callout Box) */}
            <div className="p-4 rounded-xl bg-[#1565C0]/5 border border-[#1565C0]/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Scale className="w-4 h-4 text-[#1565C0]" />
                  <label className="text-xs font-bold text-[#1565C0] uppercase tracking-wide">
                    น้ำหนักภาชนะ / บรรจุภัณฑ์เปล่า (Tare Weight)
                  </label>
                </div>
                <span className="text-[11px] font-semibold text-[#1565C0] bg-white px-2 py-0.5 rounded border border-[#1565C0]/20">
                  {formData.tareWeight > 0 ? `[Tare: ${formData.tareWeight} g]` : 'ไม่ระบุ Tare'}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                น้ำหนักของโหลแก้ว, ถุงฟอยล์, ขวดไซรัป หรือขวดพลาสติกเปล่า เมื่อบาริสต้านำทั้งขวดขึ้นชั่ง ระบบจะหักน้ำหนักนี้ออกเพื่อให้ได้ปริมาณเนื้อสุทธิที่แท้จริง
              </p>

              <div className="relative mt-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="0.0"
                  value={formData.tareWeight || ''}
                  onChange={(e) => setFormData({ ...formData, tareWeight: parseFloat(e.target.value) || 0 })}
                  className="w-full h-12 pl-4 pr-12 rounded-lg border border-[#1565C0]/40 bg-white text-base font-bold text-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0] focus:border-transparent transition-all"
                />
                <span className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs font-bold text-[#1565C0]">
                  กรัม (g)
                </span>
              </div>
            </div>

            {/* Grid 2 Cols: Current Stock & Min Stock Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Current Stock */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  สต็อกสุทธิคงเหลือ (Current Stock)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={formData.currentStock || ''}
                    onChange={(e) => setFormData({ ...formData, currentStock: parseFloat(e.target.value) || 0 })}
                    className="w-full h-12 pl-4 pr-14 rounded-lg border border-slate-300 bg-white text-base font-bold text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent transition-all"
                  />
                  <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-slate-500 font-semibold">
                    {formData.unit}
                  </span>
                </div>
              </div>

              {/* Min Stock Level */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  จุดเตือนของใกล้หมด (Min Stock Level)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={formData.minStockLevel || ''}
                    onChange={(e) => setFormData({ ...formData, minStockLevel: parseFloat(e.target.value) || 0 })}
                    className="w-full h-12 pl-4 pr-14 rounded-lg border border-slate-300 bg-white text-base font-bold text-[#E65100] focus:outline-none focus:ring-2 focus:ring-[#E65100] focus:border-transparent transition-all"
                  />
                  <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-slate-500 font-semibold">
                    {formData.unit}
                  </span>
                </div>
              </div>

            </div>

            {/* Cost, Supplier & Barcode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ต้นทุนต่อหน่วย (บาท / {formData.unit})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.costPerUnit || ''}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full h-12 pl-4 pr-12 rounded-lg border border-slate-300 bg-white text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent"
                  />
                  <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-slate-500">
                    บาท
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ผู้จัดจำหน่าย / ซัพพลายเออร์
                </label>
                <input
                  type="text"
                  placeholder="เช่น Monin Thailand, โรงคั่วกาแฟ"
                  value={formData.supplier || ''}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className="w-full h-12 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent"
                />
              </div>
            </div>

            {/* Barcode / SKU */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                บาร์โค้ดสินค้า / SKU (ถ้ามี)
              </label>
              <input
                type="text"
                placeholder="เช่น 885000100001 สำหรับสแกนบาร์โค้ดหน้าร้าน POS"
                value={formData.barcode || ''}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                className="w-full h-12 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-mono text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                หมายเหตุเพิ่มเติม / ขนาดบรรจุภัณฑ์
              </label>
              <textarea
                rows={2}
                placeholder="เช่น ถุง 1kg พร้อมวาล์ว, ขวดแก้วหัวปั๊ม, เก็บในตู้เย็น 4°C"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-3 rounded-lg border border-slate-300 bg-white text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent"
              />
            </div>

          </div>

          {/* Modal Footer */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-[#F8F9FA] flex items-center justify-end space-x-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 sm:flex-none h-11 sm:h-12 px-5 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-sm hover:bg-slate-50 touch-press transition-colors disabled:opacity-50"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-2 sm:flex-none h-11 sm:h-12 px-6 rounded-xl bg-[#2D2B2A] hover:bg-[#1f1e1d] active:bg-[#151414] text-white font-semibold text-sm flex items-center justify-center space-x-2 shadow-xs touch-press transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-[#D4A373]" />
              <span>{loading ? 'กำลังบันทึก...' : isEditMode ? 'บันทึกการแก้ไข' : 'เพิ่มวัตถุดิบเข้าคลัง'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
