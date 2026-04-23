"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PlusIcon,
  WalletIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from "lucide-react";
import type {
  Expense,
  ExpenseCategory,
  PaymentMethod,
  Supplier,
} from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Tab = "payables" | "suppliers" | "cashflow";

type SupplierWithBalance = Supplier & { outstanding_balance?: number };

type CashflowPoint = {
  date: string;
  income: number;
  expense: number;
  balance: number;
};

type Preset = "7d" | "30d" | "90d" | "ytd";

const PAYMENT_METHODS: PaymentMethod[] = [
  "efectivo",
  "tarjeta",
  "transferencia",
  "mercadopago",
  "credito_cliente",
  "otro",
];

const EMPTY_EXPENSE: Partial<Expense> = {
  name: "",
  amount: 0,
  category_id: null,
  supplier_id: null,
  due_date: null,
  paid_at: null,
  payment_method: null,
  status: "pending",
  notes: "",
  attachment_url: "",
  is_recurring: false,
  recurrence_rule: null,
};

const EMPTY_SUPPLIER: Partial<Supplier> = {
  name: "",
  doc_id: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

export default function FinanzasAdmin() {
  const [tab, setTab] = useState<Tab>("payables");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Payables filters
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Sheet state
  const [expenseSheet, setExpenseSheet] = useState<
    "create" | "edit" | "pay" | null
  >(null);
  const [expenseForm, setExpenseForm] = useState<Partial<Expense>>(EMPTY_EXPENSE);
  const [supplierSheet, setSupplierSheet] = useState<"create" | "edit" | null>(
    null
  );
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pay form
  const [payMethod, setPayMethod] = useState<PaymentMethod>("efectivo");
  const [payDate, setPayDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Cashflow
  const [preset, setPreset] = useState<Preset>("30d");
  const [cashflow, setCashflow] = useState<CashflowPoint[]>([]);
  const [cashflowTotals, setCashflowTotals] = useState({
    income: 0,
    expense: 0,
    balance: 0,
  });

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/admin/expense-categories");
    const body = await res.json();
    if (res.ok) setCategories(body.categories ?? []);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const res = await fetch("/api/admin/suppliers");
    const body = await res.json();
    if (res.ok) setSuppliers(body.suppliers ?? []);
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMonth) {
      const [y, m] = filterMonth.split("-").map(Number);
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const last = new Date(y, m, 0).getDate();
      const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
      params.set("from", from);
      params.set("to", to);
    }
    if (filterCategory) params.set("category_id", filterCategory);
    if (filterSupplier) params.set("supplier_id", filterSupplier);
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/admin/expenses?${params}`);
    const body = await res.json();
    if (res.ok) setExpenses(body.expenses ?? []);
    setLoading(false);
  }, [filterMonth, filterCategory, filterSupplier, filterStatus]);

  const loadCashflow = useCallback(async () => {
    const today = new Date();
    let from: Date;
    if (preset === "7d") {
      from = new Date(today);
      from.setDate(today.getDate() - 6);
    } else if (preset === "30d") {
      from = new Date(today);
      from.setDate(today.getDate() - 29);
    } else if (preset === "90d") {
      from = new Date(today);
      from.setDate(today.getDate() - 89);
    } else {
      from = new Date(today.getFullYear(), 0, 1);
    }
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = today.toISOString().slice(0, 10);
    const res = await fetch(
      `/api/admin/finances/cashflow?from=${fromStr}&to=${toStr}`
    );
    const body = await res.json();
    if (res.ok) {
      setCashflow(body.series ?? []);
      setCashflowTotals(body.totals ?? { income: 0, expense: 0, balance: 0 });
    }
  }, [preset]);

  useEffect(() => {
    loadCategories();
    loadSuppliers();
  }, [loadCategories, loadSuppliers]);

  useEffect(() => {
    if (tab === "payables") loadExpenses();
    if (tab === "suppliers") loadSuppliers();
    if (tab === "cashflow") loadCashflow();
  }, [tab, loadExpenses, loadSuppliers, loadCashflow]);

  // ----- KPIs for payables tab -----
  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const totalMes = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const pendiente = expenses
      .filter((e) => e.status === "pending" || e.status === "overdue")
      .reduce((s, e) => s + Number(e.amount), 0);
    const vencido = expenses
      .filter(
        (e) =>
          (e.status === "pending" || e.status === "overdue") &&
          e.due_date &&
          e.due_date < today
      )
      .reduce((s, e) => s + Number(e.amount), 0);
    const pagado = expenses
      .filter((e) => e.status === "paid")
      .reduce((s, e) => s + Number(e.amount), 0);
    return { totalMes, pendiente, vencido, pagado };
  }, [expenses]);

  // ----- Save expense -----
  async function saveExpense() {
    setSaving(true);
    setError(null);
    try {
      const isEdit = expenseSheet === "edit" && expenseForm.id;
      const url = isEdit
        ? `/api/admin/expenses/${expenseForm.id}`
        : "/api/admin/expenses";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...expenseForm,
          amount: Number(expenseForm.amount),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al guardar");
        return;
      }
      setExpenseSheet(null);
      loadExpenses();
    } finally {
      setSaving(false);
    }
  }

  async function payExpense() {
    if (!expenseForm.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/expenses/${expenseForm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paid_at: `${payDate}T12:00:00Z`,
          payment_method: payMethod,
          status: "paid",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al registrar pago");
        return;
      }
      setExpenseSheet(null);
      loadExpenses();
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
    loadExpenses();
  }

  async function saveSupplier() {
    setSaving(true);
    setError(null);
    try {
      const isEdit = supplierSheet === "edit" && supplierForm.id;
      const url = isEdit
        ? `/api/admin/suppliers/${supplierForm.id}`
        : "/api/admin/suppliers";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierForm),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al guardar");
        return;
      }
      setSupplierSheet(null);
      loadSuppliers();
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSupplier() {
    if (!supplierForm.id) return;
    if (!confirm("¿Desactivar este proveedor?")) return;
    await fetch(`/api/admin/suppliers/${supplierForm.id}`, { method: "DELETE" });
    setSupplierSheet(null);
    loadSuppliers();
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finanzas</h1>
        <p className="text-gray-500 mt-1">
          Cuentas por pagar, proveedores y flujo de caja
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(
          [
            ["payables", "Cuentas por pagar"],
            ["suppliers", "Proveedores"],
            ["cashflow", "Flujo de caja"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              tab === key
                ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "payables" && (
        <PayablesTab
          expenses={expenses}
          loading={loading}
          kpis={kpis}
          filterMonth={filterMonth}
          setFilterMonth={setFilterMonth}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          filterSupplier={filterSupplier}
          setFilterSupplier={setFilterSupplier}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          categories={categories}
          suppliers={suppliers}
          onNew={() => {
            setExpenseForm(EMPTY_EXPENSE);
            setError(null);
            setExpenseSheet("create");
          }}
          onEdit={(e) => {
            setExpenseForm(e);
            setError(null);
            setExpenseSheet("edit");
          }}
          onPay={(e) => {
            setExpenseForm(e);
            setPayMethod("efectivo");
            setPayDate(new Date().toISOString().slice(0, 10));
            setError(null);
            setExpenseSheet("pay");
          }}
          onDelete={deleteExpense}
        />
      )}

      {tab === "suppliers" && (
        <SuppliersTab
          suppliers={suppliers}
          onNew={() => {
            setSupplierForm(EMPTY_SUPPLIER);
            setError(null);
            setSupplierSheet("create");
          }}
          onEdit={(s) => {
            setSupplierForm(s);
            setError(null);
            setSupplierSheet("edit");
          }}
        />
      )}

      {tab === "cashflow" && (
        <CashflowTab
          preset={preset}
          setPreset={setPreset}
          series={cashflow}
          totals={cashflowTotals}
        />
      )}

      {/* Expense Sheet */}
      <Sheet
        open={expenseSheet !== null}
        onOpenChange={(open) => !open && setExpenseSheet(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {expenseSheet === "create"
                ? "Nueva salida"
                : expenseSheet === "edit"
                ? "Editar salida"
                : `Pagar: ${expenseForm.name}`}
            </SheetTitle>
          </SheetHeader>

          <div className="px-4 py-4 space-y-4">
            {error && (
              <div className="p-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                {error}
              </div>
            )}

            {expenseSheet === "pay" ? (
              <>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Monto a pagar
                  </p>
                  <p className="text-2xl font-bold mt-1 text-gray-900">
                    {formatMoney(Number(expenseForm.amount ?? 0))}
                  </p>
                </div>
                <Field label="Fecha de pago">
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                </Field>
                <Field label="Método de pago">
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {paymentLabel(m)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  onClick={payExpense}
                  disabled={saving}
                  className="w-full bg-green-600 hover:bg-green-700 text-white border-0"
                >
                  {saving ? "Registrando..." : "Confirmar pago"}
                </Button>
              </>
            ) : (
              <>
                <Field label="Nombre *">
                  <Input
                    value={expenseForm.name ?? ""}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, name: e.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Monto *">
                    <Input
                      type="number"
                      step="0.01"
                      value={expenseForm.amount ?? ""}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          amount: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Fecha vencimiento">
                    <Input
                      type="date"
                      value={expenseForm.due_date ?? ""}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          due_date: e.target.value || null,
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Categoría">
                  <select
                    value={expenseForm.category_id ?? ""}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        category_id: e.target.value || null,
                      })
                    }
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Proveedor">
                  <select
                    value={expenseForm.supplier_id ?? ""}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        supplier_id: e.target.value || null,
                      })
                    }
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">—</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="rounded-lg border p-3 space-y-3 bg-blue-50/30">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(expenseForm.paid_at)}
                      onChange={(e) => {
                        const nowIso = new Date().toISOString();
                        setExpenseForm({
                          ...expenseForm,
                          paid_at: e.target.checked ? nowIso : null,
                          status: e.target.checked ? "paid" : "pending",
                        });
                      }}
                    />
                    Ya está pagado
                  </label>
                  {expenseForm.paid_at && (
                    <Field label="Método de pago">
                      <select
                        value={expenseForm.payment_method ?? ""}
                        onChange={(e) =>
                          setExpenseForm({
                            ...expenseForm,
                            payment_method: e.target.value,
                          })
                        }
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                      >
                        <option value="">—</option>
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {paymentLabel(m)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
                <div className="rounded-lg border p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(expenseForm.is_recurring)}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          is_recurring: e.target.checked,
                        })
                      }
                    />
                    Es recurrente
                  </label>
                  {expenseForm.is_recurring && (
                    <Field label="Frecuencia">
                      <select
                        value={expenseForm.recurrence_rule ?? ""}
                        onChange={(e) =>
                          setExpenseForm({
                            ...expenseForm,
                            recurrence_rule: e.target.value || null,
                          })
                        }
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                      >
                        <option value="">—</option>
                        <option value="weekly">Semanal</option>
                        <option value="monthly">Mensual</option>
                        <option value="yearly">Anual</option>
                      </select>
                    </Field>
                  )}
                </div>
                <Field label="Comprobante (URL)">
                  <Input
                    value={expenseForm.attachment_url ?? ""}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        attachment_url: e.target.value,
                      })
                    }
                    placeholder="https://..."
                  />
                </Field>
                <Field label="Notas">
                  <textarea
                    value={expenseForm.notes ?? ""}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, notes: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  />
                </Field>

                <Button
                  onClick={saveExpense}
                  disabled={
                    saving ||
                    !expenseForm.name?.trim() ||
                    !Number(expenseForm.amount)
                  }
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Supplier Sheet */}
      <Sheet
        open={supplierSheet !== null}
        onOpenChange={(open) => !open && setSupplierSheet(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {supplierSheet === "create"
                ? "Nuevo proveedor"
                : `Editar: ${supplierForm.name}`}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 py-4 space-y-4">
            {error && (
              <div className="p-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                {error}
              </div>
            )}
            <Field label="Nombre *">
              <Input
                value={supplierForm.name ?? ""}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, name: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="DNI/CUIT">
                <Input
                  value={supplierForm.doc_id ?? ""}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, doc_id: e.target.value })
                  }
                />
              </Field>
              <Field label="Contacto">
                <Input
                  value={supplierForm.contact_name ?? ""}
                  onChange={(e) =>
                    setSupplierForm({
                      ...supplierForm,
                      contact_name: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Teléfono">
                <Input
                  value={supplierForm.phone ?? ""}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, phone: e.target.value })
                  }
                />
              </Field>
              <Field label="Email">
                <Input
                  value={supplierForm.email ?? ""}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, email: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Dirección">
              <Input
                value={supplierForm.address ?? ""}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, address: e.target.value })
                }
              />
            </Field>
            <Field label="Notas">
              <textarea
                value={supplierForm.notes ?? ""}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, notes: e.target.value })
                }
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
              />
            </Field>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveSupplier}
                disabled={saving || !supplierForm.name?.trim()}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-0"
              >
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              {supplierSheet === "edit" && (
                <Button
                  variant="destructive"
                  disabled={saving}
                  onClick={deactivateSupplier}
                >
                  Desactivar
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============================================================================
// Payables tab
// ============================================================================
function PayablesTab({
  expenses,
  loading,
  kpis,
  filterMonth,
  setFilterMonth,
  filterCategory,
  setFilterCategory,
  filterSupplier,
  setFilterSupplier,
  filterStatus,
  setFilterStatus,
  categories,
  suppliers,
  onNew,
  onEdit,
  onPay,
  onDelete,
}: {
  expenses: Expense[];
  loading: boolean;
  kpis: { totalMes: number; pendiente: number; vencido: number; pagado: number };
  filterMonth: string;
  setFilterMonth: (v: string) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  filterSupplier: string;
  setFilterSupplier: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  categories: ExpenseCategory[];
  suppliers: Supplier[];
  onNew: () => void;
  onEdit: (e: Expense) => void;
  onPay: (e: Expense) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Total del mes"
          value={formatMoney(kpis.totalMes)}
          icon={<WalletIcon size={16} />}
        />
        <KpiCard
          label="Pendiente"
          value={formatMoney(kpis.pendiente)}
          icon={<AlertTriangleIcon size={16} />}
          tone="warning"
        />
        <KpiCard
          label="Vencido"
          value={formatMoney(kpis.vencido)}
          icon={<TrendingDownIcon size={16} />}
          tone="negative"
        />
        <KpiCard
          label="Pagado"
          value={formatMoney(kpis.pagado)}
          icon={<CheckCircleIcon size={16} />}
          tone="positive"
        />
      </div>

      <div className="flex items-end gap-2 flex-wrap mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mes</label>
          <Input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Categoría</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Proveedor</label>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Estado</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="paid">Pagado</option>
            <option value="overdue">Vencido</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div className="flex-1" />
        <Button
          onClick={onNew}
          className="bg-orange-500 hover:bg-orange-600 text-white border-0"
        >
          <PlusIcon size={14} /> Nueva salida
        </Button>
      </div>

      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Vencimiento
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Categoría
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Proveedor
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Monto
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">
                  Estado
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : expenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-gray-400"
                  >
                    No hay salidas en este período
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {e.due_date ? formatDate(e.due_date, false) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {e.name}
                      {e.is_recurring && (
                        <span className="ml-1 text-xs text-blue-600">↻</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.category ? <CategoryBadge category={e.category} /> : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {e.supplier?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatMoney(Number(e.amount))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        {e.status !== "paid" && e.status !== "cancelled" && (
                          <Button
                            size="xs"
                            className="bg-green-600 hover:bg-green-700 text-white border-0"
                            onClick={() => onPay(e)}
                          >
                            Pagar
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => onEdit(e)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => onDelete(e.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Suppliers tab
// ============================================================================
function SuppliersTab({
  suppliers,
  onNew,
  onEdit,
}: {
  suppliers: SupplierWithBalance[];
  onNew: () => void;
  onEdit: (s: Supplier) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-500">
          {suppliers.length} proveedor{suppliers.length === 1 ? "" : "es"}
        </div>
        <Button
          onClick={onNew}
          className="bg-orange-500 hover:bg-orange-600 text-white border-0"
        >
          <PlusIcon size={14} /> Nuevo proveedor
        </Button>
      </div>

      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Contacto
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Teléfono
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Email
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Saldo pendiente
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    Sin proveedores
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => onEdit(s)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {s.contact_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{s.email ?? "—"}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        (s.outstanding_balance ?? 0) > 0
                          ? "text-red-600"
                          : "text-gray-400"
                      }`}
                    >
                      {formatMoney(s.outstanding_balance ?? 0)}
                    </td>
                    <td
                      className="px-4 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onEdit(s)}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Cashflow tab
// ============================================================================
function CashflowTab({
  preset,
  setPreset,
  series,
  totals,
}: {
  preset: Preset;
  setPreset: (p: Preset) => void;
  series: CashflowPoint[];
  totals: { income: number; expense: number; balance: number };
}) {
  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(
          [
            ["7d", "7 días"],
            ["30d", "30 días"],
            ["90d", "90 días"],
            ["ytd", "Año actual"],
          ] as [Preset, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              preset === key
                ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <KpiCard
          label="Ingresos"
          value={formatMoney(totals.income)}
          icon={<TrendingUpIcon size={16} />}
          tone="positive"
        />
        <KpiCard
          label="Egresos"
          value={formatMoney(totals.expense)}
          icon={<TrendingDownIcon size={16} />}
          tone="negative"
        />
        <KpiCard
          label="Balance"
          value={formatMoney(totals.balance)}
          icon={<WalletIcon size={16} />}
          tone={totals.balance >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="bg-white rounded-xl ring-1 ring-foreground/10 p-5 mb-5">
        <h3 className="font-semibold text-gray-900 mb-3">Movimientos diarios</h3>
        <CashflowChart series={series} />
      </div>

      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Fecha
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Ingresos
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Egresos
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {series.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    Sin movimientos en el período
                  </td>
                </tr>
              ) : (
                [...series].reverse().map((r) => (
                  <tr key={r.date} className="border-b border-gray-50">
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(r.date, false)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-700">
                      {r.income ? formatMoney(r.income) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {r.expense ? formatMoney(r.expense) : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        r.balance > 0
                          ? "text-green-700"
                          : r.balance < 0
                          ? "text-red-600"
                          : "text-gray-400"
                      }`}
                    >
                      {formatMoney(r.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CashflowChart({ series }: { series: CashflowPoint[] }) {
  if (series.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Sin datos para graficar
      </div>
    );
  }

  const W = 800;
  const H = 240;
  const PAD_L = 50;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;

  const maxVal = Math.max(
    1,
    ...series.map((r) => Math.max(r.income, r.expense, Math.abs(r.balance)))
  );
  const minVal = Math.min(0, ...series.map((r) => r.balance));

  const xStep = (W - PAD_L - PAD_R) / Math.max(1, series.length - 1);
  const scaleY = (v: number) => {
    const range = maxVal - minVal || 1;
    const frac = (v - minVal) / range;
    return H - PAD_B - frac * (H - PAD_T - PAD_B);
  };

  const path = (key: "income" | "expense" | "balance") =>
    series
      .map((r, i) => {
        const x = PAD_L + i * xStep;
        const y = scaleY(r[key]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const zeroY = scaleY(0);
  const incomeColor = "#10b981";
  const expenseColor = "#ef4444";
  const balanceColor = "#3b82f6";

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[600px] h-60"
        preserveAspectRatio="none"
      >
        {/* Y-axis reference */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={zeroY}
          y2={zeroY}
          stroke="#e5e7eb"
          strokeDasharray="3,3"
        />
        <text
          x={PAD_L - 6}
          y={PAD_T + 8}
          textAnchor="end"
          fontSize="10"
          fill="#9ca3af"
        >
          {formatMoney(maxVal, 0)}
        </text>
        <text
          x={PAD_L - 6}
          y={zeroY + 4}
          textAnchor="end"
          fontSize="10"
          fill="#9ca3af"
        >
          0
        </text>

        {/* Income area/line */}
        <path
          d={path("income")}
          fill="none"
          stroke={incomeColor}
          strokeWidth={2}
        />
        {/* Expense */}
        <path
          d={path("expense")}
          fill="none"
          stroke={expenseColor}
          strokeWidth={2}
        />
        {/* Balance */}
        <path
          d={path("balance")}
          fill="none"
          stroke={balanceColor}
          strokeWidth={2}
          strokeDasharray="4,3"
        />

        {/* Dots for each balance point */}
        {series.map((r, i) => {
          const x = PAD_L + i * xStep;
          return (
            <circle
              key={r.date}
              cx={x}
              cy={scaleY(r.balance)}
              r={2.5}
              fill={balanceColor}
            />
          );
        })}

        {/* X-axis labels: first, middle, last */}
        {[0, Math.floor(series.length / 2), series.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx)
          .map((i) => {
            const x = PAD_L + i * xStep;
            return (
              <text
                key={i}
                x={x}
                y={H - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#9ca3af"
              >
                {formatDate(series[i].date, false)}
              </text>
            );
          })}
      </svg>
      <div className="flex gap-4 text-xs mt-2">
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5"
            style={{ backgroundColor: incomeColor }}
          />
          Ingresos
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5"
            style={{ backgroundColor: expenseColor }}
          />
          Egresos
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5 border-t border-dashed"
            style={{ borderColor: balanceColor }}
          />
          Balance
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Shared pieces
// ============================================================================
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "positive" | "negative" | "warning";
}) {
  const color =
    tone === "negative"
      ? "text-red-600"
      : tone === "positive"
      ? "text-green-700"
      : tone === "warning"
      ? "text-yellow-700"
      : "text-gray-900";
  return (
    <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function CategoryBadge({ category }: { category: ExpenseCategory }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{
        backgroundColor: `${category.color}15`,
        borderColor: `${category.color}40`,
        color: category.color,
      }}
    >
      {category.name}
    </span>
  );
}

function StatusBadge({ status }: { status: Expense["status"] }) {
  const map: Record<
    Expense["status"],
    { label: string; className: string }
  > = {
    pending: {
      label: "Pendiente",
      className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    },
    paid: {
      label: "Pagado",
      className: "bg-green-100 text-green-800 border-green-200",
    },
    overdue: {
      label: "Vencido",
      className: "bg-red-100 text-red-800 border-red-200",
    },
    cancelled: {
      label: "Cancelado",
      className: "bg-gray-100 text-gray-700 border-gray-200",
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

function paymentLabel(m: PaymentMethod): string {
  const map: Record<PaymentMethod, string> = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
    mercadopago: "MercadoPago",
    credito_cliente: "Crédito cliente",
    otro: "Otro",
  };
  return map[m];
}
