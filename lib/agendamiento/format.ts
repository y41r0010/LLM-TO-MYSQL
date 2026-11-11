import type { ColumnType } from "./resources";

const nf = new Intl.NumberFormat("es-CO");
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export const formatNumber = (n: number) => (Number.isInteger(n) ? nf.format(n) : nf1.format(n));

// Values come from MariaDB as strings ("2026-11-05" / "2026-11-05 18:01:13", dateStrings).
function formatDate(v: string) {
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y) return v;
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(v: string) {
  const date = formatDate(v);
  const time = v.length > 10 ? v.slice(11, 16) : "";
  return time ? `${date} ${time}` : date;
}

export function formatCell(value: unknown, type: ColumnType = "text"): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (type) {
    case "number":
      return Number.isFinite(Number(value)) ? formatNumber(Number(value)) : String(value);
    case "percent":
      return `${nf1.format(Number(value))}%`;
    case "date":
      return formatDate(String(value));
    case "datetime":
      return formatDateTime(String(value));
    case "bool":
      return Number(value) ? "Sí" : "No";
    default:
      return String(value);
  }
}

/** Status-like badge tone from the label text; the text itself always carries the meaning. */
export function badgeTone(value: unknown): "good" | "bad" | "warn" | "neutral" {
  const v = String(value ?? "").toUpperCase();
  if (/CANCEL|FAILED|ERROR|INACTIV|EXPIRADO|FALLID/.test(v)) return "bad";
  if (/^(AGENDADA|SUCCESS|ACTIVO|CREADA|GESTIONADA|REALIZADO|DISPONIBLE)$/.test(v)) return "good";
  if (/RUNNING|RESERVADA|SIN CITA|SKIPPED|PENDIENTE/.test(v)) return "warn";
  return "neutral";
}

export const BADGE_CLASSES: Record<ReturnType<typeof badgeTone>, string> = {
  good: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  bad: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  neutral: "bg-muted text-foreground",
};
