'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, X, Loader2, AlertCircle, LogIn, Info } from 'lucide-react';
import { useAuthSession } from '@/components/auth/useAuthSession';
import { loadStockHistory } from '@/app/actions/stock-history';
import { DailyStockTotal, StockSnapshotItem } from '@/types/stock-history';
import { StockComparisonView } from '@/components/history/StockComparisonView';
import { formatCurrency, formatNumber } from '@/lib/utils';

const CHART_DAYS = 30;

/** "2026-11-05" → "พฤ. 5 พ.ย. 2569" */
function thaiDate(iso: string, withWeekday = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('th-TH', {
    timeZone: 'UTC',
    weekday: withWeekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const formatQty = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 }).format(n);

const STATUS_STYLE: Record<StockSnapshotItem['status'], { label: string; className: string } | null> = {
  ok: null,
  low: { label: 'ใกล้หมด', className: 'bg-[#E65100]/10 text-[#E65100]' },
  out: { label: 'หมด', className: 'bg-[#C62828]/10 text-[#C62828]' },
};

/**
 * ยอดสต็อกย้อนหลัง — ระบบบันทึกยอดและมูลค่าของทุกสินค้าทุกคืน 23:59
 * เลือกวันจากปุ่มเลื่อน ช่องเลือกวันที่ หรือแตะแท่งกราฟ แล้วค้นหาสินค้าในวันนั้นได้
 */
export default function StockHistoryPage() {
  const { status: authStatus } = useAuthSession();

  const [totals, setTotals] = useState<DailyStockTotal[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [items, setItems] = useState<StockSnapshotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ text: string; needLogin: boolean } | null>(null);
  const [search, setSearch] = useState<string>('');
  const [view, setView] = useState<'daily' | 'compare'>('daily');

  const apply = useCallback((res: Awaited<ReturnType<typeof loadStockHistory>>) => {
    if (res.success) {
      setTotals(res.totals);
      setDate(res.date);
      setItems(res.items);
      setError(null);
    } else {
      setError({
        text: res.code === 'UNAUTHENTICATED' ? 'กรุณาเข้าสู่ระบบเพื่อดูยอดย้อนหลัง' : res.error || 'ไม่สามารถดึงข้อมูลได้',
        needLogin: res.code === 'UNAUTHENTICATED',
      });
    }
    setLoading(false);
  }, []);

  // โหลดยอดล่าสุดเมื่อรู้สถานะล็อกอินแล้ว
  useEffect(() => {
    if (authStatus === 'loading') return;
    let ignore = false;
    loadStockHistory().then((res) => {
      if (!ignore) apply(res);
    });
    return () => {
      ignore = true;
    };
  }, [authStatus, apply]);

  const selectDate = async (next: string) => {
    if (!next || next === date) return;
    setLoading(true);
    apply(await loadStockHistory(next));
  };

  // totals เรียงจากใหม่ไปเก่า
  const index = totals.findIndex((t) => t.date === date);
  const current = index >= 0 ? totals[index] : null;
  const previous = index >= 0 ? totals[index + 1] ?? null : null;
  const newer = index > 0 ? totals[index - 1] : null;
  const diff = current && previous ? current.totalValue - previous.totalValue : null;

  const chartDays = useMemo(() => totals.slice(0, CHART_DAYS).reverse(), [totals]);
  const chartMax = Math.max(1, ...chartDays.map((t) => t.totalValue));

  const query = search.trim().toLowerCase();
  const visibleItems = items.filter(
    (item) =>
      !query ||
      item.name.toLowerCase().includes(query) ||
      (item.category ?? '').toLowerCase().includes(query) ||
      (item.sku ?? '').toLowerCase() === query
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-16">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4">
          <div className="h-14 flex items-center gap-2">
            <Link
              href="/"
              className="w-10 h-10 -ml-2 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 touch-press"
              aria-label="กลับหน้าหลัก"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-base font-bold text-[#1A1A1A] flex-1 truncate">ยอดสต็อกย้อนหลัง</h1>
            {loading && view === 'daily' && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {error && (
          <div className="p-3.5 rounded-xl bg-[#C62828]/10 border border-[#C62828]/20 text-[#C62828] text-sm flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error.text}
            </span>
            {error.needLogin && (
              <Link
                href="/login?next=%2Fhistory"
                className="shrink-0 h-9 px-3 rounded-lg bg-[#C62828] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        )}

        {!error && !loading && totals.length === 0 && (
          <div className="p-6 rounded-xl bg-white border border-slate-200 text-center text-sm text-slate-500">
            ยังไม่มียอดที่บันทึกไว้ ระบบจะบันทึกทุกวันเวลา 23:59
          </div>
        )}

        {totals.length > 0 && (
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-200/60" role="tablist">
            {(
              [
                ['daily', 'รายวัน'],
                ['compare', 'เปรียบเทียบ'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                  view === key ? 'bg-white text-[#1A1A1A] shadow-xs' : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {view === 'compare' && totals.length > 0 && <StockComparisonView totals={totals} />}

        {view === 'daily' && current && (
          <>
            {/* เลือกวัน + สรุปยอด */}
            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => previous && selectDate(previous.date)}
                  disabled={!previous || loading}
                  className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-30 touch-press"
                  aria-label="วันก่อนหน้า"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <label className="flex-1 min-w-0 relative h-10 rounded-lg border border-slate-200 flex items-center justify-center text-sm font-semibold text-[#1A1A1A]">
                  <span className="truncate px-2">{thaiDate(current.date)}</span>
                  <input
                    type="date"
                    value={current.date}
                    min={totals[totals.length - 1]?.date}
                    max={totals[0]?.date}
                    onChange={(e) => selectDate(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="เลือกวันที่"
                  />
                </label>
                <button
                  onClick={() => newer && selectDate(newer.date)}
                  disabled={!newer || loading}
                  className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-30 touch-press"
                  aria-label="วันถัดไป"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4">
                <p className="text-xs text-slate-500">มูลค่าสต็อกรวม ณ 23:59</p>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-3xl font-bold tracking-tight text-[#1A1A1A]">
                    {formatCurrency(current.totalValue)}
                  </span>
                  {diff !== null && diff !== 0 && (
                    <span className={`text-sm font-semibold ${diff > 0 ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
                      {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))}
                      <span className="font-normal text-slate-400"> จากวันก่อน</span>
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 py-2">
                    <div className="text-lg font-bold text-slate-800">{formatNumber(current.itemCount)}</div>
                    <div className="text-[11px] text-slate-500">รายการ</div>
                  </div>
                  <div className="rounded-lg bg-[#E65100]/5 py-2">
                    <div className="text-lg font-bold text-[#E65100]">{formatNumber(current.lowCount)}</div>
                    <div className="text-[11px] text-[#E65100]">ใกล้หมด</div>
                  </div>
                  <div className="rounded-lg bg-[#C62828]/5 py-2">
                    <div className="text-lg font-bold text-[#C62828]">{formatNumber(current.outCount)}</div>
                    <div className="text-[11px] text-[#C62828]">หมด</div>
                  </div>
                </div>
                {current.isBackfill && (
                  <p className="mt-3 text-xs text-slate-500 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    ยอดวันนี้คำนวณย้อนหลังจากประวัติการเคลื่อนไหว มูลค่าคิดจากราคาต่อหน่วยปัจจุบัน
                  </p>
                )}
              </div>
            </section>

            {/* กราฟมูลค่ารวมรายวัน (แตะแท่งเพื่อเลือกวัน) */}
            {chartDays.length > 1 && (
              <section className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 mb-3">
                  มูลค่ารวม {chartDays.length} วันล่าสุด
                </p>
                <div className="flex items-end gap-1 h-28">
                  {chartDays.map((t) => (
                    <button
                      key={t.date}
                      onClick={() => selectDate(t.date)}
                      title={`${thaiDate(t.date, false)} · ${formatCurrency(t.totalValue)}`}
                      aria-label={`${thaiDate(t.date, false)} มูลค่า ${formatCurrency(t.totalValue)}`}
                      className="flex-1 h-full flex items-end group"
                    >
                      <span
                        className={`w-full rounded-t-[3px] transition-colors ${
                          t.date === current.date ? 'bg-[#8B5A2B]' : 'bg-[#8B5A2B]/25 group-hover:bg-[#8B5A2B]/45'
                        }`}
                        style={{ height: `${Math.max(3, (t.totalValue / chartMax) * 100)}%` }}
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
                  <span>{thaiDate(chartDays[0].date, false)}</span>
                  <span>{thaiDate(chartDays[chartDays.length - 1].date, false)}</span>
                </div>
              </section>
            )}

            {/* รายการสินค้าของวันที่เลือก */}
            <section className="bg-white rounded-xl border border-slate-200">
              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาสินค้า หมวด หรือรหัส"
                    className="w-full h-10 pl-9 pr-9 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#8B5A2B]"
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
              <ul className="divide-y divide-slate-100">
                {visibleItems.map((item) => {
                  const badge = STATUS_STYLE[item.status];
                  return (
                    <li key={item.itemId} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-[#1A1A1A] truncate">{item.name}</span>
                          {badge && (
                            <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.className}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {formatQty(item.quantity)} {item.unit} × {formatCurrency(item.costPerUnit)}
                          {item.category ? ` · ${item.category}` : ''}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-800 tabular-nums shrink-0">
                        {formatCurrency(item.stockValue)}
                      </div>
                    </li>
                  );
                })}
                {visibleItems.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-slate-500">ไม่พบสินค้าที่ค้นหา</li>
                )}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
