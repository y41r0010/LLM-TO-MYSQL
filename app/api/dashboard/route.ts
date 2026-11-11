import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';

// Aggregate statistics for the "agendamiento-citas" database.
// Only counts are returned: no personal data leaves this route.

export const dynamic = 'force-dynamic';

type NameValue = { name: string; value: number };

export async function GET() {
  try {
    const [
      totals,
      estados,
      citasPorMes,
      ocupacionDiaria,
      topTramites,
      topSedes,
      porRegional,
      porHora,
      cancelaciones,
    ] = await Promise.all([
      executeQuery<any[]>(
        `SELECT
           (SELECT COUNT(*) FROM citas_agendadas) AS totalCitas,
           (SELECT COUNT(*) FROM citas_agendadas ca JOIN estados e ON e.id_estado = ca.id_estado_fk
             WHERE e.nombre_estado = 'AGENDADA') AS citasVigentes,
           (SELECT COUNT(*) FROM citas_agendadas ca JOIN estados e ON e.id_estado = ca.id_estado_fk
             WHERE e.nombre_estado LIKE 'CANCELADO%') AS citasCanceladas,
           (SELECT COUNT(*) FROM citas_agendadas WHERE fecha_registro >= CURDATE()) AS citasHoy,
           (SELECT COUNT(*) FROM usuarios) AS totalUsuarios,
           (SELECT COUNT(*) FROM usuarios WHERE fecha_registro >= CURDATE() - INTERVAL 30 DAY) AS usuariosUltimos30,
           (SELECT COUNT(*) FROM usuarios_beneficiarios) AS totalBeneficiarios,
           (SELECT COUNT(*) FROM cfsm) AS totalSedes,
           (SELECT COUNT(*) FROM tramites) AS totalTramites,
           (SELECT COUNT(*) FROM citas_disponibles WHERE fecha_cita >= CURDATE()) AS cuposFuturos`
      ),
      executeQuery<NameValue[]>(
        `SELECT e.nombre_estado AS name, COUNT(*) AS value
           FROM citas_agendadas ca
           JOIN estados e ON e.id_estado = ca.id_estado_fk
          GROUP BY e.id_estado, e.nombre_estado
          ORDER BY value DESC`
      ),
      executeQuery<NameValue[]>(
        `SELECT DATE_FORMAT(fecha_registro, '%Y-%m') AS name, COUNT(*) AS value
           FROM citas_agendadas
          WHERE fecha_registro >= DATE_FORMAT(CURDATE() - INTERVAL 11 MONTH, '%Y-%m-01')
          GROUP BY name
          ORDER BY name`
      ),
      executeQuery<{ fecha: string; dispuestas: number; agendadas: number }[]>(
        `SELECT fecha, SUM(dispuestas) AS dispuestas, SUM(agendadas) AS agendadas
           FROM vista_agendamiento_diario
          WHERE fecha BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() - INTERVAL 1 DAY
          GROUP BY fecha
          ORDER BY fecha`
      ),
      executeQuery<NameValue[]>(
        `SELECT t.tramite AS name, COUNT(*) AS value
           FROM citas_agendadas ca
           JOIN tramites t ON t.id_tipo_tramite = ca.id_tramite_fk
          GROUP BY t.id_tipo_tramite, t.tramite
          ORDER BY value DESC
          LIMIT 8`
      ),
      executeQuery<NameValue[]>(
        `SELECT c.dependencia AS name, COUNT(*) AS value
           FROM citas_agendadas ca
           JOIN cfsm c ON c.id_cfsm = ca.id_cfsm_fk
          GROUP BY c.id_cfsm, c.dependencia
          ORDER BY value DESC
          LIMIT 8`
      ),
      executeQuery<NameValue[]>(
        `SELECT r.nombre_regional AS name, COUNT(*) AS value
           FROM citas_agendadas ca
           JOIN cfsm c ON c.id_cfsm = ca.id_cfsm_fk
           JOIN regionales r ON r.id_regional = c.id_regional_fk
          GROUP BY r.id_regional, r.nombre_regional
          ORDER BY value DESC`
      ),
      executeQuery<NameValue[]>(
        `SELECT DATE_FORMAT(h.hora_inicio, '%H:%i') AS name, COUNT(*) AS value
           FROM citas_agendadas ca
           JOIN citas_disponibles cd ON cd.id_cita_dispo = ca.id_cita_dispo_fk
           JOIN hora_citas h ON h.id_hora = cd.id_hora_fk
          GROUP BY h.hora_inicio
          ORDER BY h.hora_inicio`
      ),
      executeQuery<NameValue[]>(
        `SELECT CASE evento
                  WHEN 'CANCELADA_USUARIO' THEN 'Por el ciudadano'
                  WHEN 'CANCELADA_ADMIN' THEN 'Por administración'
                  ELSE evento END AS name,
                COUNT(*) AS value
           FROM historial_citas
          WHERE evento LIKE 'CANCELADA%'
          GROUP BY evento
          ORDER BY value DESC`
      ),
    ]);

    const toNumbers = (rows: NameValue[]) =>
      rows.map((r) => ({ name: r.name, value: Number(r.value) }));

    const t = totals[0] ?? {};
    const sumDispuestas = ocupacionDiaria.reduce((s, d) => s + Number(d.dispuestas), 0);
    const sumAgendadas = ocupacionDiaria.reduce((s, d) => s + Number(d.agendadas), 0);

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          totalCitas: Number(t.totalCitas ?? 0),
          citasVigentes: Number(t.citasVigentes ?? 0),
          citasCanceladas: Number(t.citasCanceladas ?? 0),
          citasHoy: Number(t.citasHoy ?? 0),
          totalUsuarios: Number(t.totalUsuarios ?? 0),
          usuariosUltimos30: Number(t.usuariosUltimos30 ?? 0),
          totalBeneficiarios: Number(t.totalBeneficiarios ?? 0),
          totalSedes: Number(t.totalSedes ?? 0),
          totalTramites: Number(t.totalTramites ?? 0),
          cuposFuturos: Number(t.cuposFuturos ?? 0),
          ocupacion30Dias: sumDispuestas ? (sumAgendadas / sumDispuestas) * 100 : 0,
        },
        estados: toNumbers(estados),
        citasPorMes: toNumbers(citasPorMes),
        ocupacionDiaria: ocupacionDiaria.map((d) => ({
          fecha: d.fecha,
          dispuestas: Number(d.dispuestas),
          agendadas: Number(d.agendadas),
        })),
        topTramites: toNumbers(topTramites),
        topSedes: toNumbers(topSedes),
        porRegional: toNumbers(porRegional),
        porHora: toNumbers(porHora),
        cancelaciones: toNumbers(cancelaciones),
        generadoEn: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener las estadísticas de agendamiento' },
      { status: 500 }
    );
  }
}
