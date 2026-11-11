import { NextRequest, NextResponse } from "next/server";
import { executeReadOnly } from "@/lib/db";
import { getTable, quoteIdent } from "@/lib/agendamiento/schema";
import { CSV_MAX_ROWS, PAGE_SIZES, toCsv } from "@/lib/agendamiento/queries";
import { explorerEnabled, publicError } from "@/lib/security";

export const dynamic = "force-dynamic";

// Read-only, paginated rows of any table or view. The table and sort column are
// checked against information_schema; the search text is a bound parameter.
export async function GET(req: NextRequest, { params }: { params: Promise<{ tabla: string }> }) {
  if (!explorerEnabled()) {
    return NextResponse.json({ success: false, error: "El explorador de tablas está deshabilitado." }, { status: 404 });
  }
  const { tabla } = await params;
  const sp = req.nextUrl.searchParams;

  try {
    const table = await getTable(tabla);
    if (!table) {
      return NextResponse.json({ success: false, error: "La tabla no existe." }, { status: 404 });
    }
    if (!table.columns.length) {
      return NextResponse.json({ success: true, columns: [], rows: [], total: 0 });
    }

    const columns = table.columns.map((c) => ({ key: c.name, label: c.name, type: c.displayType }));
    const selectList = table.columns.map((c) => quoteIdent(c.name)).join(", ");
    const from = quoteIdent(table.name);

    const q = (sp.get("q") || "").trim().slice(0, 100);
    const textCols = table.columns.filter((c) => /char|text|enum|date|time/.test(c.dataType));
    const searchCols = textCols.length ? textCols : table.columns;
    const where = q ? `WHERE ${searchCols.map((c) => `CAST(${quoteIdent(c.name)} AS CHAR) LIKE ?`).join(" OR ")}` : "";
    const values = q ? searchCols.map(() => `%${q}%`) : [];

    const sortCol = table.columns.find((c) => c.name === sp.get("sort"));
    const dir = sp.get("dir") === "asc" ? "ASC" : "DESC";
    // Default: newest first by primary key when there is one.
    const pk = table.columns.find((c) => c.key === "PRI");
    const order = sortCol ? `ORDER BY ${quoteIdent(sortCol.name)} ${dir}` : pk ? `ORDER BY ${quoteIdent(pk.name)} DESC` : "";

    if (sp.get("format") === "csv") {
      const rows = await executeReadOnly<any[]>(
        `SELECT ${selectList} FROM ${from} ${where} ${order} LIMIT ${CSV_MAX_ROWS}`,
        values,
        60
      );
      return new NextResponse(toCsv(columns, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${table.name}.csv"`,
        },
      });
    }

    const page = Math.max(1, parseInt(sp.get("page") || "1") || 1);
    const size = parseInt(sp.get("pageSize") || "25");
    const pageSize = PAGE_SIZES.includes(size) ? size : 25;

    const [rows, count] = await Promise.all([
      executeReadOnly<any[]>(
        `SELECT ${selectList} FROM ${from} ${where} ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        values
      ),
      executeReadOnly<{ total: number }[]>(`SELECT COUNT(*) AS total FROM ${from} ${where}`, values),
    ]);

    return NextResponse.json({ success: true, columns, rows, total: Number(count[0]?.total ?? 0) });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: publicError(`api/explorador/${tabla}`, error, "No se pudo consultar la tabla.") },
      { status: 500 }
    );
  }
}
