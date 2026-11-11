import "server-only";
import { executeReadOnly } from "@/lib/db";
import { SENSITIVE_COLUMN, type ColumnType } from "./resources";

// Live description of the database (tables, views, columns), read from
// information_schema and cached. Used by the table explorer and the AI assistant.
// Sensitive columns (passwords, tokens…) are removed here, so neither ever sees them.

export interface SchemaColumn {
  name: string;
  dataType: string;
  columnType: string;
  key: string;
  displayType: ColumnType;
}

export interface SchemaTable {
  name: string;
  isView: boolean;
  rows: number | null;
  columns: SchemaColumn[];
}

const CACHE_MS = 10 * 60 * 1000;
const cache = globalThis as unknown as { agendaSchema?: { at: number; tables: SchemaTable[] } };

function displayType(dataType: string): ColumnType {
  const t = dataType.toLowerCase();
  if (t === "date") return "date";
  if (t === "datetime" || t === "timestamp") return "datetime";
  if (/int|decimal|float|double/.test(t)) return "number";
  if (/text|blob/.test(t)) return "longtext";
  return "text";
}

export async function getSchema(): Promise<SchemaTable[]> {
  if (cache.agendaSchema && Date.now() - cache.agendaSchema.at < CACHE_MS) {
    return cache.agendaSchema.tables;
  }

  const [tables, columns] = await Promise.all([
    executeReadOnly<{ name: string; type: string; rows: number | null }[]>(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS \`rows\`
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME`
    ),
    executeReadOnly<{ t: string; name: string; dataType: string; columnType: string; k: string }[]>(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS name, DATA_TYPE AS dataType, COLUMN_TYPE AS columnType, COLUMN_KEY AS k
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, ORDINAL_POSITION`
    ),
  ]);

  const byTable = new Map<string, SchemaColumn[]>();
  for (const c of columns) {
    if (SENSITIVE_COLUMN.test(c.name)) continue;
    if (!byTable.has(c.t)) byTable.set(c.t, []);
    byTable.get(c.t)!.push({
      name: c.name,
      dataType: c.dataType,
      columnType: c.columnType,
      key: c.k,
      displayType: displayType(c.dataType),
    });
  }

  const result = tables.map((t) => ({
    name: t.name,
    isView: t.type === "VIEW",
    rows: t.type === "VIEW" ? null : Number(t.rows ?? 0),
    columns: byTable.get(t.name) ?? [],
  }));

  cache.agendaSchema = { at: Date.now(), tables: result };
  return result;
}

export async function getTable(name: string): Promise<SchemaTable | undefined> {
  return (await getSchema()).find((t) => t.name === name);
}

/** Backtick-quotes an identifier that is already known to exist in the schema. */
export function quoteIdent(name: string) {
  return "`" + name.replace(/`/g, "``") + "`";
}
