import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClipboardList, Calendar, User, FolderOpen, Filter, Download, Plus } from 'lucide-react';

type AlertaSolicitud = { tipo: string; descripcion: string };

interface SupervisionEntry {
  id: string;
  taskId: string;
  subtaskTitle: string;
  taskTitle: string;
  projectName: string;
  projectId: string;
  phaseId?: string | null;
  userName: string;
  userEmail: string;
  date: string;
  status: string;
  report: string;
  durationMinutes?: number;
  alertasSolicitudes: AlertaSolicitud[];
}

export default function SupervisionLog() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<SupervisionEntry[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('is_archived', false)
        .order('name');
      setProjects(data || []);
    }
    loadProjects();
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [projectId, startDate, endDate]);

  async function fetchEntries() {
    setLoading(true);
    try {
      // Obtener tareas con is_supervision en notes
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title, project_id, phase_id, notes, projects!inner(id, name, is_archived)')
        .eq('projects.is_archived', false);

      const supervisionTasks = (tasksData || []).filter((t: { notes?: unknown; title?: string }) => {
        // Nuevas: marcadas con is_supervision en notes
        if (t.notes) {
          try {
            const notes = typeof t.notes === 'string' ? JSON.parse(t.notes) : t.notes;
            if (notes?.is_supervision) return true;
          } catch {
            /* ignore */
          }
        }
        // Legacy: tareas creadas con el modal "Tarea supervisión" (título suele contener la palabra)
        return /supervisi[oó]n/i.test(t.title || '');
      });

      const filteredTasks = projectId
        ? supervisionTasks.filter((t: { project_id?: string }) => t.project_id === projectId)
        : supervisionTasks;

      const taskIds = filteredTasks.map((t: { id: string }) => t.id);
      const taskMap = new Map(
        filteredTasks.map((t: { id: string; title?: string; project_id?: string; phase_id?: string; projects?: { name?: string } }) => [
          t.id,
          { title: t.title, projectId: t.project_id, phaseId: t.phase_id, projectName: (t.projects as { name?: string })?.name || 'Sin proyecto' },
        ])
      );

      if (taskIds.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const { data: subtasksData } = await supabase
        .from('subtasks')
        .select('id, title, task_id, assigned_to, status, start_date, deadline, notes')
        .in('task_id', taskIds);

      const subtasks = subtasksData || [];
      const userIds = [...new Set(subtasks.map((s: { assigned_to: string }) => s.assigned_to).filter(Boolean))];
      const { data: usersData } = await supabase.from('users').select('id, name, email').in('id', userIds);
      const userMap = new Map(
        (usersData || []).map((u: { id: string; name?: string; email?: string }) => [
          u.id,
          { name: u.name || u.email || u.id, email: u.email || '' },
        ])
      );

      const result: SupervisionEntry[] = [];

      for (const s of subtasks as { id: string; title: string; task_id: string; assigned_to: string; status: string; start_date: string; deadline: string; notes: unknown }[]) {
        const taskInfo = taskMap.get(s.task_id);
        if (!taskInfo) continue;

        const dateStr = s.deadline ? s.deadline.split('T')[0] : s.start_date?.split('T')[0] || '';
        if (dateStr < startDate || dateStr > endDate) continue;

        let report = '';
        let durationMinutes: number | undefined;
        let alertasSolicitudes: AlertaSolicitud[] = [];
        if (s.notes) {
          try {
            const notes = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes;
            report = notes.entregables || notes.notes || notes.descripcion_avance || '';
            durationMinutes = notes.duracion_real;
            if (Array.isArray(notes.alertas_solicitudes)) {
              alertasSolicitudes = notes.alertas_solicitudes.map((a: { tipo?: string; descripcion?: string }) => ({
                tipo: a.tipo || 'solicitud_nueva_tarea',
                descripcion: a.descripcion || '',
              }));
            }
          } catch {
            report = typeof s.notes === 'string' ? s.notes : '';
          }
        }

        const user = userMap.get(s.assigned_to);
        const ti = taskInfo as { title?: string; projectId?: string; phaseId?: string; projectName?: string };

        result.push({
          id: s.id,
          taskId: s.task_id,
          subtaskTitle: s.title,
          taskTitle: ti.title || '',
          projectName: ti.projectName || '',
          projectId: ti.projectId || '',
          phaseId: ti.phaseId ?? null,
          userName: user?.name || 'Sin asignar',
          userEmail: user?.email || '',
          date: dateStr,
          status: s.status,
          report,
          durationMinutes,
          alertasSolicitudes,
        });
      }

      result.sort((a, b) => b.date.localeCompare(a.date));
      setEntries(result);
    } catch (err) {
      console.error('Error cargando bitácora:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    const headers = ['Fecha', 'Proyecto', 'Tarea', 'Checkpoint', 'Usuario', 'Estado', 'Reporte', 'Alertas/Solicitudes', 'Minutos'];
    const rows = entries.map((e) => [
      e.date,
      e.projectName,
      e.taskTitle,
      e.subtaskTitle,
      e.userName,
      e.status,
      e.report.replace(/\n/g, ' ').replace(/,/g, ';'),
      e.alertasSolicitudes.map((a) => `[${a.tipo}] ${a.descripcion}`).join(' | ').replace(/,/g, ';'),
      e.durationMinutes ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bitacora_supervision_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const withReport = entries.filter((e) => e.report.trim().length > 0);
  const withoutReport = entries.filter((e) => !e.report.trim() && ['completed', 'in_review', 'approved'].includes(e.status));

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64 mb-6" />
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-7 h-7" />
            Bitácora de supervisión
          </h1>
          <p className="text-gray-500 mt-1">
            Reportes de actividades de supervisión. Qué se supervisó, hallazgos y observaciones.
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={entries.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <span className="text-gray-500">a</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-400">
          <p className="text-xs text-gray-500 font-medium uppercase">Total checkpoints</p>
          <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-400">
          <p className="text-xs text-gray-500 font-medium uppercase">Con reporte</p>
          <p className="text-2xl font-bold text-green-600">{withReport.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-400">
          <p className="text-xs text-gray-500 font-medium uppercase">Completados sin reporte</p>
          <p className="text-2xl font-bold text-amber-600">{withoutReport.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Proyecto</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Tarea</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Checkpoint</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Usuario</th>
                <th className="px-4 py-3 text-center font-medium text-gray-700">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 min-w-[280px]">Reporte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No hay actividades de supervisión en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {format(new Date(e.date), 'd MMM yyyy', { locale: es })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-700">
                        <FolderOpen className="w-3.5 h-3.5 text-gray-400" />
                        {e.projectName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{e.taskTitle}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{e.subtaskTitle}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        {e.userName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          e.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : e.status === 'in_review'
                              ? 'bg-amber-100 text-amber-800'
                              : e.status === 'completed'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {e.status === 'approved' ? 'Aprobado' : e.status === 'in_review' ? 'En revisión' : e.status === 'completed' ? 'Completado' : e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {e.report ? (
                        <div className="text-gray-700 whitespace-pre-wrap max-w-md">{e.report}</div>
                      ) : (
                        <span className="text-amber-600 text-xs italic">
                          {['completed', 'in_review', 'approved'].includes(e.status) ? 'Sin reporte' : 'Pendiente'}
                        </span>
                      )}
                      {e.alertasSolicitudes.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {e.alertasSolicitudes.map((a, idx) => (
                            <div key={idx} className="flex items-start gap-2 p-2 bg-amber-50 rounded border border-amber-100 text-sm">
                              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-xs ${
                                a.tipo === 'solicitud_nueva_tarea' ? 'bg-blue-100 text-blue-800' :
                                a.tipo === 'problema' ? 'bg-red-100 text-red-800' :
                                'bg-purple-100 text-purple-800'
                              }`}>
                                {a.tipo === 'solicitud_nueva_tarea' ? 'Nueva tarea' : a.tipo === 'problema' ? 'Problema' : 'Recurso'}
                              </span>
                              <span className="flex-1 text-gray-700">{a.descripcion}</span>
                              <button
                                type="button"
                                onClick={() => navigate('/tasks', {
                                  state: {
                                    fromSolicitud: {
                                      descripcion: a.descripcion,
                                      tipo: a.tipo,
                                      project_id: e.projectId || null,
                                      phase_id: e.phaseId || null,
                                    },
                                  },
                                })}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700"
                              >
                                <Plus className="w-3 h-3" />
                                Crear tarea
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {withoutReport.length > 0 && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Nota:</strong> {withoutReport.length} checkpoint{withoutReport.length !== 1 ? 's' : ''} marcado
          {withoutReport.length !== 1 ? 's' : ''} como completado{withoutReport.length !== 1 ? 's' : ''} sin reporte de supervisión.
          Las tareas de supervisión requieren describir qué se supervisó y los hallazgos.
        </div>
      )}
    </div>
  );
}
