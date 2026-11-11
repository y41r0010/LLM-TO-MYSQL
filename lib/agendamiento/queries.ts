import "server-only";
import { executeReadOnly } from "@/lib/db";
import { getResource, type ColumnDef, type ResourceKey } from "./resources";

// SQL behind each resource in resources.ts. `select` keys must match the column
// keys there; filter keys must match the filter keys. Everything user-supplied
// goes through bound parameters; sort keys are checked against this whitelist.

interface ResourceSql {
  from: string;
  select: Record<string, string>;
  /** Expressions matched with LIKE %q%. */
  search?: string[];
  /** Filter key -> SQL expression it compares against. */
  filters?: Record<string, string>;
  groupBy?: string;
  /** ORDER BY used when the user has not picked a column. */
  defaultOrder: string;
}

// Citas cancelled (12 = CANCELADO, 42 = CANCELADO POR NOVEDAD) do not occupy a slot.
const CANCELLED_STATES = "12, 42";
const VIGENTE_STATE = 35; // AGENDADA

const nombreCompleto = (a: string) =>
  `NULLIF(TRIM(CONCAT_WS(' ', ${a}.primer_nombre, ${a}.otros_nombres, ${a}.primer_apellido, ${a}.segundo_apellido)), '')`;

const SQL: Record<ResourceKey, ResourceSql> = {
  citas: {
    from: `citas_agendadas ca
      LEFT JOIN citas_disponibles cd ON cd.id_cita_dispo = ca.id_cita_dispo_fk
      LEFT JOIN hora_citas h ON h.id_hora = cd.id_hora_fk
      LEFT JOIN cfsm c ON c.id_cfsm = ca.id_cfsm_fk
      LEFT JOIN tramites t ON t.id_tipo_tramite = ca.id_tramite_fk
      LEFT JOIN estados e ON e.id_estado = ca.id_estado_fk
      LEFT JOIN estados_cierre ec ON ec.id_estado_cierre = ca.id_estado_cierre_fk
      LEFT JOIN usuarios u ON u.id_usuario = ca.id_usuario_fk
      LEFT JOIN tipo_documento td ON td.id_tipodoc = u.tipo_documento_fk
      LEFT JOIN usuarios_beneficiarios ub ON ub.id_beneficiario = ca.id_beneficiario_fk
      LEFT JOIN funcionarios f ON f.id = ca.id_funcionario_fk`,
    select: {
      radicado: "ca.radicado",
      fecha_cita: "cd.fecha_cita",
      hora: "DATE_FORMAT(h.hora_inicio, '%H:%i')",
      sede: "c.dependencia",
      tramite: "t.tramite",
      estado: "e.nombre_estado",
      ciudadano: nombreCompleto("u"),
      tipo_doc: "td.nombre_doc",
      documento: "u.numero_documento",
      email: "u.email",
      celular: "u.celular",
      beneficiario: nombreCompleto("ub"),
      documento_beneficiario: "ub.numero_documento",
      estado_cierre: "ec.nombre",
      funcionario: "f.nombres",
      fecha_registro: "ca.fecha_registro",
      observaciones: "ca.observaciones",
      observaciones_cierre: "ca.observaciones_cierre",
      ip_origen: "ca.ip_host_origen",
    },
    search: [
      "ca.radicado",
      "u.numero_documento",
      "ub.numero_documento",
      "u.email",
      "CONCAT_WS(' ', u.primer_nombre, u.otros_nombres, u.primer_apellido, u.segundo_apellido)",
    ],
    filters: {
      sede: "ca.id_cfsm_fk",
      tramite: "ca.id_tramite_fk",
      estado: "ca.id_estado_fk",
      fecha_cita: "cd.fecha_cita",
      fecha_registro: "ca.fecha_registro",
    },
    defaultOrder: "ca.id_agendamiento DESC",
  },

  disponibilidad: {
    from: `citas_disponibles cd
      LEFT JOIN citas_agendadas ca
        ON ca.id_cita_dispo_fk = cd.id_cita_dispo AND COALESCE(ca.id_estado_fk, 0) NOT IN (${CANCELLED_STATES})
      LEFT JOIN cfsm c ON c.id_cfsm = cd.id_cfsm_fk
      LEFT JOIN tramites t ON t.id_tipo_tramite = cd.id_tipo_tramite_fk`,
    select: {
      fecha: "cd.fecha_cita",
      sede: "MAX(c.dependencia)",
      tramite: "MAX(t.tramite)",
      cupos: "COUNT(DISTINCT cd.id_cita_dispo)",
      agendadas: "COUNT(DISTINCT CASE WHEN ca.id_agendamiento IS NOT NULL THEN cd.id_cita_dispo END)",
      sin_agendar:
        "COUNT(DISTINCT cd.id_cita_dispo) - COUNT(DISTINCT CASE WHEN ca.id_agendamiento IS NOT NULL THEN cd.id_cita_dispo END)",
      ocupacion:
        "ROUND(100 * COUNT(DISTINCT CASE WHEN ca.id_agendamiento IS NOT NULL THEN cd.id_cita_dispo END) / COUNT(DISTINCT cd.id_cita_dispo), 1)",
    },
    filters: {
      sede: "cd.id_cfsm_fk",
      tramite: "cd.id_tipo_tramite_fk",
      fecha: "cd.fecha_cita",
    },
    groupBy: "cd.fecha_cita, cd.id_cfsm_fk, cd.id_tipo_tramite_fk",
    defaultOrder: "cd.fecha_cita DESC, sede ASC",
  },

  historial: {
    from: `historial_citas hc
      LEFT JOIN citas_agendadas ca ON ca.id_agendamiento = hc.id_agendamiento_fk
      LEFT JOIN tramites t ON t.id_tipo_tramite = hc.id_tramite_fk
      LEFT JOIN usuarios u ON u.id_usuario = hc.id_usuario_fk`,
    select: {
      fecha_evento: "hc.fecha_evento",
      evento: "hc.evento",
      radicado: "ca.radicado",
      tramite: "t.tramite",
      documento: "u.numero_documento",
      ciudadano: nombreCompleto("u"),
      motivo: "hc.motivo",
      metadata: "hc.metadata",
    },
    search: ["ca.radicado", "u.numero_documento"],
    filters: { evento: "hc.evento", tramite: "hc.id_tramite_fk", fecha: "hc.fecha_evento" },
    defaultOrder: "hc.id_historial DESC",
  },

  ciudadanos: {
    from: `usuarios u
      LEFT JOIN tipo_documento td ON td.id_tipodoc = u.tipo_documento_fk
      LEFT JOIN genero g ON g.id_genero = u.id_genero_fk`,
    select: {
      tipo_doc: "td.nombre_doc",
      documento: "u.numero_documento",
      nombre: nombreCompleto("u"),
      email: "u.email",
      celular: "u.celular",
      fecha_nacimiento: "u.fecha_nacimiento",
      genero: "g.nombre_genero",
      email_verificado: "u.email_verificado",
      activo: "u.active",
      citas: "(SELECT COUNT(*) FROM citas_agendadas x WHERE x.id_usuario_fk = u.id_usuario)",
      beneficiarios: "(SELECT COUNT(*) FROM usuarios_beneficiarios b WHERE b.id_usuario_padre_fk = u.id_usuario)",
      intentos_fallidos: "u.intentos_fallidos_login",
      bloqueado_hasta: "u.bloqueo_login_hasta",
      observaciones: "u.observaciones_modificacion",
      fecha_registro: "u.fecha_registro",
    },
    search: [
      "u.numero_documento",
      "u.email",
      "u.celular",
      "CONCAT_WS(' ', u.primer_nombre, u.otros_nombres, u.primer_apellido, u.segundo_apellido)",
    ],
    filters: { tipo_doc: "u.tipo_documento_fk", fecha_registro: "u.fecha_registro" },
    defaultOrder: "u.id_usuario DESC",
  },

  beneficiarios: {
    from: `usuarios_beneficiarios b
      LEFT JOIN usuarios u ON u.id_usuario = b.id_usuario_padre_fk
      LEFT JOIN tipo_documento td ON td.id_tipodoc = b.tipo_documento_fk
      LEFT JOIN parentescos p ON p.id_parentesco = b.id_parentesco_fk
      LEFT JOIN genero g ON g.id_genero = b.id_genero_fk`,
    select: {
      tipo_doc: "td.nombre_doc",
      documento: "b.numero_documento",
      nombre: nombreCompleto("b"),
      fecha_nacimiento: "b.fecha_nacimiento",
      parentesco: "p.parentesco",
      titular: nombreCompleto("u"),
      documento_titular: "u.numero_documento",
      genero: "g.nombre_genero",
      discapacidad: "b.discapacidad",
      descripcion_discapacidad: "b.descripcion_discapacidad",
      citas: "(SELECT COUNT(*) FROM citas_agendadas x WHERE x.id_beneficiario_fk = b.id_beneficiario)",
      activo: "b.activo",
      fecha_registro: "b.fecha_registro",
    },
    search: [
      "b.numero_documento",
      "u.numero_documento",
      "CONCAT_WS(' ', b.primer_nombre, b.otros_nombres, b.primer_apellido, b.segundo_apellido)",
      "CONCAT_WS(' ', u.primer_nombre, u.primer_apellido)",
    ],
    filters: { fecha_registro: "b.fecha_registro" },
    defaultOrder: "b.id_beneficiario DESC",
  },

  funcionarios: {
    from: `funcionarios f
      LEFT JOIN cfsm c ON c.id_cfsm = f.id_cfsm_fk
      LEFT JOIN regionales r ON r.id_regional = f.id_regional_fk`,
    select: {
      nombres: "f.nombres",
      usuario: "f.nombre_usuario",
      email: "f.email",
      documento: "f.numero_doc",
      sede: "c.dependencia",
      regional: "r.nombre_regional",
      grupo: "f.groupid",
      activo: "f.active",
      citas_gestionadas: "(SELECT COUNT(*) FROM citas_agendadas x WHERE x.id_funcionario_fk = f.id)",
      creado: "f.created_at",
    },
    search: ["f.nombres", "f.nombre_usuario", "f.email", "f.numero_doc"],
    filters: { sede: "f.id_cfsm_fk", regional: "f.id_regional_fk", activo: "f.active" },
    defaultOrder: "f.nombres ASC",
  },

  sedes: {
    from: `cfsm c LEFT JOIN regionales r ON r.id_regional = c.id_regional_fk`,
    select: {
      codigo: "c.cod_dependencia",
      sede: "c.dependencia",
      regional: "r.nombre_regional",
      direccion: "c.direccion",
      ventanillas: "c.num_ventanillas",
      tramites_activos:
        "(SELECT COUNT(*) FROM cfsm_tramites ct WHERE ct.id_cfsm_fk = c.id_cfsm AND ct.activo = 1)",
      citas_total: "(SELECT COUNT(*) FROM citas_agendadas x WHERE x.id_cfsm_fk = c.id_cfsm)",
      citas_vigentes: `(SELECT COUNT(*) FROM citas_agendadas x WHERE x.id_cfsm_fk = c.id_cfsm AND x.id_estado_fk = ${VIGENTE_STATE})`,
      cupos_futuros:
        "(SELECT COUNT(*) FROM citas_disponibles x WHERE x.id_cfsm_fk = c.id_cfsm AND x.fecha_cita >= CURDATE())",
      latitud: "c.latitud",
      longitud: "c.longitud",
      mapa: "c.map",
    },
    search: ["c.dependencia", "CAST(c.cod_dependencia AS CHAR)", "c.direccion"],
    filters: { regional: "c.id_regional_fk" },
    defaultOrder: "c.dependencia ASC",
  },

  regionales: {
    from: "regionales r",
    select: {
      codigo: "r.codigo_regional",
      regional: "r.nombre_regional",
      estado: "r.estado",
      sedes: "(SELECT COUNT(*) FROM cfsm c WHERE c.id_regional_fk = r.id_regional)",
      funcionarios: "(SELECT COUNT(*) FROM funcionarios f WHERE f.id_regional_fk = r.id_regional)",
      citas_total:
        "(SELECT COUNT(*) FROM citas_agendadas x JOIN cfsm c ON c.id_cfsm = x.id_cfsm_fk WHERE c.id_regional_fk = r.id_regional)",
      citas_vigentes: `(SELECT COUNT(*) FROM citas_agendadas x JOIN cfsm c ON c.id_cfsm = x.id_cfsm_fk WHERE c.id_regional_fk = r.id_regional AND x.id_estado_fk = ${VIGENTE_STATE})`,
      creada: "r.fecha_creacion",
    },
    defaultOrder: "r.nombre_regional ASC",
  },

  tramites: {
    from: `tramites t LEFT JOIN grupo_tramites g ON g.id_grupo_tramite = t.id_grupo_tramite_fk`,
    select: {
      codigo: "t.codigo_tramite",
      tramite: "t.tramite",
      grupo: "COALESCE(g.nombre_grupo_tramite, t.grupo_tramite)",
      estado: "CASE t.estado_tramite_vigente WHEN 'A' THEN 'Activo' WHEN 'I' THEN 'Inactivo' ELSE t.estado_tramite_vigente END",
      sedes:
        "(SELECT COUNT(*) FROM cfsm_tramites ct WHERE ct.id_tramite_fk = t.id_tipo_tramite AND ct.activo = 1)",
      citas_total: "(SELECT COUNT(*) FROM citas_agendadas x WHERE x.id_tramite_fk = t.id_tipo_tramite)",
      citas_vigentes: `(SELECT COUNT(*) FROM citas_agendadas x WHERE x.id_tramite_fk = t.id_tipo_tramite AND x.id_estado_fk = ${VIGENTE_STATE})`,
      canceladas: `(SELECT COUNT(*) FROM citas_agendadas x WHERE x.id_tramite_fk = t.id_tipo_tramite AND x.id_estado_fk IN (${CANCELLED_STATES}))`,
      ultima_cita: "(SELECT MAX(x.fecha_registro) FROM citas_agendadas x WHERE x.id_tramite_fk = t.id_tipo_tramite)",
    },
    search: ["t.tramite"],
    filters: { grupo: "t.id_grupo_tramite_fk", estado: "t.estado_tramite_vigente" },
    defaultOrder: "t.estado_tramite_vigente ASC, t.tramite ASC",
  },

  festivos: {
    from: "th_tramite_festivo tf",
    select: {
      fecha: "tf.fecha",
      nombre: "tf.nombre",
      descripcion: "tf.descripcion",
      vigencia: "tf.vigencia",
      activo: "tf.activo",
    },
    search: ["tf.nombre", "tf.descripcion"],
    filters: { fecha: "tf.fecha" },
    defaultOrder: "tf.fecha DESC",
  },

  cargas: {
    from: "agenda_lote_carga l",
    select: {
      id_lote: "l.id_lote",
      tipo: "l.tipo_cargue",
      fecha_objetivo: "l.fecha_objetivo",
      fecha_inicio: "l.fecha_inicio",
      fecha_fin: "l.fecha_fin",
      estado: "l.estado",
      filas: "l.inserted_rows",
      publicado: "l.estado_publicacion",
      origen: "l.trigger_source",
      solicitado_por: "l.solicitado_por",
      inicio: "l.started_at",
      fin: "l.finished_at",
      error: "l.error_message",
    },
    filters: { estado: "l.estado", tipo: "l.tipo_cargue", fecha_objetivo: "l.fecha_objetivo" },
    defaultOrder: "l.id_lote DESC",
  },

  novedades: {
    from: `cancelaciones_novedad_log n
      LEFT JOIN cfsm c ON c.id_cfsm = n.id_cfsm_fk
      LEFT JOIN tramites t ON t.id_tipo_tramite = n.id_tramite_fk`,
    select: {
      fecha_cita: "n.fecha_cita",
      sede: "c.dependencia",
      tramite: "t.tramite",
      motivo: "n.motivo",
      total_citas: "n.total_citas",
      citas_agendadas: "n.citas_agendadas_count",
      correos_enviados: "n.correos_enviados",
      correos_fallidos: "n.correos_fallidos",
      ejecutado_por: "n.ejecutado_por",
      fecha_ejecucion: "n.fecha_ejecucion",
    },
    search: ["n.motivo", "n.ejecutado_por"],
    filters: { sede: "n.id_cfsm_fk", fecha_cita: "n.fecha_cita" },
    defaultOrder: "n.id DESC",
  },

  auditoria: {
    from: "agendamiento_citas_marzo27_audit a",
    select: {
      fecha: "a.datetime",
      usuario: "a.user",
      accion: "a.action",
      tabla: "a.`table`",
      resumen: "LEFT(REPLACE(REPLACE(a.description, '\\r', ' '), '\\n', ' '), 140)",
      ip: "a.ip",
      descripcion: "a.description",
    },
    search: ["a.user", "a.`table`", "a.description"],
    filters: { accion: "a.action", tabla: "a.`table`", fecha: "a.datetime" },
    defaultOrder: "a.id DESC",
  },
};

export const PAGE_SIZES = [25, 50, 100];
export const CSV_MAX_ROWS = 10000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ResourceQuery {
  page: number;
  pageSize: number;
  q: string;
  sort?: string;
  dir: "asc" | "desc";
  params: URLSearchParams;
}

function buildWhere(resource: ResourceKey, sql: ResourceSql, query: ResourceQuery) {
  const def = getResource(resource);
  const clauses: string[] = [];
  const values: any[] = [];

  const q = query.q.trim();
  if (q && sql.search?.length) {
    clauses.push(`(${sql.search.map((e) => `${e} LIKE ?`).join(" OR ")})`);
    sql.search.forEach(() => values.push(`%${q}%`));
  }

  for (const f of def.filters) {
    const expr = sql.filters?.[f.key];
    if (!expr) continue;
    if (f.type === "select") {
      const v = query.params.get(f.key);
      if (v) {
        clauses.push(`${expr} = ?`);
        values.push(v);
      }
    } else {
      const desde = query.params.get(`${f.key}_desde`);
      const hasta = query.params.get(`${f.key}_hasta`);
      if (desde && DATE_RE.test(desde)) {
        clauses.push(`${expr} >= ?`);
        values.push(desde);
      }
      if (hasta && DATE_RE.test(hasta)) {
        clauses.push(`${expr} < DATE_ADD(?, INTERVAL 1 DAY)`);
        values.push(hasta);
      }
    }
  }

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

function orderBy(resource: ResourceKey, sql: ResourceSql, query: ResourceQuery) {
  const col = getResource(resource).columns.find((c) => c.key === query.sort);
  if (col && col.sortable !== false && sql.select[col.key]) {
    // Empty values last in both directions (MariaDB has no NULLS LAST).
    return `\`${col.key}\` IS NULL, \`${col.key}\` ${query.dir === "asc" ? "ASC" : "DESC"}`;
  }
  return sql.defaultOrder;
}

function selectList(sql: ResourceSql, columns: ColumnDef[]) {
  return columns.map((c) => `${sql.select[c.key]} AS \`${c.key}\``).join(",\n  ");
}

export async function queryResource(resource: ResourceKey, query: ResourceQuery) {
  const sql = SQL[resource];
  const def = getResource(resource);
  const { where, values } = buildWhere(resource, sql, query);
  const group = sql.groupBy ? `GROUP BY ${sql.groupBy}` : "";
  const offset = (query.page - 1) * query.pageSize;

  const rowsSql = `SELECT ${selectList(sql, def.columns)}
FROM ${sql.from}
${where}
${group}
ORDER BY ${orderBy(resource, sql, query)}
LIMIT ${query.pageSize} OFFSET ${offset}`;

  const countSql = sql.groupBy
    ? `SELECT COUNT(*) AS total FROM (SELECT 1 FROM ${sql.from} ${where} ${group}) x`
    : `SELECT COUNT(*) AS total FROM ${sql.from} ${where}`;

  const [rows, count] = await Promise.all([
    executeReadOnly<any[]>(rowsSql, values),
    executeReadOnly<{ total: number }[]>(countSql, values),
  ]);

  return { rows, total: Number(count[0]?.total ?? 0) };
}

export async function exportResource(resource: ResourceKey, query: ResourceQuery) {
  const sql = SQL[resource];
  const def = getResource(resource);
  const { where, values } = buildWhere(resource, sql, query);
  const group = sql.groupBy ? `GROUP BY ${sql.groupBy}` : "";
  const rows = await executeReadOnly<any[]>(
    `SELECT ${selectList(sql, def.columns)} FROM ${sql.from} ${where} ${group}
     ORDER BY ${orderBy(resource, sql, query)} LIMIT ${CSV_MAX_ROWS}`,
    values,
    60
  );
  return { columns: def.columns, rows };
}

export function toCsv(columns: { key: string; label: string }[], rows: any[]) {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(";")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(";"));
  // BOM + ';' so Excel in Spanish locales opens it with accents and columns intact.
  return "﻿" + lines.join("\r\n");
}

export function parseResourceQuery(params: URLSearchParams): ResourceQuery {
  const page = Math.max(1, parseInt(params.get("page") || "1") || 1);
  const size = parseInt(params.get("pageSize") || "25");
  return {
    page,
    pageSize: PAGE_SIZES.includes(size) ? size : 25,
    q: (params.get("q") || "").slice(0, 100),
    sort: params.get("sort") || undefined,
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    params,
  };
}
