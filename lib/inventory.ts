import { Ingredient, InventoryStats } from '@/types/ingredient';

/**
 * ตัวช่วยฝั่ง browser: กรองรายการและสรุปยอดจากข้อมูลที่โหลดมาแล้ว
 * (ข้อมูลมีไม่กี่สิบรายการ กรองในเครื่องเร็วกว่าเรียก server ใหม่ทุกครั้งที่พิมพ์ค้นหา)
 */

export type StockStatusFilter = 'all' | 'low' | 'out' | 'in_stock';

export function filterInventory(
  items: Ingredient[],
  { search = '', category = 'all', status = 'all' }: { search?: string; category?: string; status?: StockStatusFilter }
): Ingredient[] {
  const term = search.trim().toLowerCase();
  return items.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (status === 'out' && item.status !== 'out') return false;
    if (status === 'low' && item.status !== 'low') return false;
    if (status === 'in_stock' && item.status !== 'ok') return false;
    if (!term) return true;
    return (
      item.name.toLowerCase().includes(term) ||
      (item.sku ?? '').toLowerCase().includes(term) ||
      (item.barcode ?? '').toLowerCase().includes(term)
    );
  });
}

export function computeInventoryStats(items: Ingredient[]): InventoryStats {
  return {
    totalItems: items.length,
    lowStockCount: items.filter((item) => item.status === 'low').length,
    outOfStockCount: items.filter((item) => item.status === 'out').length,
    categoriesCount: new Set(items.map((item) => item.category).filter(Boolean)).size,
    totalEstimatedValue: items.reduce((sum, item) => sum + Math.max(0, item.stockValue), 0),
  };
}
