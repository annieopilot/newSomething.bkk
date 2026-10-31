'use server';

import { isSupabaseConfigured } from '@/lib/supabase';
import { supabase, getAuthenticatedClient } from '@/lib/supabase-server';
import { Ingredient, IngredientInput, InventoryStats, InventoryTab } from '@/types/ingredient';
import { revalidatePath } from 'next/cache';

/**
 * ตรวจสอบว่าระบบกำลังเชื่อมต่อกับ Supabase หรือไม่
 */
export async function getDatabaseConnectionStatus(): Promise<{
  provider: 'supabase' | 'local';
  isConfigured: boolean;
  supabaseUrl?: string;
}> {
  return {
    provider: isSupabaseConfigured ? 'supabase' : 'local',
    isConfigured: isSupabaseConfigured,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  };
}

/**
 * ดึงรายการพัสดุและสต็อกจาก Supabase (รองรับทั้ง supplies และ stock)
 */
export async function getIngredients(params?: {
  tab?: InventoryTab;
  search?: string;
  category?: string;
  status?: 'all' | 'low' | 'out' | 'in_stock';
  sortBy?: 'name' | 'currentStock' | 'tareWeight';
  sortOrder?: 'asc' | 'desc';
}): Promise<{ success: boolean; data: Ingredient[]; provider: string; error?: string }> {
  try {
    const {
      tab = 'supplies',
      search,
      category,
      status = 'all',
      sortBy = 'name',
      sortOrder = 'asc',
    } = params || {};

    if (!isSupabaseConfigured) {
      return { success: false, data: [], provider: 'none', error: 'ยังไม่ได้ตั้งค่า Supabase' };
    }

    let items: Ingredient[] = [];

    if (tab === 'supplies') {
      // ดึงจากตาราง supplies
      let query = supabase.from('supplies').select('*');

      if (category && category !== 'all') {
        query = query.eq('category', category);
      }
      if (search && search.trim() !== '') {
        query = query.ilike('item_name', `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      items = (data || []).map((row) => ({
        id: String(row.id),
        name: row.item_name || '',
        unit: row.unit || 'ชิ้น',
        tareWeight: 0, // จุดประสงค์เดิม: ระบบรองรับ Tare Weight (รอเพิ่ม column ใน DB ภายหลัง)
        currentStock: Number(row.stock_quantity) || 0,
        minStockLevel: 5, // จุดเตือนเบื้องต้น
        category: row.category || 'Supply',
        costPerUnit: Number(row.cost_per_unit) || Number(row.purchase_price) || 0,
        price: Number(row.purchase_price) || 0,
        packageQuantity: Number(row.package_quantity) || 1,
        sourceTable: 'supplies',
        createdAt: row.created_at,
        notes: row.package_quantity ? `บรรจุแพ็คละ ${row.package_quantity} ${row.unit}` : null,
      }));
    } else {
      // ดึงจากตาราง stock
      let query = supabase.from('stock').select('*');

      if (category && category !== 'all') {
        query = query.eq('category', category);
      }
      if (search && search.trim() !== '') {
        query = query.ilike('item_name', `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      items = (data || []).map((row) => ({
        id: String(row.id),
        name: row.item_name || '',
        unit: row.unit || 'Cup',
        tareWeight: 0, // จุดประสงค์เดิม: ระบบรองรับ Tare Weight (รอเพิ่ม column ใน DB ภายหลัง)
        currentStock: Number(row.stock_quantity) || 0,
        minStockLevel: 10,
        category: row.category || 'Coffee',
        costPerUnit: Number(row.avg_cost) || 0,
        price: Number(row.price) || 0,
        barcode: row.barcode && row.barcode !== '-' ? row.barcode : null,
        sourceTable: 'stock',
        createdAt: row.created_at,
        notes: row.profit_margin ? `Margin: ${row.profit_margin}` : null,
      }));
    }

    // จัดเรียง
    items.sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name, 'th') : b.name.localeCompare(a.name, 'th');
      }
      if (sortBy === 'currentStock') {
        return sortOrder === 'asc' ? a.currentStock - b.currentStock : b.currentStock - a.currentStock;
      }
      return 0;
    });

    // กรองสถานะสต็อก
    if (status === 'out') {
      items = items.filter((item) => item.currentStock <= 0);
    } else if (status === 'low') {
      items = items.filter((item) => item.currentStock > 0 && item.currentStock <= item.minStockLevel);
    } else if (status === 'in_stock') {
      items = items.filter((item) => item.currentStock > item.minStockLevel);
    }

    return { success: true, data: items, provider: 'supabase' };
  } catch (error: any) {
    console.error('Failed to fetch ingredients from Supabase:', error);
    return { success: false, data: [], provider: 'supabase', error: error.message || 'ไม่สามารถดึงข้อมูลได้' };
  }
}

/**
 * ดึงข้อมูลสรุปภาพรวมสต็อก
 */
export async function getInventoryStats(tab: InventoryTab = 'supplies'): Promise<InventoryStats> {
  try {
    if (!isSupabaseConfigured) {
      return { totalItems: 0, lowStockCount: 0, outOfStockCount: 0, categoriesCount: 0, totalEstimatedValue: 0 };
    }

    const tableName = tab === 'supplies' ? 'supplies' : 'stock';
    const { data, error } = await supabase.from(tableName).select('*');
    if (error || !data) return { totalItems: 0, lowStockCount: 0, outOfStockCount: 0, categoriesCount: 0, totalEstimatedValue: 0 };

    const totalItems = data.length;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalEstimatedValue = 0;
    const uniqueCategories = new Set<string>();

    for (const item of data) {
      if (item.category) uniqueCategories.add(item.category);

      const qty = Number(item.stock_quantity) || 0;
      const minLevel = tab === 'supplies' ? 5 : 10;
      const cost = tab === 'supplies' ? (Number(item.cost_per_unit) || Number(item.purchase_price) || 0) : (Number(item.avg_cost) || 0);

      if (qty <= 0) {
        outOfStockCount++;
      } else if (qty <= minLevel) {
        lowStockCount++;
      }

      if (cost > 0 && qty > 0) {
        // จำกัดไม่ให้จำนวนหลอกเช่น 999999 ดึงมูลค่าเวอร์
        const effectiveQty = qty > 10000 ? 100 : qty;
        totalEstimatedValue += cost * effectiveQty;
      }
    }

    return {
      totalItems,
      lowStockCount,
      outOfStockCount,
      categoriesCount: uniqueCategories.size,
      totalEstimatedValue,
    };
  } catch (error) {
    console.error('Failed to get inventory stats:', error);
    return { totalItems: 0, lowStockCount: 0, outOfStockCount: 0, categoriesCount: 0, totalEstimatedValue: 0 };
  }
}

type WriteOperation = 'insert' | 'update' | 'delete';

type WriteResult = { success: boolean; error?: string; code?: 'UNAUTHENTICATED' | 'RLS_DENIED' };

const WRITE_OPERATION_LABEL: Record<WriteOperation, string> = {
  insert: 'เพิ่ม',
  update: 'แก้ไข',
  delete: 'ลบ',
};

const UNAUTHENTICATED_RESULT: WriteResult = {
  success: false,
  code: 'UNAUTHENTICATED',
  error: 'กรุณาเข้าสู่ระบบก่อนแก้ไขข้อมูล',
};

/**
 * แปลง error จาก Supabase ให้อ่านเข้าใจได้ และระบุตาราง/คำสั่งที่ต้องเพิ่ม RLS policy
 */
function toWriteError(error: any, table: string, operation: WriteOperation, fallback: string): WriteResult {
  const message: string = error?.message || '';
  if (error?.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return {
      success: false,
      code: 'RLS_DENIED',
      error: `ไม่มีสิทธิ์${WRITE_OPERATION_LABEL[operation]}ข้อมูลในตาราง "${table}" (ถูกปฏิเสธโดย Row Level Security) — ต้องเพิ่ม policy ${operation.toUpperCase()} สำหรับ role authenticated บนตาราง ${table} ใน Supabase`,
    };
  }
  return { success: false, error: message || fallback };
}

/**
 * UPDATE/DELETE ที่ RLS ไม่อนุญาตจะไม่ error แต่ไม่มีแถวใดถูกเปลี่ยน จึงต้องตรวจจำนวนแถวด้วย
 */
function noRowsAffectedError(table: string, operation: WriteOperation): WriteResult {
  return {
    success: false,
    code: 'RLS_DENIED',
    error: `ไม่มีรายการใดถูก${WRITE_OPERATION_LABEL[operation]}ในตาราง "${table}" — รายการอาจถูกลบไปแล้ว หรือ Row Level Security ไม่อนุญาต (ต้องมี policy SELECT และ ${operation.toUpperCase()} สำหรับ role authenticated บนตาราง ${table})`,
  };
}

/**
 * สร้างรายการใหม่ลงใน Supabase
 */
export async function createIngredient(
  data: IngredientInput
): Promise<WriteResult & { data?: Ingredient }> {
  const targetTable = data.sourceTable || 'supplies';
  try {
    if (!data.name || data.name.trim() === '') {
      return { success: false, error: 'กรุณากรอกชื่อวัตถุดิบ/สินค้า' };
    }

    const auth = await getAuthenticatedClient();
    if (!auth) return UNAUTHENTICATED_RESULT;

    if (targetTable === 'supplies') {
      const payload = {
        item_name: data.name.trim(),
        category: data.category?.trim() || 'Supply',
        unit: data.unit || 'ชิ้น',
        purchase_price: Number(data.costPerUnit) || 0,
        cost_per_unit: Number(data.costPerUnit) || 0,
        stock_quantity: Number(data.currentStock) || 0,
        package_quantity: Number(data.packageQuantity) || 1,
      };

      const { error } = await auth.client.from('supplies').insert([payload]);
      if (error) return toWriteError(error, 'supplies', 'insert', 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Supabase');
      revalidatePath('/');
      return { success: true };
    } else {
      const payload = {
        item_name: data.name.trim(),
        category: data.category?.trim() || 'Coffee',
        unit: data.unit || 'Cup',
        price: Number(data.price) || 0,
        avg_cost: Number(data.costPerUnit) || 0,
        stock_quantity: Number(data.currentStock) || 0,
        barcode: data.barcode?.trim() || '-',
        sale_type: 'ราคาต่อหน่วย',
      };

      const { error } = await auth.client.from('stock').insert([payload]);
      if (error) return toWriteError(error, 'stock', 'insert', 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Supabase');
      revalidatePath('/');
      return { success: true };
    }
  } catch (error: any) {
    console.error('Failed to create ingredient:', error);
    return toWriteError(error, targetTable, 'insert', 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Supabase');
  }
}

/**
 * อัปเดตข้อมูลใน Supabase
 */
export async function updateIngredient(
  id: string,
  data: Partial<IngredientInput>,
  sourceTable: 'supplies' | 'stock' = 'supplies'
): Promise<WriteResult> {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) return UNAUTHENTICATED_RESULT;

    const numId = isNaN(Number(id)) ? id : Number(id);
    const updatePayload: any = {};

    if (sourceTable === 'supplies') {
      if (data.name !== undefined) updatePayload.item_name = data.name.trim();
      if (data.category !== undefined) updatePayload.category = data.category.trim();
      if (data.unit !== undefined) updatePayload.unit = data.unit.trim();
      if (data.costPerUnit !== undefined) {
        updatePayload.cost_per_unit = Number(data.costPerUnit);
        updatePayload.purchase_price = Number(data.costPerUnit);
      }
      if (data.currentStock !== undefined) updatePayload.stock_quantity = Number(data.currentStock);
      if (data.packageQuantity !== undefined) updatePayload.package_quantity = Number(data.packageQuantity);
    } else {
      if (data.name !== undefined) updatePayload.item_name = data.name.trim();
      if (data.category !== undefined) updatePayload.category = data.category.trim();
      if (data.unit !== undefined) updatePayload.unit = data.unit.trim();
      if (data.price !== undefined) updatePayload.price = Number(data.price);
      if (data.costPerUnit !== undefined) updatePayload.avg_cost = Number(data.costPerUnit);
      if (data.currentStock !== undefined) updatePayload.stock_quantity = Number(data.currentStock);
      if (data.barcode !== undefined) updatePayload.barcode = data.barcode.trim();
    }

    const { error, count } = await auth.client
      .from(sourceTable)
      .update(updatePayload, { count: 'exact' })
      .eq('id', numId);
    if (error) return toWriteError(error, sourceTable, 'update', 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
    if (count === 0) return noRowsAffectedError(sourceTable, 'update');

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to update ingredient in Supabase:', error);
    return toWriteError(error, sourceTable, 'update', 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
  }
}

/**
 * ลบรายการออกจาก Supabase
 */
export async function deleteIngredient(
  id: string,
  sourceTable: 'supplies' | 'stock' = 'supplies'
): Promise<WriteResult> {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) return UNAUTHENTICATED_RESULT;

    const numId = isNaN(Number(id)) ? id : Number(id);
    const { error, count } = await auth.client
      .from(sourceTable)
      .delete({ count: 'exact' })
      .eq('id', numId);
    if (error) return toWriteError(error, sourceTable, 'delete', 'เกิดข้อผิดพลาดในการลบข้อมูล');
    if (count === 0) return noRowsAffectedError(sourceTable, 'delete');

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete ingredient from Supabase:', error);
    return toWriteError(error, sourceTable, 'delete', 'เกิดข้อผิดพลาดในการลบข้อมูล');
  }
}

/**
 * ปรับยอดสต็อกอย่างรวดเร็ว (Quick Adjust Stock)
 */
export async function quickAdjustStock(
  id: string,
  amount: number,
  mode: 'set' | 'add' | 'subtract',
  sourceTable: 'supplies' | 'stock' = 'supplies'
): Promise<WriteResult & { newStock?: number }> {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) return UNAUTHENTICATED_RESULT;

    const numId = isNaN(Number(id)) ? id : Number(id);
    const { data: item, error: fetchErr } = await auth.client
      .from(sourceTable)
      .select('stock_quantity')
      .eq('id', numId)
      .single();

    if (fetchErr || !item) {
      return {
        success: false,
        error: `ไม่พบรายการในตาราง "${sourceTable}" (หรือ role authenticated ยังไม่มี policy SELECT บนตารางนี้)`,
      };
    }
    const currentStock = Number(item.stock_quantity) || 0;

    let newStock = currentStock;
    if (mode === 'set') newStock = Math.max(0, amount);
    else if (mode === 'add') newStock = currentStock + amount;
    else if (mode === 'subtract') newStock = Math.max(0, currentStock - amount);

    const { error: updateErr, count } = await auth.client
      .from(sourceTable)
      .update({ stock_quantity: newStock }, { count: 'exact' })
      .eq('id', numId);

    if (updateErr) return toWriteError(updateErr, sourceTable, 'update', 'เกิดข้อผิดพลาดในการปรับยอดสต็อก');
    if (count === 0) return noRowsAffectedError(sourceTable, 'update');

    revalidatePath('/');
    return { success: true, newStock };
  } catch (error: any) {
    console.error('Failed to adjust stock:', error);
    return toWriteError(error, sourceTable, 'update', 'เกิดข้อผิดพลาดในการปรับยอดสต็อก');
  }
}
