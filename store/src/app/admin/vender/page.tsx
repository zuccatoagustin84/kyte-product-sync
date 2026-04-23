"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  XIcon,
  TrashIcon,
  UserIcon,
  UserPlusIcon,
  Trash2Icon,
  PercentIcon,
  DollarSignIcon,
  TruckIcon,
  BanknoteIcon,
  CreditCardIcon,
  LandmarkIcon,
  SmartphoneIcon,
  WalletIcon,
  CircleEllipsisIcon,
  FileTextIcon,
  PrinterIcon,
  MessageCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatMoney } from "@/lib/format";
import type {
  Product,
  Category,
  Customer,
  PaymentMethod,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CartLine = {
  product: Product;
  quantity: number;
  unit_price: number; // editable
};

type DiscountMode = "amount" | "percent";

type PaymentRow = {
  id: string;
  method: PaymentMethod;
  amount: string; // as string for input binding
  reference: string;
};

type CheckoutResult = {
  id: string;
  order_number: number | null;
  total: number;
  payment_status: string;
};

const PAYMENT_OPTIONS: {
  value: PaymentMethod;
  label: string;
  Icon: typeof BanknoteIcon;
}[] = [
  { value: "efectivo", label: "Efectivo", Icon: BanknoteIcon },
  { value: "tarjeta", label: "Tarjeta", Icon: CreditCardIcon },
  { value: "transferencia", label: "Transferencia", Icon: LandmarkIcon },
  { value: "mercadopago", label: "MercadoPago", Icon: SmartphoneIcon },
  { value: "credito_cliente", label: "Crédito cliente", Icon: WalletIcon },
  { value: "otro", label: "Otro", Icon: CircleEllipsisIcon },
];

function newPaymentRow(method: PaymentMethod = "efectivo"): PaymentRow {
  return {
    id: Math.random().toString(36).slice(2),
    method,
    amount: "",
    reference: "",
  };
}

export default function VenderPage() {
  // ---------- Catalog state ----------
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // ---------- Cart state ----------
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountValue, setDiscountValue] = useState<string>("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("amount");
  const [shipping, setShipping] = useState<string>("");
  const [notes, setNotes] = useState("");

  // ---------- Customer picker ----------
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // ---------- Payments ----------
  const [payments, setPayments] = useState<PaymentRow[]>([newPaymentRow()]);

  // ---------- Checkout ----------
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  // ---------- Load catalog ----------
  useEffect(() => {
    async function load() {
      setLoadingCatalog(true);
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase
          .from("products")
          .select("*, category:categories(*)")
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .limit(500),
        supabase
          .from("categories")
          .select("*")
          .order("sort_order", { ascending: true }),
      ]);
      setProducts((prods as Product[]) ?? []);
      setCategories((cats as Category[]) ?? []);
      setLoadingCatalog(false);
    }
    load();
  }, []);

  // ---------- Customer search ----------
  useEffect(() => {
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoadingCustomers(true);
      const res = await fetch(
        `/api/admin/customers?q=${encodeURIComponent(customerQuery)}`
      );
      if (res.ok) {
        const body = await res.json();
        setCustomerResults((body.customers ?? []).slice(0, 8));
      }
      setLoadingCustomers(false);
    }, 220);
    return () => clearTimeout(handle);
  }, [customerQuery]);

  // ---------- Filtered product list ----------
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryFilter]);

  // ---------- Cart operations ----------
  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        { product: p, quantity: 1, unit_price: Number(p.sale_price) },
      ];
    });
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((l) =>
        l.product.id === productId ? { ...l, quantity: qty } : l
      )
    );
  }

  function updatePrice(productId: string, price: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.product.id === productId ? { ...l, unit_price: price } : l
      )
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function clearCart() {
    if (cart.length === 0) return;
    if (!confirm("¿Vaciar el carrito?")) return;
    setCart([]);
    setPayments([newPaymentRow()]);
    setDiscountValue("");
    setShipping("");
    setNotes("");
    setCustomer(null);
  }

  // ---------- Totals ----------
  const subtotal = useMemo(
    () =>
      cart.reduce(
        (s, l) => s + Number(l.quantity) * Number(l.unit_price),
        0
      ),
    [cart]
  );

  const discountAmount = useMemo(() => {
    const v = Number(discountValue) || 0;
    if (discountMode === "percent") {
      return Math.max(0, Math.min(subtotal, (subtotal * v) / 100));
    }
    return Math.max(0, Math.min(subtotal, v));
  }, [discountValue, discountMode, subtotal]);

  const shippingAmount = Math.max(0, Number(shipping) || 0);
  const total = Math.max(0, subtotal - discountAmount + shippingAmount);

  const paidAmount = useMemo(
    () => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments]
  );
  const pending = Math.max(0, total - paidAmount);

  // ---------- Payment handlers ----------
  function addPaymentRow() {
    setPayments((prev) => [...prev, newPaymentRow()]);
  }
  function removePaymentRow(id: string) {
    setPayments((prev) =>
      prev.length === 1 ? prev : prev.filter((p) => p.id !== id)
    );
  }
  function updatePayment(id: string, patch: Partial<PaymentRow>) {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  }
  function fillFirstPaymentWithRemaining() {
    setPayments((prev) => {
      if (prev.length === 0) return prev;
      const others = prev.slice(1).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const remaining = Math.max(0, total - others);
      const first = { ...prev[0], amount: remaining.toFixed(2) };
      return [first, ...prev.slice(1)];
    });
  }

  // ---------- Checkout ----------
  const canCheckout =
    cart.length > 0 &&
    paidAmount > 0 &&
    !submitting &&
    (!payments.some((p) => p.method === "credito_cliente") ||
      (customer && customer.allow_pay_later));

  async function handleCheckout() {
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError("Carrito vacío");
      return;
    }
    const filteredPayments = payments.filter(
      (p) => Number(p.amount) > 0
    );
    if (filteredPayments.length === 0) {
      setCheckoutError("Registre al menos un pago");
      return;
    }
    if (
      filteredPayments.some((p) => p.method === "credito_cliente") &&
      (!customer || !customer.allow_pay_later)
    ) {
      setCheckoutError(
        "Para pagar con crédito se necesita un cliente con pago diferido habilitado"
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? "Cliente genérico",
          items: cart.map((l) => ({
            product_id: l.product.id,
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
          discount_total: Number(discountAmount.toFixed(2)),
          shipping_total: Number(shippingAmount.toFixed(2)),
          payments: filteredPayments.map((p) => ({
            method: p.method,
            amount: Number(p.amount),
            reference: p.reference || null,
          })),
          notes: notes || null,
          channel: "pos",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCheckoutError(body.error ?? "Error al cobrar");
        return;
      }
      setResult(body.order);
    } finally {
      setSubmitting(false);
    }
  }

  function resetAfterSale() {
    setCart([]);
    setPayments([newPaymentRow()]);
    setDiscountValue("");
    setShipping("");
    setNotes("");
    setCustomer(null);
    setResult(null);
    setCheckoutError(null);
  }

  async function openWhatsapp(orderId: string) {
    setWhatsappLoading(true);
    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/receipt/whatsapp`
      );
      const body = await res.json();
      if (res.ok && body.url) {
        window.open(body.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setWhatsappLoading(false);
    }
  }

  // ---------- UI ----------
  return (
    <div className="flex h-full max-h-screen bg-gray-50">
      {/* LEFT — product grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header + search */}
        <div className="p-4 bg-white border-b border-gray-200 space-y-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Vender</h1>
            <span className="text-sm text-gray-400">
              {filteredProducts.length} productos
            </span>
          </div>
          <div className="relative">
            <SearchIcon
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o código..."
              className="pl-9 h-10"
            />
          </div>
          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <CategoryChip
              label="Todas"
              active={categoryFilter === null}
              onClick={() => setCategoryFilter(null)}
            />
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                label={c.name}
                active={categoryFilter === c.id}
                onClick={() => setCategoryFilter(c.id)}
              />
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingCatalog ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 15 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 bg-gray-100 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              Sin productos
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onAdd={() => addToCart(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — cart */}
      <aside className="w-[420px] shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        {/* Customer picker */}
        <div className="p-3 border-b border-gray-200 relative">
          {customer ? (
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <UserIcon size={16} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {customer.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    Saldo:{" "}
                    <span
                      className={
                        Number(customer.balance) < 0
                          ? "text-red-600 font-medium"
                          : Number(customer.balance) > 0
                          ? "text-green-700 font-medium"
                          : ""
                      }
                    >
                      {formatMoney(Number(customer.balance ?? 0))}
                    </span>
                    {customer.allow_pay_later && (
                      <span className="ml-2 text-[10px] uppercase bg-blue-50 text-blue-700 border border-blue-200 rounded px-1 py-0.5">
                        Crédito
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setCustomer(null);
                  setCustomerQuery("");
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Quitar cliente"
              >
                <XIcon size={14} />
              </button>
            </div>
          ) : (
            <>
              <label className="text-xs text-gray-500 mb-1 block">
                Cliente
              </label>
              <div className="relative">
                <UserPlusIcon
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <Input
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() =>
                    setTimeout(() => setShowCustomerDropdown(false), 180)
                  }
                  placeholder="Buscar cliente o 'Cliente genérico'"
                  className="pl-8 h-8"
                />
              </div>
              {showCustomerDropdown && customerQuery.trim() && (
                <div className="absolute left-3 right-3 top-[58px] bg-white rounded-lg shadow-lg ring-1 ring-black/5 max-h-64 overflow-y-auto z-20">
                  {loadingCustomers && (
                    <div className="p-2 text-xs text-gray-400 text-center">
                      Buscando...
                    </div>
                  )}
                  {!loadingCustomers && customerResults.length === 0 && (
                    <div className="p-3 text-xs text-gray-400 text-center">
                      Sin resultados
                    </div>
                  )}
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCustomer(c);
                        setCustomerQuery("");
                        setShowCustomerDropdown(false);
                      }}
                      className="block w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {c.name}
                        </span>
                        {c.allow_pay_later && (
                          <span className="text-[10px] uppercase bg-blue-50 text-blue-700 border border-blue-200 rounded px-1 py-0.5 shrink-0">
                            Crédito
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 flex justify-between">
                        <span>{c.phone ?? ""}</span>
                        <span
                          className={
                            Number(c.balance) < 0
                              ? "text-red-600"
                              : Number(c.balance) > 0
                              ? "text-green-700"
                              : ""
                          }
                        >
                          {formatMoney(Number(c.balance ?? 0))}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              Sin productos en el carrito
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {cart.map((line) => (
                <CartLineRow
                  key={line.product.id}
                  line={line}
                  onQty={(q) => updateQty(line.product.id, q)}
                  onPrice={(p) => updatePrice(line.product.id, p)}
                  onRemove={() => removeFromCart(line.product.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Summary / actions */}
        <div className="border-t border-gray-200 bg-white p-3 space-y-3">
          {/* Discount + shipping */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-gray-500 mb-1 block">
                Descuento
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    setDiscountMode(
                      discountMode === "amount" ? "percent" : "amount"
                    )
                  }
                  className="h-8 px-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                  title={
                    discountMode === "amount" ? "Cambiar a %" : "Cambiar a $"
                  }
                >
                  {discountMode === "amount" ? (
                    <DollarSignIcon size={14} />
                  ) : (
                    <PercentIcon size={14} />
                  )}
                </button>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="0"
                  className="h-8"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 mb-1 block">
                Envío
              </label>
              <div className="flex gap-1">
                <div className="h-8 px-2 rounded-lg border border-gray-200 text-gray-500 inline-flex items-center">
                  <TruckIcon size={14} />
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  placeholder="0"
                  className="h-8"
                />
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Descuento</span>
                <span>− {formatMoney(discountAmount)}</span>
              </div>
            )}
            {shippingAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Envío</span>
                <span>{formatMoney(shippingAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="text-2xl font-bold text-gray-900">
                {formatMoney(total)}
              </span>
            </div>
          </div>

          {/* Payments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-gray-500 font-medium">
                Pagos
              </span>
              <button
                onClick={fillFirstPaymentWithRemaining}
                className="text-[11px] text-orange-600 hover:text-orange-700 font-medium"
                disabled={total <= 0}
              >
                Autocompletar
              </button>
            </div>
            {payments.map((p, idx) => (
              <PaymentRowEditor
                key={p.id}
                row={p}
                canRemove={payments.length > 1}
                onChange={(patch) => updatePayment(p.id, patch)}
                onRemove={() => removePaymentRow(p.id)}
                showHint={idx === 0}
              />
            ))}
            <button
              onClick={addPaymentRow}
              className="w-full h-7 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg hover:border-gray-400"
            >
              + Agregar otro pago
            </button>
            {pending > 0.01 && (
              <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
                Falta cobrar: {formatMoney(pending)}
                {payments.some((p) => p.method === "credito_cliente") &&
                  " (quedará en cuenta corriente)"}
              </div>
            )}
            {paidAmount > total + 0.01 && (
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                Vuelto: {formatMoney(paidAmount - total)}
              </div>
            )}
          </div>

          {/* Notes */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas (opcional)"
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
          />

          {checkoutError && (
            <div className="p-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {checkoutError}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={clearCart}
              disabled={cart.length === 0 || submitting}
              className="shrink-0"
            >
              <Trash2Icon size={14} />
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={!canCheckout}
              className="flex-1 h-10 bg-orange-500 hover:bg-orange-600 text-white border-0 text-base font-semibold"
            >
              {submitting ? (
                <>
                  <Loader2Icon size={16} className="animate-spin" /> Cobrando...
                </>
              ) : (
                <>Cobrar {formatMoney(total)}</>
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Post-sale success modal */}
      {result && (
        <SuccessModal
          result={result}
          onClose={resetAfterSale}
          onWhatsapp={() => openWhatsapp(result.id)}
          whatsappLoading={whatsappLoading}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-orange-500 text-white border-orange-500"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

function ProductCard({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: () => void;
}) {
  return (
    <button
      onClick={onAdd}
      className="group relative bg-white rounded-xl ring-1 ring-foreground/10 hover:ring-orange-300 hover:shadow-md transition-all text-left overflow-hidden"
    >
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-gray-300 text-xs">Sin imagen</div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium text-gray-900 line-clamp-2 min-h-[32px]">
          {product.name}
        </p>
        {product.code && (
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            {product.code}
          </p>
        )}
        <p className="text-sm font-bold text-orange-600 mt-1">
          {formatMoney(Number(product.sale_price))}
        </p>
        {product.stock !== null && product.stock !== undefined && (
          <p className="text-[10px] text-gray-400">Stock: {product.stock}</p>
        )}
      </div>
    </button>
  );
}

function CartLineRow({
  line,
  onQty,
  onPrice,
  onRemove,
}: {
  line: CartLine;
  onQty: (q: number) => void;
  onPrice: (p: number) => void;
  onRemove: () => void;
}) {
  // Derive the string from the prop; keep local state only while editing
  const [editing, setEditing] = useState(false);
  const [priceStr, setPriceStr] = useState(line.unit_price.toString());
  const displayValue = editing ? priceStr : line.unit_price.toString();

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {line.product.name}
          </p>
          {line.product.code && (
            <p className="text-[10px] text-gray-400 font-mono">
              {line.product.code}
            </p>
          )}
        </div>
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-red-600 shrink-0"
          aria-label="Quitar"
        >
          <TrashIcon size={14} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onQty(line.quantity - 1)}
            className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 flex items-center justify-center"
          >
            <MinusIcon size={12} />
          </button>
          <input
            type="number"
            value={line.quantity}
            onChange={(e) => {
              const n = parseInt(e.target.value) || 0;
              onQty(n);
            }}
            className="w-10 h-7 rounded-lg border border-gray-200 text-center text-sm"
          />
          <button
            onClick={() => onQty(line.quantity + 1)}
            className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 flex items-center justify-center"
          >
            <PlusIcon size={12} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">×</span>
          <input
            type="number"
            step="0.01"
            value={displayValue}
            onFocus={() => {
              setPriceStr(line.unit_price.toString());
              setEditing(true);
            }}
            onChange={(e) => setPriceStr(e.target.value)}
            onBlur={() => {
              const n = Number(priceStr);
              if (Number.isFinite(n) && n >= 0) onPrice(n);
              setEditing(false);
            }}
            className="w-20 h-7 rounded-lg border border-gray-200 text-right text-sm px-2"
          />
        </div>
      </div>
      <div className="text-right text-sm font-semibold text-gray-900 mt-1">
        {formatMoney(line.unit_price * line.quantity)}
      </div>
    </div>
  );
}

function PaymentRowEditor({
  row,
  canRemove,
  onChange,
  onRemove,
  showHint,
}: {
  row: PaymentRow;
  canRemove: boolean;
  onChange: (patch: Partial<PaymentRow>) => void;
  onRemove: () => void;
  showHint: boolean;
}) {
  const opt = PAYMENT_OPTIONS.find((o) => o.value === row.method);
  const Icon = opt?.Icon ?? BanknoteIcon;
  return (
    <div className="rounded-lg border border-gray-200 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="inline-flex items-center gap-1 px-2 h-7 rounded-lg bg-gray-50 border border-gray-200 text-gray-600">
          <Icon size={12} />
        </div>
        <select
          value={row.method}
          onChange={(e) =>
            onChange({ method: e.target.value as PaymentMethod })
          }
          className="h-7 flex-1 rounded-lg border border-gray-200 bg-transparent px-2 text-xs"
        >
          {PAYMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={row.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          placeholder="0.00"
          className="h-7 w-24 text-right text-sm"
        />
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-red-600 shrink-0"
            aria-label="Quitar pago"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>
      {(row.method === "transferencia" ||
        row.method === "mercadopago" ||
        row.method === "tarjeta") && (
        <Input
          value={row.reference}
          onChange={(e) => onChange({ reference: e.target.value })}
          placeholder="Referencia / N° transacción"
          className="h-7 text-xs"
        />
      )}
      {showHint && (
        <p className="text-[10px] text-gray-400">
          Podés sumar varios métodos de pago.
        </p>
      )}
    </div>
  );
}

function SuccessModal({
  result,
  onClose,
  onWhatsapp,
  whatsappLoading,
}: {
  result: CheckoutResult;
  onClose: () => void;
  onWhatsapp: () => void;
  whatsappLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 text-center border-b border-gray-100">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2Icon size={36} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">¡Venta registrada!</h2>
          <p className="text-sm text-gray-500 mt-1">
            Pedido N° {result.order_number ?? "—"}
          </p>
          <p className="text-3xl font-bold text-orange-600 mt-3">
            {formatMoney(Number(result.total))}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {result.payment_status === "paid"
              ? "Pagado"
              : result.payment_status === "partial"
              ? "Pago parcial"
              : "Pendiente"}
          </p>
        </div>

        <div className="p-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Comprobante
          </p>
          <a
            href={`/api/admin/orders/${result.id}/receipt/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
          >
            <FileTextIcon size={20} className="text-blue-600" />
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-gray-900">PDF A4</p>
              <p className="text-xs text-gray-500">Abrir para imprimir o guardar</p>
            </div>
          </a>
          <a
            href={`/admin/vender/ticket/${result.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
          >
            <PrinterIcon size={20} className="text-gray-700" />
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-gray-900">Ticket térmico 80mm</p>
              <p className="text-xs text-gray-500">Imprime automáticamente</p>
            </div>
          </a>
          <button
            onClick={onWhatsapp}
            disabled={whatsappLoading}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <MessageCircleIcon size={20} className="text-green-600" />
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-gray-900">WhatsApp</p>
              <p className="text-xs text-gray-500">
                {whatsappLoading ? "Generando..." : "Enviar al cliente"}
              </p>
            </div>
          </button>
        </div>

        <div className="p-4 bg-gray-50">
          <Button
            onClick={onClose}
            className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white border-0"
          >
            Nueva venta
          </Button>
        </div>
      </div>
    </div>
  );
}
