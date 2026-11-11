import { notFound } from "next/navigation";
import { Explorer } from "@/components/agendamiento/explorer";
import { explorerEnabled } from "@/lib/security";

// Lists every table of the database: only available with ENABLE_EXPLORER=true.
export const dynamic = "force-dynamic";

export default function Page() {
  if (!explorerEnabled()) notFound();
  return <Explorer />;
}
