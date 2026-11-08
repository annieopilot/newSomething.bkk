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
  countLocations: CountLocation[]; // จุดนับ (ว่าง = นับช่องเดียวแบบเดิม)
  createdAt?: string;
  updatedAt?: string;
}

/**
 * จุดนับของสินค้าที่วางไว้หลายที่ (ตาราง public.item_count_locations)
 * ยอดสินค้า = ผลรวม lastCount ของทุกจุด
 */
export interface CountLocation {
  id: string;
  name: string;
  tareWeight: number; // น้ำหนักภาชนะของจุดนี้ (กรัม)
  lastCount: number | null; // ยอดสุทธิที่นับได้ล่าสุด, null = ยังไม่เคยนับ
  lastCountedAt: string | null;
  receivesPurchases: boolean; // จุดเก็บของรับเข้า (ไม่มีจุดไหนตั้ง = จุดสุดท้าย)
}

/** จุดนับในฟอร์มแก้ไขสินค้า (ไม่มี id = จุดใหม่) */
export interface CountLocationInput {
  id?: string;
  name: string;
  tareWeight: number;
  receivesPurchases?: boolean;
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
  countLocations?: CountLocationInput[]; // ถ้ามี = ตั้งจุดนับใหม่ทั้งชุด (จุดที่ไม่อยู่ในรายการถูกลบ)
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
