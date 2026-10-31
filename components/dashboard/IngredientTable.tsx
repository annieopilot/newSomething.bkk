'use client';

import React, { useState } from 'react';
import { 
  Search, 
  X, 
  Edit2, 
  Trash2, 
  Scale, 
  Plus, 
  Minus, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  LayoutGrid, 
  List, 
  Filter,
  PackageOpen
} from 'lucide-react';
import { Ingredient } from '@/types/ingredient';
import { formatNumber, getStockStatus } from '@/lib/utils';

interface IngredientTableProps {
  ingredients: Ingredient[];
  categories: string[];
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: 'all' | 'low' | 'out' | 'in_stock';
  onStatusFilterChange: (status: 'all' | 'low' | 'out' | 'in_stock') => void;
  onEdit: (ingredient: Ingredient) => void;
  onDelete: (ingredient: Ingredient) => void;
  onOpenScaleModal: (ingredient: Ingredient) => void;
  onQuickAdjust: (ingredient: Ingredient, amount: number, mode: 'add' | 'subtract') => void;
  loading: boolean;
}

export function IngredientTable({
  ingredients,
  categories,
  selectedCategory,
  onCategorySelect,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onEdit,
  onDelete,
  onOpenScaleModal,
  onQuickAdjust,
  loading,
}: IngredientTableProps) {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');

  // Set default view: table on desktop, cards on mobile/tablet
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setViewMode('table');
    }
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      
      {/* Search and Filters Toolbar */}
      <div className="p-3 sm:p-5 border-b border-slate-200 space-y-3">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="ค้นหาชื่อวัตถุดิบ, ยี่ห้อ, โน้ต..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-9 h-11 sm:h-12 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm text-[#1A1A1A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* View Toggle & Status Tabs */}
          <div className="flex items-center justify-between sm:justify-end space-x-2">
            
            {/* Status Filter Badges */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
              <button
                onClick={() => onStatusFilterChange('all')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors touch-press ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => onStatusFilterChange('in_stock')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors touch-press ${
                  statusFilter === 'in_stock'
                    ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ปกติ
              </button>
              <button
                onClick={() => onStatusFilterChange('low')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors touch-press ${
                  statusFilter === 'low'
                    ? 'bg-white text-[#E65100] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ใกล้หมด
              </button>
              <button
                onClick={() => onStatusFilterChange('out')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors touch-press ${
                  statusFilter === 'out'
                    ? 'bg-white text-[#C62828] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                หมด
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('cards')}
                title="มุมมองการ์ด (เหมาะกับมือถือ & POS)"
                className={`p-1.5 sm:p-2 rounded-lg transition-colors touch-press ${
                  viewMode === 'cards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                title="มุมมองตาราง"
                className={`p-1.5 sm:p-2 rounded-lg transition-colors touch-press ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>

        {/* Category Horizontal Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <div className="flex items-center text-slate-400 mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5 mr-1" />
            <span>หมวด:</span>
          </div>

          <button
            onClick={() => onCategorySelect('all')}
            className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-colors touch-press font-medium ${
              selectedCategory === 'all'
                ? 'bg-[#2D2B2A] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด ({ingredients.length})
          </button>

          {categories.map((cat) => {
            const count = ingredients.filter((i) => i.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => onCategorySelect(cat)}
                className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-colors touch-press font-medium ${
                  selectedCategory === cat
                    ? 'bg-[#8B5A2B] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat} {count > 0 && <span className="opacity-75">({count})</span>}
              </button>
            );
          })}
        </div>

      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center text-slate-400">
          <div className="w-8 h-8 border-3 border-[#8B5A2B] border-t-transparent rounded-full animate-spin"></div>
          <span className="mt-3 text-sm font-medium">กำลังโหลดข้อมูลสต็อก...</span>
        </div>
      ) : ingredients.length === 0 ? (
        <div className="p-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <PackageOpen className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">ไม่พบข้อมูลวัตถุดิบ</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            ลองปรับเปลี่ยนคำค้นหา หรือเปลี่ยนตัวกรองหมวดหมู่และสถานะ
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW (Information-Dense POS Table) */
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8F9FA] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 sm:px-6">ชื่อวัตถุดิบ</th>
                <th className="py-3.5 px-4">หมวดหมู่</th>
                <th className="py-3.5 px-4 text-right">สต็อกสุทธิ (Net Stock)</th>
                <th className="py-3.5 px-4">
                  <div className="flex items-center space-x-1">
                    <span>น้ำหนักภาชนะ (Tare)</span>
                    <span className="text-[10px] text-[#1565C0] font-normal lowercase">(ไม่รวมเนื้อ)</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">จุดเตือนขั้นต่ำ</th>
                <th className="py-3.5 px-4 text-center">สถานะ</th>
                <th className="py-3.5 px-4 sm:px-6 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {ingredients.map((item) => {
                const status = getStockStatus(item.currentStock, item.minStockLevel);
                const stockPercent = item.minStockLevel > 0 
                  ? Math.min(100, Math.round((item.currentStock / (item.minStockLevel * 2)) * 100))
                  : 100;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 transition-colors group h-16"
                  >
                    {/* Item Name & Details */}
                    <td className="py-3 px-4 sm:px-6">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-[#1A1A1A] leading-tight">
                          {item.name}
                        </span>
                        {item.barcode && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200" title={`บาร์โค้ด: ${item.barcode}`}>
                            #{item.barcode}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                        {item.supplier && (
                          <span className="truncate max-w-[140px] text-slate-400">
                            {item.supplier}
                          </span>
                        )}
                        {item.notes && (
                          <span className="truncate max-w-[200px] text-slate-400" title={item.notes}>
                            • {item.notes}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                        {item.category || 'ทั่วไป'}
                      </span>
                    </td>

                    {/* Current Stock */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end">
                        <div className="flex items-baseline space-x-1">
                          <span className={`text-base font-bold tabular-nums ${
                            status === 'out_of_stock' 
                              ? 'text-[#C62828]' 
                              : status === 'low_stock' 
                              ? 'text-[#E65100]' 
                              : 'text-slate-900'
                          }`}>
                            {formatNumber(item.currentStock, item.unit === 'pcs' ? 0 : 1)}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">{item.unit}</span>
                        </div>

                        {/* Stock Level Bar */}
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full ${
                              status === 'out_of_stock'
                                ? 'bg-[#C62828]'
                                : status === 'low_stock'
                                ? 'bg-[#E65100]'
                                : 'bg-emerald-600'
                            }`}
                            style={{ width: `${item.currentStock <= 0 ? 0 : Math.max(5, stockPercent)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Tare Weight (Highlighting Tare Requirement) */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {item.tareWeight > 0 ? (
                        <div className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-[#1565C0]/10 text-[#1565C0] border border-[#1565C0]/20 font-medium text-xs">
                          <Scale className="w-3.5 h-3.5 text-[#1565C0]" />
                          <span className="font-semibold">{formatNumber(item.tareWeight, 1)} g</span>
                          <span className="text-[10px] opacity-75">ภาชนะ</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => onOpenScaleModal(item)}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-[#1565C0] hover:bg-[#1565C0]/5 transition-colors"
                          title="กดเพื่อชั่งน้ำหนักและตัดน้ำหนักภาชนะ"
                        >
                          <Scale className="w-3 h-3" />
                          <span>รองรับการตัดภาชนะ</span>
                        </button>
                      )}
                    </td>

                    {/* Min Stock Level */}
                    <td className="py-3 px-4 text-right whitespace-nowrap text-xs text-slate-600 font-medium">
                      <span>{formatNumber(item.minStockLevel, item.unit === 'pcs' ? 0 : 0)}</span> {item.unit}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {status === 'out_of_stock' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#C62828]/10 text-[#C62828] border border-[#C62828]/20">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>หมดสต็อก</span>
                        </span>
                      )}
                      {status === 'low_stock' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E65100]/10 text-[#E65100] border border-[#E65100]/20">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>ใกล้หมด</span>
                        </span>
                      )}
                      {status === 'in_stock' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>สต็อกปกติ</span>
                        </span>
                      )}
                    </td>

                    {/* Actions: Scale, Edit, Delete, Quick Adjust */}
                    <td className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1">
                        
                        {/* Quick Tare Deduction Button */}
                        <button
                          onClick={() => onOpenScaleModal(item)}
                          title="ชั่งน้ำหนักรวมแล้วหักภาชนะ (Tare Deduct)"
                          className="h-10 px-2.5 rounded-lg border border-[#1565C0]/20 bg-[#1565C0]/5 text-[#1565C0] hover:bg-[#1565C0]/15 active:bg-[#1565C0]/20 touch-press transition-colors text-xs font-medium flex items-center space-x-1"
                        >
                          <Scale className="w-4 h-4" />
                          <span className="hidden lg:inline">ชั่งน้ำหนัก</span>
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => onEdit(item)}
                          title="แก้ไขข้อมูลวัตถุดิบ"
                          className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200 touch-press transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => onDelete(item)}
                          title="ลบรายการ"
                          className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-200 text-[#C62828] hover:bg-[#C62828]/10 active:bg-[#C62828]/20 touch-press transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* CARDS / TOUCH GRID VIEW (Ideal for POS touchscreen tablets & Mobile) */
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
          {ingredients.map((item) => {
            const status = getStockStatus(item.currentStock, item.minStockLevel);

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-3.5 sm:p-4 bg-white transition-colors shadow-xs [content-visibility:auto] [contain-intrinsic-size:auto_240px] ${
                  status === 'out_of_stock'
                    ? 'border-[#C62828]/40 ring-1 ring-[#C62828]/20'
                    : status === 'low_stock'
                    ? 'border-[#E65100]/40 ring-1 ring-[#E65100]/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Card Top: Category & Status */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    {item.category || 'ทั่วไป'}
                  </span>
                  
                  {status === 'out_of_stock' && (
                    <span className="text-[10px] font-bold text-[#C62828] bg-[#C62828]/10 px-2 py-0.5 rounded border border-[#C62828]/20 flex items-center space-x-1">
                      <XCircle className="w-3 h-3 inline mr-0.5" />
                      <span>หมดสต็อก</span>
                    </span>
                  )}
                  {status === 'low_stock' && (
                    <span className="text-[10px] font-bold text-[#E65100] bg-[#E65100]/10 px-2 py-0.5 rounded border border-[#E65100]/20 flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                      <span>ใกล้หมด</span>
                    </span>
                  )}
                  {status === 'in_stock' && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                      <span>ปกติ</span>
                    </span>
                  )}
                </div>

                {/* Name & Barcode */}
                <div className="flex items-start justify-between gap-1">
                  <h4 className="font-bold text-[#1A1A1A] text-sm sm:text-base leading-snug line-clamp-1">
                    {item.name}
                  </h4>
                  {item.barcode && (
                    <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      #{item.barcode}
                    </span>
                  )}
                </div>

                {/* Stock Details Box */}
                <div className="mt-2.5 p-3 rounded-xl bg-[#F8F9FA] border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium block">สต็อกสุทธิคงเหลือ</span>
                    <div className="flex items-baseline space-x-1 mt-0.5">
                      <span className={`text-xl sm:text-2xl font-extrabold tabular-nums ${
                        status === 'out_of_stock' ? 'text-[#C62828]' : status === 'low_stock' ? 'text-[#E65100]' : 'text-slate-900'
                      }`}>
                        {formatNumber(item.currentStock, item.unit === 'pcs' || item.unit === 'ใบ' || item.unit === 'Cup' ? 0 : 1)}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">{item.unit}</span>
                    </div>
                  </div>

                  {/* Tare Info & Quick Adjusters */}
                  <div className="flex flex-col items-end space-y-1">
                    <div>
                      {item.tareWeight > 0 ? (
                        <span className="inline-flex items-center text-[11px] font-bold text-[#1565C0] bg-[#1565C0]/10 px-2 py-0.5 rounded">
                          <Scale className="w-3 h-3 mr-1" />
                          Tare: {formatNumber(item.tareWeight, 1)}g
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">เตือนที่ &le; {formatNumber(item.minStockLevel, 0)} {item.unit}</span>
                      )}
                    </div>
                    
                    {/* Quick +/- Steppers */}
                    <div className="flex items-center space-x-1 pt-0.5">
                      <button
                        onClick={() => onQuickAdjust(item, item.unit === 'pcs' || item.unit === 'ใบ' || item.unit === 'Cup' ? 1 : 10, 'subtract')}
                        title="ลดสต็อกอย่างเร็ว"
                        className="w-7 h-7 rounded-lg bg-slate-200/80 hover:bg-slate-300 flex items-center justify-center text-slate-700 active:scale-90 transition-all touch-press"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onQuickAdjust(item, item.unit === 'pcs' || item.unit === 'ใบ' || item.unit === 'Cup' ? 1 : 10, 'add')}
                        title="เพิ่มสต็อกอย่างเร็ว"
                        className="w-7 h-7 rounded-lg bg-slate-200/80 hover:bg-slate-300 flex items-center justify-center text-slate-700 active:scale-90 transition-all touch-press"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Touch Actions */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => onOpenScaleModal(item)}
                    className="flex-1 h-10 rounded-xl border border-[#1565C0]/30 bg-[#1565C0]/5 hover:bg-[#1565C0]/10 active:bg-[#1565C0]/20 text-[#1565C0] text-xs font-semibold flex items-center justify-center space-x-1 touch-press transition-colors"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>ชั่งตัดภาชนะ</span>
                  </button>

                  <button
                    onClick={() => onEdit(item)}
                    className="h-10 px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200 text-xs font-semibold flex items-center space-x-1 touch-press transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>แก้ไข</span>
                  </button>

                  <button
                    onClick={() => onDelete(item)}
                    className="h-10 w-10 rounded-xl border border-slate-200 text-[#C62828] hover:bg-[#C62828]/10 active:bg-[#C62828]/20 flex items-center justify-center touch-press transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer / Results Count */}
      <div className="p-4 border-t border-slate-200 bg-[#F8F9FA] text-xs text-slate-500 flex items-center justify-between">
        <span>
          แสดงผล <strong className="text-slate-800">{ingredients.length}</strong> รายการ
        </span>
        <span className="text-slate-400">
          ระบบคำนวณหักน้ำหนักภาชนะอัตโนมัติ (Tare-Assisted Inventory)
        </span>
      </div>

    </div>
  );
}
