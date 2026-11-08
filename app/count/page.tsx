'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, X, Info, Save, Loader2, CheckCircle2, AlertCircle, LogIn } from 'lucide-react';
import { IngredientModal } from '@/components/dashboard/IngredientModal';
import { useAuthSession } from '@/components/auth/useAuthSession';
import { loadInventory, updateIngredient, saveStockCounts, saveLocationCounts } from '@/app/actions/ingredients';
import { CountLocation, Ingredient, IngredientInput, InventoryLookups, EMPTY_LOOKUPS } from '@/types/ingredient';

/**
 * น้ำหนักภาชนะในหน่วยของรายการ (น้ำหนักภาชนะเก็บเป็นกรัม)
 * ใช้เฉพาะรายการที่นับเป็นน้ำหนัก — หน่วยนับอื่น (ขวด/ชิ้น) ไม่มีความหมายที่จะหักภาชนะ
 */
function tareInItemUnit(item: Ingredient, tareGrams: number): number {
  if (!(tareGrams > 0)) return 0;
  if (item.unitCode === 'g') return tareGrams;
  if (item.unitCode === 'kg') return tareGrams / 1000;
  return 0;
}

/** ค่าที่กรอก → ยอดสุทธิ (กรอกน้ำหนักรวมภาชนะ แล้วหักภาชนะออก) */
function netCount(item: Ingredient, raw: string | undefined, tareGrams: number): number {
  if (raw === undefined || raw === '') return NaN;
  const value = Number(raw);
  if (isNaN(value)) return NaN;
  const net = value - tareInItemUnit(item, tareGrams);
  return Math.max(0, Math.round(net * 1000) / 1000);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fieldKey = (item: Ingredient, loc?: CountLocation) => (loc ? `${item.id}:${loc.id}` : item.id);

type LocationPart = { loc: CountLocation; counted: boolean; value: number };

/** "หน้าบาร์ 120 + จุดที่ไม่ได้นับ 850" — จุดที่ไม่ได้กรอกรวมเป็นก้อนเดียว (ใช้ยอดที่ระบบจำไว้) */
function summaryParts(parts: LocationPart[]): string {
  const counted = parts.filter((p) => p.counted).map((p) => `${p.loc.name} ${p.value}`);
  const rest = parts.filter((p) => !p.counted);
  if (rest.length > 0) counted.push(`จุดที่ไม่ได้นับ ${round3(rest.reduce((sum, p) => sum + p.value, 0))}`);
  return counted.join(' + ');
}

/**
 * รายการที่นับแยกจุด: จุดที่กรอก = ยอดใหม่ (หักภาชนะของจุดนั้น), จุดที่ว่าง = ยอดล่าสุดของจุดนั้น
 * คืน null ถ้ายังไม่ได้กรอกจุดไหนเลย
 */
function locationTotal(item: Ingredient, counts: Record<string, string>) {
  const parts: LocationPart[] = item.countLocations.map((loc) => {
    const net = netCount(item, counts[fieldKey(item, loc)], loc.tareWeight);
    return isNaN(net) ? { loc, counted: false, value: loc.lastCount ?? 0 } : { loc, counted: true, value: net };
  });
  if (!parts.some((p) => p.counted)) return null;
  return { parts, total: round3(parts.reduce((sum, p) => sum + p.value, 0)) };
}

/**
 * หน้านับสต็อกสำหรับมือถือ — หนึ่งรายการต่อหนึ่งบรรทัด กรอกยอดที่นับได้แล้วกดบันทึกทีเดียว
 * ช่องที่เว้นว่างไว้ = ไม่เปลี่ยนยอด (ยอดเดิมแสดงเป็นตัวจาง)
 * รายการที่ตั้งน้ำหนักภาชนะไว้ ให้กรอกน้ำหนักรวมจากตาชั่ง ระบบหักภาชนะให้ก่อนบันทึก
 * รายการที่ตั้งจุดนับไว้ (เช่น หน้าบาร์ + หลังร้าน) กรอกแยกแต่ละจุด ระบบรวมให้ — จุดที่ไม่ได้นับใช้ยอดเดิมของจุดนั้น
 */
export default function StockCountPage() {
  const router = useRouter();
  const { status: authStatus } = useAuthSession();

  const [category, setCategory] = useState<string>('all');
  const [lookups, setLookups] = useState<InventoryLookups>(EMPTY_LOOKUPS);
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // ยอดที่กรอกไว้แต่ยังไม่บันทึก: key -> ข้อความในช่อง (key = id สินค้า หรือ "id สินค้า:id จุดนับ")
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [detailItem, setDetailItem] = useState<Ingredient | null>(null);
  const [detailSaving, setDetailSaving] = useState<boolean>(false);

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const applyLoadResult = useCallback((res: Awaited<ReturnType<typeof loadInventory>>) => {
    if (res.success) {
      setItems(res.items);
      setLookups(res.lookups);
      setLoadError('');
    } else {
      setLoadError(
        res.code === 'UNAUTHENTICATED' ? 'กรุณาเข้าสู่ระบบเพื่อดูข้อมูลสต็อก' : res.error || 'ไม่สามารถดึงข้อมูลได้'
      );
    }
    setLoading(false);
  }, []);

  const loadItems = useCallback(async () => applyLoadResult(await loadInventory()), [applyLoadResult]);

  // โหลดใหม่เมื่อสถานะล็อกอินเปลี่ยน (ข้อมูลสต็อกอ่านได้เฉพาะผู้ที่ล็อกอิน) — เรียก server ครั้งเดียว
  useEffect(() => {
    if (authStatus === 'loading') return;
    let ignore = false;
    loadInventory().then((res) => {
      if (!ignore) applyLoadResult(res);
    });
    return () => {
      ignore = true;
    };
  }, [authStatus, applyLoadResult]);

  // รายการช่องเดียว: บันทึกเมื่อยอดต่างจากเดิม
  const changedSimple = items
    .filter((item) => item.countLocations.length === 0 && counts[item.id] !== undefined && counts[item.id] !== '')
    .map((item) => ({ item, value: netCount(item, counts[item.id], item.tareWeight) }))
    .filter(({ item, value }) => !isNaN(value) && value !== item.currentStock);

  // รายการแยกจุด: บันทึกเมื่อกรอกอย่างน้อย 1 จุด (แม้ยอดรวมเท่าเดิม ก็ต้องเก็บยอดของจุดนั้นไว้)
  const changedLocations = items
    .filter((item) => item.countLocations.length > 0)
    .map((item) => ({ item, result: locationTotal(item, counts) }))
    .filter((entry): entry is { item: Ingredient; result: NonNullable<ReturnType<typeof locationTotal>> } =>
      entry.result !== null
    );

  const changedCount = changedSimple.length + changedLocations.length;

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

  const categories = Array.from(new Set(items.map((item) => item.category).filter(Boolean))) as string[];

  const query = search.trim().toLowerCase();
  const visibleItems = items.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      (!query || item.name.toLowerCase().includes(query) || (item.sku ?? '').toLowerCase() === query)
  );

  // ลำดับช่องกรอกทั้งหมด (รายการแยกจุด = หลายช่อง) สำหรับปุ่ม "ถัดไป" บนคีย์บอร์ด
  const fieldOrder = visibleItems.flatMap((item) =>
    item.countLocations.length > 0 ? item.countLocations.map((loc) => fieldKey(item, loc)) : [fieldKey(item)]
  );
  const focusNext = (key: string) => {
    const next = fieldOrder[fieldOrder.indexOf(key) + 1];
    if (next) inputRefs.current.get(next)?.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  const clearCountsFor = (ids: Set<string>) =>
    setCounts((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => !ids.has(key.split(':')[0])))
    );

  const handleSaveAll = async () => {
    if (changedCount === 0) return;
    if (authStatus !== 'authenticated') {
      showMessage('กรุณาเข้าสู่ระบบก่อนบันทึกยอดนับ', 'error');
      goToLogin();
      return;
    }

    setSaving(true);
    const simpleRes =
      changedSimple.length > 0
        ? await saveStockCounts(changedSimple.map(({ item, value }) => ({ id: item.id, currentStock: value })))
        : null;
    const locationRes =
      changedLocations.length > 0
        ? await saveLocationCounts(
            changedLocations.map(({ item, result }) => ({
              itemId: item.id,
              counts: result.parts.filter((p) => p.counted).map((p) => ({ locationId: p.loc.id, count: p.value })),
            }))
          )
        : null;
    setSaving(false);

    const savedSimple = new Set(simpleRes?.savedIds || []);
    const savedLocation = new Set(locationRes?.savedIds || []);
    const simpleValues = new Map(changedSimple.map(({ item, value }) => [item.id, value]));
    const locationParts = new Map(changedLocations.map(({ item, result }) => [item.id, result.parts]));
    const now = new Date().toISOString();

    if (savedSimple.size + savedLocation.size > 0) {
      setItems((prev) =>
        prev.map((item) => {
          if (savedSimple.has(item.id)) {
            return { ...item, currentStock: simpleValues.get(item.id) ?? item.currentStock };
          }
          if (savedLocation.has(item.id)) {
            const parts = locationParts.get(item.id) ?? [];
            return {
              ...item,
              currentStock: locationRes?.totals?.[item.id] ?? item.currentStock,
              countLocations: item.countLocations.map((loc) => {
                const part = parts.find((p) => p.loc.id === loc.id && p.counted);
                return part ? { ...loc, lastCount: part.value, lastCountedAt: now } : loc;
              }),
            };
          }
          return item;
        })
      );
      clearCountsFor(new Set([...savedSimple, ...savedLocation]));
    }

    const failure = [simpleRes, locationRes].find((res) => res && !res.success);
    if (!failure) {
      showMessage(`บันทึกยอดนับ ${savedSimple.size + savedLocation.size} รายการแล้ว`);
    } else {
      showMessage(failure.error || 'บันทึกไม่สำเร็จ', 'error');
      if (failure.code === 'UNAUTHENTICATED') goToLogin();
    }
  };

  const handleSaveDetail = async (formData: IngredientInput): Promise<boolean> => {
    if (!detailItem) return false;
    setDetailSaving(true);
    const res = await updateIngredient(detailItem.id, formData);
    setDetailSaving(false);

    if (!res.success) {
      showMessage(res.error || 'บันทึกไม่สำเร็จ', 'error');
      if (res.code === 'UNAUTHENTICATED') goToLogin();
      return false;
    }

    // ยอด/จุดนับในหน้ารายละเอียดถูกบันทึกแล้ว จึงล้างยอดที่ค้างไว้ของรายการนั้น
    clearCountsFor(new Set([detailItem.id]));
    showMessage(`อัปเดต "${formData.name}" แล้ว`);
    loadItems();
    return true;
  };

  const setCount = (key: string, value: string) => setCounts((prev) => ({ ...prev, [key]: value }));

  const renderInput = (item: Ingredient, key: string, placeholder: string, isChanged: boolean, label: string) => (
    <div className="relative w-28 shrink-0">
      <input
        ref={(el) => {
          if (el) inputRefs.current.set(key, el);
          else inputRefs.current.delete(key);
        }}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        enterKeyHint={fieldOrder.indexOf(key) < fieldOrder.length - 1 ? 'next' : 'done'}
        placeholder={placeholder}
        value={counts[key] ?? ''}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setCount(key, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            focusNext(key);
          }
        }}
        aria-label={label}
        className={`w-full h-11 pl-3 pr-11 rounded-lg border text-right text-base font-bold placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B5A2B] focus:border-transparent ${
          isChanged ? 'border-[#8B5A2B]/50 bg-white text-[#8B5A2B]' : 'border-slate-200 bg-[#F8F9FA] text-[#1A1A1A]'
        }`}
      />
      <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[11px] text-slate-500 pointer-events-none max-w-10 truncate">
        {item.unit}
      </span>
    </div>
  );

  const renderInfoButton = (item: Ingredient) => (
    <button
      type="button"
      onClick={() => setDetailItem(item)}
      className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 touch-press"
      aria-label={`รายละเอียดของ ${item.name}`}
    >
      <Info className="w-5 h-5" />
    </button>
  );

  /** คำอธิบายใต้ชื่อ: หักภาชนะเท่าไร / สุทธิเท่าไร */
  const tareHint = (item: Ingredient, raw: string, tareGrams: number, emptyText: string) => {
    const tare = tareInItemUnit(item, tareGrams);
    const net = netCount(item, raw, tareGrams);
    if (raw === '') {
      const tareText = tare > 0 ? `หักภาชนะ ${tare} ${item.unit}` : '';
      return { text: [emptyText, tareText].filter(Boolean).join(' · '), error: false };
    }
    if (tare > 0 && Number(raw) < tare) return { text: `น้อยกว่าน้ำหนักภาชนะ (${tare} ${item.unit})`, error: true };
    if (tare > 0) return { text: `หักภาชนะ ${tare} → สุทธิ ${net} ${item.unit}`, error: false };
    return { text: '', error: false };
  };

  const renderSimpleItem = (item: Ingredient) => {
    const value = counts[item.id] ?? '';
    const net = netCount(item, value, item.tareWeight);
    const isChanged = value !== '' && !isNaN(net) && net !== item.currentStock;
    const hint = tareInItemUnit(item, item.tareWeight) > 0 ? tareHint(item, value, item.tareWeight, 'กรอกน้ำหนักรวมภาชนะ') : null;

    return (
      <li key={item.id} className={`flex items-center gap-2 pl-4 pr-2 py-1.5 ${isChanged ? 'bg-[#8B5A2B]/5' : ''}`}>
        <div className="flex-1 min-w-0">
          <span className={`block truncate text-sm ${isChanged ? 'font-semibold text-[#8B5A2B]' : 'text-[#1A1A1A]'}`}>
            {item.name}
          </span>
          {hint && hint.text && (
            <span className={`block truncate text-[11px] ${hint.error ? 'text-[#C62828]' : 'text-slate-500'}`}>{hint.text}</span>
          )}
        </div>
        {renderInput(item, item.id, String(item.currentStock), isChanged, `ยอดนับของ ${item.name}`)}
        {renderInfoButton(item)}
      </li>
    );
  };

  const renderLocationItem = (item: Ingredient) => {
    const result = locationTotal(item, counts);
    const isChanged = result !== null;
    const countedSpots = result ? result.parts.filter((p) => p.counted).length : 0;

    return (
      <li key={item.id} className={`pb-1.5 ${isChanged ? 'bg-[#8B5A2B]/5' : ''}`}>
        <div className="flex items-center gap-2 pl-4 pr-2 pt-1.5">
          <div className="flex-1 min-w-0">
            <span className={`block truncate text-sm ${isChanged ? 'font-semibold text-[#8B5A2B]' : 'text-[#1A1A1A]'}`}>
              {item.name}
            </span>
            <span className="block text-[11px] text-slate-500">
              {result ? (
                <>
                  {summaryParts(result.parts)} ={' '}
                  <span className="font-bold text-[#8B5A2B]">
                    {result.total} {item.unit}
                  </span>
                  {countedSpots < result.parts.length && ` · นับ ${countedSpots}/${result.parts.length} จุด`}
                </>
              ) : (
                `ยอดรวม ${item.currentStock} ${item.unit} · ${item.countLocations.length} จุด`
              )}
            </span>
          </div>
          {renderInfoButton(item)}
        </div>

        {item.countLocations.map((loc) => {
          const key = fieldKey(item, loc);
          const value = counts[key] ?? '';
          const filled = !isNaN(netCount(item, value, loc.tareWeight));
          const neverCounted = loc.lastCount === null;
          const hint = tareHint(item, value, loc.tareWeight, neverCounted ? 'ยังไม่เคยนับ' : '');
          const warn = value === '' && neverCounted;

          return (
            <div key={loc.id} className="flex items-center gap-2 pl-8 pr-14 py-1">
              <div className="flex-1 min-w-0">
                <span className={`block truncate text-[13px] ${filled ? 'font-semibold text-[#8B5A2B]' : 'text-slate-700'}`}>
                  {loc.name}
                </span>
                {hint.text && (
                  <span
                    className={`block truncate text-[11px] ${
                      hint.error ? 'text-[#C62828]' : warn ? 'text-[#E65100]' : 'text-slate-500'
                    }`}
                  >
                    {hint.text}
                  </span>
                )}
              </div>
              {renderInput(item, key, '', filled, `ยอดนับของ ${item.name} ที่ ${loc.name}`)}
            </div>
          );
        })}
      </li>
    );
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

          {/* กรองตามหมวด (ยอดที่กรอกไว้ไม่หาย) */}
          <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5">
            {['all', ...categories].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold touch-press transition-colors ${
                  category === cat ? 'bg-[#2D2B2A] text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {cat === 'all' ? 'ทั้งหมด' : cat}
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
            {visibleItems.map((item) =>
              item.countLocations.length > 0 ? renderLocationItem(item) : renderSimpleItem(item)
            )}
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
        lookups={lookups}
      />
    </div>
  );
}
