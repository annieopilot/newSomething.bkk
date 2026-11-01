'use server';

import { isSupabaseConfigured } from '@/lib/supabase';
import { getAuthenticatedClient } from '@/lib/supabase-server';
import {
  Ingredient,
  IngredientInput,
  InventoryLookups,
  EMPTY_LOOKUPS,
  StockMovementInput,
} from '@/types/ingredient';
import { revalidatePath } from 'next/cache';

/**
 * ข้อมูลสต็อกอยู่ในตารางชุดใหม่ (supabase/inventory.sql):
 *   items            — สินค้า/วัตถุดิบ
 *   stock_movements  — ประวัติรับเข้า/ใช้/นับ (ยอดคงเหลือคำนวณจากตารางนี้ด้วย trigger)
 *   v_inventory      — view สำหรับอ่าน (รวมหมวด หน่วย ผู้ขาย สถานะ)
 * ทุกการอ่าน/เขียนใช้ session ของผู้ใช้ (role authenticated) → RLS ตรวจสิทธิ์ และ audit_log รู้ว่าใครแก้
 */

type Client = NonNullable<Awaited<ReturnType<typeof getAuthenticatedClient>>>['client'];

type ErrorCode = 'UNAUTHENTICATED' | 'RLS_DENIED' | 'NOT_CONFIGURED';
type WriteResult = { success: boolean; error?: string; code?: ErrorCode };
type WriteOperation = 'insert' | 'update' | 'delete';

const NOT_CONFIGURED: WriteResult = { success: false, code: 'NOT_CONFIGURED', error: 'ยังไม่ได้ตั้งค่า Supabase' };
const UNAUTHENTICATED: WriteResult = {
  success: false,
  code: 'UNAUTHENTICATED',
  error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน',
};

const WRITE_OPERATION_LABEL: Record<WriteOperation, string> = {
  insert: 'เพิ่ม',
  update: 'แก้ไข',
  delete: 'ลบ',
};

/**
 * แปลง error จาก Supabase ให้อ่านเข้าใจได้
 */
function toWriteError(error: any, table: string, operation: WriteOperation, fallback: string): WriteResult {
  const message: string = error?.message || '';
  if (error?.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return {
      success: false,
      code: 'RLS_DENIED',
      error: `ไม่มีสิทธิ์${WRITE_OPERATION_LABEL[operation]}ข้อมูลในตาราง "${table}" (ถูกปฏิเสธโดย Row Level Security)`,
    };
  }
  if (error?.code === '23505') {
    return { success: false, error: 'ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว (เช่น SKU หรือชื่อซ้ำ)' };
  }
  if (error?.code === '23514') {
    return { success: false, error: 'ค่าที่กรอกไม่ถูกต้อง (เช่น ตัวเลขติดลบ)' };
  }
  return { success: false, error: message || fallback };
}

function noRowsAffectedError(table: string, operation: WriteOperation): WriteResult {
  return {
    success: false,
    code: 'RLS_DENIED',
    error: `ไม่มีรายการใดถูก${WRITE_OPERATION_LABEL[operation]}ในตาราง "${table}" — รายการอาจถูกลบไปแล้ว หรือไม่มีสิทธิ์`,
  };
}

/** ตรวจ config + session ครั้งเดียว */
async function requireClient(): Promise<{ client: Client } | { failure: WriteResult }> {
  if (!isSupabaseConfigured) return { failure: NOT_CONFIGURED };
  const auth = await getAuthenticatedClient();
  if (!auth) return { failure: UNAUTHENTICATED };
  return { client: auth.client };
}

const toNumber = (value: unknown): number => Number(value) || 0;
const toId = (id: string): number => Number(id);

function mapRow(row: any): Ingredient {
  return {
    id: String(row.id),
    sku: row.sku ?? null,
    name: row.name || '',
    unit: row.unit || '',
    unitCode: row.unit_code || '',
    tareWeight: toNumber(row.tare_weight),
    currentStock: toNumber(row.current_stock),
    minStockLevel: toNumber(row.reorder_point),
    suggestedOrderQty: toNumber(row.suggested_order_qty),
    category: row.category ?? null,
    costPerUnit: toNumber(row.cost_per_unit),
    stockValue: toNumber(row.stock_value),
    barcode: row.barcode ?? null,
    supplier: row.supplier ?? null,
    notes: row.notes ?? null,
    packageQuantity: row.purchase_pack_size == null ? null : toNumber(row.purchase_pack_size),
    status: row.status,
    lastMovementAt: row.last_movement_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * โหลดข้อมูลหน้าคลังทั้งหมดในการเรียกครั้งเดียว: รายการที่ใช้งานอยู่ + ตัวเลือกในฟอร์ม
 * (Next.js รัน server action ทีละตัว การรวมเป็นตัวเดียวจึงเร็วกว่าเรียกหลายตัว)
 * การกรอง/ค้นหา/สรุปยอด ทำฝั่ง browser ด้วย lib/inventory.ts
 */
export async function loadInventory(): Promise<{
  success: boolean;
  isConfigured: boolean;
  items: Ingredient[];
  lookups: InventoryLookups;
  error?: string;
  code?: ErrorCode;
}> {
  const empty = { items: [], lookups: EMPTY_LOOKUPS, isConfigured: isSupabaseConfigured };
  const ctx = await requireClient();
  if ('failure' in ctx) return { ...empty, ...ctx.failure, success: false };

  try {
    // ยิงพร้อมกันทั้ง 4 คำสั่ง
    const [items, categories, units, suppliers] = await Promise.all([
      ctx.client.from('v_inventory').select('*').eq('is_active', true),
      ctx.client.from('item_categories').select('name').order('sort_order').order('name'),
      ctx.client.from('units').select('name_th, kind').order('kind').order('name_th'),
      ctx.client.from('suppliers').select('name').eq('is_active', true).order('name'),
    ]);
    if (items.error) throw items.error;

    const data = (items.data || []).map(mapRow);
    data.sort(
      (a, b) =>
        (a.category || '').localeCompare(b.category || '', 'th') || a.name.localeCompare(b.name, 'th')
    );

    return {
      success: true,
      isConfigured: true,
      items: data,
      lookups: {
        categories: (categories.data || []).map((row) => row.name),
        units: (units.data || []).map((row) => row.name_th),
        suppliers: (suppliers.data || []).map((row) => row.name),
      },
    };
  } catch (error: any) {
    console.error('Failed to load inventory from Supabase:', error);
    return { ...empty, success: false, error: error.message || 'ไม่สามารถดึงข้อมูลได้' };
  }
}

// ---------------------------------------------------------------------------
// ตัวช่วยเขียนข้อมูล
// ---------------------------------------------------------------------------

/** หา id ของหมวด/ผู้ขายจากชื่อ ถ้ายังไม่มีให้สร้างใหม่ (ชื่อว่าง = null) */
async function resolveNamedId(client: Client, table: 'item_categories' | 'suppliers', name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const { data: existing, error: findErr } = await client.from(table).select('id').eq('name', trimmed).maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id as number;

  const { data: created, error: insertErr } = await client.from(table).insert({ name: trimmed }).select('id').single();
  if (insertErr) throw insertErr;
  return created.id as number;
}

/** แปลงชื่อหน่วยภาษาไทย → units.code */
async function resolveUnitCode(client: Client, unitName: string) {
  const { data, error } = await client.from('units').select('code').eq('name_th', unitName.trim()).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`ไม่รู้จักหน่วย "${unitName}" — เพิ่มหน่วยในตาราง units ก่อน`);
  return data.code as string;
}

/** บันทึกรับเข้า/จ่ายออก 1 รายการ จ่ายออกเกินยอดที่มี → จ่ายเท่าที่มี (ยอดไม่ติดลบ) */
async function insertMovement(client: Client, itemId: number, movement: StockMovementInput) {
  const amount = Math.abs(Number(movement.quantity) || 0);
  if (amount === 0) return { quantity: 0 };

  let quantity = movement.type === 'purchase' ? amount : -amount;
  if (movement.type === 'usage') {
    const { data: item, error } = await client.from('items').select('current_stock').eq('id', itemId).single();
    if (error) throw error;
    quantity = -Math.min(amount, Math.max(0, toNumber(item.current_stock)));
    if (quantity === 0) return { quantity: 0 };
  }

  const { error } = await client.from('stock_movements').insert({
    item_id: itemId,
    movement_type: movement.type,
    quantity,
    note: movement.note || null,
  });
  if (error) throw error;
  return { quantity };
}

async function itemPayload(client: Client, data: Partial<IngredientInput>) {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.unit !== undefined) payload.unit_code = await resolveUnitCode(client, data.unit);
  if (data.category !== undefined) payload.category_id = await resolveNamedId(client, 'item_categories', data.category);
  if (data.supplier !== undefined) payload.default_supplier_id = await resolveNamedId(client, 'suppliers', data.supplier);
  if (data.costPerUnit !== undefined) payload.cost_per_unit = Math.max(0, Number(data.costPerUnit) || 0);
  if (data.minStockLevel !== undefined) payload.reorder_point = Math.max(0, Number(data.minStockLevel) || 0);
  if (data.tareWeight !== undefined) payload.tare_weight = Math.max(0, Number(data.tareWeight) || 0);
  if (data.barcode !== undefined) payload.barcode = data.barcode.trim() || null;
  if (data.notes !== undefined) payload.notes = data.notes.trim() || null;
  if (data.packageQuantity !== undefined) {
    const size = Number(data.packageQuantity);
    payload.purchase_pack_size = size > 0 ? size : null;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// เพิ่ม / แก้ / ลบ
// ---------------------------------------------------------------------------

/**
 * เพิ่มสินค้าใหม่ — ยอดเริ่มต้นถูกบันทึกเป็น movement "opening" อัตโนมัติ (trigger)
 */
export async function createIngredient(data: IngredientInput): Promise<WriteResult & { data?: Ingredient }> {
  if (!data.name || data.name.trim() === '') {
    return { success: false, error: 'กรุณากรอกชื่อวัตถุดิบ/สินค้า' };
  }

  const ctx = await requireClient();
  if ('failure' in ctx) return ctx.failure;

  try {
    const payload = await itemPayload(ctx.client, data);
    payload.current_stock = Math.max(0, Number(data.currentStock) || 0);

    const { error } = await ctx.client.from('items').insert(payload);
    if (error) return toWriteError(error, 'items', 'insert', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to create item:', error);
    return toWriteError(error, 'items', 'insert', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
  }
}

/**
 * แก้ไขข้อมูลสินค้า
 * - stockMovement → บันทึกรับเข้า/จ่ายออก
 * - currentStock (ไม่มี stockMovement) → ตั้งยอดใหม่ ระบบบันทึกส่วนต่างเป็น "นับสต็อก"
 */
export async function updateIngredient(id: string, data: Partial<IngredientInput>): Promise<WriteResult> {
  const ctx = await requireClient();
  if ('failure' in ctx) return ctx.failure;

  try {
    const itemId = toId(id);
    const payload = await itemPayload(ctx.client, data);
    if (!data.stockMovement && data.currentStock !== undefined) {
      payload.current_stock = Math.max(0, Number(data.currentStock) || 0);
    }

    if (Object.keys(payload).length > 0) {
      const { error, count } = await ctx.client.from('items').update(payload, { count: 'exact' }).eq('id', itemId);
      if (error) return toWriteError(error, 'items', 'update', 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
      if (count === 0) return noRowsAffectedError('items', 'update');
    }

    if (data.stockMovement) await insertMovement(ctx.client, itemId, data.stockMovement);

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to update item:', error);
    return toWriteError(error, 'items', 'update', 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
  }
}

/**
 * นำรายการออกจากคลัง — ตั้ง is_active = false (ประวัติสต็อกและ audit log ยังอยู่ครบ)
 */
export async function deleteIngredient(id: string): Promise<WriteResult> {
  const ctx = await requireClient();
  if ('failure' in ctx) return ctx.failure;

  try {
    const { error, count } = await ctx.client
      .from('items')
      .update({ is_active: false }, { count: 'exact' })
      .eq('id', toId(id));
    if (error) return toWriteError(error, 'items', 'update', 'เกิดข้อผิดพลาดในการลบข้อมูล');
    if (count === 0) return noRowsAffectedError('items', 'update');

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to deactivate item:', error);
    return toWriteError(error, 'items', 'update', 'เกิดข้อผิดพลาดในการลบข้อมูล');
  }
}

/**
 * ปรับยอดสต็อกอย่างรวดเร็ว: add = รับเข้า, subtract = จ่ายออก, set = ตั้งยอด (นับสต็อก)
 */
export async function quickAdjustStock(
  id: string,
  amount: number,
  mode: 'set' | 'add' | 'subtract'
): Promise<WriteResult & { newStock?: number }> {
  const ctx = await requireClient();
  if ('failure' in ctx) return ctx.failure;

  try {
    const itemId = toId(id);
    if (mode === 'set') {
      const { error } = await ctx.client.rpc('record_stock_count', {
        p_item_id: itemId,
        p_counted: Math.max(0, Number(amount) || 0),
      });
      if (error) return toWriteError(error, 'stock_movements', 'insert', 'เกิดข้อผิดพลาดในการปรับยอดสต็อก');
    } else {
      await insertMovement(ctx.client, itemId, { type: mode === 'add' ? 'purchase' : 'usage', quantity: amount });
    }

    const { data: item, error: fetchErr } = await ctx.client
      .from('items')
      .select('current_stock')
      .eq('id', itemId)
      .single();
    if (fetchErr) return toWriteError(fetchErr, 'items', 'update', 'ปรับยอดแล้ว แต่อ่านยอดใหม่ไม่ได้');

    revalidatePath('/');
    return { success: true, newStock: toNumber(item.current_stock) };
  } catch (error: any) {
    console.error('Failed to adjust stock:', error);
    return toWriteError(error, 'stock_movements', 'insert', 'เกิดข้อผิดพลาดในการปรับยอดสต็อก');
  }
}

/**
 * บันทึกยอดนับสต็อกหลายรายการ (หน้า /count) — แต่ละรายการบันทึกส่วนต่างเป็น movement "count"
 * คืนรายการ id ที่บันทึกไม่สำเร็จ เพื่อให้หน้าเว็บเก็บค่าที่ยังไม่ได้บันทึกไว้ให้ลองใหม่
 */
export async function saveStockCounts(
  counts: { id: string; currentStock: number }[]
): Promise<WriteResult & { savedIds?: string[]; failedIds?: string[] }> {
  const ctx = await requireClient();
  if ('failure' in ctx) return ctx.failure;

  try {
    const results = await Promise.all(
      counts.map(async ({ id, currentStock }) => {
        const { error } = await ctx.client.rpc('record_stock_count', {
          p_item_id: toId(id),
          p_counted: Math.max(0, Number(currentStock) || 0),
          p_note: 'นับสต็อก (หน้านับสต็อก)',
        });
        if (error) {
          return { id, failure: toWriteError(error, 'stock_movements', 'insert', 'เกิดข้อผิดพลาดในการบันทึกยอดนับ') };
        }
        return { id, failure: null };
      })
    );

    const savedIds = results.filter((r) => !r.failure).map((r) => r.id);
    const failedIds = results.filter((r) => r.failure).map((r) => r.id);
    if (savedIds.length > 0) revalidatePath('/');

    if (failedIds.length > 0) {
      const firstFailure = results.find((r) => r.failure)!.failure!;
      return { ...firstFailure, success: false, savedIds, failedIds };
    }
    return { success: true, savedIds, failedIds };
  } catch (error: any) {
    console.error('Failed to save stock counts:', error);
    return toWriteError(error, 'stock_movements', 'insert', 'เกิดข้อผิดพลาดในการบันทึกยอดนับ');
  }
}
