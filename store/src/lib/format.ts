export function formatPrice(value: number): string {
  return "$" + Math.round(value).toLocaleString("es-AR");
}

export function formatMoney(value: number, fractionDigits = 2): string {
  return (
    "$ " +
    value.toLocaleString("es-AR", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
  );
}

export function formatDate(value: string | Date, withTime = true): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const date = d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  if (!withTime) return date;
  const time = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time}`;
}
