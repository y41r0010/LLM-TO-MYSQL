import { NextRequest, NextResponse } from "next/server";
import { LLMService } from "@/lib/llm-service";
import { executeReadOnly } from "@/lib/db";
import { buildSchemaContext } from "@/lib/agendamiento/assistant-context";
import { SENSITIVE_COLUMN } from "@/lib/agendamiento/resources";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Natural-language questions -> one read-only SQL query -> rows + chart hint + summary.

const MAX_ROWS = 1000;

type ChartHint = { tipo: "bar" | "line" | "none"; x?: string; y?: string[] };
type Plan = { sql: string; titulo?: string; explicacion?: string; grafico?: ChartHint };
type HistoryItem = { pregunta: string; sql?: string };

class UserFacingError extends Error {
  constructor(message: string, public sql?: string, public status = 400) {
    super(message);
  }
}

/** Pulls the JSON object out of a model reply, tolerating ```json fences or extra text. */
function parsePlan(text: string): Plan {
  const cleaned = text.replace(/```(?:json|sql)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1));
      return { ...obj, sql: String(obj.sql ?? "").trim() };
    } catch {
      /* fall through: maybe the model answered with bare SQL */
    }
  }
  return { sql: /^\s*(select|with)\b/i.test(cleaned) ? cleaned : "" };
}

/** Only a single SELECT/WITH statement, without file access or sensitive columns. */
function checkSql(sql: string): string {
  let s = sql.trim().replace(/;+\s*$/, "").trim();
  if (!/^(select|with)\b/i.test(s)) {
    throw new UserFacingError("Solo se permiten consultas de lectura (SELECT).", s);
  }
  // A ';' left in the middle means several statements (string literals aside, which is fine to reject).
  if (s.includes(";")) {
    throw new UserFacingError("Solo se permite una consulta a la vez.", s);
  }
  if (/\b(into\s+(outfile|dumpfile)|load_file|sleep\s*\(|benchmark\s*\(|get_lock\s*\(|for\s+update|lock\s+in\s+share\s+mode)\b/i.test(s)) {
    throw new UserFacingError("La consulta usa funciones no permitidas.", s);
  }
  if (/\b(insert|update|delete|replace|drop|alter|create|truncate|grant|revoke|rename|call|handler|load)\s/i.test(s.replace(/'[^']*'/g, "''"))) {
    throw new UserFacingError("Solo se permiten consultas de lectura (SELECT).", s);
  }
  if (SENSITIVE_COLUMN.test(s.replace(/'[^']*'/g, "''"))) {
    throw new UserFacingError("La consulta intenta leer datos sensibles (contraseñas o tokens).", s);
  }
  // Cap the result size unless the query already ends with its own LIMIT.
  if (!/\blimit\s+\d+(\s*(,|offset)\s*\d+)?\s*$/i.test(s)) {
    s = `${s}\nLIMIT ${MAX_ROWS}`;
  }
  return s;
}

// Columns that hold codes, not quantities, even when they look numeric.
const CODE_COLUMN = /(documento|radicado|codigo|^cod_|celular|telefono|cedula|(^|_)nit($|_)|(^|_)ip($|_))/i;

/**
 * SUM()/ROUND() results can arrive as strings ("3835"). Turn a column into numbers
 * when every value is a plain number without leading zeros, so stats and charts work.
 */
function numericStringsToNumbers(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const plain = /^-?(0|[1-9]\d*)(\.\d+)?$/;
  for (const key of Object.keys(rows[0])) {
    if (CODE_COLUMN.test(key)) continue;
    const values = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
    if (values.length && values.some((v) => typeof v === "string") && values.every((v) => typeof v === "number" || (typeof v === "string" && plain.test(v) && v.length < 16))) {
      for (const r of rows) if (typeof r[key] === "string") r[key] = Number(r[key]);
    }
  }
}

function historyText(history: HistoryItem[]) {
  if (!history.length) return "";
  return (
    "Preguntas anteriores de esta conversación (para entender referencias como 'y por sede?'):\n" +
    history.map((h, i) => `${i + 1}. ${h.pregunta}${h.sql ? `\n   SQL: ${h.sql.replace(/\s+/g, " ")}` : ""}`).join("\n") +
    "\n\n"
  );
}

const PLAN_FORMAT = `Responde SOLO con un objeto JSON, sin texto adicional, con esta forma:
{"sql": "<consulta>", "titulo": "<título corto del resultado>", "explicacion": "<una frase sobre qué calcula la consulta>",
 "grafico": {"tipo": "bar" | "line" | "none", "x": "<alias de la columna categoría o fecha>", "y": ["<alias de columnas numéricas>"]}}
Usa "line" para series de tiempo, "bar" para comparar categorías y "none" para listados de registros o un único valor.`;

async function planQuery(question: string, history: HistoryItem[], schema: string): Promise<Plan> {
  const today = new Date().toISOString().slice(0, 10);
  const text = await LLMService.generateText({
    instructions: `Eres un analista experto en SQL. Fecha de hoy: ${today}.\n\n${schema}\n\n${PLAN_FORMAT}`,
    input: `${historyText(history)}Pregunta del usuario: ${question}`,
  });
  return parsePlan(text);
}

async function fixQuery(question: string, failedSql: string, dbError: string, schema: string): Promise<Plan> {
  const text = await LLMService.generateText({
    instructions: `Eres un analista experto en SQL.\n\n${schema}\n\n${PLAN_FORMAT}`,
    input: `Pregunta del usuario: ${question}\n\nEsta consulta falló:\n${failedSql}\n\nError de la base de datos: ${dbError}\n\nCorrige la consulta.`,
  });
  return parsePlan(text);
}

async function summarize(question: string, sql: string, rows: any[], truncated: boolean) {
  const sample = JSON.stringify(rows.slice(0, 40));
  try {
    return await LLMService.generateText({
      instructions:
        "Eres un analista de datos. Responde en español, en 2 a 4 frases, la pregunta del usuario usando solo los datos dados. " +
        "Menciona las cifras más relevantes (formato con separador de miles). No inventes datos ni hables del SQL.",
      input: `Pregunta: ${question}\nFilas devueltas: ${rows.length}${truncated ? " (resultado recortado)" : ""}\nDatos (primeras filas): ${sample}`,
    });
  } catch {
    return ""; // The answer is still useful without the summary.
  }
}

export async function POST(req: NextRequest) {
  let lastSql: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    const question = typeof body.input === "string" ? body.input.trim() : "";
    const history: HistoryItem[] = Array.isArray(body.history)
      ? body.history
          .slice(-3)
          .filter((h: any) => typeof h?.pregunta === "string")
          .map((h: any) => ({ pregunta: String(h.pregunta).slice(0, 500), sql: typeof h.sql === "string" ? h.sql.slice(0, 2000) : undefined }))
      : [];
    if (!question) {
      return NextResponse.json({ error: "Escribe una pregunta." }, { status: 400 });
    }
    if (question.length > 1000) {
      return NextResponse.json({ error: "La pregunta es demasiado larga (máximo 1000 caracteres)." }, { status: 400 });
    }

    const schema = await buildSchemaContext();

    // 1. Question -> SQL plan.
    let plan = await planQuery(question, history, schema);
    if (!plan.sql) {
      return NextResponse.json(
        { error: plan.explicacion || "No pude generar una consulta para esa pregunta. Intenta formularla de otra manera." },
        { status: 422 }
      );
    }

    // 2. Run it read-only; if the database rejects it, let the model fix it once.
    let sql = checkSql(plan.sql);
    lastSql = sql;
    let rows: any[];
    try {
      rows = await executeReadOnly<any[]>(sql, [], 30);
    } catch (err: any) {
      const fixed = await fixQuery(question, sql, err?.message ?? String(err), schema);
      if (!fixed.sql) throw new UserFacingError(`La consulta falló: ${err?.message ?? err}`, sql);
      plan = { ...plan, ...fixed };
      sql = checkSql(fixed.sql);
      lastSql = sql;
      try {
        rows = await executeReadOnly<any[]>(sql, [], 30);
      } catch (err2: any) {
        throw new UserFacingError(`La consulta falló: ${err2?.message ?? err2}`, sql);
      }
    }

    // 3. Drop any sensitive column that slipped through an alias, normalise values.
    const result = (Array.isArray(rows) ? rows : []).map((r) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (SENSITIVE_COLUMN.test(k)) continue;
        out[k] = typeof v === "bigint" ? Number(v) : Buffer.isBuffer(v) ? v.toString("utf8") : v;
      }
      return out;
    });
    numericStringsToNumbers(result);
    const truncated = result.length >= MAX_ROWS;

    // 4. Short answer in words.
    const resumen = await summarize(question, sql, result, truncated);

    return NextResponse.json({
      sql,
      result,
      titulo: plan.titulo || question,
      explicacion: plan.explicacion || "",
      grafico: plan.grafico ?? null,
      resumen,
      truncated,
    });
  } catch (error: any) {
    if (error instanceof UserFacingError) {
      return NextResponse.json({ error: error.message, sql: error.sql ?? lastSql }, { status: error.status });
    }
    console.error("[api/sql-assistant]", error);
    const msg = String(error?.message ?? "");
    const friendly = /api key|401|403|permission/i.test(msg)
      ? "El modelo de IA rechazó la solicitud: revisa LLM_API_KEY en .env.local."
      : /404|model/i.test(msg)
        ? "El modelo de IA configurado no está disponible: revisa LLM_MODEL en .env.local."
        : /429|quota|rate/i.test(msg)
          ? "Se alcanzó el límite de uso del modelo de IA. Intenta de nuevo en un momento."
          : msg || "Error inesperado.";
    return NextResponse.json({ error: friendly, sql: lastSql }, { status: 500 });
  }
}
