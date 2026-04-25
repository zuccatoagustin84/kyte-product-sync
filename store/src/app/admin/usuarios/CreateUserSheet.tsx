"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Role = "admin" | "operador" | "user";
type Mode = "password" | "invite";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  operador: "Operador",
  user: "Cliente",
};

const ROLE_DESC: Record<Role, string> = {
  admin: "Acceso total al panel y configuración",
  operador: "Vende, ve pedidos y gestiona clientes — sin config ni usuarios",
  user: "Cliente final que compra desde el catálogo",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

export default function CreateUserSheet({ open, onOpenChange, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>("password");
  const [role, setRole] = useState<Role>("operador");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [createCustomer, setCreateCustomer] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerDoc, setCustomerDoc] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [allowPayLater, setAllowPayLater] = useState(false);
  const [creditLimit, setCreditLimit] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    email: string;
    role: Role;
    tempPassword: string | null;
    mode: Mode;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setMode("password");
    setRole("operador");
    setEmail("");
    setFullName("");
    setPassword("");
    setCreateCustomer(false);
    setCustomerName("");
    setCustomerDoc("");
    setCustomerPhone("");
    setCustomerAddress("");
    setAllowPayLater(false);
    setCreditLimit("");
    setError(null);
    setResult(null);
    setCopied(false);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        mode,
        email: email.trim(),
        full_name: fullName.trim() || null,
        role,
      };
      if (mode === "password" && password.trim()) {
        payload.password = password.trim();
      }
      if (createCustomer) {
        payload.create_customer = true;
        payload.customer = {
          name: customerName.trim() || fullName.trim() || email.trim(),
          doc_id: customerDoc.trim() || null,
          phone: customerPhone.trim() || null,
          address: customerAddress.trim() || null,
          allow_pay_later: allowPayLater,
          credit_limit: creditLimit.trim() === "" ? null : Number(creditLimit),
        };
      }

      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo crear el usuario");
        return;
      }
      setResult({
        email: body.user.email,
        role: body.user.role,
        tempPassword: body.temp_password ?? null,
        mode: body.mode,
      });
      onCreated();
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function copyCreds() {
    if (!result?.tempPassword) return;
    const text = `Email: ${result.email}\nContraseña: ${result.tempPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignorar
    }
  }

  const canSubmit =
    /.+@.+\..+/.test(email.trim()) &&
    (mode === "invite" || password.trim().length === 0 || password.trim().length >= 8);

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{result ? "Usuario creado" : "Nuevo usuario"}</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-5">
          {result ? (
            <ResultCard result={result} copied={copied} onCopy={copyCreds} onClose={() => handleClose(false)} />
          ) : (
            <>
              {error && (
                <div className="p-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                  {error}
                </div>
              )}

              {/* Modo de alta */}
              <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Modo de alta</h3>
                <div className="grid grid-cols-2 gap-2">
                  <ModeOption
                    selected={mode === "password"}
                    title="Con contraseña"
                    desc="Crear ya con clave (la podés copiar)"
                    onClick={() => setMode("password")}
                  />
                  <ModeOption
                    selected={mode === "invite"}
                    title="Por invitación"
                    desc="Le mandamos un email para que defina su clave"
                    onClick={() => setMode("invite")}
                  />
                </div>
              </section>

              {/* Datos básicos */}
              <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Datos del usuario</h3>
                <Field label="Email">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@ejemplo.com"
                    disabled={saving}
                  />
                </Field>
                <Field label="Nombre completo">
                  <Input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Juan Pérez"
                    disabled={saving}
                  />
                </Field>
                {mode === "password" && (
                  <Field label="Contraseña (vacío = autogenerada)">
                    <Input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      disabled={saving}
                    />
                  </Field>
                )}
              </section>

              {/* Rol */}
              <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Rol</h3>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    disabled={saving}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      role === r
                        ? "border-orange-300 bg-orange-50/50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{ROLE_LABEL[r]}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{ROLE_DESC[r]}</p>
                  </button>
                ))}
              </section>

              {/* Crear ficha de cliente */}
              {role === "user" && (
                <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createCustomer}
                      onChange={(e) => setCreateCustomer(e.target.checked)}
                      disabled={saving}
                      className="mt-1 size-4 accent-orange-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Crear también ficha de cliente
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Para cuenta corriente, saldos y datos de facturación
                      </p>
                    </div>
                  </label>

                  {createCustomer && (
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                      <Field label="Razón social / Nombre">
                        <Input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder={fullName || "Nombre del cliente"}
                          disabled={saving}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="CUIT / DNI">
                          <Input
                            type="text"
                            value={customerDoc}
                            onChange={(e) => setCustomerDoc(e.target.value)}
                            placeholder="20-12345678-9"
                            disabled={saving}
                          />
                        </Field>
                        <Field label="Teléfono">
                          <Input
                            type="tel"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="+54 9 11..."
                            disabled={saving}
                          />
                        </Field>
                      </div>
                      <Field label="Dirección">
                        <Input
                          type="text"
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          placeholder="Calle 123, Localidad"
                          disabled={saving}
                        />
                      </Field>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowPayLater}
                          onChange={(e) => setAllowPayLater(e.target.checked)}
                          disabled={saving}
                          className="mt-1 size-4 accent-orange-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Permitir cuenta corriente
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Puede comprar a crédito y pagar después
                          </p>
                        </div>
                      </label>
                      {allowPayLater && (
                        <Field label="Límite de crédito (opcional)">
                          <Input
                            type="number"
                            value={creditLimit}
                            onChange={(e) => setCreditLimit(e.target.value)}
                            placeholder="0 = sin límite"
                            disabled={saving}
                          />
                        </Field>
                      )}
                    </div>
                  )}
                </section>
              )}

              <div className="sticky bottom-0 -mx-4 px-4 pt-2 pb-4 bg-gradient-to-t from-white to-transparent">
                <Button
                  onClick={handleSubmit}
                  disabled={saving || !canSubmit}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
                >
                  {saving ? "Creando..." : "Crear usuario"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function ModeOption({
  selected,
  title,
  desc,
  onClick,
}: {
  selected: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
        selected
          ? "border-orange-300 bg-orange-50/50"
          : "border-gray-200 hover:bg-gray-50"
      }`}
    >
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
    </button>
  );
}

function ResultCard({
  result,
  copied,
  onCopy,
  onClose,
}: {
  result: { email: string; role: Role; tempPassword: string | null; mode: Mode };
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-green-50 border border-green-200 p-4">
        <p className="text-sm font-semibold text-green-800">
          ¡Usuario creado correctamente!
        </p>
        <p className="text-xs text-green-700 mt-1">
          {result.mode === "invite"
            ? "Le enviamos un email con el link para definir su contraseña."
            : "Compartile las credenciales por un canal seguro."}
        </p>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-3">
        <Row label="Email" value={result.email} mono />
        <Row label="Rol" value={ROLE_LABEL[result.role]} />
        {result.tempPassword && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Contraseña
              </p>
              <p className="font-mono text-sm text-gray-900 break-all">
                {result.tempPassword}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onCopy}>
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        )}
      </div>

      <Button onClick={onClose} className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0">
        Listo
      </Button>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-gray-800 text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
