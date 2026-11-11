import { NextRequest, NextResponse } from "next/server";
import { isResourceKey } from "@/lib/agendamiento/resources";
import { exportResource, parseResourceQuery, queryResource, toCsv } from "@/lib/agendamiento/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  if (!isResourceKey(resource)) {
    return NextResponse.json({ success: false, error: "Recurso no encontrado." }, { status: 404 });
  }

  const query = parseResourceQuery(req.nextUrl.searchParams);

  try {
    if (req.nextUrl.searchParams.get("format") === "csv") {
      const { columns, rows } = await exportResource(resource, query);
      return new NextResponse(toCsv(columns, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${resource}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const { rows, total } = await queryResource(resource, query);
    return NextResponse.json({ success: true, rows, total, page: query.page, pageSize: query.pageSize });
  } catch (error: any) {
    console.error(`[api/agendamiento/${resource}]`, error);
    return NextResponse.json(
      { success: false, error: `No se pudieron consultar los datos: ${error?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }
}
