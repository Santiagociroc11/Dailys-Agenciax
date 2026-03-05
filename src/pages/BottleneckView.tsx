import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getBottleneckAnalysis, getReviewBottleneckAnalysis, type BottleneckRow, type BottleneckBlockerSubtask, type ReviewBottleneckItem } from '../lib/metrics';
import { supabase } from '../lib/supabase';
import {
  AlertTriangle, Users, ChevronDown, ChevronRight, Download, HelpCircle,
  Clock, CheckCircle2, RotateCcw, Eye, Zap, ArrowRight, FileSearch
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; cls: string; urgency: number }> = {
  pending:     { label: 'Pendiente',    cls: 'bg-gray-100 text-gray-700 border-gray-300',        urgency: 3 },
  assigned:    { label: 'Asignada',     cls: 'bg-blue-50 text-blue-700 border-blue-300',         urgency: 2 },
  in_progress: { label: 'En progreso', cls: 'bg-sky-50 text-sky-700 border-sky-300',            urgency: 1 },
  completed:   { label: 'Completada',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-300', urgency: 0 },
  in_review:   { label: 'En revisión', cls: 'bg-amber-50 text-amber-700 border-amber-300',      urgency: 0 },
  returned:    { label: 'Devuelta',    cls: 'bg-orange-50 text-orange-700 border-orange-300',    urgency: 2 },
  blocked:     { label: 'Bloqueada',   cls: 'bg-red-50 text-red-700 border-red-300',             urgency: 4 },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-300', urgency: 0 };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function getBlockerUrgency(subtasks: BottleneckBlockerSubtask[]): 'critical' | 'warning' | 'low' {
  const maxUrgency = Math.max(...subtasks.map((s) => STATUS_CONFIG[s.status]?.urgency ?? 0));
  if (maxUrgency >= 3) return 'critical';
  if (maxUrgency >= 2) return 'warning';
  return 'low';
}

function UrgencyDot({ level }: { level: 'critical' | 'warning' | 'low' }) {
  const cls = {
    critical: 'bg-red-500',
    warning: 'bg-amber-400',
    low: 'bg-green-400',
  }[level];
  const title = {
    critical: 'Crítico: subtareas sin iniciar o devueltas',
    warning: 'Medio: subtareas asignadas o devueltas',
    low: 'Bajo: subtareas en progreso o revisión',
  }[level];
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} title={title} />;
}

function exportToCSV(data: BottleneckRow[]) {
  const headers = ['Usuario', 'Email', 'Actividades esperando', 'Bloqueado por', 'Bloqueando a'];
  const rows = data.map((r) => [
    r.userName,
    r.userEmail,
    r.waitingCount,
    r.blockedBy.map((b) => `${b.userName} (${b.pendingCount})`).join('; '),
    r.blockedUsers.map((u) => `${u.userName} (${u.waitingCount})`).join('; '),
  ]);
  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuellos_botella_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportReviewToCSV(items: ReviewBottleneckItem[]) {
  const headers = ['Tipo', 'Tarea/Subtarea', 'Proyecto', 'Asignado a', 'Horas esperando', 'Entrada a revisión'];
  const rows = items.map((i) => [
    i.itemType === 'task' ? 'Tarea' : 'Subtarea',
    i.title,
    i.projectName,
    i.assignedToName,
    i.hoursWaiting.toFixed(1),
    new Date(i.enteredReviewAt).toLocaleString('es'),
  ]);
  const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuello_revision_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type ViewMode = 'blocked' | 'blockers';
type BottleneckMode = 'sequence' | 'review';

export default function BottleneckView() {
  const [bottleneckMode, setBottleneckMode] = useState<BottleneckMode>('sequence');
  const [data, setData] = useState<BottleneckRow[]>([]);
  const [reviewData, setReviewData] = useState<{ items: ReviewBottleneckItem[]; summary: { totalInReview: number; avgHoursWaiting: number; maxHoursWaiting: number; affectedProjects: number } } | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('blocked');

  useEffect(() => {
    async function loadProjects() {
      const { data: projData } = await supabase
        .from('projects')
        .select('id, name')
        .eq('is_archived', false)
        .order('name');
      setProjects(projData || []);
    }
    loadProjects();
  }, []);

  useEffect(() => {
    if (bottleneckMode !== 'sequence') return;
    async function load() {
      setLoading(true);
      const result = await getBottleneckAnalysis(projectId || undefined);
      setData(result);
      setLoading(false);
    }
    load();
  }, [projectId, bottleneckMode]);

  useEffect(() => {
    if (bottleneckMode !== 'review') return;
    async function load() {
      setLoading(true);
      const result = await getReviewBottleneckAnalysis(projectId || undefined);
      setReviewData(result);
      setLoading(false);
    }
    load();
  }, [projectId, bottleneckMode]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalBlockedActivities = data.reduce((sum, r) => sum + r.waitingCount, 0);
  const usersWithWaiting = data.filter((r) => r.waitingCount > 0).length;
  const usersBlocking = data.filter((r) => r.blockingCount > 0).length;

  const affectedProjects = useMemo(() => {
    const projects = new Set<string>();
    data.forEach((r) => r.details.forEach((d) => projects.add(d.projectName)));
    return projects.size;
  }, [data]);

  // Vista "bloqueados": ordenados por waitingCount desc
  const sortedBlocked = useMemo(
    () => [...data].filter((r) => r.waitingCount > 0).sort((a, b) => b.waitingCount - a.waitingCount),
    [data]
  );

  // Vista "bloqueadores": ordenados por impacto (a cuántos bloquean) desc
  const sortedBlockers = useMemo(() => {
    const blockers = [...data].filter((r) => r.blockingCount > 0);
    return blockers.sort((a, b) => {
      const impactA = a.blockedUsers.reduce((s, u) => s + u.waitingCount, 0);
      const impactB = b.blockedUsers.reduce((s, u) => s + u.waitingCount, 0);
      return impactB - impactA;
    });
  }, [data]);

  // Detalles agrupados por proyecto > tarea
  const groupDetailsByProject = (details: BottleneckRow['details']) => {
    const grouped = new Map<string, { projectName: string; tasks: Map<string, { taskTitle: string; subtasks: typeof details }> }>();
    details.forEach((d) => {
      const key = d.projectId || d.projectName;
      if (!grouped.has(key)) grouped.set(key, { projectName: d.projectName, tasks: new Map() });
      const proj = grouped.get(key)!;
      const taskKey = d.taskId || d.taskTitle;
      if (!proj.tasks.has(taskKey)) proj.tasks.set(taskKey, { taskTitle: d.taskTitle, subtasks: [] });
      proj.tasks.get(taskKey)!.subtasks.push(d);
    });
    return grouped;
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6 animate-pulse">
        <div>
          <div className="h-8 bg-gray-200 rounded w-64 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-96" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  const activeRows = viewMode === 'blocked' ? sortedBlocked : sortedBlockers;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Cuellos de botella
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-gray-400 hover:text-gray-600"
              title="¿Qué significa esto?"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {bottleneckMode === 'sequence'
              ? 'Identifica quién bloquea a quién en tareas secuenciales y qué tan urgente es cada bloqueo.'
              : 'Tareas en cola de revisión esperando aprobación del admin.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {bottleneckMode === 'sequence' && (
            <button
              onClick={() => exportToCSV(data)}
              disabled={data.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          )}
          {bottleneckMode === 'review' && reviewData && (
            <>
              <button
                onClick={() => exportReviewToCSV(reviewData.items)}
                disabled={reviewData.items.length === 0}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
              <Link
                to="/management"
                className="flex items-center gap-2 px-3 py-2 bg-indigo-100 hover:bg-indigo-200 rounded-lg text-sm font-medium text-indigo-700 transition-colors"
              >
                <FileSearch className="w-4 h-4" />
                Ir a revisión
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Modo: Secuencia | Revisión */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setBottleneckMode('sequence')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            bottleneckMode === 'sequence'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Secuencia
          </span>
        </button>
        <button
          onClick={() => setBottleneckMode('review')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            bottleneckMode === 'review'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <FileSearch className="w-4 h-4" />
            Revisión
          </span>
        </button>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 space-y-2">
          <p className="font-semibold">¿Cómo leer esta vista?</p>
          {bottleneckMode === 'sequence' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div><strong>Actividades esperando</strong>: subtareas pendientes cuyo nivel anterior en la secuencia aún no está aprobado.</div>
              </div>
              <div className="flex gap-2">
                <Eye className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div><strong>Estado del bloqueador</strong>: muestra si la subtarea que bloquea está pendiente (urgente), en progreso (esperando), o en revisión (a punto de resolverse).</div>
              </div>
              <div className="flex gap-2">
                <Zap className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <div><strong>Urgencia</strong>: <span className="inline-block w-2 h-2 rounded-full bg-red-500 mx-0.5" /> Pendiente/devuelta (actuar ya), <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mx-0.5" /> Asignada (seguimiento), <span className="inline-block w-2 h-2 rounded-full bg-green-400 mx-0.5" /> En progreso/revisión (esperar).</div>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <p><strong>Revisión</strong>: tareas o subtareas entregadas que están en estado &quot;En revisión&quot; esperando que un admin las apruebe o devuelva. El tiempo de espera se calcula desde que entraron a revisión.</p>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      {bottleneckMode === 'sequence' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-400">
            <div className="flex items-center justify-between mb-1">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-2xl font-bold text-gray-900">{totalBlockedActivities}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Actividades bloqueadas</p>
            <p className="text-xs text-gray-400 mt-1">Subtareas esperando</p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-400">
            <div className="flex items-center justify-between mb-1">
              <Users className="w-5 h-5 text-amber-400" />
              <span className="text-2xl font-bold text-gray-900">{usersWithWaiting}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Personas bloqueadas</p>
            <p className="text-xs text-gray-400 mt-1">Con trabajo detenido</p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-400">
            <div className="flex items-center justify-between mb-1">
              <Zap className="w-5 h-5 text-orange-400" />
              <span className="text-2xl font-bold text-gray-900">{usersBlocking}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Bloqueadores</p>
            <p className="text-xs text-gray-400 mt-1">Personas que causan espera</p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-400">
            <div className="flex items-center justify-between mb-1">
              <Clock className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold text-gray-900">{affectedProjects}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Proyectos afectados</p>
            <p className="text-xs text-gray-400 mt-1">Con bloqueos activos</p>
          </div>
        </div>
      ) : reviewData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-400">
            <div className="flex items-center justify-between mb-1">
              <FileSearch className="w-5 h-5 text-amber-400" />
              <span className="text-2xl font-bold text-gray-900">{reviewData.summary.totalInReview}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">En cola de revisión</p>
            <p className="text-xs text-gray-400 mt-1">Tareas esperando</p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-400">
            <div className="flex items-center justify-between mb-1">
              <Clock className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold text-gray-900">{reviewData.summary.avgHoursWaiting.toFixed(1)}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tiempo promedio (h)</p>
            <p className="text-xs text-gray-400 mt-1">Horas de espera</p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-400">
            <div className="flex items-center justify-between mb-1">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-2xl font-bold text-gray-900">{reviewData.summary.maxHoursWaiting.toFixed(1)}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tiempo máximo (h)</p>
            <p className="text-xs text-gray-400 mt-1">La más antigua</p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-400">
            <div className="flex items-center justify-between mb-1">
              <Users className="w-5 h-5 text-indigo-400" />
              <span className="text-2xl font-bold text-gray-900">{reviewData.summary.affectedProjects}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Proyectos afectados</p>
            <p className="text-xs text-gray-400 mt-1">Con tareas en revisión</p>
          </div>
        </div>
      )}

      {/* View mode tabs - solo para Secuencia */}
      {bottleneckMode === 'sequence' && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setViewMode('blocked')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'blocked'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Personas bloqueadas
            </span>
          </button>
          <button
            onClick={() => setViewMode('blockers')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'blockers'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              Bloqueadores
            </span>
          </button>
        </div>
      )}

      {/* Main content */}
      {bottleneckMode === 'sequence' ? (
        data.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Sin cuellos de botella</p>
            <p className="text-gray-400 text-sm mt-1">Las tareas secuenciales no tienen actividades esperando por otros.</p>
          </div>
        ) : viewMode === 'blocked' ? (
          <BlockedView rows={sortedBlocked} expandedIds={expandedIds} toggleExpanded={toggleExpanded} groupDetailsByProject={groupDetailsByProject} />
        ) : (
          <BlockersView rows={sortedBlockers} data={data} expandedIds={expandedIds} toggleExpanded={toggleExpanded} />
        )
      ) : reviewData ? (
        reviewData.items.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Sin tareas en revisión</p>
            <p className="text-gray-400 text-sm mt-1">No hay tareas esperando aprobación del admin.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarea / Subtarea</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asignado a</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tiempo esperando</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada a revisión</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reviewData.items.map((item) => (
                  <tr key={`${item.itemType}-${item.itemId}`} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm text-gray-600">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.itemType === 'task' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>
                        {item.itemType === 'task' ? 'Tarea' : 'Subtarea'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{item.title}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{item.projectName}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{item.assignedToName}</td>
                    <td className="px-5 py-3 text-sm font-medium text-amber-600">{item.hoursWaiting.toFixed(1)} h</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{new Date(item.enteredReviewAt).toLocaleString('es')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}

function BlockedView({
  rows,
  expandedIds,
  toggleExpanded,
  groupDetailsByProject,
}: {
  rows: BottleneckRow[];
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  groupDetailsByProject: (details: BottleneckRow['details']) => Map<string, { projectName: string; tasks: Map<string, { taskTitle: string; subtasks: BottleneckRow['details'] }> }>;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const isExpanded = expandedIds.has(row.userId);
        const grouped = groupDetailsByProject(row.details);

        return (
          <div key={row.userId} className="bg-white rounded-lg shadow overflow-hidden">
            {/* Row header */}
            <button
              onClick={() => toggleExpanded(row.userId)}
              className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors text-left"
            >
              <div className="shrink-0">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </div>

              {/* Name + email */}
              <div className="min-w-[160px]">
                <p className="font-semibold text-gray-900 text-sm">{row.userName}</p>
                <p className="text-xs text-gray-400">{row.userEmail}</p>
              </div>

              {/* Waiting count */}
              <div className="flex items-center gap-2 min-w-[130px]">
                <span className="text-xl font-bold text-amber-600">{row.waitingCount}</span>
                <span className="text-xs text-gray-500">actividades<br/>esperando</span>
              </div>

              {/* Blocked by */}
              <div className="flex-1">
                {row.blockedBy.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] text-gray-400 uppercase font-medium mr-1 self-center">Bloqueado por:</span>
                    {row.blockedBy.map((b) => {
                      const urgency = getBlockerUrgency(b.subtasks);
                      return (
                        <span
                          key={b.userId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded-full text-xs font-medium"
                        >
                          <UrgencyDot level={urgency} />
                          {b.userName}
                          <span className="text-red-400">({b.pendingCount})</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </button>

            {/* Expanded details */}
            {isExpanded && row.details.length > 0 && (
              <div className="border-t border-gray-100 bg-gradient-to-b from-amber-50/40 to-white px-5 py-4">
                {Array.from(grouped.entries()).map(([projKey, proj]) => (
                  <div key={projKey} className="mb-4 last:mb-0">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                      {proj.projectName}
                    </p>
                    {Array.from(proj.tasks.entries()).map(([taskKey, task]) => (
                      <div key={taskKey} className="ml-3 mb-3 last:mb-0">
                        <p className="text-xs font-semibold text-gray-700 mb-1.5">{task.taskTitle}</p>
                        <div className="space-y-2 ml-3">
                          {task.subtasks.map((d) => (
                            <div
                              key={d.subtaskId}
                              className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{d.subtaskTitle}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">Nivel {d.sequenceOrder} en la secuencia</p>
                                </div>
                              </div>
                              {d.blockedByUsers.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-100">
                                  <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Esperando que terminen:</p>
                                  <div className="space-y-1">
                                    {d.blockedByUsers.map((b) =>
                                      b.subtasks.map((st) => (
                                        <div key={st.subtaskId} className="flex items-center gap-2 text-xs">
                                          <UrgencyDot level={getBlockerUrgency([st])} />
                                          <span className="font-medium text-gray-700">{b.userName}</span>
                                          <ArrowRight className="w-3 h-3 text-gray-300" />
                                          <span className="text-gray-500 truncate max-w-[200px]">{st.subtaskTitle}</span>
                                          <StatusBadge status={st.status} />
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BlockersView({
  rows,
  data,
  expandedIds,
  toggleExpanded,
}: {
  rows: BottleneckRow[];
  data: BottleneckRow[];
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const isExpanded = expandedIds.has('blocker-' + row.userId);
        const totalImpact = row.blockedUsers.reduce((s, u) => s + u.waitingCount, 0);

        // Encontrar subtareas de este usuario que causan bloqueo (de los details de otros)
        const blockerSubtasks = new Map<string, { subtask: BottleneckBlockerSubtask; affectedUsers: string[] }>();
        data.forEach((otherRow) => {
          if (otherRow.userId === row.userId) return;
          otherRow.blockedBy.forEach((b) => {
            if (b.userId === row.userId) {
              b.subtasks.forEach((st) => {
                if (!blockerSubtasks.has(st.subtaskId)) {
                  blockerSubtasks.set(st.subtaskId, { subtask: st, affectedUsers: [] });
                }
                const entry = blockerSubtasks.get(st.subtaskId)!;
                if (!entry.affectedUsers.includes(otherRow.userName)) {
                  entry.affectedUsers.push(otherRow.userName);
                }
              });
            }
          });
        });

        const urgency = blockerSubtasks.size > 0
          ? getBlockerUrgency(Array.from(blockerSubtasks.values()).map((v) => v.subtask))
          : 'low';

        return (
          <div key={row.userId} className="bg-white rounded-lg shadow overflow-hidden">
            <button
              onClick={() => toggleExpanded('blocker-' + row.userId)}
              className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors text-left"
            >
              <div className="shrink-0">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </div>

              <div className="min-w-[160px]">
                <p className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  {row.userName}
                  <UrgencyDot level={urgency} />
                </p>
                <p className="text-xs text-gray-400">{row.userEmail}</p>
              </div>

              <div className="flex items-center gap-2 min-w-[130px]">
                <span className="text-xl font-bold text-orange-600">{totalImpact}</span>
                <span className="text-xs text-gray-500">actividades<br/>bloqueando</span>
              </div>

              <div className="flex-1">
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-gray-400 uppercase font-medium mr-1 self-center">Bloqueando a:</span>
                  {row.blockedUsers.map((u) => (
                    <span
                      key={u.userId}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-full text-xs font-medium"
                    >
                      {u.userName}
                      <span className="text-orange-400">({u.waitingCount})</span>
                    </span>
                  ))}
                </div>
              </div>
            </button>

            {isExpanded && blockerSubtasks.size > 0 && (
              <div className="border-t border-gray-100 bg-gradient-to-b from-orange-50/40 to-white px-5 py-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Subtareas que causan bloqueo ({blockerSubtasks.size})
                </p>
                <div className="space-y-2">
                  {Array.from(blockerSubtasks.entries()).map(([stId, { subtask, affectedUsers }]) => (
                    <div
                      key={stId}
                      className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm flex items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <UrgencyDot level={getBlockerUrgency([subtask])} />
                          <p className="text-sm font-medium text-gray-900 truncate">{subtask.subtaskTitle}</p>
                          <StatusBadge status={subtask.status} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1 ml-4">
                          Nivel {subtask.sequenceOrder}
                          {' · '}Bloquea a: <span className="text-orange-600 font-medium">{affectedUsers.join(', ')}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
