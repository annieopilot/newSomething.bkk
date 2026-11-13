'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, LogIn, Copy, Check, PartyPopper } from 'lucide-react';
import { useAuthSession } from '@/components/auth/useAuthSession';
import { loadInventory } from '@/app/actions/ingredients';
import { Ingredient } from '@/types/ingredient';
import { formatCurrency } from '@/lib/utils';

const formatQty = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n);

const NO_SUPPLIER = 'ยังไม่ได้ระบุร้านที่ซื้อ';

/**
 * จำนวนที่ควรสั่ง: ต่ำกว่าจุดสั่งซื้อ → เติมให้ถึงจุดสั่งซื้อ (suggested_order_qty)
 * ยอดพอดีจุดสั่งซื้อ (suggested = 0) → สั่งเท่าจุดสั่งซื้อ 1 รอบ (อย่างน้อย 1)
 */
const orderQty = (item: Ingredient) =>
  item.suggestedOrderQty > 0 ? item.suggestedOrderQty : Math.max(1, item.minStockLevel);

/**
 * ของที่ต้องสั่ง — รายการที่หมดแล้ว/ใกล้หมด แยกตามร้านที่ซื้อ
 * กดคัดลอกเพื่อส่งรายการให้ร้านทาง LINE ได้เลย
 */
export default function OrderPage() {
  const { status: authStatus } = useAuthSession();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ text: string; needLogin: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === 'loading') return;
    let ignore = false;
    loadInventory().then((res) => {
      if (ignore) return;
      if (res.success) {
        setItems(res.items);
        setError(null);
      } else {
        setError({
          text: res.code === 'UNAUTHENTICATED' ? 'กรุณาเข้าสู่ระบบก่อน' : res.error || 'โหลดข้อมูลไม่ได้',
          needLogin: res.code === 'UNAUTHENTICATED',
        });
      }
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [authStatus]);

  // แยกตามร้าน: ร้านที่มีของหมดมากกว่าขึ้นก่อน, ในร้าน ของที่หมดแล้วขึ้นก่อน
  const groups = useMemo(() => {
    const need = items.filter((i) => i.status === 'low' || i.status === 'out');
    const map = new Map<string, Ingredient[]>();
    for (const item of need) {
      const key = item.supplier?.trim() || NO_SUPPLIER;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()]
      .map(([supplier, list]) => ({
        supplier,
        list: list.sort(
          (a, b) => (a.status === b.status ? 0 : a.status === 'out' ? -1 : 1) || a.name.localeCompare(b.name, 'th')
        ),
        cost: list.reduce((s, i) => s + orderQty(i) * i.costPerUnit, 0),
      }))
      .sort((a, b) =>
        a.supplier === NO_SUPPLIER ? 1 : b.supplier === NO_SUPPLIER ? -1 : b.list.length - a.list.length
      );
  }, [items]);

  const totalCount = groups.reduce((s, g) => s + g.list.length, 0);
  const totalCost = groups.reduce((s, g) => s + g.cost, 0);

  const copyList = async (supplier: string, list: Ingredient[]) => {
    const lines = list.map((i) => `- ${i.name} ${formatQty(orderQty(i))} ${i.unit}`);
    const text = supplier === NO_SUPPLIER ? lines.join('\n') : `สั่งของ (${supplier})\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(supplier);
      setTimeout(() => setCopied((c) => (c === supplier ? null : c)), 2000);
    } catch {
      window.prompt('คัดลอกข้อความนี้', text);
    }
  };

  return (
    <div className="min-h-screen bg-page pb-16">
      <header className="sticky top-0 z-30 bg-card border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4">
          <div className="h-14 flex items-center gap-2">
            <Link
              href="/"
              className="w-10 h-10 -ml-2 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 touch-press"
              aria-label="กลับหน้าหลัก"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-base font-bold text-ink flex-1 truncate">ของที่ต้องสั่ง</h1>
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
                href="/login?next=%2Forder"
                className="shrink-0 h-9 px-3 rounded-lg bg-danger-strong text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        )}

        {loading && (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        )}

        {!loading && !error && totalCount === 0 && (
          <div className="p-8 rounded-xl bg-card border border-slate-200 text-center">
            <PartyPopper className="w-8 h-8 mx-auto text-success" />
            <p className="mt-2 text-sm font-semibold text-ink">ของยังพอทุกอย่าง</p>
            <p className="text-xs text-slate-500">ยังไม่มีอะไรต้องสั่งตอนนี้</p>
          </div>
        )}

        {!loading && totalCount > 0 && (
          <>
            <section className="bg-card rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">ต้องสั่งของ</p>
              <p className="text-3xl font-bold tracking-tight text-ink">{totalCount} อย่าง</p>
              {totalCost > 0 && (
                <p className="mt-1 text-sm text-slate-500">
                  ใช้เงินประมาณ <span className="font-semibold text-slate-700">{formatCurrency(totalCost)}</span>
                </p>
              )}
            </section>

            {groups.map(({ supplier, list, cost }) => (
              <section key={supplier} className="bg-card rounded-xl border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{supplier}</p>
                    <p className="text-xs text-slate-500">
                      {list.length} อย่าง{cost > 0 ? ` · ประมาณ ${formatCurrency(cost)}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => copyList(supplier, list)}
                    className="shrink-0 h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 touch-press"
                  >
                    {copied === supplier ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-success" /> คัดลอกแล้ว
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> คัดลอกรายการ
                      </>
                    )}
                  </button>
                </div>
                <ul className="divide-y divide-slate-100">
                  {list.map((item) => (
                    <li key={item.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-ink truncate">{item.name}</span>
                          {item.status === 'out' && (
                            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-danger/10 text-danger">
                              หมดแล้ว
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          เหลือ {formatQty(Math.max(0, item.currentStock))} {item.unit}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-slate-400">ควรสั่ง</div>
                        <div className="text-sm font-semibold text-accent">
                          {formatQty(orderQty(item))} {item.unit}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <p className="text-xs text-slate-400 text-center px-4">
              &ldquo;ควรสั่ง&rdquo; = จำนวนที่ทำให้ของกลับมาพอใช้ ตามจุดสั่งซื้อที่ตั้งไว้ของแต่ละอย่าง
            </p>
          </>
        )}
      </main>
    </div>
  );
}
