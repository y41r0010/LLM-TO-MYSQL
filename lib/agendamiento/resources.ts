// Display configuration for each browsable dataset of the agendamiento database.
// Shared by the browser (table, filters) and the server (which owns the SQL in
// lib/agendamiento/queries.ts, keyed by the same resource and column keys).

export type ColumnType =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "percent"
  | "bool"
  | "badge"
  | "longtext";

export interface ColumnDef {
  key: string;
  label: string;
  type?: ColumnType;
  /** Only shown in the row detail panel, not as a table column. */
  hidden?: boolean;
  /** Set false for columns too expensive to sort (correlated subqueries on big tables). */
  sortable?: boolean;
}

/** Where a select filter gets its choices: a static list or a lookup from /api/agendamiento/opciones. */
export type OptionSource =
  | "sedes"
  | "tramites"
  | "estados"
  | "regionales"
  | "grupos"
  | "tiposDoc"
  | "eventos"
  | "auditAcciones"
  | "auditTablas";

export interface FilterDef {
  key: string;
  label: string;
  type: "select" | "daterange";
  options?: OptionSource | { value: string; label: string }[];
}

export interface ResourceDef {
  title: string;
  description: string;
  searchPlaceholder?: string;
  columns: ColumnDef[];
  filters: FilterDef[];
}

const ACTIVO_OPTIONS = [
  { value: "1", label: "Activo" },
  { value: "0", label: "Inactivo" },
];

export const RESOURCES = {
  citas: {
    title: "Citas agendadas",
    description: "Todas las citas tomadas por ciudadanos, con su fecha, sede, trámite y estado.",
    searchPlaceholder: "Buscar por radicado, documento, nombre o correo…",
    columns: [
      { key: "radicado", label: "Radicado" },
      { key: "fecha_cita", label: "Fecha cita", type: "date" },
      { key: "hora", label: "Hora" },
      { key: "sede", label: "Sede" },
      { key: "tramite", label: "Trámite" },
      { key: "estado", label: "Estado", type: "badge" },
      { key: "ciudadano", label: "Ciudadano" },
      { key: "tipo_doc", label: "Tipo documento", hidden: true },
      { key: "documento", label: "Documento" },
      { key: "email", label: "Correo", hidden: true },
      { key: "celular", label: "Celular", hidden: true },
      { key: "beneficiario", label: "Beneficiario", hidden: true },
      { key: "documento_beneficiario", label: "Documento beneficiario", hidden: true },
      { key: "estado_cierre", label: "Cierre", type: "badge" },
      { key: "funcionario", label: "Funcionario", hidden: true },
      { key: "fecha_registro", label: "Registrada", type: "datetime" },
      { key: "observaciones", label: "Observaciones", type: "longtext", hidden: true },
      { key: "observaciones_cierre", label: "Observaciones de cierre", type: "longtext", hidden: true },
      { key: "ip_origen", label: "IP de origen", hidden: true },
    ],
    filters: [
      { key: "sede", label: "Sede", type: "select", options: "sedes" },
      { key: "tramite", label: "Trámite", type: "select", options: "tramites" },
      { key: "estado", label: "Estado", type: "select", options: "estados" },
      { key: "fecha_cita", label: "Fecha de la cita", type: "daterange" },
      { key: "fecha_registro", label: "Fecha de registro", type: "daterange" },
    ],
  },

  disponibilidad: {
    title: "Disponibilidad de cupos",
    description:
      "Cupos publicados por día, sede y trámite, y cuántos tienen una cita vigente (sin contar canceladas).",
    columns: [
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "sede", label: "Sede" },
      { key: "tramite", label: "Trámite" },
      { key: "cupos", label: "Cupos", type: "number" },
      { key: "agendadas", label: "Agendadas", type: "number" },
      { key: "sin_agendar", label: "Sin agendar", type: "number" },
      { key: "ocupacion", label: "Ocupación", type: "percent" },
    ],
    filters: [
      { key: "sede", label: "Sede", type: "select", options: "sedes" },
      { key: "tramite", label: "Trámite", type: "select", options: "tramites" },
      { key: "fecha", label: "Fecha", type: "daterange" },
    ],
  },

  historial: {
    title: "Historial de citas",
    description: "Eventos de cada cita: creación y cancelaciones por el ciudadano o la administración.",
    searchPlaceholder: "Buscar por radicado o documento…",
    columns: [
      { key: "fecha_evento", label: "Fecha", type: "datetime" },
      { key: "evento", label: "Evento", type: "badge" },
      { key: "radicado", label: "Radicado" },
      { key: "tramite", label: "Trámite" },
      { key: "documento", label: "Documento" },
      { key: "ciudadano", label: "Ciudadano" },
      { key: "motivo", label: "Motivo" },
      { key: "metadata", label: "Metadatos", type: "longtext", hidden: true },
    ],
    filters: [
      { key: "evento", label: "Evento", type: "select", options: "eventos" },
      { key: "tramite", label: "Trámite", type: "select", options: "tramites" },
      { key: "fecha", label: "Fecha del evento", type: "daterange" },
    ],
  },

  ciudadanos: {
    title: "Ciudadanos",
    description: "Usuarios registrados en el portal de agendamiento.",
    searchPlaceholder: "Buscar por documento, nombre, correo o celular…",
    columns: [
      { key: "tipo_doc", label: "Tipo doc." },
      { key: "documento", label: "Documento" },
      { key: "nombre", label: "Nombre" },
      { key: "email", label: "Correo" },
      { key: "celular", label: "Celular" },
      { key: "fecha_nacimiento", label: "Fecha de nacimiento", type: "date", hidden: true },
      { key: "genero", label: "Género", hidden: true },
      { key: "email_verificado", label: "Correo verificado", type: "bool" },
      { key: "activo", label: "Activo", type: "bool", hidden: true },
      { key: "citas", label: "Citas", type: "number", sortable: false },
      { key: "beneficiarios", label: "Beneficiarios", type: "number", sortable: false },
      { key: "intentos_fallidos", label: "Intentos de acceso fallidos", type: "number", hidden: true },
      { key: "bloqueado_hasta", label: "Bloqueado hasta", type: "datetime", hidden: true },
      { key: "observaciones", label: "Observaciones", type: "longtext", hidden: true },
      { key: "fecha_registro", label: "Registro", type: "datetime" },
    ],
    filters: [
      { key: "tipo_doc", label: "Tipo de documento", type: "select", options: "tiposDoc" },
      { key: "fecha_registro", label: "Fecha de registro", type: "daterange" },
    ],
  },

  beneficiarios: {
    title: "Beneficiarios",
    description: "Personas registradas a cargo de un ciudadano (por ejemplo, menores de edad).",
    searchPlaceholder: "Buscar por documento o nombre del beneficiario o del titular…",
    columns: [
      { key: "tipo_doc", label: "Tipo doc." },
      { key: "documento", label: "Documento" },
      { key: "nombre", label: "Nombre" },
      { key: "fecha_nacimiento", label: "Nacimiento", type: "date" },
      { key: "parentesco", label: "Parentesco" },
      { key: "titular", label: "Titular" },
      { key: "documento_titular", label: "Documento titular" },
      { key: "genero", label: "Género", hidden: true },
      { key: "discapacidad", label: "Discapacidad", hidden: true },
      { key: "descripcion_discapacidad", label: "Descripción discapacidad", type: "longtext", hidden: true },
      { key: "citas", label: "Citas", type: "number", sortable: false },
      { key: "activo", label: "Activo", type: "bool" },
      { key: "fecha_registro", label: "Registro", type: "datetime" },
    ],
    filters: [{ key: "fecha_registro", label: "Fecha de registro", type: "daterange" }],
  },

  funcionarios: {
    title: "Funcionarios",
    description: "Personal que gestiona las citas en las sedes.",
    searchPlaceholder: "Buscar por nombre, usuario, correo o documento…",
    columns: [
      { key: "nombres", label: "Nombre" },
      { key: "usuario", label: "Usuario" },
      { key: "email", label: "Correo" },
      { key: "documento", label: "Documento", hidden: true },
      { key: "sede", label: "Sede" },
      { key: "regional", label: "Regional" },
      { key: "grupo", label: "Grupo / rol", hidden: true },
      { key: "activo", label: "Activo", type: "bool" },
      { key: "citas_gestionadas", label: "Citas gestionadas", type: "number" },
      { key: "creado", label: "Creado", type: "datetime" },
    ],
    filters: [
      { key: "sede", label: "Sede", type: "select", options: "sedes" },
      { key: "regional", label: "Regional", type: "select", options: "regionales" },
      { key: "activo", label: "Estado", type: "select", options: ACTIVO_OPTIONS },
    ],
  },

  sedes: {
    title: "Sedes (CFSM)",
    description: "Centros de atención con su regional, capacidad, trámites ofrecidos y volumen de citas.",
    searchPlaceholder: "Buscar por nombre, código o dirección…",
    columns: [
      { key: "codigo", label: "Código", type: "number" },
      { key: "sede", label: "Sede" },
      { key: "regional", label: "Regional" },
      { key: "direccion", label: "Dirección" },
      { key: "ventanillas", label: "Ventanillas", type: "number" },
      { key: "tramites_activos", label: "Trámites activos", type: "number" },
      { key: "citas_total", label: "Citas", type: "number" },
      { key: "citas_vigentes", label: "Vigentes", type: "number" },
      { key: "cupos_futuros", label: "Cupos desde hoy", type: "number" },
      { key: "latitud", label: "Latitud", hidden: true },
      { key: "longitud", label: "Longitud", hidden: true },
      { key: "mapa", label: "Mapa", hidden: true },
    ],
    filters: [{ key: "regional", label: "Regional", type: "select", options: "regionales" }],
  },

  regionales: {
    title: "Regionales",
    description: "Agrupación territorial de las sedes.",
    columns: [
      { key: "codigo", label: "Código" },
      { key: "regional", label: "Regional" },
      { key: "estado", label: "Activa", type: "bool" },
      { key: "sedes", label: "Sedes", type: "number" },
      { key: "funcionarios", label: "Funcionarios", type: "number" },
      { key: "citas_total", label: "Citas", type: "number" },
      { key: "citas_vigentes", label: "Vigentes", type: "number" },
      { key: "creada", label: "Creada", type: "datetime", hidden: true },
    ],
    filters: [],
  },

  tramites: {
    title: "Trámites",
    description: "Tipos de trámite que se pueden agendar, en cuántas sedes se ofrecen y su demanda.",
    searchPlaceholder: "Buscar trámite…",
    columns: [
      { key: "codigo", label: "Código", type: "number" },
      { key: "tramite", label: "Trámite" },
      { key: "grupo", label: "Grupo" },
      { key: "estado", label: "Estado", type: "badge" },
      { key: "sedes", label: "Sedes que lo ofrecen", type: "number" },
      { key: "citas_total", label: "Citas", type: "number" },
      { key: "citas_vigentes", label: "Vigentes", type: "number" },
      { key: "canceladas", label: "Canceladas", type: "number" },
      { key: "ultima_cita", label: "Última cita registrada", type: "datetime" },
    ],
    filters: [
      { key: "grupo", label: "Grupo", type: "select", options: "grupos" },
      {
        key: "estado",
        label: "Estado",
        type: "select",
        options: [
          { value: "A", label: "Activo" },
          { value: "I", label: "Inactivo" },
        ],
      },
    ],
  },

  festivos: {
    title: "Días festivos",
    description: "Fechas en las que no se publica agenda.",
    searchPlaceholder: "Buscar festivo…",
    columns: [
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "nombre", label: "Nombre" },
      { key: "descripcion", label: "Descripción" },
      { key: "vigencia", label: "Vigencia", type: "number" },
      { key: "activo", label: "Activo", type: "bool" },
    ],
    filters: [{ key: "fecha", label: "Fecha", type: "daterange" }],
  },

  cargas: {
    title: "Cargas de agenda",
    description: "Ejecuciones del proceso que genera los cupos de cada día.",
    columns: [
      { key: "id_lote", label: "Lote", type: "number" },
      { key: "tipo", label: "Tipo", type: "badge" },
      { key: "fecha_objetivo", label: "Fecha objetivo", type: "date" },
      { key: "fecha_inicio", label: "Desde", type: "date", hidden: true },
      { key: "fecha_fin", label: "Hasta", type: "date", hidden: true },
      { key: "estado", label: "Estado", type: "badge" },
      { key: "filas", label: "Cupos creados", type: "number" },
      { key: "publicado", label: "Publicado", type: "bool" },
      { key: "origen", label: "Origen" },
      { key: "solicitado_por", label: "Solicitado por" },
      { key: "inicio", label: "Inicio", type: "datetime" },
      { key: "fin", label: "Fin", type: "datetime", hidden: true },
      { key: "error", label: "Error", type: "longtext", hidden: true },
    ],
    filters: [
      {
        key: "estado",
        label: "Estado",
        type: "select",
        options: ["RUNNING", "SUCCESS", "FAILED", "SKIPPED", "ERROR"].map((v) => ({ value: v, label: v })),
      },
      {
        key: "tipo",
        label: "Tipo",
        type: "select",
        options: ["SEMANAL", "DIARIO", "RANGO"].map((v) => ({ value: v, label: v })),
      },
      { key: "fecha_objetivo", label: "Fecha objetivo", type: "daterange" },
    ],
  },

  novedades: {
    title: "Cancelaciones por novedad",
    description: "Cancelaciones masivas por cierres o emergencias, con los correos enviados a los ciudadanos.",
    searchPlaceholder: "Buscar por motivo o responsable…",
    columns: [
      { key: "fecha_cita", label: "Fecha afectada", type: "date" },
      { key: "sede", label: "Sede" },
      { key: "tramite", label: "Trámite" },
      { key: "motivo", label: "Motivo" },
      { key: "total_citas", label: "Cupos afectados", type: "number" },
      { key: "citas_agendadas", label: "Citas canceladas", type: "number" },
      { key: "correos_enviados", label: "Correos enviados", type: "number" },
      { key: "correos_fallidos", label: "Correos fallidos", type: "number" },
      { key: "ejecutado_por", label: "Ejecutado por" },
      { key: "fecha_ejecucion", label: "Ejecución", type: "datetime" },
    ],
    filters: [
      { key: "sede", label: "Sede", type: "select", options: "sedes" },
      { key: "fecha_cita", label: "Fecha afectada", type: "daterange" },
    ],
  },

  auditoria: {
    title: "Auditoría",
    description: "Registro de accesos y cambios hechos desde la aplicación de administración.",
    searchPlaceholder: "Buscar por usuario, tabla o detalle…",
    columns: [
      { key: "fecha", label: "Fecha", type: "datetime" },
      { key: "usuario", label: "Usuario" },
      { key: "accion", label: "Acción", type: "badge" },
      { key: "tabla", label: "Tabla" },
      { key: "resumen", label: "Detalle", sortable: false },
      { key: "ip", label: "IP" },
      { key: "descripcion", label: "Detalle completo", type: "longtext", hidden: true },
    ],
    filters: [
      { key: "accion", label: "Acción", type: "select", options: "auditAcciones" },
      { key: "tabla", label: "Tabla", type: "select", options: "auditTablas" },
      { key: "fecha", label: "Fecha", type: "daterange" },
    ],
  },
} satisfies Record<string, ResourceDef>;

export type ResourceKey = keyof typeof RESOURCES;

export function isResourceKey(key: string): key is ResourceKey {
  return Object.prototype.hasOwnProperty.call(RESOURCES, key);
}

export function getResource(key: ResourceKey): ResourceDef {
  return RESOURCES[key];
}

/** Columns that must never be shown or sent to the AI model. */
export const SENSITIVE_COLUMN = /(password|passwd|token|hash|cookie|secret|ext_security_id)/i;
