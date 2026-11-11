import { NextResponse } from "next/server";
import { getSchema } from "@/lib/agendamiento/schema";
import { explorerEnabled, publicError } from "@/lib/security";

export const dynamic = "force-dynamic";

// Lists every table and view with its columns (sensitive columns removed).
// Reveals the database structure, so it only works with ENABLE_EXPLORER=true.
export async function GET() {
  if (!explorerEnabled()) {
    return NextResponse.json({ success: false, error: "El explorador de tablas está deshabilitado." }, { status: 404 });
  }
  try {
    const tables = await getSchema();
    return NextResponse.json({ success: true, tables });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: publicError("api/explorador", error, "No se pudo leer el esquema.") },
      { status: 500 }
    );
  }
}
