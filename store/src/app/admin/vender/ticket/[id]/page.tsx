"use client";

import { useEffect, useState, use } from "react";
import { supabase } from "@/lib/supabase";
import { useTenantId } from "@/components/TenantProvider";
import { formatMoney, formatDate } from "@/lib/format";
import type { Order, OrderItem, OrderPayment } from "@/lib/types";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transf.",
  mercadopago: "MercadoPago",
  credito_cliente: "Crédito cte.",
  otro: "Otro",
};

export default function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tenantId = useTenantId();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [o, i, p] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("company_id", tenantId)
          .eq("id", id)
          .single(),
        supabase
          .from("order_items")
          .select("*")
          .eq("company_id", tenantId)
          .eq("order_id", id),
        supabase
          .from("order_payments")
          .select("*")
          .eq("company_id", tenantId)
          .eq("order_id", id)
          .order("paid_at", { ascending: true }),
      ]);
      if (o.data) setOrder(o.data as Order);
      setItems((i.data as OrderItem[]) ?? []);
      setPayments((p.data as OrderPayment[]) ?? []);
      setLoading(false);
    }
    load();
  }, [id, tenantId]);

  useEffect(() => {
    if (!loading && order) {
      // Give layout a beat, then trigger print
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [loading, order]);

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">Cargando...</div>
    );
  }
  if (!order) {
    return (
      <div className="p-4 text-center text-sm text-red-600">
        Pedido no encontrado
      </div>
    );
  }

  return (
    <div className="ticket-root">
      <style jsx global>{`
        @page {
          size: 80mm auto;
          margin: 0;
        }
        body {
          background: white !important;
          margin: 0;
        }
        .ticket-root {
          width: 80mm;
          padding: 4mm 3mm;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            monospace;
          font-size: 11px;
          line-height: 1.3;
          color: #000;
          background: white;
          margin: 0 auto;
        }
        .ticket-root h1 {
          font-size: 14px;
          font-weight: 700;
          margin: 0;
          text-align: center;
        }
        .ticket-root .muted {
          color: #444;
        }
        .ticket-root .center {
          text-align: center;
        }
        .ticket-root .row {
          display: flex;
          justify-content: space-between;
          gap: 4px;
        }
        .ticket-root .dashed {
          border-top: 1px dashed #000;
          margin: 4px 0;
        }
        .ticket-root .item-name {
          font-weight: 600;
        }
        .ticket-root .total {
          font-size: 14px;
          font-weight: 700;
        }
        .ticket-root .print-btn {
          display: block;
          margin: 10px auto 0;
          padding: 6px 10px;
          border: 1px solid #000;
          background: white;
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
        }
        @media print {
          .ticket-root .print-btn {
            display: none;
          }
        }
      `}</style>

      <h1>MP.TOOLS MAYORISTA</h1>
      <p className="center muted">Comprobante de venta</p>
      <div className="dashed" />

      <div className="row">
        <span>N° {order.order_number ?? "—"}</span>
        <span className="muted">{formatDate(order.created_at)}</span>
      </div>
      <div>
        <span className="muted">Cliente: </span>
        {order.customer_name}
      </div>
      {order.customer_phone && (
        <div>
          <span className="muted">Tel: </span>
          {order.customer_phone}
        </div>
      )}

      <div className="dashed" />

      {items.map((it) => (
        <div key={it.id} style={{ marginBottom: 4 }}>
          <div className="item-name">{it.product_name}</div>
          {it.product_code && (
            <div className="muted" style={{ fontSize: 10 }}>
              {it.product_code}
            </div>
          )}
          <div className="row">
            <span>
              {it.quantity} × {formatMoney(Number(it.unit_price))}
            </span>
            <span>{formatMoney(Number(it.subtotal))}</span>
          </div>
        </div>
      ))}

      <div className="dashed" />

      <div className="row">
        <span>Subtotal</span>
        <span>{formatMoney(Number(order.subtotal ?? 0))}</span>
      </div>
      {Number(order.discount_total) > 0 && (
        <div className="row">
          <span>Descuento</span>
          <span>− {formatMoney(Number(order.discount_total))}</span>
        </div>
      )}
      {Number(order.shipping_total) > 0 && (
        <div className="row">
          <span>Envío</span>
          <span>{formatMoney(Number(order.shipping_total))}</span>
        </div>
      )}
      <div className="row total">
        <span>TOTAL</span>
        <span>{formatMoney(Number(order.total))}</span>
      </div>

      <div className="dashed" />

      <div className="muted" style={{ marginBottom: 2 }}>
        Pagos:
      </div>
      {payments.map((p) => (
        <div key={p.id} className="row">
          <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
          <span>{formatMoney(Number(p.amount))}</span>
        </div>
      ))}

      {order.notes && (
        <>
          <div className="dashed" />
          <div className="muted">Notas:</div>
          <div>{order.notes}</div>
        </>
      )}

      <div className="dashed" />
      <p className="center">¡Gracias por su compra!</p>

      <button className="print-btn" onClick={() => window.print()}>
        Imprimir ticket
      </button>
    </div>
  );
}
