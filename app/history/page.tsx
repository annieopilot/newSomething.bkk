'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, X, Loader2, AlertCircle, LogIn, Package, TrendingDown } from 'lucide-react';
import { useAuthSession } from '@/components/auth/useAuthSession';
import { loadStockHistory } from '@/app/actions/stock-history';
import { DailyStockTotal, StockSnapshotItem } from '@/types/stock-history';
import { UsageView } from '@/components/history/UsageView';
import { formatCurrency } from '@/lib/utils';

/** "2026-11-05" → "พฤ. 5 พ.ย. 2569" */
function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('th-TH', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const formatQty = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n);

const STATUS_BADGE: Record<StockSnapshotItem['status'], { label: string; className: string } | null> = {
  ok: null,
  low: { label: 'ใกล้หมด', className: 'bg-warning/10 text-warning' },
  out: { label: 'หมดแล้ว', className: 'bg-danger/10 text-danger' },
};

/**
 * ย้อนหลัง — ระบบจดยอดของทุกชิ้นไว้ทุกคืน 23:59
 *   usage (หน้าแรก)  ใช้ของไปเท่าไหร่ในช่วงที่เลือก
 *   daily           วันที่เลือกมีของเหลืออะไรบ้าง
 */
export default function StockHistoryPage() {
  const { status: authStatus } = useAuthSession();

  const [totals, setTotals] = useState<DailyStockTotal[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [items, setItems] = useState<StockSnapshotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ text: string; needLogin: boolean } | null>(null);
  const [search, setSearch] = useState<string>('');
  const [view, setView] = useState<'usage' | 'daily'>('usage');

  const apply = useCallback((res: Awaited<ReturnType<typeof loadStockHistory>>) => {
    if (res.success) {
      setTotals(res.totals);
      setDate(res.date);
      setItems(res.items);
      setError(null);
    } else {
      setError({
        text: res.code === 'UNAUTHENTICATED' ? 'กรุณาเข้าสู่ระบบก่อน' : res.error || 'โหลดข้อมูลไม่ได้',
        needLogin: res.code === 'UNAUTHENTICATED',
      });
    }
    setLoading(false);
  }, []);

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
  const older = index >= 0 ? totals[index + 1] ?? null : null;
  const newer = index > 0 ? totals[index - 1] : null;

  const query = search.trim().toLowerCase();
  const visibleItems = items.filter(
    (item) =>
      !query ||
      item.name.toLowerCase().includes(query) ||
      (item.category ?? '').toLowerCase().includes(query) ||
      (item.sku ?? '').toLowerCase() === query
  );

  return (
    <div className="min-h-screen bg-page pb-16">
      <header className="sticky top-0 z-30 bg-card border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4">
          <div className="h-14 flex items-center gap-2">
            {view === 'daily' ? (
              <button
                onClick={() => setView('usage')}
                className="w-10 h-10 -ml-2 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 touch-press"
                aria-label="กลับ"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <Link
                href="/"
                className="w-10 h-10 -ml-2 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 touch-press"
                aria-label="กลับหน้าหลัก"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
            )}
            <h1 className="text-base font-bold text-ink flex-1 truncate">
              {view === 'usage' ? 'ใช้ของไปเท่าไหร่' : 'ของเหลือแต่ละวัน'}
            </h1>
            {loading && view === 'daily' && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {error && (
          <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error.text}
            </span>
            {error.needLogin && (
              <Link
                href="/login?next=%2Fhistory"
                className="shrink-0 h-9 px-3 rounded-lg bg-danger-strong text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        )}

        {!error && loading && totals.length === 0 && (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        )}

        {!error && !loading && totals.length === 0 && (
          <div className="p-6 rounded-xl bg-card border border-slate-200 text-center text-sm text-slate-500">
            ยังไม่มีข้อมูล ระบบจะเริ่มจดยอดคืนนี้ตอน 23:59
          </div>
        )}

        {view === 'usage' && totals.length > 0 && (
          <>
            <UsageView dates={totals.map((t) => t.date)} />
            <button
              onClick={() => setView('daily')}
              className="w-full h-12 rounded-xl bg-card border border-slate-200 text-sm font-semibold text-slate-700 flex items-center justify-center gap-2 touch-press"
            >
              <Package className="w-4 h-4" />
              ดูของเหลือแต่ละวัน
            </button>
          </>
        )}

        {view === 'daily' && current && (
          <>
            <section className="bg-card rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => older && selectDate(older.date)}
                  disabled={!older || loading}
                  className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-30 touch-press"
                  aria-label="วันก่อนหน้า"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <label className="flex-1 min-w-0 relative h-10 rounded-lg border border-slate-200 flex items-center justify-center text-sm font-semibold text-ink">
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

              <p className="mt-4 text-sm text-slate-500">ตอนปิดร้าน มีของรวมเป็นเงิน</p>
              <p className="text-3xl font-bold tracking-tight text-ink tabular-nums">
                {formatCurrency(current.totalValue)}
              </p>
              {(current.lowCount > 0 || current.outCount > 0) && (
                <p className="mt-1 text-sm text-warning">
                  {[
                    current.outCount > 0 && `หมดแล้ว ${current.outCount} อย่าง`,
                    current.lowCount > 0 && `ใกล้หมด ${current.lowCount} อย่าง`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </section>

            <section className="bg-card rounded-xl border border-slate-200">
              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาชื่อของ"
                    className="w-full h-10 pl-9 pr-9 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-accent"
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
                  const badge = STATUS_BADGE[item.status];
                  return (
                    <li key={item.itemId} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-ink truncate">{item.name}</span>
                          {badge && (
                            <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.className}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          เหลือ {formatQty(item.quantity)} {item.unit}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-800 tabular-nums shrink-0">
                        {formatCurrency(item.stockValue)}
                      </div>
                    </li>
                  );
                })}
                {visibleItems.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-slate-500">ไม่เจอของที่ค้นหา</li>
                )}
              </ul>
            </section>

            <button
              onClick={() => setView('usage')}
              className="w-full h-12 rounded-xl bg-card border border-slate-200 text-sm font-semibold text-slate-700 flex items-center justify-center gap-2 touch-press"
            >
              <TrendingDown className="w-4 h-4" />
              ดูว่าใช้ของไปเท่าไหร่
            </button>
          </>
        )}
      </main>
    </div>
  );
}
