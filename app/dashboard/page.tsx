"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SqlAssistant } from "@/components/agendamiento/sql-assistant";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  FileText,
  Gauge,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";

type NameValue = { name: string; value: number };

type AgendamientoStats = {
  totals: {
    totalCitas: number;
    citasVigentes: number;
    citasCanceladas: number;
    citasHoy: number;
    totalUsuarios: number;
    usuariosUltimos30: number;
    totalBeneficiarios: number;
    totalSedes: number;
    totalTramites: number;
    cuposFuturos: number;
    ocupacion30Dias: number;
  };
  estados: NameValue[];
  citasPorMes: NameValue[];
  ocupacionDiaria: { fecha: string; dispuestas: number; agendadas: number }[];
  topTramites: NameValue[];
  topSedes: NameValue[];
  porRegional: NameValue[];
  porHora: NameValue[];
  cancelaciones: NameValue[];
  generadoEn: string;
};

const nf = new Intl.NumberFormat("es-CO");
const fmt = (n: number) => nf.format(n);
const pct = (part: number, total: number) =>
  total ? `${((part / total) * 100).toFixed(1)}%` : "0%";

// "2026-05" -> "may 2026"
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "short", year: "numeric" });
}

// "2026-10-23" -> "23 oct"
function dayLabel(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// Shared chart styling: series colors come from CSS tokens so dark mode works.
const SERIES_1 = "var(--viz-1)";
const SERIES_2 = "var(--viz-2)";
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const tooltipProps = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--popover-foreground)",
    fontSize: 13,
  },
  labelStyle: { color: "var(--popover-foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--popover-foreground)" },
  cursor: { fill: "var(--muted)", opacity: 0.6 },
  formatter: (v: number | string) => fmt(Number(v)),
};

function StatTile({
  title,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
}) {
  return (
    <Card className="lift">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="shimmer h-8 w-24 rounded-md" />
        ) : (
          <div className="animate-in fade-in text-2xl font-bold tabular-nums duration-500">{value}</div>
        )}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{loading ? " " : hint}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
      {loading ? "Cargando…" : "Sin datos"}
    </div>
  );
}

// Horizontal ranking bars: one series, so no legend; the card title names it.
function RankingChart({ data, loading, height = 320 }: { data: NameValue[]; loading: boolean; height?: number }) {
  if (!data.length) return <EmptyState loading={loading} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" tick={AXIS_TICK} tickFormatter={fmt} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={190}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 27)}…` : v)}
        />
        <Tooltip {...tooltipProps} />
        <Bar dataKey="value" name="Citas" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<AgendamientoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);


  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      } else {
        setLoadError(data.error || "No se pudieron cargar las estadísticas.");
      }
    } catch {
      setLoadError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const t = stats?.totals;
  const citasPorMes = (stats?.citasPorMes ?? []).map((d) => ({ ...d, name: monthLabel(d.name) }));
  const ocupacionDiaria = (stats?.ocupacionDiaria ?? []).map((d) => ({ ...d, fecha: dayLabel(d.fecha) }));
  const cancelacionesHint = (stats?.cancelaciones ?? [])
    .map((c) => `${c.name.toLowerCase()}: ${fmt(c.value)}`)
    .join(" · ");

  return (
    <div className="flex-1 space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-gradient text-3xl font-bold tracking-tight">Agendamiento de citas</h2>
            <p className="text-sm text-muted-foreground">
              {stats
                ? `Datos de la base de agendamiento · actualizado ${new Date(stats.generadoEn).toLocaleString("es-CO")}`
                : "Estadísticas de la base de agendamiento"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDashboardData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>

        <SqlAssistant compact />
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError} Revisa la conexión SSH y las credenciales en <code>.env.local</code>.
        </div>
      )}

      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          title="Citas agendadas"
          icon={CalendarCheck}
          loading={loading}
          value={fmt(t?.totalCitas ?? 0)}
          hint={`${fmt(t?.citasHoy ?? 0)} registradas hoy`}
        />
        <StatTile
          title="Citas vigentes"
          icon={CalendarClock}
          loading={loading}
          value={fmt(t?.citasVigentes ?? 0)}
          hint={`${pct(t?.citasVigentes ?? 0, t?.totalCitas ?? 0)} del total`}
        />
        <StatTile
          title="Citas canceladas"
          icon={CalendarX}
          loading={loading}
          value={fmt(t?.citasCanceladas ?? 0)}
          hint={`Tasa de cancelación ${pct(t?.citasCanceladas ?? 0, t?.totalCitas ?? 0)}`}
        />
        <StatTile
          title="Ocupación (últimos 30 días)"
          icon={Gauge}
          loading={loading}
          value={`${(t?.ocupacion30Dias ?? 0).toFixed(1)}%`}
          hint={`${fmt(t?.cuposFuturos ?? 0)} cupos desde hoy`}
        />
        <StatTile
          title="Ciudadanos registrados"
          icon={Users}
          loading={loading}
          value={fmt(t?.totalUsuarios ?? 0)}
          hint={`+${fmt(t?.usuariosUltimos30 ?? 0)} en los últimos 30 días`}
        />
        <StatTile
          title="Beneficiarios"
          icon={UserPlus}
          loading={loading}
          value={fmt(t?.totalBeneficiarios ?? 0)}
          hint="Personas a cargo de un ciudadano"
        />
        <StatTile
          title="Sedes (CFSM)"
          icon={Building2}
          loading={loading}
          value={fmt(t?.totalSedes ?? 0)}
          hint={`${fmt(stats?.porRegional.length ?? 0)} regionales con citas`}
        />
        <StatTile
          title="Trámites"
          icon={FileText}
          loading={loading}
          value={fmt(t?.totalTramites ?? 0)}
          hint={cancelacionesHint ? `Cancelaciones ${cancelacionesHint}` : "Tipos de trámite configurados"}
        />
      </div>

      <Tabs defaultValue="resumen" className="space-y-4">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Citas registradas por mes</CardTitle>
                <CardDescription>Según la fecha en que el ciudadano agendó, últimos 12 meses</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                {citasPorMes.length ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={citasPorMes} barCategoryGap={8}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={AXIS_TICK} tickFormatter={fmt} axisLine={false} tickLine={false} width={64} />
                      <Tooltip {...tooltipProps} />
                      <Bar dataKey="value" name="Citas" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState loading={loading} />
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Estado de las citas</CardTitle>
                <CardDescription>Estado actual de cada cita agendada</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <RankingChart data={stats?.estados ?? []} loading={loading} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ocupación diaria</CardTitle>
              <CardDescription>Cupos ofrecidos frente a citas agendadas por día de atención, últimos 30 días</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              {ocupacionDiaria.length ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={ocupacionDiaria} margin={{ right: 24 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="fecha" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis tick={AXIS_TICK} tickFormatter={fmt} axisLine={false} tickLine={false} width={64} />
                    <Tooltip {...tooltipProps} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
                    <Legend wrapperStyle={{ fontSize: 13, color: "var(--foreground)" }} />
                    <Line
                      type="monotone"
                      dataKey="dispuestas"
                      name="Cupos ofrecidos"
                      stroke={SERIES_1}
                      strokeWidth={2}
                      dot={{ r: 3, fill: SERIES_1, strokeWidth: 0 }}
                      activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="agendadas"
                      name="Citas agendadas"
                      stroke={SERIES_2}
                      strokeWidth={2}
                      dot={{ r: 3, fill: SERIES_2, strokeWidth: 0 }}
                      activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState loading={loading} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detalle" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Trámites más solicitados</CardTitle>
                <CardDescription>Top 8 por número de citas agendadas</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <RankingChart data={stats?.topTramites ?? []} loading={loading} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sedes con más citas</CardTitle>
                <CardDescription>Top 8 centros (CFSM) por número de citas agendadas</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <RankingChart data={stats?.topSedes ?? []} loading={loading} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Citas por regional</CardTitle>
                <CardDescription>Total de citas agendadas en las sedes de cada regional</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <RankingChart
                  data={stats?.porRegional ?? []}
                  loading={loading}
                  height={Math.max(220, (stats?.porRegional.length ?? 0) * 32)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Citas por hora de atención</CardTitle>
                <CardDescription>Distribución según la hora de inicio de la cita</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                {stats?.porHora.length ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={stats.porHora} barCategoryGap={2}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={12} />
                      <YAxis tick={AXIS_TICK} tickFormatter={fmt} axisLine={false} tickLine={false} width={64} />
                      <Tooltip {...tooltipProps} />
                      <Bar dataKey="value" name="Citas" fill={SERIES_1} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState loading={loading} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
