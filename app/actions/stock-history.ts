'use server';

import { isSupabaseConfigured } from '@/lib/supabase';
import { getAuthenticatedClient } from '@/lib/supabase-server';
import {
  DailyStockTotal,
  StockComparison,
  StockComparisonItem,
  StockSnapshotItem,
} from '@/types/stock-history';

/**
 * ยอดสต็อกย้อนหลัง (supabase/stock_history.sql) — บันทึกทุกคืน 23:59 โดย pg_cron
 *   v_stock_daily_totals     ยอดรวมแต่ละวัน (วันละ 1 แถว จึงโหลดทั้งหมดได้)
 *   stock_daily_snapshots    ยอดรายสินค้าของวันที่เลือก
 * อ่านได้เฉพาะผู้ที่ล็อกอิน (RLS)
 */

type HistoryResult = {
  success: boolean;
  totals: DailyStockTotal[];
  date: string | null;
  items: StockSnapshotItem[];
  error?: string;
  code?: 'UNAUTHENTICATED' | 'NOT_CONFIGURED';
};

const MAX_DAYS = 1000;

export async function loadStockHistory(date?: string): Promise<HistoryResult> {
  const empty = { totals: [], date: null, items: [] };
  if (!isSupabaseConfigured) {
    return { ...empty, success: false, code: 'NOT_CONFIGURED', error: 'ยังไม่ได้ตั้งค่า Supabase' };
  }
  const auth = await getAuthenticatedClient();
  if (!auth) return { ...empty, success: false, code: 'UNAUTHENTICATED', error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' };
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ...empty, success: false, error: 'วันที่ไม่ถูกต้อง' };
  }

  try {
    const totalsRes = await auth.client
      .from('v_stock_daily_totals')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(MAX_DAYS);
    if (totalsRes.error) throw totalsRes.error;

    const totals: DailyStockTotal[] = (totalsRes.data || []).map((row) => ({
      date: row.snapshot_date,
      itemCount: Number(row.item_count) || 0,
      totalValue: Number(row.total_value) || 0,
      lowCount: Number(row.low_count) || 0,
      outCount: Number(row.out_count) || 0,
      isBackfill: !!row.is_backfill,
    }));

    const selected = date ?? totals[0]?.date ?? null;
    if (!selected) return { success: true, totals, date: null, items: [] };

    const itemsRes = await auth.client
      .from('stock_daily_snapshots')
      .select('item_id, item_name, sku, category, unit, quantity, cost_per_unit, stock_value, reorder_point, status')
      .eq('snapshot_date', selected)
      .order('stock_value', { ascending: false });
    if (itemsRes.error) throw itemsRes.error;

    const items: StockSnapshotItem[] = (itemsRes.data || []).map((row) => ({
      itemId: String(row.item_id),
      name: row.item_name,
      sku: row.sku ?? null,
      category: row.category ?? null,
      unit: row.unit ?? '',
      quantity: Number(row.quantity) || 0,
      costPerUnit: Number(row.cost_per_unit) || 0,
      stockValue: Number(row.stock_value) || 0,
      reorderPoint: Number(row.reorder_point) || 0,
      status: row.status,
    }));

    return { success: true, totals, date: selected, items };
  } catch (error) {
    console.error('Failed to load stock history:', error);
    const message = (error as { message?: string } | null)?.message;
    return { ...empty, success: false, error: message || 'ไม่สามารถดึงข้อมูลย้อนหลังได้' };
  }
}

const RECEIVED_TYPES = new Set(['opening', 'purchase']);
const USAGE_TYPES = new Set(['usage', 'sale', 'waste']);

/** เที่ยงคืนต้นวันถัดไปตามเวลาไทย = เวลาที่ยอดของวันนั้นสิ้นสุด */
const dayEndBangkok = (isoDate: string) => new Date(`${isoDate}T00:00:00+07:00`).getTime() + 86_400_000;

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * เปรียบเทียบยอดสิ้นวัน 2 วัน และแยกการเคลื่อนไหวในช่วงนั้น (หลังสิ้นวันเริ่ม ถึงสิ้นวันสิ้นสุด)
 *   ใช้ไปโดยประมาณ = ยอดเริ่ม + รับเข้า − ยอดสิ้นสุด
 *   (รวมที่บันทึกว่าใช้/ขาย/เสีย และส่วนที่หายไปตอนนับสต็อก)
 */
export async function loadStockComparison(
  from: string,
  to: string
): Promise<{ success: boolean; data?: StockComparison; error?: string; code?: 'UNAUTHENTICATED' | 'NOT_CONFIGURED' }> {
  if (!isSupabaseConfigured) return { success: false, code: 'NOT_CONFIGURED', error: 'ยังไม่ได้ตั้งค่า Supabase' };
  const auth = await getAuthenticatedClient();
  if (!auth) return { success: false, code: 'UNAUTHENTICATED', error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' };
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!isDate(from) || !isDate(to)) return { success: false, error: 'วันที่ไม่ถูกต้อง' };
  if (from > to) [from, to] = [to, from];

  try {
    const snapshotCols = 'snapshot_date, item_id, item_name, category, unit, quantity, cost_per_unit, stock_value';
    const [snapshots, movements] = await Promise.all([
      auth.client.from('stock_daily_snapshots').select(snapshotCols).in('snapshot_date', [from, to]),
      auth.client
        .from('stock_movements')
        .select('item_id, movement_type, quantity, unit_cost')
        .gte('occurred_at', new Date(dayEndBangkok(from)).toISOString())
        .lt('occurred_at', new Date(dayEndBangkok(to)).toISOString())
        .limit(50_000),
    ]);
    if (snapshots.error) throw snapshots.error;
    if (movements.error) throw movements.error;

    type Acc = StockComparisonItem;
    const byItem = new Map<string, Acc>();
    const get = (id: string): Acc => {
      let acc = byItem.get(id);
      if (!acc) {
        acc = {
          itemId: id, name: '', category: null, unit: '',
          fromQty: null, toQty: null, fromValue: 0, toValue: 0,
          receivedQty: 0, receivedValue: 0, recordedUsageQty: 0, countAdjustQty: 0,
          usedQty: 0, usedValue: 0, costPerUnit: 0,
        };
        byItem.set(id, acc);
      }
      return acc;
    };

    // ใส่วันเริ่มก่อน วันสิ้นสุดทับชื่อ/หมวด/ราคา (ใช้ข้อมูลล่าสุดของช่วง)
    const rows = [...(snapshots.data || [])].sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : 1));
    for (const row of rows) {
      const acc = get(String(row.item_id));
      acc.name = row.item_name;
      acc.category = row.category ?? null;
      acc.unit = row.unit ?? '';
      acc.costPerUnit = Number(row.cost_per_unit) || 0;
      if (row.snapshot_date === from) {
        acc.fromQty = Number(row.quantity) || 0;
        acc.fromValue = Number(row.stock_value) || 0;
      }
      if (row.snapshot_date === to) {
        acc.toQty = Number(row.quantity) || 0;
        acc.toValue = Number(row.stock_value) || 0;
      }
    }

    const pendingReceivedCost: Array<[Acc, number, number | null]> = [];
    for (const m of movements.data || []) {
      const acc = byItem.get(String(m.item_id));
      if (!acc) continue; // สินค้าที่ไม่อยู่ในยอดทั้ง 2 วัน (เช่น ปิดใช้งานแล้ว)
      const qty = Number(m.quantity) || 0;
      if (RECEIVED_TYPES.has(m.movement_type)) {
        acc.receivedQty += qty;
        pendingReceivedCost.push([acc, qty, m.unit_cost == null ? null : Number(m.unit_cost)]);
      } else if (USAGE_TYPES.has(m.movement_type)) {
        acc.recordedUsageQty += -qty;
      } else {
        acc.countAdjustQty += qty;
      }
    }
    // มูลค่ารับเข้า: ใช้ราคาที่บันทึกตอนรับ ถ้าไม่มีใช้ราคาต่อหน่วยของสินค้า
    for (const [acc, qty, unitCost] of pendingReceivedCost) acc.receivedValue += qty * (unitCost ?? acc.costPerUnit);

    const items = [...byItem.values()].map((acc) => {
      const used = (acc.fromQty ?? 0) + acc.receivedQty - (acc.toQty ?? 0);
      return {
        ...acc,
        receivedQty: round(acc.receivedQty, 3),
        receivedValue: round(acc.receivedValue, 2),
        recordedUsageQty: round(acc.recordedUsageQty, 3),
        countAdjustQty: round(acc.countAdjustQty, 3),
        usedQty: round(used, 3),
        usedValue: round(used * acc.costPerUnit, 2),
      };
    });

    const sum = (pick: (i: StockComparisonItem) => number) => round(items.reduce((s, i) => s + pick(i), 0), 2);
    return {
      success: true,
      data: {
        from,
        to,
        fromTotal: sum((i) => Math.max(0, i.fromValue)),
        toTotal: sum((i) => Math.max(0, i.toValue)),
        receivedValue: sum((i) => i.receivedValue),
        // แยกรายการที่ยอดเพิ่มเกินที่รับเข้า (มักมาจากนับได้มากกว่าในระบบ) ไม่ให้หักลบกับที่ใช้ไปจริง
        usedValue: sum((i) => Math.max(0, i.usedValue)),
        surplusValue: sum((i) => Math.max(0, -i.usedValue)),
        items,
      },
    };
  } catch (error) {
    console.error('Failed to compare stock:', error);
    const message = (error as { message?: string } | null)?.message;
    return { success: false, error: message || 'ไม่สามารถเปรียบเทียบข้อมูลได้' };
  }
}
