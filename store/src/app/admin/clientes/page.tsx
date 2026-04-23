"use client";

import { useEffect, useState, useCallback } from "react";
import { PlusIcon, SearchIcon, WalletIcon, UserIcon, KeyRoundIcon, MailIcon, CopyIcon, CheckIcon } from "lucide-react";
import type { Customer, CustomerLedgerEntry } from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Mode = "create" | "edit" | "ledger" | "access";

const EMPTY: Partial<Customer> = {
  name: "",
  doc_id: "",
  email: "",
  phone: "",
  phone_alt: "",
  address: "",
  city: "",
  state: "",
  tax_condition: "Consumidor Final",
  allow_pay_later: false,
  credit_limit: null,
  notes: "",
};

export default function ClientesAdmin() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sheetMode, setSheetMode] = useState<Mode | null>(null);
  const [form, setForm] = useState<Partial<Customer>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<CustomerLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("efectivo");
  const [payNotes, setPayNotes] = useState("");
  const [payType, setPayType] = useState<"payment" | "credit_add">("payment");

  // Crear cliente con acceso
  const [accessMode, setAccessMode] = useState<"password" | "invite">("password");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessName, setAccessName] = useState("");
  const [accessPhone, setAccessPhone] = useState("");
  const [accessDocId, setAccessDocId] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [accessResult, setAccessResult] = useState<{
    email: string;
    temp_password: string | null;
    mode: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/customers?${params}`);
    const body = await res.json();
    if (res.ok) setCustomers(body.customers ?? []);
    setLoading(false);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(fetchCustomers, 250);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  function openCreate() {
    setForm(EMPTY);
    setError(null);
    setSheetMode("create");
  }

  function openCreateWithAccess() {
    setError(null);
    setAccessMode("password");
    setAccessEmail("");
    setAccessName("");
    setAccessPhone("");
    setAccessDocId("");
    setAccessPassword("");
    setAccessResult(null);
    setCopied(false);
    setSheetMode("access");
  }

  async function createUserAccess() {
    if (!accessEmail.trim() || !accessName.trim()) {
      setError("Email y nombre son obligatorios");
      return;
    }
    if (accessMode === "password" && accessPassword && accessPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres (dejá vacío para una random)");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: accessMode,
          email: accessEmail.trim().toLowerCase(),
          password: accessMode === "password" ? (accessPassword || undefined) : undefined,
          full_name: accessName.trim(),
          role: "user",
          create_customer: true,
          customer: {
            name: accessName.trim(),
            phone: accessPhone.trim() || undefined,
            doc_id: accessDocId.trim() || undefined,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo crear");
        return;
      }
      setAccessResult({
        email: body.user.email,
        temp_password: body.temp_password ?? null,
        mode: body.mode,
      });
      fetchCustomers();
    } finally {
      setSaving(false);
    }
  }

  async function copyPassword() {
    if (!accessResult?.temp_password) return;
    await navigator.clipboard.writeText(accessResult.temp_password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openEdit(c: Customer) {
    setForm(c);
    setError(null);
    setSheetMode("edit");
  }

  async function openLedger(c: Customer) {
    setForm(c);
    setSheetMode("ledger");
    setLedgerLoading(true);
    setPayAmount("");
    setPayMethod("efectivo");
    setPayNotes("");
    setPayType("payment");
    const res = await fetch(`/api/admin/customers/${c.id}/ledger`);
    const body = await res.json();
    if (res.ok) setLedger(body.entries ?? []);
    setLedgerLoading(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const isEdit = sheetMode === "edit" && form.id;
      const url = isEdit ? `/api/admin/customers/${form.id}` : "/api/admin/customers";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al guardar");
        return;
      }
      setSheetMode(null);
      fetchCustomers();
    } finally {
      setSaving(false);
    }
  }

  async function submitLedgerEntry() {
    if (!form.id) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Monto inválido");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/customers/${form.id}/ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_type: payType,
          amount: amt,
          payment_method: payMethod,
          notes: payNotes || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error");
        return;
      }
      const refresh = await fetch(`/api/admin/customers/${form.id}`);
      const refreshBody = await refresh.json();
      if (refresh.ok) setForm(refreshBody.customer);
      const lres = await fetch(`/api/admin/customers/${form.id}/ledger`);
      const lbody = await lres.json();
      if (lres.ok) setLedger(lbody.entries ?? []);
      setPayAmount("");
      setPayNotes("");
      fetchCustomers();
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!form.id) return;
    if (!confirm("¿Desactivar este cliente?")) return;
    await fetch(`/api/admin/customers/${form.id}`, { method: "DELETE" });
    setSheetMode(null);
    fetchCustomers();
  }

  const totalBalance = customers.reduce((s, c) => s + Number(c.balance ?? 0), 0);
  const debtors = customers.filter((c) => Number(c.balance) < 0);
  const creditHolders = customers.filter((c) => Number(c.balance) > 0);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 mt-1">CRM, cuenta corriente y crédito</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={openCreateWithAccess}
            variant="outline"
            className="border-orange-200 text-orange-700 hover:bg-orange-50"
          >
            <KeyRoundIcon size={14} /> Con acceso web
          </Button>
          <Button
            onClick={openCreate}
            className="bg-orange-500 hover:bg-orange-600 text-white border-0"
          >
            <PlusIcon size={14} /> Nuevo cliente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <KpiCard label="Clientes" value={customers.length.toString()} />
        <KpiCard
          label="Deudores"
          value={debtors.length.toString()}
          sub={formatMoney(debtors.reduce((s, c) => s + Number(c.balance), 0))}
          tone="negative"
        />
        <KpiCard
          label="Saldo total"
          value={formatMoney(totalBalance)}
          tone={totalBalance < 0 ? "negative" : "positive"}
          sub={`${creditHolders.length} con crédito a favor`}
        />
      </div>

      <div className="relative mb-4 max-w-md">
        <SearchIcon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, teléfono, DNI/CUIT o email"
          className="pl-9"
        />
      </div>

      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">DNI/CUIT</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cond. fiscal</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Crédito</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
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
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No hay clientes
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const bal = Number(c.balance ?? 0);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => openLedger(c)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <UserIcon size={14} className="text-gray-400" />
                          {c.name}
                          {c.tags && c.tags.length > 0 && (
                            <span className="text-xs text-gray-400">
                              · {c.tags.join(", ")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {c.doc_id ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.tax_condition ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.allow_pay_later ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            Sí {c.credit_limit ? `· ${formatMoney(Number(c.credit_limit), 0)}` : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">No</span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          bal < 0 ? "text-red-600" : bal > 0 ? "text-green-700" : "text-gray-400"
                        }`}
                      >
                        {formatMoney(bal)}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-center">
                          <Button size="xs" variant="outline" onClick={() => openEdit(c)}>
                            Editar
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => openLedger(c)}
                          >
                            <WalletIcon size={12} /> Saldo
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet
        open={sheetMode !== null}
        onOpenChange={(open) => !open && setSheetMode(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "create"
                ? "Nuevo cliente"
                : sheetMode === "edit"
                ? "Editar cliente"
                : sheetMode === "access"
                ? "Crear cliente con acceso web"
                : `Saldo — ${form.name}`}
            </SheetTitle>
          </SheetHeader>

          <div className="px-4 py-4 space-y-4">
            {error && (
              <div className="p-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                {error}
              </div>
            )}

            {sheetMode === "access" ? (
              accessResult ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                    <p className="text-sm font-semibold text-green-800">
                      {accessResult.mode === "invite"
                        ? "Invitación enviada"
                        : "Usuario creado"}
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Email: <strong>{accessResult.email}</strong>
                    </p>
                    {accessResult.mode === "invite" && (
                      <p className="text-xs text-green-700 mt-2">
                        El cliente va a recibir un email de Supabase con un link
                        para configurar su contraseña.
                      </p>
                    )}
                  </div>
                  {accessResult.temp_password && (
                    <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
                      <p className="text-xs text-yellow-800 font-medium uppercase tracking-wider">
                        Contraseña temporal
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <code className="flex-1 bg-white px-3 py-2 rounded border border-yellow-300 font-mono text-sm break-all">
                          {accessResult.temp_password}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={copyPassword}
                        >
                          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        </Button>
                      </div>
                      <p className="text-xs text-yellow-700 mt-2">
                        Guardala y pasásela al cliente. No se muestra de nuevo.
                      </p>
                    </div>
                  )}
                  <Button
                    onClick={() => setSheetMode(null)}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
                  >
                    Listo
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                    Creás la ficha del cliente + una cuenta de login vinculada.
                    El cliente va a poder entrar a la web con su email y ver sus
                    pedidos y saldo.
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAccessMode("password")}
                      className={`p-3 rounded-lg text-xs font-medium border text-left transition ${
                        accessMode === "password"
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <KeyRoundIcon size={14} className="inline mr-1" />
                      Contraseña temporal
                      <p className="font-normal mt-1 opacity-80">
                        Vos le entregás la pass al cliente
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccessMode("invite")}
                      className={`p-3 rounded-lg text-xs font-medium border text-left transition ${
                        accessMode === "invite"
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <MailIcon size={14} className="inline mr-1" />
                      Invitación por email
                      <p className="font-normal mt-1 opacity-80">
                        Le mandamos un link para que elija pass
                      </p>
                    </button>
                  </div>

                  <Field label="Nombre completo *">
                    <Input
                      value={accessName}
                      onChange={(e) => setAccessName(e.target.value)}
                      placeholder="Juan Pérez"
                    />
                  </Field>
                  <Field label="Email *">
                    <Input
                      type="email"
                      value={accessEmail}
                      onChange={(e) => setAccessEmail(e.target.value)}
                      placeholder="cliente@empresa.com"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Teléfono">
                      <Input
                        value={accessPhone}
                        onChange={(e) => setAccessPhone(e.target.value)}
                      />
                    </Field>
                    <Field label="DNI/CUIT">
                      <Input
                        value={accessDocId}
                        onChange={(e) => setAccessDocId(e.target.value)}
                      />
                    </Field>
                  </div>
                  {accessMode === "password" && (
                    <Field label="Contraseña (vacío = random)">
                      <Input
                        type="text"
                        value={accessPassword}
                        onChange={(e) => setAccessPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                      />
                    </Field>
                  )}

                  <Button
                    onClick={createUserAccess}
                    disabled={saving || !accessEmail.trim() || !accessName.trim()}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
                  >
                    {saving
                      ? "Creando..."
                      : accessMode === "invite"
                      ? "Enviar invitación"
                      : "Crear cuenta"}
                  </Button>
                </div>
              )
            ) : sheetMode === "ledger" && form.id ? (
              <>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Saldo actual</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      Number(form.balance) < 0
                        ? "text-red-600"
                        : Number(form.balance) > 0
                        ? "text-green-700"
                        : "text-gray-700"
                    }`}
                  >
                    {formatMoney(Number(form.balance ?? 0))}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {Number(form.balance) < 0
                      ? "Debe"
                      : Number(form.balance) > 0
                      ? "A favor"
                      : "Sin saldo"}
                  </p>
                </div>

                <div className="border rounded-lg p-3 space-y-2">
                  <h4 className="font-medium text-sm">Registrar movimiento</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPayType("payment")}
                      className={`p-2 rounded-lg text-xs font-medium border transition ${
                        payType === "payment"
                          ? "bg-green-500 text-white border-green-500"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      Cobrar pago
                    </button>
                    <button
                      onClick={() => setPayType("credit_add")}
                      className={`p-2 rounded-lg text-xs font-medium border transition ${
                        payType === "credit_add"
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      Agregar crédito
                    </button>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Monto"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                  {payType === "payment" && (
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="mercadopago">MercadoPago</option>
                      <option value="otro">Otro</option>
                    </select>
                  )}
                  <Input
                    placeholder="Notas (opcional)"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                  <Button
                    onClick={submitLedgerEntry}
                    disabled={saving || !payAmount}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
                  >
                    {saving ? "Registrando..." : "Registrar"}
                  </Button>
                </div>

                <div>
                  <h4 className="font-medium text-sm mb-2">Historial</h4>
                  {ledgerLoading ? (
                    <div className="h-20 bg-gray-100 rounded animate-pulse" />
                  ) : ledger.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin movimientos</p>
                  ) : (
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {ledger.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between text-xs border-b border-gray-100 py-2"
                        >
                          <div>
                            <p className="font-medium">{ledgerLabel(e.entry_type)}</p>
                            <p className="text-gray-400">
                              {formatDate(e.created_at)}
                              {e.payment_method && ` · ${e.payment_method}`}
                            </p>
                            {e.notes && <p className="text-gray-500">{e.notes}</p>}
                          </div>
                          <div className="text-right">
                            <p
                              className={`font-semibold ${
                                ledgerSign(e.entry_type, e.amount) > 0
                                  ? "text-green-700"
                                  : "text-red-600"
                              }`}
                            >
                              {ledgerSign(e.entry_type, e.amount) > 0 ? "+" : "−"}
                              {formatMoney(Math.abs(e.amount))}
                            </p>
                            <p className="text-gray-400">
                              Saldo: {formatMoney(Number(e.balance_after))}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Field label="Nombre *">
                  <Input
                    value={form.name ?? ""}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Teléfono">
                    <Input
                      value={form.phone ?? ""}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </Field>
                  <Field label="Tel. alt">
                    <Input
                      value={form.phone_alt ?? ""}
                      onChange={(e) => setForm({ ...form, phone_alt: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="DNI/CUIT">
                    <Input
                      value={form.doc_id ?? ""}
                      onChange={(e) => setForm({ ...form, doc_id: e.target.value })}
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      value={form.email ?? ""}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Cond. fiscal">
                  <select
                    value={form.tax_condition ?? ""}
                    onChange={(e) => setForm({ ...form, tax_condition: e.target.value })}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">—</option>
                    <option value="Consumidor Final">Consumidor Final</option>
                    <option value="Monotributo">Monotributo</option>
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Exento">Exento</option>
                  </select>
                </Field>
                <Field label="Dirección">
                  <Input
                    value={form.address ?? ""}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Ciudad">
                    <Input
                      value={form.city ?? ""}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </Field>
                  <Field label="Provincia">
                    <Input
                      value={form.state ?? ""}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="rounded-lg border p-3 space-y-3 bg-blue-50/30">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.allow_pay_later)}
                      onChange={(e) =>
                        setForm({ ...form, allow_pay_later: e.target.checked })
                      }
                    />
                    Permitir ventas a crédito (pagar después)
                  </label>
                  {form.allow_pay_later && (
                    <Field label="Límite de crédito (vacío = sin límite)">
                      <Input
                        type="number"
                        step="0.01"
                        value={form.credit_limit ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            credit_limit: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </Field>
                  )}
                </div>

                <Field label="Notas">
                  <textarea
                    value={form.notes ?? ""}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  />
                </Field>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={save}
                    disabled={saving || !form.name?.trim()}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-0"
                  >
                    {saving ? "Guardando..." : "Guardar"}
                  </Button>
                  {sheetMode === "edit" && (
                    <Button
                      variant="destructive"
                      disabled={saving}
                      onClick={deactivate}
                    >
                      Desactivar
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  const color =
    tone === "negative"
      ? "text-red-600"
      : tone === "positive"
      ? "text-green-700"
      : "text-gray-900";
  return (
    <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ledgerLabel(t: CustomerLedgerEntry["entry_type"]): string {
  const map: Record<CustomerLedgerEntry["entry_type"], string> = {
    sale: "Venta a crédito",
    payment: "Pago recibido",
    credit_add: "Crédito agregado",
    credit_sub: "Crédito consumido",
    refund: "Reembolso",
    adjust: "Ajuste",
  };
  return map[t];
}

function ledgerSign(t: CustomerLedgerEntry["entry_type"], amount: number): number {
  if (t === "sale" || t === "credit_sub") return -1;
  if (t === "payment" || t === "credit_add" || t === "refund") return 1;
  return amount >= 0 ? 1 : -1;
}
