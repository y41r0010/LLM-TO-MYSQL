import "server-only";
import { getSchema } from "./schema";
import { getEngine } from "@/lib/db";

// Text given to the AI model so it can write correct SQL for this database:
// the live schema plus the business rules that are not visible in it.

// Internal tables of the admin tool, empty helpers, or views that fail to run.
const EXCLUDED_TABLE =
  /^(agendamiento_citasug|webreport|config_dias_horas_presets$|contador$|radicado_consecutivo$|trimestre_2$|vista_citas_agendadas_copy1$|v_citas_estadisticas$)|_settings$/;

export const DOMAIN_NOTES = `
Motor: {{MOTOR}}. Base de datos de agendamiento de citas de trámites migratorios en Colombia.

Relaciones principales (no todas están declaradas como llaves foráneas):
- citas_agendadas (ca) = cada cita tomada por un ciudadano. ca.fecha_registro = cuándo se agendó.
  - Fecha y hora de la cita: JOIN citas_disponibles cd ON cd.id_cita_dispo = ca.id_cita_dispo_fk (cd.fecha_cita),
    JOIN hora_citas h ON h.id_hora = cd.id_hora_fk (h.hora_inicio). Usa LEFT JOIN: algunas citas no tienen cupo asociado.
  - Estado: ca.id_estado_fk -> estados.id_estado (estados.nombre_estado). Valores usados:
    35 = 'AGENDADA' (cita vigente), 12 = 'CANCELADO', 42 = 'CANCELADO POR NOVEDAD', 36 = 'SIN CITA', 37 = 'CITA RESERVADA'.
    Una cita "cancelada" es id_estado_fk IN (12, 42).
  - Cierre/atención: ca.id_estado_cierre_fk -> estados_cierre.id_estado_cierre (nombre).
  - Sede: ca.id_cfsm_fk -> cfsm.id_cfsm. El nombre de la sede es cfsm.dependencia (es la ciudad, p. ej. 'BOGOTA D.C.').
  - Regional: cfsm.id_regional_fk -> regionales.id_regional (nombre_regional).
  - Trámite: ca.id_tramite_fk -> tramites.id_tipo_tramite (tramites.tramite). tramites.estado_tramite_vigente 'A' activo / 'I' inactivo.
    Grupo de trámite: tramites.id_grupo_tramite_fk -> grupo_tramites.id_grupo_tramite.
  - Ciudadano: ca.id_usuario_fk -> usuarios.id_usuario. Beneficiario (opcional): ca.id_beneficiario_fk -> usuarios_beneficiarios.id_beneficiario.
  - Funcionario que gestionó: ca.id_funcionario_fk -> funcionarios.id.
- citas_disponibles (cd) = cupos publicados. cd.fecha_cita, cd.id_hora_fk, cd.id_cfsm_fk (sede), cd.id_tipo_tramite_fk (trámite),
  cd.id_estado_tramite_fk -> estados (estado del cupo: 'EXPIRADO', 'AGENDADA', 'REGISTRADO', 'DISPONIBLE', ...).
  cd.id_lote_carga_fk -> agenda_lote_carga.id_lote (proceso que generó el cupo).
- Carga vs. publicación de cupos (¡no confundir!):
  1. CARGA: el lote crea los cupos en estado 1 'REGISTRADO' (aún NO visibles para el ciudadano).
     cd.fecha_creacion = alc.started_at = hora de CARGA. Nunca la uses como fecha de publicación.
  2. PUBLICACIÓN: un evento de la base pasa los cupos a estado 31 'DISPONIBLE' todos los días a las 17:00
     para la fecha del día siguiente (hay también una publicación semanal). Al publicar, el lote queda con
     alc.estado_publicacion = 1 y alc.updated_at = hora de PUBLICACIÓN.
  - Fecha/hora de publicación de un cupo: JOIN agenda_lote_carga alc ON alc.id_lote = cd.id_lote_carga_fk,
    usa alc.updated_at con alc.estado_publicacion = 1.
  - Tiempo desde la publicación hasta que se tomó la cita: TIMESTAMPDIFF(MINUTE, alc.updated_at, ca.fecha_registro).
  - Cuando el cupo vence sin ser tomado pasa a 23 'EXPIRADO'.
- Ocupación: un cupo está ocupado si tiene una cita en citas_agendadas con id_estado_fk NOT IN (12, 42).
  La vista vista_agendamiento_diario ya lo calcula por día y sede (fecha, id_sede, sede, dispuestas, agendadas, disponibles):
  úsala para preguntas de ocupación/disponibilidad por fecha o sede.
- usuarios = ciudadanos registrados. usuarios.tipo_documento_fk -> tipo_documento.id_tipodoc (nombre_doc);
  usuarios.id_genero_fk -> genero.id_genero (nombre_genero); id_discapacidad_fk -> discapacidades; id_etnia_fk -> etnias.
  Nombre completo: CONCAT_WS(' ', primer_nombre, otros_nombres, primer_apellido, segundo_apellido).
- usuarios_beneficiarios.id_usuario_padre_fk -> usuarios.id_usuario; id_parentesco_fk -> parentescos.id_parentesco.
- funcionarios: id_cfsm_fk -> cfsm, id_regional_fk -> regionales.
- historial_citas: eventos de cada cita (evento = 'CREADA', 'CANCELADA_USUARIO', 'CANCELADA_ADMIN'), fecha_evento,
  id_agendamiento_fk -> citas_agendadas.id_agendamiento.
- cfsm_tramites: qué trámites ofrece cada sede (activo = 1). cfsm_tramites_horas: horarios y número de citas por hora.
- agenda_lote_carga: ejecuciones que generan cupos (estado 'SUCCESS'/'FAILED'/..., inserted_rows).
- cancelaciones_novedad_log: cancelaciones masivas por cierre o emergencia.
- th_tramite_festivo: días festivos sin agenda.
- agendamiento_citas_marzo27_audit: auditoría de la aplicación (datetime, user, \`table\`, action, description).
`.trim();

const RULES = `
Reglas para la consulta:
- Devuelve UNA sola sentencia SELECT (puede empezar con WITH). Nunca INSERT, UPDATE, DELETE, DDL ni varias sentencias.
- Usa sintaxis de {{MOTOR}}. Usa CURDATE()/NOW() para fechas relativas.
- Usa alias claros en español y snake_case para cada columna calculada (p. ej. total_citas, sede, mes, porcentaje_cancelacion).
- Muestra nombres legibles (sede, trámite, estado) haciendo JOIN, no ids internos, salvo que el usuario los pida.
- Para series de tiempo agrupa con DATE_FORMAT(fecha, '%Y-%m') AS mes o DATE(fecha) AS dia y ordena cronológicamente.
- Para rankings ordena de mayor a menor y limita a lo razonable (p. ej. LIMIT 20).
- Para listados de registros agrega LIMIT 200 salvo que el usuario pida otra cantidad.
- Porcentajes: ROUND(100 * parte / NULLIF(total, 0), 1).
- Nunca selecciones contraseñas, tokens ni hashes.
- Si la pregunta no se puede responder con esta base, devuelve sql vacío y explica por qué en "explicacion".
`.trim();

export async function buildSchemaContext(): Promise<string> {
  const [tables, engine] = await Promise.all([getSchema(), getEngine()]);
  const motor = `${engine.name} ${engine.version}`;
  const lines = tables
    .filter((t) => !EXCLUDED_TABLE.test(t.name) && t.columns.length)
    .map((t) => {
      const cols = t.columns.map((c) => `${c.name} ${c.columnType}${c.key === "PRI" ? " PK" : ""}`).join(", ");
      const kind = t.isView ? "VISTA" : `TABLA ~${t.rows} filas`;
      return `- ${t.name} [${kind}]: ${cols}`;
    });
  return `${DOMAIN_NOTES}\n\nEsquema (tablas y vistas disponibles):\n${lines.join("\n")}\n\n${RULES}`.replaceAll("{{MOTOR}}", motor);
}
