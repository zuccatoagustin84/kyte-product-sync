import { describe, it, expect } from "vitest";
import {
  allocateFIFO,
  computePaymentStatus,
  sumAllocations,
  onAccountRemainder,
} from "./payment-utils";

describe("allocateFIFO", () => {
  it("cubre primero la orden más vieja (asume input ya ordenado)", () => {
    const orders = [
      { id: "old", pending: 100 },
      { id: "new", pending: 100 },
    ];
    expect(allocateFIFO(orders, 100)).toEqual([{ order_id: "old", amount: 100 }]);
  });

  it("reparte entre varias órdenes hasta agotar el monto", () => {
    const orders = [
      { id: "a", pending: 50 },
      { id: "b", pending: 80 },
      { id: "c", pending: 30 },
    ];
    expect(allocateFIFO(orders, 100)).toEqual([
      { order_id: "a", amount: 50 },
      { order_id: "b", amount: 50 },
    ]);
  });

  it("la última orden recibe sólo el remanente, no se pasa", () => {
    const orders = [
      { id: "a", pending: 30 },
      { id: "b", pending: 100 },
    ];
    const result = allocateFIFO(orders, 50);
    expect(result).toEqual([
      { order_id: "a", amount: 30 },
      { order_id: "b", amount: 20 },
    ]);
    const total = result.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(50);
  });

  it("no genera entries para órdenes que quedaron sin asignación", () => {
    const orders = [
      { id: "a", pending: 100 },
      { id: "b", pending: 100 },
    ];
    expect(allocateFIFO(orders, 50)).toEqual([{ order_id: "a", amount: 50 }]);
  });

  it("monto 0 → no aloca nada", () => {
    expect(allocateFIFO([{ id: "a", pending: 100 }], 0)).toEqual([]);
  });

  it("monto negativo → no aloca nada", () => {
    expect(allocateFIFO([{ id: "a", pending: 100 }], -50)).toEqual([]);
  });

  it("monto NaN → no aloca nada", () => {
    expect(allocateFIFO([{ id: "a", pending: 100 }], NaN)).toEqual([]);
  });

  it("lista vacía → no aloca nada", () => {
    expect(allocateFIFO([], 500)).toEqual([]);
  });

  it("monto > suma de todas las pendientes → cubre todo y deja remanente", () => {
    const orders = [
      { id: "a", pending: 50 },
      { id: "b", pending: 50 },
    ];
    const result = allocateFIFO(orders, 1000);
    expect(result).toEqual([
      { order_id: "a", amount: 50 },
      { order_id: "b", amount: 50 },
    ]);
    expect(sumAllocations(result)).toBe(100);
  });

  it("ignora órdenes con pending <= 0", () => {
    const orders = [
      { id: "zero", pending: 0 },
      { id: "neg", pending: -10 },
      { id: "real", pending: 100 },
    ];
    expect(allocateFIFO(orders, 80)).toEqual([{ order_id: "real", amount: 80 }]);
  });

  it("redondea cada imputación a centavos para no propagar floats", () => {
    const orders = [
      { id: "a", pending: 33.33 },
      { id: "b", pending: 33.33 },
      { id: "c", pending: 33.34 },
    ];
    const result = allocateFIFO(orders, 100);
    // Cada amount debe estar redondeado a 2 decimales (no 33.33000000004)
    for (const a of result) {
      const cents = Math.round(a.amount * 100);
      expect(a.amount * 100).toBeCloseTo(cents, 5);
    }
    expect(sumAllocations(result)).toBe(100);
  });

  it("centavos: 0.10 partido en dos órdenes de 0.05 cada una", () => {
    const orders = [
      { id: "a", pending: 0.05 },
      { id: "b", pending: 0.05 },
    ];
    expect(allocateFIFO(orders, 0.1)).toEqual([
      { order_id: "a", amount: 0.05 },
      { order_id: "b", amount: 0.05 },
    ]);
  });
});

describe("computePaymentStatus", () => {
  it("paid si paid >= total exacto", () => {
    expect(computePaymentStatus(100, 100)).toBe("paid");
  });

  it("paid si paid > total (sobrepago)", () => {
    expect(computePaymentStatus(120, 100)).toBe("paid");
  });

  it("partial si 0 < paid < total", () => {
    expect(computePaymentStatus(50, 100)).toBe("partial");
  });

  it("pending si paid == 0", () => {
    expect(computePaymentStatus(0, 100)).toBe("pending");
  });

  it("paid con tolerancia de medio centavo (99.999 → paid)", () => {
    expect(computePaymentStatus(99.999, 100)).toBe("paid");
  });

  it("partial cuando falta más de medio centavo (99.99 → partial)", () => {
    expect(computePaymentStatus(99.99, 100)).toBe("partial");
  });

  it("total <= 0 con paid > 0 → paid", () => {
    expect(computePaymentStatus(50, 0)).toBe("paid");
  });

  it("total <= 0 con paid 0 → pending", () => {
    expect(computePaymentStatus(0, 0)).toBe("pending");
  });
});

describe("sumAllocations", () => {
  it("suma simple", () => {
    expect(
      sumAllocations([
        { order_id: "a", amount: 10 },
        { order_id: "b", amount: 20 },
      ])
    ).toBe(30);
  });

  it("suma redondeada a centavos", () => {
    expect(
      sumAllocations([
        { order_id: "a", amount: 0.1 },
        { order_id: "b", amount: 0.2 },
      ])
    ).toBe(0.3);
  });

  it("array vacío → 0", () => {
    expect(sumAllocations([])).toBe(0);
  });

  it("ignora amounts inválidos", () => {
    expect(
      sumAllocations([
        { order_id: "a", amount: 10 },
        { order_id: "b", amount: NaN },
      ])
    ).toBe(10);
  });
});

describe("onAccountRemainder", () => {
  it("monto sin imputar → todo a cuenta", () => {
    expect(onAccountRemainder(500, [])).toBe(500);
  });

  it("monto totalmente imputado → 0", () => {
    expect(
      onAccountRemainder(100, [
        { order_id: "a", amount: 60 },
        { order_id: "b", amount: 40 },
      ])
    ).toBe(0);
  });

  it("imputación parcial → resto a cuenta", () => {
    expect(onAccountRemainder(100, [{ order_id: "a", amount: 30 }])).toBe(70);
  });

  it("clamp a 0 si por algún motivo se imputó más que el monto", () => {
    expect(onAccountRemainder(100, [{ order_id: "a", amount: 150 }])).toBe(0);
  });
});
