import { SqlAssistant } from "@/components/agendamiento/sql-assistant";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; h?: string | string[] }>;
}) {
  const { q, h } = await searchParams;
  const initialQuestion = typeof q === "string" ? q.slice(0, 1000) : undefined;
  const historyId = typeof h === "string" ? h.slice(0, 40) : undefined;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="animate-in fade-in slide-in-from-top-2 duration-500">
        <h2 className="text-gradient text-3xl font-bold tracking-tight">Asistente de consultas</h2>
        <p className="text-sm text-muted-foreground">
          Haz cualquier pregunta sobre la base de agendamiento. El asistente escribe la consulta SQL, la ejecuta en modo
          solo lectura y te muestra el resultado con estadísticas y gráficos.
        </p>
      </div>
      <SqlAssistant initialQuestion={initialQuestion} historyId={historyId} />
    </div>
  );
}
