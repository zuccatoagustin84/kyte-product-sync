import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, errToCtx } from "./log";

describe("log", () => {
  let origEnv: string | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    origEnv = process.env.NODE_ENV;
    stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("emite JSON válido en producción", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    log.info("test_event", { foo: 42 });
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const arg = stdoutSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(arg);
    expect(parsed).toMatchObject({
      level: "info",
      event: "test_event",
      foo: 42,
    });
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("emite formato legible fuera de producción", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    log.info("test_event", { foo: 42 });
    const arg = stdoutSpy.mock.calls[0]![0] as string;
    expect(arg).toContain("[info] test_event");
    expect(arg).toContain('"foo":42');
  });

  it("error y warn van a stderr", () => {
    log.error("boom", { code: 500 });
    log.warn("careful", { code: 400 });
    expect(stderrSpy).toHaveBeenCalledTimes(2);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("info y debug van a stdout", () => {
    log.info("hi");
    log.debug("details");
    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("contexto vacío no rompe", () => {
    expect(() => log.info("no_ctx")).not.toThrow();
  });
});

describe("errToCtx", () => {
  it("serializa Error con nombre, mensaje y stack truncado", () => {
    const err = new TypeError("boom");
    const ctx = errToCtx(err);
    expect(ctx.error_name).toBe("TypeError");
    expect(ctx.error_message).toBe("boom");
    expect(typeof ctx.error_stack).toBe("string");
  });

  it("acepta non-Error fallback con error_value", () => {
    expect(errToCtx("plain string")).toEqual({ error_value: "plain string" });
    expect(errToCtx(42)).toEqual({ error_value: "42" });
    expect(errToCtx(null)).toEqual({ error_value: "null" });
  });

  it("trunca stacks largos a 6 líneas", () => {
    const err = new Error("x");
    err.stack = Array.from({ length: 50 })
      .map((_, i) => `  at fn${i} (file.ts:${i})`)
      .join("\n");
    const ctx = errToCtx(err) as { error_stack: string };
    const parts = ctx.error_stack.split(" | ");
    expect(parts.length).toBeLessThanOrEqual(6);
  });
});
