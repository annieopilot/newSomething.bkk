'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Header } from '@/components/dashboard/Header';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { IngredientTable } from '@/components/dashboard/IngredientTable';
import { IngredientModal } from '@/components/dashboard/IngredientModal';
import { DeleteConfirmDialog } from '@/components/dashboard/DeleteConfirmDialog';
import { TareScaleModal } from '@/components/dashboard/TareScaleModal';
import { SupabaseConfigModal } from '@/components/dashboard/SupabaseConfigModal';
import { useAuthSession } from '@/components/auth/useAuthSession';
import { Ingredient, IngredientInput, InventoryStats, InventoryTab } from '@/types/ingredient';
import { 
  getIngredients, 
  getInventoryStats, 
  createIngredient, 
  updateIngredient, 
  deleteIngredient, 
  quickAdjustStock,
  getDatabaseConnectionStatus
} from '@/app/actions/ingredients';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, ClipboardList } from 'lucide-react';

export default function StockDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status: authStatus, signOut } = useAuthSession();
  const isAuthenticated = authStatus === 'authenticated';
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<InventoryTab>('supplies');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [stats, setStats] = useState<InventoryStats>({
    totalItems: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    categoriesCount: 0,
    totalEstimatedValue: 0,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out' | 'in_stock'>('all');

  // Modals State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [ingredientToDelete, setIngredientToDelete] = useState<Ingredient | null>(null);

  const [isScaleModalOpen, setIsScaleModalOpen] = useState<boolean>(false);
  const [ingredientForScale, setIngredientForScale] = useState<Ingredient | null>(null);

  const [isSupabaseConfigOpen, setIsSupabaseConfigOpen] = useState<boolean>(false);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, type === 'error' ? 7000 : 3500);
  };

  // Auth: พาไปหน้าล็อกอินแล้วกลับมาหน้าเดิมหลังล็อกอินสำเร็จ
  const goToLogin = useCallback(() => {
    router.push(`/login?next=${encodeURIComponent(pathname || '/')}`);
  }, [router, pathname]);

  // ป้องกันการเปิดฟอร์ม/ปุ่มแก้ไขเมื่อยังไม่ล็อกอิน (ฝั่ง server และ RLS ตรวจสิทธิ์ซ้ำอีกชั้น)
  const requireAuth = (): boolean => {
    if (isAuthenticated) return true;
    if (authStatus === 'loading') {
      showToast('กำลังตรวจสอบสถานะการเข้าสู่ระบบ กรุณาลองอีกครั้ง', 'error');
      return false;
    }
    showToast('กรุณาเข้าสู่ระบบก่อนแก้ไขข้อมูล', 'error');
    goToLogin();
    return false;
  };

  const handleWriteError = (res: { error?: string; code?: string }, fallback: string) => {
    showToast(res.error || fallback, 'error');
    if (res.code === 'UNAUTHENTICATED') goToLogin();
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      // ปิดหน้าต่างแก้ไขทั้งหมดหลังออกจากระบบ
      setIsModalOpen(false);
      setSelectedIngredient(null);
      setIsDeleteDialogOpen(false);
      setIngredientToDelete(null);
      setIsScaleModalOpen(false);
      setIngredientForScale(null);
      showToast('ออกจากระบบเรียบร้อยแล้ว');
      router.refresh();
    } catch (error) {
      showToast('ไม่สามารถออกจากระบบได้ กรุณาลองใหม่', 'error');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Fetch Data Function
  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);

    try {
      const [ingredientsRes, statsRes, dbStatus] = await Promise.all([
        getIngredients({
          tab: activeTab,
          search: searchQuery,
          category: selectedCategory,
          status: statusFilter,
        }),
        getInventoryStats(activeTab),
        getDatabaseConnectionStatus(),
      ]);

      if (ingredientsRes.success) {
        setIngredients(ingredientsRes.data);
      }
      setStats(statsRes);
      setIsSupabaseConnected(dbStatus.isConfigured);
    } catch (error) {
      console.error('Error loading data:', error);
      showToast('ไม่สามารถเชื่อมต่อฐานข้อมูลได้', 'error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab, searchQuery, selectedCategory, statusFilter]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Extract unique categories for filter pills
  const availableCategories = Array.from(
    new Set(ingredients.map((item) => item.category).filter(Boolean))
  ) as string[];

  // Action: Add / Edit Save
  const handleSaveIngredient = async (formData: IngredientInput): Promise<boolean> => {
    try {
      if (selectedIngredient) {
        const res = await updateIngredient(selectedIngredient.id, formData, selectedIngredient.sourceTable);
        if (res.success) {
          showToast(`อัปเดต "${formData.name}" บน Supabase เรียบร้อยแล้ว`);
          loadData();
          return true;
        } else {
          handleWriteError(res, 'เกิดข้อผิดพลาดในการแก้ไข');
          return false;
        }
      } else {
        const res = await createIngredient({ ...formData, sourceTable: activeTab });
        if (res.success) {
          showToast(`เพิ่ม "${formData.name}" ลงในตาราง ${activeTab} สำเร็จ`);
          loadData();
          return true;
        } else {
          handleWriteError(res, 'เกิดข้อผิดพลาดในการบันทึก');
          return false;
        }
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาดของระบบ', 'error');
      return false;
    }
  };

  // Action: Confirm Delete
  const handleConfirmDelete = async () => {
    if (!ingredientToDelete) return;
    try {
      const res = await deleteIngredient(ingredientToDelete.id, ingredientToDelete.sourceTable);
      if (res.success) {
        showToast(`ลบ "${ingredientToDelete.name}" ออกจาก Supabase แล้ว`);
        setIsDeleteDialogOpen(false);
        setIngredientToDelete(null);
        loadData();
      } else {
        handleWriteError(res, 'ไม่สามารถลบรายการได้');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาดในการลบรายการ', 'error');
    }
  };

  // Action: Quick Adjust Stock
  const handleQuickAdjust = async (ingredient: Ingredient, amount: number, mode: 'add' | 'subtract') => {
    if (!requireAuth()) return;
    try {
      const res = await quickAdjustStock(ingredient.id, amount, mode, ingredient.sourceTable);
      if (res.success && res.newStock !== undefined) {
        showToast(`ปรับสต็อก "${ingredient.name}" เป็น ${res.newStock} ${ingredient.unit}`);
        loadData();
      } else {
        handleWriteError(res, 'ไม่สามารถปรับยอดสต็อกได้');
      }
    } catch (error) {
      showToast('ไม่สามารถปรับยอดสต็อกได้', 'error');
    }
  };

  // Action: Apply Stock from Scale Tare Calculation (Preserves core purpose)
  const handleApplyTareStock = async (id: string, netStock: number): Promise<boolean> => {
    try {
      const item = ingredients.find((i) => i.id === id);
      const res = await updateIngredient(id, { currentStock: netStock }, item?.sourceTable || activeTab);
      if (res.success) {
        showToast(`หักน้ำหนักภาชนะสำเร็จ! อัปเดตสต็อกสุทธิเป็น ${netStock} ${item?.unit || 'ชิ้น'}`);
        loadData();
        return true;
      } else {
        handleWriteError(res, 'ไม่สามารถอัปเดตสต็อกได้');
        return false;
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาดในการอัปเดตสต็อก', 'error');
      return false;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA]">
      
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div
            className={`flex items-center justify-center sm:justify-start space-x-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-[#2D2B2A] text-white border-slate-700'
                : 'bg-[#C62828] text-white border-red-700'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-[#2E7D32] shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-300 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSelectedCategory('all');
        }}
        onAddNew={() => {
          if (!requireAuth()) return;
          setSelectedIngredient(null);
          setIsModalOpen(true);
        }}
        onOpenScaleModal={() => {
          if (!requireAuth()) return;
          setIngredientForScale(ingredients[0] || null);
          setIsScaleModalOpen(true);
        }}
        onRefresh={() => loadData()}
        isRefreshing={isRefreshing}
        totalLowStock={stats.lowStockCount + stats.outOfStockCount}
        isSupabaseConnected={isSupabaseConnected}
        onOpenSupabaseConfig={() => setIsSupabaseConfigOpen(true)}
        authStatus={authStatus}
        userEmail={user?.email}
        onLogin={goToLogin}
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3.5 sm:py-6">
        
        {/* โหมดนับสต็อก (หน้าแยกสำหรับกรอกยอดทีละบรรทัด) */}
        <Link
          href="/count"
          className="mb-3.5 sm:mb-5 h-12 w-full sm:w-auto sm:inline-flex px-5 rounded-xl bg-[#8B5A2B] active:bg-[#74491f] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs touch-press transition-colors"
        >
          <ClipboardList className="w-4 h-4" />
          <span>นับสต็อก</span>
        </Link>

        {/* Summary Cards */}
        <SummaryCards
          stats={stats}
          currentFilter={statusFilter}
          onFilterChange={(newStatus) => setStatusFilter(newStatus)}
        />

        {/* Ingredient Table & Filter Grid */}
        <IngredientTable
          ingredients={ingredients}
          categories={availableCategories}
          selectedCategory={selectedCategory}
          onCategorySelect={(cat) => setSelectedCategory(cat)}
          searchQuery={searchQuery}
          onSearchChange={(q) => setSearchQuery(q)}
          statusFilter={statusFilter}
          onStatusFilterChange={(s) => setStatusFilter(s)}
          onEdit={(item) => {
            if (!requireAuth()) return;
            setSelectedIngredient(item);
            setIsModalOpen(true);
          }}
          onDelete={(item) => {
            if (!requireAuth()) return;
            setIngredientToDelete(item);
            setIsDeleteDialogOpen(true);
          }}
          onOpenScaleModal={(item) => {
            if (!requireAuth()) return;
            setIngredientForScale(item);
            setIsScaleModalOpen(true);
          }}
          onQuickAdjust={handleQuickAdjust}
          loading={loading}
        />

      </main>

      {/* CRUD Modal (Add / Edit) */}
      <IngredientModal
        isOpen={isModalOpen}
        activeTab={activeTab}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedIngredient(null);
        }}
        onSubmit={handleSaveIngredient}
        initialData={selectedIngredient}
        loading={isPending}
      />

      {/* Confirm Delete Dialog */}
      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        ingredient={ingredientToDelete}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setIngredientToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        loading={isPending}
      />

      {/* Tare Scale Deduction Modal */}
      <TareScaleModal
        isOpen={isScaleModalOpen}
        ingredients={ingredients}
        selectedIngredient={ingredientForScale}
        onClose={() => {
          setIsScaleModalOpen(false);
          setIngredientForScale(null);
        }}
        onApplyStock={handleApplyTareStock}
        loading={isPending}
      />

      {/* Supabase Connection Guide Modal */}
      <SupabaseConfigModal
        isOpen={isSupabaseConfigOpen}
        onClose={() => setIsSupabaseConfigOpen(false)}
        isConfigured={isSupabaseConnected}
      />

    </div>
  );
}
