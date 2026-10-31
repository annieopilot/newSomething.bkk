'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, X, Info, Save, Loader2, CheckCircle2, AlertCircle, LogIn } from 'lucide-react';
import { IngredientModal } from '@/components/dashboard/IngredientModal';
import { useAuthSession } from '@/components/auth/useAuthSession';
import { getIngredients, updateIngredient, saveStockCounts } from '@/app/actions/ingredients';
import { Ingredient, IngredientInput, InventoryTab } from '@/types/ingredient';

const TABS: { value: InventoryTab; label: string }[] = [
  { value: 'supplies', label: 'พัสดุ & บรรจุภัณฑ์' },
  { value: 'stock', label: 'สินค้าหน้าร้าน' },
];

/**
 * หน้านับสต็อกสำหรับมือถือ — หนึ่งรายการต่อหนึ่งบรรทัด กรอกยอดที่นับได้แล้วกดบันทึกทีเดียว
 * ช่องที่เว้นว่างไว้ = ไม่เปลี่ยนยอด (ยอดเดิมแสดงเป็นตัวจาง)
 */
export default function StockCountPage() {
  const router = useRouter();
  const { status: authStatus } = useAuthSession();

  const [activeTab, setActiveTab] = useState<InventoryTab>('supplies');
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // ยอดที่กรอกไว้แต่ยังไม่บันทึก: id -> ข้อความในช่อง
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [detailItem, setDetailItem] = useState<Ingredient | null>(null);
  const [detailSaving, setDetailSaving] = useState<boolean>(false);

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const applyLoadResult = useCallback((res: Awaited<ReturnType<typeof getIngredients>>) => {
    if (res.success) {
      setItems(res.data);
      setLoadError('');
    } else {
      setLoadError(res.error || 'ไม่สามารถดึงข้อมูลได้');
    }
    setLoading(false);
  }, []);

  const loadItems = useCallback(
    async (tab: InventoryTab) => applyLoadResult(await getIngredients({ tab })),
    [applyLoadResult]
  );

  useEffect(() => {
    let ignore = false;
    getIngredients({ tab: activeTab }).then((res) => {
      if (!ignore) applyLoadResult(res);
    });
    return () => {
      ignore = true;
    };
  }, [activeTab, applyLoadResult]);

  const changedEntries = items
    .filter((item) => counts[item.id] !== undefined && counts[item.id] !== '')
    .map((item) => ({ item, value: Number(counts[item.id]) }))
    .filter(({ item, value }) => !isNaN(value) && value !== item.currentStock);
  const changedCount = changedEntries.length;

  // เตือนก่อนปิด/รีเฟรชหน้า ถ้ามียอดที่ยังไม่บันทึก
  useEffect(() => {
    if (changedCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [changedCount]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), type === 'error' ? 7000 : 3000);
  };

  const goToLogin = () => router.push('/login?next=%2Fcount');

  const handleTabChange = (tab: InventoryTab) => {
    if (tab === activeTab) return;
    if (changedCount > 0 && !window.confirm(`มียอดที่ยังไม่บันทึก ${changedCount} รายการ ต้องการทิ้งแล้วเปลี่ยนแท็บหรือไม่?`)) return;
    setCounts({});
    setSearch('');
    setLoading(true);
    setActiveTab(tab);
  };

  const query = search.trim().toLowerCase();
  const visibleItems = query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;

  // กด "ถัดไป" บนคีย์บอร์ด → ไปช่องของรายการถัดไป
  const focusNext = (index: number) => {
    const next = visibleItems[index + 1];
    if (next) inputRefs.current.get(next.id)?.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  const handleSaveAll = async () => {
    if (changedCount === 0) return;
    if (authStatus !== 'authenticated') {
      showMessage('กรุณาเข้าสู่ระบบก่อนบันทึกยอดนับ', 'error');
      goToLogin();
      return;
    }

    setSaving(true);
    const res = await saveStockCounts(
      changedEntries.map(({ item, value }) => ({ id: item.id, currentStock: value })),
      activeTab
    );
    setSaving(false);

    const savedIds = new Set(res.savedIds || []);
    if (savedIds.size > 0) {
      setItems((prev) =>
        prev.map((item) => (savedIds.has(item.id) ? { ...item, currentStock: Math.max(0, Number(counts[item.id])) } : item))
      );
      setCounts((prev) => {
        const nextCounts = { ...prev };
        savedIds.forEach((id) => delete nextCounts[id]);
        return nextCounts;
      });
    }

    if (res.success) {
      showMessage(`บันทึกยอดนับ ${savedIds.size} รายการแล้ว`);
    } else {
      showMessage(res.error || 'บันทึกไม่สำเร็จ', 'error');
      if (res.code === 'UNAUTHENTICATED') goToLogin();
    }
  };

  const handleSaveDetail = async (formData: IngredientInput): Promise<boolean> => {
    if (!detailItem) return false;
    setDetailSaving(true);
    const res = await updateIngredient(detailItem.id, formData, detailItem.sourceTable);
    setDetailSaving(false);

    if (!res.success) {
      showMessage(res.error || 'บันทึกไม่สำเร็จ', 'error');
      if (res.code === 'UNAUTHENTICATED') goToLogin();
      return false;
    }

    // ยอดในหน้ารายละเอียดถูกบันทึกแล้ว จึงล้างยอดที่ค้างไว้ในบรรทัดนั้น
    setCounts((prev) => {
      const nextCounts = { ...prev };
      delete nextCounts[detailItem.id];
      return nextCounts;
    });
    showMessage(`อัปเดต "${formData.name}" แล้ว`);
    loadItems(activeTab);
    return true;
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-3 sm:px-4">
          <div className="h-14 flex items-center gap-2">
            <Link
              href="/"
              onClick={(e) => {
                if (changedCount > 0 && !window.confirm(`มียอดที่ยังไม่บันทึก ${changedCount} รายการ ต้องการออกจากหน้านี้หรือไม่?`)) {
                  e.preventDefault();
                }
              }}
              className="w-10 h-10 -ml-1 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 touch-press"
              aria-label="กลับหน้าหลัก"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-base font-bold text-[#1A1A1A] flex-1">นับสต็อก</h1>
            {authStatus === 'unauthenticated' && (
              <button
                onClick={goToLogin}
                className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 flex items-center gap-1.5 touch-press"
              >
                <LogIn className="w-3.5 h-3.5" />
                เข้าสู่ระบบ
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/90 rounded-xl">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`py-2 rounded-lg text-xs font-semibold touch-press transition-colors ${
                  activeTab === tab.value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative py-2.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารายการ"
              className="w-full h-10 pl-9 pr-9 rounded-lg bg-[#F8F9FA] border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400"
                aria-label="ล้างคำค้นหา"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* List */}
      <main className="max-w-2xl mx-auto">
        {loading ? (
          <div className="py-16 flex justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : loadError ? (
          <p className="py-16 text-center text-sm text-[#C62828]">{loadError}</p>
        ) : visibleItems.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">ไม่พบรายการ</p>
        ) : (
          <ul className="bg-white border-y border-slate-200 divide-y divide-slate-100">
            {visibleItems.map((item, index) => {
              const value = counts[item.id] ?? '';
              const isChanged = value !== '' && Number(value) !== item.currentStock;

              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-2 pl-4 pr-2 py-1.5 ${isChanged ? 'bg-[#8B5A2B]/5' : ''}`}
                >
                  <span className={`flex-1 min-w-0 truncate text-sm ${isChanged ? 'font-semibold text-[#8B5A2B]' : 'text-[#1A1A1A]'}`}>
                    {item.name}
                  </span>

                  <div className="relative w-28 shrink-0">
                    <input
                      ref={(el) => {
                        if (el) inputRefs.current.set(item.id, el);
                        else inputRefs.current.delete(item.id);
                      }}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      enterKeyHint={index < visibleItems.length - 1 ? 'next' : 'done'}
                      placeholder={String(item.currentStock)}
                      value={value}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setCounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          focusNext(index);
                        }
                      }}
                      aria-label={`ยอดนับของ ${item.name}`}
                      className={`w-full h-11 pl-3 pr-11 rounded-lg border text-right text-base font-bold placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent ${
                        isChanged ? 'border-[#8B5A2B]/50 bg-white text-[#8B5A2B]' : 'border-slate-200 bg-[#F8F9FA] text-[#1A1A1A]'
                      }`}
                    />
                    <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[11px] text-slate-500 pointer-events-none max-w-10 truncate">
                      {item.unit}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetailItem(item)}
                    className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 touch-press"
                    aria-label={`รายละเอียดของ ${item.name}`}
                  >
                    <Info className="w-5 h-5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* Toast */}
      {message && (
        <div className="fixed top-3 inset-x-3 z-50 max-w-2xl mx-auto">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
              message.type === 'success' ? 'bg-[#2D2B2A]' : 'bg-[#C62828]'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-[#2E7D32] shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-300 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Save Bar */}
      {changedCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setCounts({})}
              disabled={saving}
              className="h-12 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-sm touch-press disabled:opacity-50"
            >
              ล้าง
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex-1 h-12 rounded-xl bg-[#2D2B2A] active:bg-[#151414] text-white font-semibold text-sm flex items-center justify-center gap-2 touch-press disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#D4A373]" />}
              <span>{saving ? 'กำลังบันทึก...' : `บันทึกยอดนับ ${changedCount} รายการ`}</span>
            </button>
          </div>
        </div>
      )}

      <IngredientModal
        isOpen={detailItem !== null}
        onClose={() => setDetailItem(null)}
        onSubmit={handleSaveDetail}
        initialData={detailItem}
        loading={detailSaving}
        activeTab={activeTab}
      />
    </div>
  );
}
