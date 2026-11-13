'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { loadStockComparison } from '@/app/actions/stock-history';
import { StockComparison } from '@/types/stock-history';
import { formatCurrency } from '@/lib/utils';

const formatQty = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n);

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** วันที่ที่มียอด ซึ่งใกล้ target ที่สุดแต่ไม่เกิน (dates เรียงใหม่ → เก่า) */
const onOrBefore = (dates: string[], target: string) => dates.find((d) => d <= target);

type Period = { key: string; label: string; from: string; to: string };

/**
 * ใช้ของไปเท่าไหร่ — เลือกช่วงเวลา แล้วดูว่าใช้ของอะไรไปบ้าง คิดเป็นเงินเท่าไหร่
 * ช่วงเวลา = ตั้งแต่หลังปิดวัน "from" จนถึงปิดวัน "to" (ใช้ยอดที่ระบบจดไว้ทุกคืน)
 * ใช้ไป = ของที่มีตอนเริ่ม + ที่รับเข้า − ของที่เหลือตอนท้าย (คำนวณใน loadStockComparison)
 */
export function UsageView({ dates }: { dates: string[] }) {
  const periods = useMemo<Period[]>(() => {
    const latest = dates[0];
    const monthStart = `${latest.slice(0, 7)}-01`;
    const prevMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
    const yesterday = onOrBefore(dates, addDays(latest, -1));
    const list: Array<Partial<Period> & { key: string; label: string }> = [
      { key: 'day', label: 'วันล่าสุด', from: yesterday, to: latest },
      { key: 'week', label: '7 วัน', from: onOrBefore(dates, addDays(latest, -7)) ?? dates[dates.length - 1], to: latest },
      { key: 'month', label: 'เดือนนี้', from: onOrBefore(dates, addDays(monthStart, -1)) ?? dates[dates.length - 1], to: latest },
      {
        key: 'prevMonth',
        label: 'เดือนที่แล้ว',
        from: onOrBefore(dates, addDays(prevMonthStart, -1)) ?? dates[dates.length - 1],
        to: onOrBefore(dates, addDays(monthStart, -1)),
      },
    ];
    return list.filter((p): p is Period => !!p.from && !!p.to && p.from < p.to);
  }, [dates]);

  const [periodKey, setPeriodKey] = useState<string>(() => periods.find((p) => p.key === 'week')?.key ?? periods[0]?.key);
  const period = periods.find((p) => p.key === periodKey) ?? periods[0];

  const [data, setData] = useState<StockComparison | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!period) return;
    let ignore = false;
    loadStockComparison(period.from, period.to).then((res) => {
      if (ignore) return;
      if (res.success && res.data) {
        setData(res.data);
        setError('');
      } else {
        setError(res.error || 'โหลดข้อมูลไม่ได้');
      }
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [period]);

  const used = useMemo(
    () => (data ? data.items.filter((i) => i.usedValue > 0).sort((a, b) => b.usedValue - a.usedValue) : []),
    [data]
  );
  const maxUsed = used[0]?.usedValue || 1;

  if (!period) {
    return (
      <div className="p-6 rounded-xl bg-card border border-slate-200 text-center text-sm text-slate-500">
        ต้องมีข้อมูลอย่างน้อย 2 วันก่อน ถึงจะดูได้ว่าใช้ของไปเท่าไหร่
      </div>
    );
  }

  // ช่วงที่แสดงให้คนอ่าน: วันถัดจาก from ถึง to
  const firstDay = addDays(period.from, 1);
  const rangeText = firstDay === period.to ? shortDate(period.to) : `${shortDate(firstDay)} – ${shortDate(period.to)}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1.5">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              if (p.key === period.key) return;
              setLoading(true);
              setPeriodKey(p.key);
            }}
            className={`h-10 rounded-lg text-sm font-semibold border touch-press ${
              p.key === period.key ? 'bg-accent-strong border-accent text-white' : 'bg-card border-slate-200 text-slate-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-2">
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
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <section className="bg-card rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{rangeText} ใช้ของไป</p>
            <p className="text-4xl font-bold tracking-tight text-accent tabular-nums">{formatCurrency(data.usedValue)}</p>
            {data.receivedValue > 0 && (
              <p className="mt-1 text-sm text-slate-500">
                ช่วงเดียวกันซื้อของเข้า <span className="font-semibold text-slate-700">{formatCurrency(data.receivedValue)}</span>
              </p>
            )}
          </section>

          <section className="bg-card rounded-xl border border-slate-200">
            <ul className="divide-y divide-slate-100">
              {used.map((item) => (
                <li key={item.itemId} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-ink truncate">{item.name}</span>
                    <span className="text-sm font-semibold text-slate-800 tabular-nums shrink-0">
                      {formatCurrency(item.usedValue)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3">
                    <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                      ใช้ไป {formatQty(item.usedQty)} {item.unit}
                    </span>
                    <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-accent/60"
                        style={{ width: `${Math.max(2, (item.usedValue / maxUsed) * 100)}%` }}
                      />
                    </span>
                  </div>
                </li>
              ))}
              {used.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-500">ช่วงนี้ยังไม่มีการใช้ของ</li>
              )}
            </ul>
          </section>
          <p className="text-xs text-slate-400 text-center px-4">
            คิดจากของที่มีตอนเริ่ม + ที่ซื้อเข้า − ของที่เหลือตอนท้าย จึงรวมทั้งที่ขาย ใช้ และทิ้งไป
          </p>
        </div>
      )}
    </div>
  );
}
