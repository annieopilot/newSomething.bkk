/**
 * รายการในคลัง (อ่านจาก view public.v_inventory → ตาราง public.items)
 * ชื่อ type ยังเป็น Ingredient เพื่อให้คอมโพเนนต์เดิมใช้ต่อได้
 */
export interface Ingredient {
  id: string;
  sku: string | null;
  name: string;
  unit: string; // ชื่อหน่วยภาษาไทย (units.name_th) เช่น กรัม, ใบ, ถุง
  unitCode: string; // รหัสหน่วย (units.code) เช่น g, each, bag
  tareWeight: number; // น้ำหนักภาชนะเปล่า (กรัม) สำหรับชั่งตัดภาชนะ
  currentStock: number;
  minStockLevel: number; // จุดสั่งซื้อ (items.reorder_point)
  suggestedOrderQty: number;
  category: string | null;
  costPerUnit: number;
  stockValue: number;
  barcode: string | null;
  supplier: string | null;
  notes: string | null;
  packageQuantity: number | null; // 1 หน่วยซื้อ = กี่หน่วยนับ (items.purchase_pack_size)
  status: 'ok' | 'low' | 'out';
  lastMovementAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** การเปลี่ยนยอดแบบมีประเภท: รับเข้า (purchase) หรือ จ่ายออก/ใช้ไป (usage) */
export interface StockMovementInput {
  type: 'purchase' | 'usage';
  quantity: number; // จำนวนบวกเสมอ ระบบใส่เครื่องหมายให้ตามประเภท
  note?: string;
}

export interface IngredientInput {
  name: string;
  unit: string; // ชื่อหน่วยภาษาไทย ต้องมีในตาราง units
  tareWeight: number;
  currentStock: number; // ตอนสร้าง = ยอดเริ่มต้น, ตอนแก้ = ยอดใหม่ (ระบบบันทึกส่วนต่างเป็น "นับสต็อก")
  minStockLevel: number;
  category?: string;
  costPerUnit?: number;
  barcode?: string;
  supplier?: string;
  packageQuantity?: number;
  notes?: string;
  stockMovement?: StockMovementInput; // ถ้ามี ใช้แทน currentStock
}

export interface InventoryStats {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  categoriesCount: number;
  totalEstimatedValue: number;
}

/** ตัวเลือกในฟอร์ม (โหลดจากฐานข้อมูล) */
export interface InventoryLookups {
  categories: string[];
  units: string[]; // ชื่อหน่วยภาษาไทย
  suppliers: string[];
}

export const EMPTY_LOOKUPS: InventoryLookups = { categories: [], units: [], suppliers: [] };
