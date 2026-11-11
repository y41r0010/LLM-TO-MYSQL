"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryResult, type AssistantAnswer } from "@/components/agendamiento/query-result";
import { getHistoryItem, newHistoryId, saveHistoryItem } from "@/lib/agendamiento/history";

const EXAMPLES = [
  "¿Cuántas citas se agendaron por mes este año?",
  "Top 10 sedes con más citas vigentes",
  "Porcentaje de cancelación por trámite",
  "Ocupación por sede en los últimos 7 días",
  "¿Qué día de la semana se agendan más citas?",
  "Ciudadanos registrados por género",
];

type Entry = { id: string; pregunta: string; answer?: AssistantAnswer; error?: string; sql?: string };

const LOADING_STEPS = ["Entendiendo la pregunta…", "Escribiendo la consulta SQL…", "Consultando la base de datos…", "Analizando el resultado…"];

function LoadingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-4 py-2" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <span key={step} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          {LOADING_STEPS[step]}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer h-20 rounded-lg" />
        ))}
      </div>
      <div className="shimmer h-48 rounded-lg" />
    </div>
  );
}

export function SqlAssistant({
  compact = false,
  initialQuestion,
  historyId,
}: {
  compact?: boolean;
  initialQuestion?: string;
  /** Opens a saved question from the history (sidebar link ?h=...). */
  historyId?: string;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setInput("");
    const id = newHistoryId();
    // Last successful questions give the model context for follow-ups ("¿y por sede?").
    const history = entries
      .filter((e) => e.answer)
      .slice(0, 3)
      .reverse()
      .map((e) => ({ pregunta: e.pregunta, sql: e.answer!.sql }));
    setEntries((prev) => [{ id, pregunta: q }, ...prev.filter((e) => e.id !== id)].slice(0, 6));

    let entry: Entry;
    try {
      const res = await fetch("/api/sql-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: q, history }),
      });
      // The body can be empty if the server crashes; never let res.json() throw here.
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        /* not JSON */
      }
      if (!data) {
        entry = { id, pregunta: q, error: `El servidor respondió ${res.status} sin un resultado válido. Revisa la terminal donde corre "npm run dev".` };
      } else if (!res.ok || data.error) {
        entry = { id, pregunta: q, error: data.error || `Error ${res.status}`, sql: data.sql };
      } else {
        entry = { id, pregunta: q, answer: { pregunta: q, ...data } };
      }
    } catch (err: any) {
      entry = { id, pregunta: q, error: err?.message || "No se pudo conectar con el servidor." };
    }
    setEntries((prev) => prev.map((e) => (e.id === id ? entry : e)));
    setLoading(false);
    saveHistoryItem({ id, pregunta: q, createdAt: Date.now(), answer: entry.answer, error: entry.error });
    // On the assistant page, point the URL at this entry so the sidebar highlights it
    // and a reload reopens it instead of asking again.
    if (!compact) window.history.replaceState(null, "", `/dashboard/asistente?h=${id}`);
  }

  // /dashboard/asistente?q=... runs that question on load (shareable links).
  const askedInitial = useRef(false);
  useEffect(() => {
    if (initialQuestion && !askedInitial.current) {
      askedInitial.current = true;
      ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  // Sidebar history link: show the saved answer at the top.
  useEffect(() => {
    if (!historyId) return;
    const item = getHistoryItem(historyId);
    if (!item) return;
    setEntries((prev) => [
      { id: item.id, pregunta: item.pregunta, answer: item.answer, error: item.error },
      ...prev.filter((e) => e.id !== item.id),
    ].slice(0, 6));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [historyId]);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="ask-box group relative rounded-xl"
      >
        <Sparkles className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-primary transition-transform duration-300 group-focus-within:rotate-12 group-focus-within:scale-110" />
        <Input
          type="text"
          placeholder="Pregunta lo que quieras sobre las citas, sedes, trámites, ciudadanos…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="relative h-14 rounded-xl border-transparent bg-card pl-12 dark:bg-card pr-16 text-base shadow-sm md:text-lg"
          aria-label="Pregunta en lenguaje natural"
          disabled={loading}
          maxLength={1000}
        />
        <Button
          type="submit"
          size="icon"
          className="absolute right-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
          aria-label="Enviar pregunta"
          disabled={!input.trim() || loading}
        >
          {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </form>

      {entries.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.slice(0, compact ? 4 : EXAMPLES.length).map((ex, i) => (
            <button
              key={ex}
              type="button"
              onClick={() => ask(ex)}
              style={{ animationDelay: `${i * 60}ms` }}
              className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {entries.map((e, i) => (
        <Card
          key={e.id}
          className={`animate-in fade-in slide-in-from-bottom-4 duration-500 ${i > 0 ? "opacity-90" : "border-primary/20 shadow-md"}`}
        >
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Pregunta</p>
              <CardTitle className="text-lg">{e.answer?.titulo || e.pregunta}</CardTitle>
              {e.answer?.titulo && e.answer.titulo !== e.pregunta && (
                <p className="text-sm text-muted-foreground">{e.pregunta}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Cerrar resultado"
              title="Cerrar (sigue en el historial)"
              onClick={() => setEntries((prev) => prev.filter((x) => x.id !== e.id))}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {!e.answer && !e.error ? (
              <LoadingState />
            ) : e.error ? (
              <div className="space-y-2 animate-in fade-in duration-300">
                <p className="text-sm text-destructive">{e.error}</p>
                {e.sql && (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{e.sql}</pre>
                )}
                <Button variant="outline" size="sm" onClick={() => ask(e.pregunta)} disabled={loading}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <div className="animate-in fade-in duration-500">
                <QueryResult answer={e.answer!} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
