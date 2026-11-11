import { NextResponse } from "next/server";
import { executeReadOnly } from "@/lib/db";

export const dynamic = "force-dynamic";

// Health check for monitoring and for verifying a deployment. Reveals nothing
// beyond "the app is up" and "the database answers".
export async function GET() {
  const started = Date.now();
  try {
    await executeReadOnly("SELECT 1", [], 5);
    return NextResponse.json({ ok: true, db: true, ms: Date.now() - started });
  } catch (error) {
    console.error("[api/health]", error);
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
