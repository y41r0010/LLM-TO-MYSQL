"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BADGE_CLASSES, badgeTone, formatCell, formatNumber } from "@/lib/agendamiento/format";
import type { ColumnDef } from "@/lib/agendamiento/resources";

export type GridColumn = ColumnDef;

interface DataGridProps {
  columns: GridColumn[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  error?: string | null;
  sort?: string;
  dir?: "asc" | "desc";
  onSortChange?: (key: string, dir: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Title for the row detail panel. */
  detailTitle?: (row: Record<string, unknown>) => string;
}

function Cell({ value, column }: { value: unknown; column: GridColumn }) {
  if (column.type === "badge" && value !== null && value !== undefined && value !== "") {
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[badgeTone(value)]}`}>
        {String(value)}
      </span>
    );
  }
  const text = formatCell(value, column.type);
  const numeric = column.type === "number" || column.type === "percent";
  return (
    <span
      className={numeric ? "tabular-nums" : column.type === "date" || column.type === "datetime" ? "whitespace-nowrap" : "line-clamp-2"}
      title={text.length > 40 ? text : undefined}
    >
      {text}
    </span>
  );
}

export function DataGrid({
  columns,
  rows,
  total,
  page,
  pageSize,
  loading,
  error,
  sort,
  dir = "desc",
  onSortChange,
  onPageChange,
  onPageSizeChange,
  detailTitle,
}: DataGridProps) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const visible = columns.filter((c) => !c.hidden);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  function toggleSort(col: GridColumn) {
    if (!onSortChange || col.sortable === false) return;
    if (sort !== col.key) onSortChange(col.key, "desc");
    else onSortChange(col.key, dir === "desc" ? "asc" : "desc");
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="relative overflow-x-auto">
        {loading && rows.length > 0 && (
          <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary" aria-hidden />
        )}
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {visible.map((col) => {
                const numeric = col.type === "number" || col.type === "percent";
                const canSort = !!onSortChange && col.sortable !== false;
                const active = sort === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`whitespace-nowrap px-3 py-2 font-medium text-muted-foreground ${numeric ? "text-right" : "text-left"}`}
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
                      >
                        {col.label}
                        {active ? (
                          dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={visible.length} className="px-3 py-10 text-center text-destructive">
                  {error}
                </td>
              </tr>
            ) : loading && rows.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t">
                  {visible.map((c) => (
                    <td key={c.key} className="px-3 py-3">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={visible.length} className="px-3 py-10 text-center text-muted-foreground">
                  No hay registros con estos filtros.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="cursor-pointer border-t hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  onClick={() => setDetail(row)}
                  onKeyDown={(e) => e.key === "Enter" && setDetail(row)}
                  tabIndex={0}
                >
                  {visible.map((col) => (
                    <td
                      key={col.key}
                      className={`max-w-[320px] px-3 py-2 align-top ${col.type === "number" || col.type === "percent" ? "text-right" : ""}`}
                    >
                      <Cell value={row[col.key]} column={col} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {total ? `${formatNumber(from)}–${formatNumber(to)} de ${formatNumber(total)}` : "0 registros"}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            Filas
            <select
              className="h-8 rounded-md border bg-background px-1 text-foreground"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            {formatNumber(page)} / {formatNumber(pages)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= pages || loading}
            onClick={() => onPageChange(page + 1)}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detail && detailTitle ? detailTitle(detail) : "Detalle del registro"}</SheetTitle>
            <SheetDescription>Todos los campos de este registro.</SheetDescription>
          </SheetHeader>
          {detail && (
            <dl className="space-y-3 px-4 pb-6">
              {columns.map((col) => (
                <div key={col.key} className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 border-b pb-2 text-sm">
                  <dt className="text-muted-foreground">{col.label}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {col.type === "badge" ? <Cell value={detail[col.key]} column={col} /> : formatCell(detail[col.key], col.type === "longtext" ? "text" : col.type)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
