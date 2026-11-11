import "server-only";

// Settings that change what the panel reveals. Defaults are the safe choice in
// production (`next build` + `next start`); development keeps the debug details.

const isProduction = process.env.NODE_ENV === "production";

function flag(name: string, fallback: boolean) {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

/** Show the generated SQL in the assistant (reveals table and column names). */
export const showSql = () => flag("ASSISTANT_SHOW_SQL", !isProduction);

/** The table explorer lists every table and column, so it is off unless enabled. */
export const explorerEnabled = () => flag("ENABLE_EXPLORER", false);

/**
 * Message safe to send to the browser. Database/driver errors can contain the
 * host, the DB user or table names, so in production they are only logged.
 */
export function publicError(context: string, error: unknown, fallback: string) {
  console.error(`[${context}]`, error);
  if (isProduction) return fallback;
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return msg ? `${fallback} (${msg})` : fallback;
}
