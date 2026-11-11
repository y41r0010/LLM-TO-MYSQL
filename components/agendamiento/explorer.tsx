"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Search, Table2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataGrid, type GridColumn } from "@/components/agendamiento/data-grid";
import { formatNumber } from "@/lib/agendamiento/format";

type TableInfo = {
  name: string;
  isView: boolean;
  rows: number | null;
  columns: { name: string; columnType: string; key: string }[];
};

export function Explorer() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ key?: string; dir: "asc" | "desc" }>({ dir: "desc" });
  const [columns, setColumns] = useState<GridColumn[]>([]);
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; total: number }>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/explorador")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setTables(d.tables);
        setSelected((s) => s ?? d.tables.find((t: TableInfo) => t.name === "citas_agendadas")?.name ?? d.tables[0]?.name ?? null);
      })
      .catch((e) => setListError(e.message || "No se pudo leer el esquema."));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // New table: reset paging, sort and search.
  useEffect(() => {
    setPage(1);
    setSort({ dir: "desc" });
    setSearch("");
    setQ("");
    setColumns([]);
    setData({ rows: [], total: 0 });
  }, [selected]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sort.key) {
      p.set("sort", sort.key);
      p.set("dir", sort.dir);
    }
    return p;
  }, [q, sort]);

  useEffect(() => setPage(1), [params, pageSize]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const p = new URLSearchParams(params);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    setLoading(true);
    setError(null);
    fetch(`/api/explorador/${encodeURIComponent(selected)}?${p}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!d) throw new Error(`El servidor respondió ${r.status} sin datos.`);
        if (!d.success) throw new Error(d.error);
        setColumns(d.columns);
        setData({ rows: d.rows, total: d.total });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected, params, page, pageSize]);

  const shown = tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));
  const current = tables.find((t) => t.name === selected);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Explorador de datos</h2>
        <p className="text-sm text-muted-foreground">
          Consulta cualquier tabla o vista de la base de agendamiento (solo lectura; las contraseñas y tokens están ocultos).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border bg-card">
          <div className="border-b p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar tablas…"
              aria-label="Filtrar tablas"
              className="h-8"
            />
          </div>
          {listError ? (
            <p className="p-3 text-sm text-destructive">{listError}</p>
          ) : (
            <ul className="max-h-[40vh] overflow-y-auto p-1 lg:max-h-[70vh]">
              {shown.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.name)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                      t.name === selected ? "bg-muted font-medium" : ""
                    }`}
                  >
                    {t.isView ? (
                      <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Vista" />
                    ) : (
                      <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Tabla" />
                    )}
                    <span className="truncate">{t.name}</span>
                    {t.rows !== null && (
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatNumber(t.rows)}</span>
                    )}
                  </button>
                </li>
              ))}
              {!tables.length && <li className="p-3 text-sm text-muted-foreground">Cargando tablas…</li>}
            </ul>
          )}
        </aside>

        <section className="min-w-0 space-y-3">
          {current && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{current.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {current.isView ? "Vista" : "Tabla"} · {current.columns.length} columnas
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar en todas las columnas…"
                    className="pl-8"
                    aria-label="Buscar en la tabla"
                  />
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/explorador/${encodeURIComponent(current.name)}?${params}&format=csv`} download>
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </a>
                </Button>
              </div>
            </div>
          )}
          {selected && (
            <DataGrid
              columns={columns.length ? columns : (current?.columns ?? []).map((c) => ({ key: c.name, label: c.name }))}
              rows={data.rows}
              total={data.total}
              page={page}
              pageSize={pageSize}
              loading={loading}
              error={error}
              sort={sort.key}
              dir={sort.dir}
              onSortChange={(key, dir) => setSort({ key, dir })}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              detailTitle={() => current?.name ?? "Registro"}
            />
          )}
        </section>
      </div>
    </div>
  );
}
