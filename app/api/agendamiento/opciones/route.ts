import { NextResponse } from "next/server";
import { executeReadOnly } from "@/lib/db";
import type { OptionSource } from "@/lib/agendamiento/resources";

// Choices for the select filters. Small lookup tables, cached briefly in memory.

import { publicError } from "@/lib/security";
export const dynamic = "force-dynamic";

type Option = { value: string; label: string };

const QUERIES: Record<OptionSource, string> = {
  sedes: "SELECT id_cfsm AS value, dependencia AS label FROM cfsm ORDER BY dependencia",
  tramites: "SELECT id_tipo_tramite AS value, tramite AS label FROM tramites ORDER BY tramite",
  estados: `SELECT e.id_estado AS value, e.nombre_estado AS label FROM estados e
             WHERE EXISTS (SELECT 1 FROM citas_agendadas ca WHERE ca.id_estado_fk = e.id_estado)
             ORDER BY e.nombre_estado`,
  regionales: "SELECT id_regional AS value, nombre_regional AS label FROM regionales ORDER BY nombre_regional",
  grupos: "SELECT id_grupo_tramite AS value, nombre_grupo_tramite AS label FROM grupo_tramites ORDER BY nombre_grupo_tramite",
  tiposDoc: "SELECT id_tipodoc AS value, nombre_doc AS label FROM tipo_documento ORDER BY nombre_doc",
  eventos: "SELECT DISTINCT evento AS value, evento AS label FROM historial_citas WHERE evento IS NOT NULL ORDER BY evento",
  auditAcciones:
    "SELECT DISTINCT action AS value, action AS label FROM agendamiento_citas_marzo27_audit WHERE action <> '' ORDER BY action",
  auditTablas:
    "SELECT DISTINCT `table` AS value, `table` AS label FROM agendamiento_citas_marzo27_audit WHERE `table` <> '' ORDER BY `table`",
};

const CACHE_MS = 5 * 60 * 1000;
const globalCache = globalThis as unknown as { agendaOptions?: { at: number; data: Record<string, Option[]> } };

export async function GET() {
  try {
    const cached = globalCache.agendaOptions;
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    const entries = await Promise.all(
      (Object.keys(QUERIES) as OptionSource[]).map(async (key) => {
        const rows = await executeReadOnly<{ value: unknown; label: unknown }[]>(QUERIES[key]);
        return [key, rows.map((r) => ({ value: String(r.value), label: String(r.label ?? r.value) }))] as const;
      })
    );
    const data = Object.fromEntries(entries);
    globalCache.agendaOptions = { at: Date.now(), data };
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: publicError("api/agendamiento/opciones", error, "No se pudieron cargar los filtros.") },
      { status: 500 }
    );
  }
}
