'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Loader2, AlertCircle, Info, ArrowRight } from 'lucide-react';
import { loadStockComparison } from '@/app/actions/stock-history';
import { DailyStockTotal, StockComparison, StockComparisonItem } from '@/types/stock-history';
import { formatCurrency } from '@/lib/utils';

type SortKey = 'used' | 'decrease' | 'increase' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'used', label: 'ใช้ไปมากสุด' },
  { key: 'decrease', label: 'มูลค่าลดลงมากสุด' },
  { key: 'increase', label: 'มูลค่าเพิ่มขึ้นมากสุด' },
  { key: 'name', label: 'ชื่อ' },
];

const formatQty = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 }).format(n);
const signed = (n: number, fmt: (n: number) => string) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('th-TH', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

/** วันที่ที่มีอยู่จริง ซึ่งใกล้ target ที่สุดแต่ไม่เกิน (dates เรียงใหม่ → เก่า) */
function closestOnOrBefore(dates: string[], target: string): string | undefined {
  return dates.find((d) => d <= target) ?? dates[dates.length - 1];
}

function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * เปรียบเทียบยอดสิ้นวัน 2 วัน: มูลค่ารวม ส่วนต่างรายสินค้า และแยกรับเข้า / ใช้ไป ในช่วงนั้น
 * totals = รายการวันที่ที่มียอด (เรียงใหม่ → เก่า) จากหน้า /history
 */
export function StockComparisonView({ totals }: { totals: DailyStockTotal[] }) {
  const dates = useMemo(() => totals.map((t) => t.date), [totals]);
  const latest = dates[0];

  const [range, setRange] = useState<{ from: string; to: string }>(() => ({
    from: closestOnOrBefore(dates, daysBefore(latest, 7)) ?? latest,
    to: latest,
  }));
  const [data, setData] = useState<StockComparison | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('used');
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    let ignore = false;
    loadStockComparison(range.from, range.to).then((res) => {
      if (ignore) return;
      if (res.success && res.data) {
        setData(res.data);
        setError('');
      } else {
        setError(res.error || 'ไม่สามารถเปรียบเทียบข้อมูลได้');
      }
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [range]);

  const changeRange = (next: { from: string; to: string }) => {
    if (next.from === range.from && next.to === range.to) return;
    setLoading(true);
    setRange(next.from <= next.to ? next : { from: next.to, to: next.from });
  };

  const presets = useMemo(() => {
    const monthStart = `${latest.slice(0, 7)}-01`;
    // ต้นเดือน = ยอดสิ้นวันสุดท้ายของเดือนก่อน (ถ้ามี) ไม่งั้นใช้วันแรกของเดือนที่มีข้อมูล
    const monthFrom = dates.find((d) => d < monthStart) ?? [...dates].reverse().find((d) => d >= monthStart);
    return [
      { label: 'เมื่อวาน', from: dates[1] },
      { label: '7 วัน', from: closestOnOrBefore(dates, daysBefore(latest, 7)) },
      { label: 'ต้นเดือน', from: monthFrom },
      { label: 'ทั้งหมด', from: dates[dates.length - 1] },
    ].filter((p): p is { label: string; from: string } => !!p.from && p.from !== latest);
  }, [dates, latest]);

  const query = search.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (!data) return [];
    const list = data.items.filter(
      (item) =>
        !query || item.name.toLowerCase().includes(query) || (item.category ?? '').toLowerCase().includes(query)
    );
    const delta = (i: StockComparisonItem) => i.toValue - i.fromValue;
    const compare: Record<SortKey, (a: StockComparisonItem, b: StockComparisonItem) => number> = {
      used: (a, b) => b.usedValue - a.usedValue,
      decrease: (a, b) => delta(a) - delta(b),
      increase: (a, b) => delta(b) - delta(a),
      name: (a, b) => a.name.localeCompare(b.name, 'th'),
    };
    return list.sort(compare[sort]);
  }, [data, query, sort]);

  const totalDiff = data ? data.toTotal - data.fromTotal : 0;
  const totalPct = data && data.fromTotal > 0 ? (totalDiff / data.fromTotal) * 100 : null;

  if (dates.length < 2) {
    return (
      <div className="p-6 rounded-xl bg-white border border-slate-200 text-center text-sm text-slate-500">
        ต้องมียอดอย่างน้อย 2 วันจึงจะเปรียบเทียบได้
      </div>
    );
  }

  const dateSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="flex-1 min-w-0 h-10 px-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-[#1A1A1A] focus:outline-none focus:border-[#8B5A2B]"
    >
      {dates.map((d) => (
        <option key={d} value={d}>
          {shortDate(d)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      {/* เลือกช่วงวัน */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          {dateSelect(range.from, (from) => changeRange({ ...range, from }), 'วันเริ่ม')}
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
          {dateSelect(range.to, (to) => changeRange({ ...range, to }), 'วันสิ้นสุด')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const active = range.from === p.from && range.to === latest;
            return (
              <button
                key={p.label}
                onClick={() => changeRange({ from: p.from, to: latest })}
                className={`h-8 px-3 rounded-full text-xs font-medium border touch-press ${
                  active ? 'bg-[#8B5A2B] border-[#8B5A2B] text-white' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="p-3.5 rounded-xl bg-[#C62828]/10 border border-[#C62828]/20 text-[#C62828] text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      )}

      {data && (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* สรุปช่วง */}
          <section className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              มูลค่าสต็อก {shortDate(data.from)} → {shortDate(data.to)}
            </p>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-lg text-slate-500 tabular-nums">{formatCurrency(data.fromTotal)}</span>
              <ArrowRight className="w-4 h-4 text-slate-400 self-center" />
              <span className="text-3xl font-bold tracking-tight text-[#1A1A1A] tabular-nums">
                {formatCurrency(data.toTotal)}
              </span>
            </div>
            {totalDiff !== 0 && (
              <p className={`mt-1 text-sm font-semibold ${totalDiff > 0 ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
                {totalDiff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(totalDiff))}
                {totalPct !== null && ` (${signed(totalPct, (n) => n.toFixed(1))}%)`}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#2E7D32]/5 p-2.5">
                <div className="text-[11px] text-[#2E7D32]">รับเข้า</div>
                <div className="text-base font-bold text-[#2E7D32] tabular-nums">{formatCurrency(data.receivedValue)}</div>
              </div>
              <div className="rounded-lg bg-[#8B5A2B]/5 p-2.5">
                <div className="text-[11px] text-[#8B5A2B]">ใช้ไป (ประมาณ)</div>
                <div className="text-base font-bold text-[#8B5A2B] tabular-nums">{formatCurrency(data.usedValue)}</div>
              </div>
            </div>
            {data.surplusValue > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                ยอดเพิ่มเกินที่รับเข้า{' '}
                <span className="font-semibold tabular-nums">{formatCurrency(data.surplusValue)}</span> (ส่วนใหญ่มาจากนับได้มากกว่ายอดในระบบ
                หรือรับของโดยไม่ได้บันทึก)
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              ใช้ไป = ยอดเริ่ม + รับเข้า − ยอดสิ้นสุด รวมทั้งที่บันทึกว่าใช้/ขาย/เสีย และส่วนที่ลดลงตอนนับสต็อก
              {totals.some((t) => t.isBackfill && (t.date === data.from || t.date === data.to)) &&
                ' · มีวันที่คำนวณย้อนหลัง มูลค่าคิดจากราคาปัจจุบัน'}
            </p>
          </section>

          {/* รายสินค้า */}
          <section className="mt-4 bg-white rounded-xl border border-slate-200">
            <div className="p-3 border-b border-slate-100 flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาสินค้า"
                  className="w-full h-10 pl-9 pr-8 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#8B5A2B]"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400"
                    aria-label="ล้างคำค้นหา"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="เรียงตาม"
                className="w-36 shrink-0 h-10 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#8B5A2B]"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <ul className="divide-y divide-slate-100">
              {visibleItems.map((item) => (
                <ComparisonRow key={item.itemId} item={item} />
              ))}
              {visibleItems.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-500">ไม่พบสินค้าที่ค้นหา</li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function ComparisonRow({ item }: { item: StockComparisonItem }) {
  const valueDiff = item.toValue - item.fromValue;
  const qtyDiff = (item.toQty ?? 0) - (item.fromQty ?? 0);
  const unit = item.unit ? ` ${item.unit}` : '';
  const isNew = item.fromQty === null;
  const isGone = item.toQty === null;

  // รายละเอียดการเคลื่อนไหว แสดงเฉพาะที่มี
  const details: string[] = [];
  if (item.receivedQty) details.push(`รับเข้า ${formatQty(item.receivedQty)}`);
  if (item.recordedUsageQty) details.push(`บันทึกใช้/เสีย ${formatQty(item.recordedUsageQty)}`);
  if (item.countAdjustQty) details.push(`ปรับจากการนับ ${signed(item.countAdjustQty, formatQty)}`);

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-[#1A1A1A] truncate">{item.name}</span>
            {isNew && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#1565C0]/10 text-[#1565C0]">
                ใหม่
              </span>
            )}
            {isGone && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                ไม่มีแล้ว
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 tabular-nums">
            {isNew ? '—' : formatQty(item.fromQty!)} → {isGone ? '—' : formatQty(item.toQty!)}
            {unit}
            {qtyDiff !== 0 && (
              <span className={qtyDiff > 0 ? 'text-[#2E7D32]' : 'text-[#C62828]'}> ({signed(qtyDiff, formatQty)})</span>
            )}
          </div>
          {item.usedQty !== 0 && (
            <div className="text-xs text-[#8B5A2B] tabular-nums">
              {item.usedQty > 0 ? 'ใช้ไป' : 'เพิ่มขึ้นเกินที่รับเข้า'} {formatQty(Math.abs(item.usedQty))}
              {unit} ≈ {formatCurrency(Math.abs(item.usedValue))}
            </div>
          )}
          {details.length > 0 && <div className="text-[11px] text-slate-400 truncate">{details.join(' · ')}</div>}
        </div>
        <div className="text-right shrink-0 tabular-nums">
          <div className="text-sm font-semibold text-slate-800">{formatCurrency(item.toValue)}</div>
          {valueDiff !== 0 && (
            <div className={`text-xs font-medium ${valueDiff > 0 ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
              {signed(valueDiff, formatCurrency)}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
