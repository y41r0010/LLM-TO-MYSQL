import { NextResponse } from "next/server";
import { getSchema } from "@/lib/agendamiento/schema";

export const dynamic = "force-dynamic";

// Lists every table and view with its columns (sensitive columns removed).
export async function GET() {
  try {
    const tables = await getSchema();
    return NextResponse.json({ success: true, tables });
  } catch (error: any) {
    console.error("[api/explorador]", error);
    return NextResponse.json(
      { success: false, error: `No se pudo leer el esquema: ${error?.message ?? ""}` },
      { status: 500 }
    );
  }
}
