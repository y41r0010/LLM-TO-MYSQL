"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/agendamiento/format";

export type ChartHint = { tipo?: "bar" | "line" | "none"; x?: string; y?: string[] } | null;

export interface AssistantAnswer {
  pregunta: string;
  sql?: string;
  result: Record<string, unknown>[];
  titulo?: string;
  explicacion?: string;
  resumen?: string;
  grafico?: ChartHint;
  truncated?: boolean;
}

// Categorical slots in fixed order (validated palette, see globals.css --viz-*).
const SERIES = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"];
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const TOOLTIP = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--popover-foreground)",
    fontSize: 13,
  },
  labelStyle: { color: "var(--popover-foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--popover-foreground)" },
  formatter: (v: number | string) => (typeof v === "number" ? formatNumber(v) : v),
};

// Identifier-like numbers (ids, documents, codes, years) are not measures.
const ID_LIKE = /(^id$|^id_|_id$|_fk$|documento|codigo|cod_|celular|telefono|radicado|^anio$|^año$|^year$|^mes$|^mes_num|_mes$|semana|^num_|numero$|^dia$|^dia_|^hora|trimestre|semestre|periodo|latitud|longitud)/i;
const RATE_LIKE = /(porcentaje|pct|tasa|promedio|ocupacion|ratio|^avg_|_avg$)/i;
const DATE_LIKE =/^\d{4}-\d{2}(-\d{2})?( \d{2}:\d{2}(:\d{2})?)?$/;

const label = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function analyse(rows: Record<string, unknown>[]) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const numeric = keys.filter(
    (k) => rows.some((r) => r[k] !== null && r[k] !== undefined) && rows.every((r) => r[k] === null || r[k] === undefined || typeof r[k] === "number")
  );
  const measures = numeric.filter((k) => !ID_LIKE.test(k));
  const categories = keys.filter((k) => !measures.includes(k));
  return { keys, numeric, measures, categories };
}

function toCsv(rows: Record<string, unknown>[]) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [keys.join(";"), ...rows.map((r) => keys.map((k) => cell(r[k])).join(";"))].join("\r\n");
}

function StatTile({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={hint}>{hint}</p>}
    </div>
  );
}

export function QueryResult({ answer }: { answer: AssistantAnswer }) {
  const rows = answer.result;
  const { keys, measures, categories } = useMemo(() => analyse(rows), [rows]);

  // X axis: the model's hint if valid, else the first non-measure column.
  const xKey =
    answer.grafico?.x && keys.includes(answer.grafico.x) && !measures.includes(answer.grafico.x)
      ? answer.grafico.x
      : categories[0];

  // Measures that share a scale with the largest one can share one axis; the rest
  // are offered as alternatives (never a second y-axis).
  const defaultSeries = useMemo(() => {
    const hinted = (answer.grafico?.y ?? []).filter((k) => measures.includes(k));
    const pool = hinted.length ? hinted : measures;
    // Rates and counts never share an axis: keep the kind of the first measure.
    const firstIsRate = RATE_LIKE.test(pool[0] ?? "");
    const candidates = pool.filter((k) => RATE_LIKE.test(k) === firstIsRate);
    const maxOf = (k: string) => Math.max(...rows.map((r) => Math.abs(Number(r[k]) || 0)));
    const top = Math.max(...candidates.map(maxOf), 0);
    return candidates.filter((k) => maxOf(k) >= top / 20).slice(0, 4);
  }, [answer.grafico, measures, rows]);
  const [series, setSeries] = useState<string[]>(defaultSeries);
  const activeSeries = series.filter((k) => measures.includes(k));

  const isTime = !!xKey && rows.length > 2 && rows.every((r) => r[xKey] === null || DATE_LIKE.test(String(r[xKey])));
  // Respect the model's "no chart" for record listings, but still chart small
  // grouped results (few label columns) where it obviously helps.
  const wantsChart = answer.grafico?.tipo !== "none" || (rows.length <= 50 && categories.length <= 2);
  const chartType: "bar" | "line" | "none" =
    !wantsChart || !xKey || !activeSeries.length || rows.length < 2
      ? "none"
      : isTime || answer.grafico?.tipo === "line"
        ? "line"
        : "bar";

  const chartRows = useMemo(() => {
    if (!xKey) return [];
    const data = rows.slice(0, chartType === "line" ? 400 : 30).map((r) => ({
      ...r,
      [xKey]: r[xKey] === null || r[xKey] === undefined ? "(vacío)" : String(r[xKey]),
    }));
    return data;
  }, [rows, xKey, chartType]);
  const longLabels = chartRows.some((r) => String(r[xKey!]).length > 14) || chartRows.length > 12;

  // Headline numbers: one row -> each value; many rows -> totals per measure.
  const tiles = useMemo(() => {
    if (rows.length === 1) {
      return keys
        .filter((k) => typeof rows[0][k] === "number" || measures.includes(k))
        .slice(0, 6)
        .map((k) => ({ title: label(k), value: formatNumber(Number(rows[0][k])) }));
    }
    const out = [{ title: "Filas", value: formatNumber(rows.length), hint: answer.truncated ? "Resultado recortado" : undefined }];
    for (const k of measures.slice(0, 3)) {
      const vals = rows.map((r) => Number(r[k])).filter((n) => Number.isFinite(n));
      if (!vals.length) continue;
      const sum = vals.reduce((a, b) => a + b, 0);
      const maxIdx = rows.findIndex((r) => Number(r[k]) === Math.max(...vals));
      const isRate = RATE_LIKE.test(k);
      out.push(
        isRate
          ? { title: `${label(k)} (promedio)`, value: formatNumber(Math.round((sum / vals.length) * 10) / 10), hint: undefined }
          : {
              title: `${label(k)} (suma)`,
              value: formatNumber(sum),
              hint:
                xKey && maxIdx >= 0
                  ? `Máximo: ${formatNumber(Math.max(...vals))} en ${String(rows[maxIdx][xKey] ?? "—")}`
                  : `Promedio ${formatNumber(Math.round((sum / vals.length) * 10) / 10)}`,
            }
      );
    }
    return out;
  }, [rows, keys, measures, xKey, answer.truncated]);

  function downloadCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "consulta.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {answer.resumen && <p className="text-base leading-relaxed">{answer.resumen}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">La consulta no devolvió resultados.</p>
      ) : (
        <>
          {tiles.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((t) => (
                <StatTile key={t.title} {...t} />
              ))}
            </div>
          )}

          {chartType !== "none" && xKey && (
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {activeSeries.map(label).join(", ")} por {label(xKey)}
                  {rows.length > chartRows.length && (
                    <span className="font-normal text-muted-foreground"> · primeras {chartRows.length} de {formatNumber(rows.length)} filas</span>
                  )}
                </p>
                {measures.length > 1 && (
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Medidas del gráfico">
                    {measures.map((m) => {
                      const on = series.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setSeries((s) => {
                              if (on) return s.filter((x) => x !== m);
                              // Adding a measure of the other kind (rate vs count) replaces the current ones.
                              const sameKind = s.filter((x) => RATE_LIKE.test(x) === RATE_LIKE.test(m));
                              return [...sameKind, m].slice(-4);
                            })
                          }
                          className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-foreground/40 bg-muted font-medium" : "text-muted-foreground"}`}
                        >
                          {label(m)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={longLabels && chartType === "bar" ? Math.max(260, chartRows.length * 28) : 320}>
                {chartType === "line" ? (
                  <LineChart data={chartRows} margin={{ right: 24, left: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis tick={AXIS_TICK} tickFormatter={formatNumber} axisLine={false} tickLine={false} width={64} />
                    <Tooltip {...TOOLTIP} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
                    {activeSeries.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} />}
                    {activeSeries.map((k, i) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={label(k)}
                        stroke={SERIES[i]}
                        strokeWidth={2}
                        dot={chartRows.length <= 40 ? { r: 3, fill: SERIES[i], strokeWidth: 0 } : false}
                        activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                ) : longLabels ? (
                  <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={4}>
                    <CartesianGrid horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" tick={AXIS_TICK} tickFormatter={formatNumber} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey={xKey}
                      width={200}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => (v.length > 30 ? `${v.slice(0, 29)}…` : v)}
                    />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
                    {activeSeries.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} />}
                    {activeSeries.map((k, i) => (
                      <Bar key={k} dataKey={k} name={label(k)} fill={SERIES[i]} isAnimationActive={false} radius={[0, 4, 4, 0]} maxBarSize={20} />
                    ))}
                  </BarChart>
                ) : (
                  <BarChart data={chartRows} margin={{ left: 8, right: 8 }} barCategoryGap={8}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} tickFormatter={formatNumber} axisLine={false} tickLine={false} width={64} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
                    {activeSeries.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} />}
                    {activeSeries.map((k, i) => (
                      <Bar key={k} dataKey={k} name={label(k)} fill={SERIES[i]} isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {formatNumber(rows.length)} {rows.length === 1 ? "fila" : "filas"}
                {answer.truncated && " (recortado a 1.000)"}
              </span>
              <Button variant="ghost" size="sm" onClick={downloadCsv}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {keys.map((k) => (
                      <th
                        key={k}
                        className={`whitespace-nowrap px-3 py-2 font-medium text-muted-foreground ${measures.includes(k) ? "text-right" : "text-left"}`}
                      >
                        {label(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r, i) => (
                    <tr key={i} className="border-t">
                      {keys.map((k) => {
                        const v = r[k];
                        const isMeasure = measures.includes(k);
                        return (
                          <td key={k} className={`max-w-[320px] px-3 py-1.5 align-top ${isMeasure ? "text-right tabular-nums" : ""}`}>
                            {v === null || v === undefined
                              ? "—"
                              : typeof v === "number" && isMeasure
                                ? formatNumber(v)
                                : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 500 && (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Se muestran 500 filas; descarga el CSV para verlas todas.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* The server only sends the SQL when ASSISTANT_SHOW_SQL allows it. */}
      {answer.sql ? (
        <details className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Ver SQL{answer.explicacion ? ` · ${answer.explicacion}` : ""}
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">{answer.sql}</pre>
        </details>
      ) : (
        answer.explicacion && <p className="text-sm text-muted-foreground">{answer.explicacion}</p>
      )}
    </div>
  );
}
