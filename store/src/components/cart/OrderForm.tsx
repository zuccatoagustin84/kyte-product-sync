"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCartStore } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";

interface OrderFormProps {
  onBack: () => void;
}

interface FormData {
  customer_name: string;
  customer_company: string;
  customer_phone: string;
  customer_email: string;
  notes: string;
}

interface OrderResult {
  orderId: string;
  customerName: string;
  customerCompany: string;
  customerPhone: string;
}

const WHATSAPP_PHONE = "5491156742847";

function buildWhatsAppMessage(
  items: { name: string; quantity: number; subtotal: number }[],
  total: number,
  form: FormData
): string {
  const lines: string[] = [
    "Hola! Hice un pedido en MP Tools Mayorista:",
    "",
    ...items.map(
      (item) =>
        `*${item.name} x${item.quantity} - ${formatPrice(item.subtotal)}*`
    ),
    "",
    `*Total: ${formatPrice(total)}*`,
    "",
    `Nombre: ${form.customer_name}`,
    `Empresa: ${form.customer_company}`,
    `Tel: ${form.customer_phone}`,
  ];
  if (form.customer_email) {
    lines.push(`Email: ${form.customer_email}`);
  }
  return encodeURIComponent(lines.join("\n"));
}

export function OrderForm({ onBack }: OrderFormProps) {
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.total);
  const clearCart = useCartStore((state) => state.clearCart);
  const closeCart = useCartStore((state) => state.closeCart);

  const [form, setForm] = useState<FormData>({
    customer_name: "",
    customer_company: "",
    customer_phone: "",
    customer_email: "",
    notes: "",
  });

  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const orderTotal = total();

  function validate(): boolean {
    const newErrors: Partial<FormData> = {};
    if (!form.customer_name.trim()) {
      newErrors.customer_name = "Requerido";
    }
    if (!form.customer_company.trim()) {
      newErrors.customer_company = "Requerido";
    }
    if (!form.customer_phone.trim()) {
      newErrors.customer_phone = "Requerido";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setSubmitError(null);

    const payload = {
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      customer_email: form.customer_email.trim(),
      customer_company: form.customer_company.trim(),
      notes: form.notes.trim(),
      items: items.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        product_code: item.product.code,
        unit_price: item.product.sale_price,
        quantity: item.quantity,
        subtotal: item.product.sale_price * item.quantity,
      })),
      total: orderTotal,
    };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al enviar el pedido");
      }

      setResult({
        orderId: data.orderId,
        customerName: form.customer_name.trim(),
        customerCompany: form.customer_company.trim(),
        customerPhone: form.customer_phone.trim(),
      });
      clearCart();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Error al enviar el pedido"
      );
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (result) {
    const waMessage = buildWhatsAppMessage(
      items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        subtotal: item.product.sale_price * item.quantity,
      })),
      orderTotal,
      form
    );
    const waUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${waMessage}`;

    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-6 px-4 py-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Pedido recibido
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Gracias, {result.customerName}. Nos pondremos en contacto pronto.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Pedido #{result.orderId.slice(0, 8).toUpperCase()}
          </p>
        </div>

        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#25D366] text-white font-medium text-sm hover:bg-[#20bf5b] transition-colors"
        >
          <WhatsAppIcon />
          Confirmar por WhatsApp
        </a>

        <button
          onClick={closeCart}
          className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700 transition-colors"
        >
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      {/* Header with back button */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Volver al carrito"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h2 className="text-base font-semibold text-gray-900">Datos del pedido</h2>
      </div>

      {/* Scrollable fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Nombre */}
        <div className="space-y-1.5">
          <label
            htmlFor="customer_name"
            className="block text-sm font-medium text-gray-700"
          >
            Nombre y apellido <span className="text-red-500">*</span>
          </label>
          <Input
            id="customer_name"
            type="text"
            placeholder="Juan García"
            value={form.customer_name}
            onChange={(e) =>
              setForm((f) => ({ ...f, customer_name: e.target.value }))
            }
            aria-invalid={!!errors.customer_name}
            className="h-10"
          />
          {errors.customer_name && (
            <p className="text-xs text-red-500">{errors.customer_name}</p>
          )}
        </div>

        {/* Empresa */}
        <div className="space-y-1.5">
          <label
            htmlFor="customer_company"
            className="block text-sm font-medium text-gray-700"
          >
            Empresa / Negocio <span className="text-red-500">*</span>
          </label>
          <Input
            id="customer_company"
            type="text"
            placeholder="Ferretería El Tornillo"
            value={form.customer_company}
            onChange={(e) =>
              setForm((f) => ({ ...f, customer_company: e.target.value }))
            }
            aria-invalid={!!errors.customer_company}
            className="h-10"
          />
          {errors.customer_company && (
            <p className="text-xs text-red-500">{errors.customer_company}</p>
          )}
        </div>

        {/* Teléfono */}
        <div className="space-y-1.5">
          <label
            htmlFor="customer_phone"
            className="block text-sm font-medium text-gray-700"
          >
            Teléfono <span className="text-red-500">*</span>
          </label>
          <Input
            id="customer_phone"
            type="tel"
            placeholder="+54 9 11 1234-5678"
            value={form.customer_phone}
            onChange={(e) =>
              setForm((f) => ({ ...f, customer_phone: e.target.value }))
            }
            aria-invalid={!!errors.customer_phone}
            className="h-10"
          />
          {errors.customer_phone && (
            <p className="text-xs text-red-500">{errors.customer_phone}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label
            htmlFor="customer_email"
            className="block text-sm font-medium text-gray-700"
          >
            Email{" "}
            <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <Input
            id="customer_email"
            type="email"
            placeholder="juan@ejemplo.com"
            value={form.customer_email}
            onChange={(e) =>
              setForm((f) => ({ ...f, customer_email: e.target.value }))
            }
            className="h-10"
          />
        </div>

        {/* Notas */}
        <div className="space-y-1.5">
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700"
          >
            Notas / Observaciones{" "}
            <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            id="notes"
            placeholder="Forma de entrega, aclaraciones, etc."
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring resize-none transition-colors"
          />
        </div>

        {submitError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
            {submitError}
          </div>
        )}
      </div>

      {/* Footer with order summary + submit */}
      <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-white">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Total del pedido</span>
          <span className="text-base font-bold text-gray-900">
            {formatPrice(orderTotal)}
          </span>
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-[#e85d04] hover:bg-[#c94e03] text-white font-semibold rounded-xl text-sm disabled:opacity-60"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner />
              Enviando...
            </span>
          ) : (
            "Enviar Pedido"
          )}
        </Button>
      </div>
    </form>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
