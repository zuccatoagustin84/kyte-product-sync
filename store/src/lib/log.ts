// Logger estructurado: emite líneas JSON a stdout/stderr. Vercel ingesta
// stdout automáticamente a Logs (filtros, búsquedas y alertas funcionan
// con campos JSON), así que no hace falta un sink remoto extra.
//
// Uso:
//   import { log } from "@/lib/log";
//   log.error("payment_failed", { customer_id, error: err.message });
//
// En desarrollo (NODE_ENV != production) imprime como string legible para
// que la consola no quede inundada de JSON.

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function emit(level: LogLevel, event: string, ctx: LogContext = {}) {
  const isProd = process.env.NODE_ENV === "production";
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...ctx,
  };

  const target =
    level === "error" || level === "warn" ? console.error : console.log;

  if (isProd) {
    try {
      target(JSON.stringify(payload));
    } catch {
      target(`[log] ${level} ${event}`);
    }
  } else {
    const ctxStr = Object.keys(ctx).length > 0 ? " " + JSON.stringify(ctx) : "";
    target(`[${level}] ${event}${ctxStr}`);
  }
}

export const log = {
  debug: (event: string, ctx?: LogContext) => emit("debug", event, ctx),
  info: (event: string, ctx?: LogContext) => emit("info", event, ctx),
  warn: (event: string, ctx?: LogContext) => emit("warn", event, ctx),
  error: (event: string, ctx?: LogContext) => emit("error", event, ctx),
};

// Serializa un Error para meter en context (mensaje + stack truncado).
export function errToCtx(err: unknown): LogContext {
  if (err instanceof Error) {
    return {
      error_message: err.message,
      error_name: err.name,
      error_stack: err.stack?.split("\n").slice(0, 6).join(" | "),
    };
  }
  return { error_value: String(err) };
}
