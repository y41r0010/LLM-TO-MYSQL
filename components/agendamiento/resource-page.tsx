"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/agendamiento/data-grid";
import { RESOURCES, type FilterDef, type OptionSource, type ResourceKey } from "@/lib/agendamiento/resources";

type Option = { value: string; label: string };

// Filter choices are shared by every page: fetch them once per browser session.
let optionsPromise: Promise<Record<string, Option[]>> | null = null;
function loadOptions() {
  if (!optionsPromise) {
    optionsPromise = fetch("/api/agendamiento/opciones")
      .then((r) => r.json())
      .then((d) => (d.success ? d.data : {}))
      .catch(() => {
        optionsPromise = null;
        return {};
      });
  }
  return optionsPromise;
}

function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function FilterControl({
  filter,
  values,
  options,
  onChange,
}: {
  filter: FilterDef;
  values: Record<string, string>;
  options: Record<string, Option[]>;
  onChange: (key: string, value: string) => void;
}) {
  const fieldClass = "h-9 rounded-md border bg-background px-2 text-sm";
  if (filter.type === "select") {
    const opts = Array.isArray(filter.options) ? filter.options : options[filter.options as OptionSource] ?? [];
    return (
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-auto">
        {filter.label}
        <select
          className={`${fieldClass} w-full text-foreground sm:w-auto sm:min-w-[160px] sm:max-w-[240px]`}
          value={values[filter.key] ?? ""}
          onChange={(e) => onChange(filter.key, e.target.value)}
        >
          <option value="">Todos</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <fieldset className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-auto">
      <legend className="mb-1">{filter.label}</legend>
      <div className="flex items-center gap-1">
        <input
          type="date"
          aria-label={`${filter.label} desde`}
          className={`${fieldClass} min-w-0 flex-1 text-foreground`}
          value={values[`${filter.key}_desde`] ?? ""}
          onChange={(e) => onChange(`${filter.key}_desde`, e.target.value)}
        />
        <span>a</span>
        <input
          type="date"
          aria-label={`${filter.label} hasta`}
          className={`${fieldClass} min-w-0 flex-1 text-foreground`}
          value={values[`${filter.key}_hasta`] ?? ""}
          onChange={(e) => onChange(`${filter.key}_hasta`, e.target.value)}
        />
      </div>
    </fieldset>
  );
}

export function ResourcePage({ resourceKey }: { resourceKey: ResourceKey }) {
  const def = RESOURCES[resourceKey];
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ key?: string; dir: "asc" | "desc" }>({ dir: "desc" });
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; total: number }>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const q = useDebounced(search);

  useEffect(() => {
    if (def.filters.some((f) => f.type === "select" && !Array.isArray(f.options))) {
      loadOptions().then(setOptions);
    }
  }, [def]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    if (sort.key) {
      p.set("sort", sort.key);
      p.set("dir", sort.dir);
    }
    return p;
  }, [q, filters, sort]);

  // Back to page 1 whenever the result set changes.
  useEffect(() => setPage(1), [query, pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    const p = new URLSearchParams(query);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    setLoading(true);
    setError(null);
    fetch(`/api/agendamiento/${resourceKey}?${p}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!d) throw new Error(`El servidor respondió ${r.status} sin datos.`);
        if (!d.success) throw new Error(d.error);
        setData({ rows: d.rows, total: d.total });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message || "No se pudieron cargar los datos.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [resourceKey, query, page, pageSize, reload]);

  const activeFilters = Object.values(filters).filter(Boolean).length + (search ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{def.title}</h2>
          <p className="text-sm text-muted-foreground">{def.description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setReload((n) => n + 1)} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/agendamiento/${resourceKey}?${query}&format=csv`} download>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {"searchPlaceholder" in def && def.searchPlaceholder && (
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={def.searchPlaceholder}
              className="pl-8"
              aria-label="Buscar"
            />
          </div>
        )}
        {def.filters.map((f) => (
          <FilterControl
            key={f.key}
            filter={f}
            values={filters}
            options={options}
            onChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
          />
        ))}
        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({});
              setSearch("");
            }}
          >
            <X className="mr-1 h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      <DataGrid
        columns={def.columns}
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
        detailTitle={(row) => String(row[def.columns[0].key] ?? def.title)}
      />
      <p className="text-xs text-muted-foreground">
        Haz clic en una fila para ver todos sus campos. La exportación incluye hasta 10.000 filas con los filtros actuales.
      </p>
    </div>
  );
}
