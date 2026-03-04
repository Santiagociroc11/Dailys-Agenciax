import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, differenceInDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Sun, CheckSquare, FolderOpen, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import TaskStatusDisplay from '../components/TaskStatusDisplay';
import PhaseBadge from '../components/PhaseBadge';
import { SkeletonMiDia } from '../components/Skeleton';

interface TodayAssignment {
  id: string;
  task_id: string;
  task_type: string;
  subtask_id: string | null;
  status: string;
  project_id: string | null;
  date: string;
  title: string;
  projectName: string;
  phaseName: string | null;
  deadline: string | null;
  estimated_duration: number;
}

export default function MiDiaView() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<TodayAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchTodaysAssignments();
    }
  }, [user]);

  async function fetchTodaysAssignments() {
    if (!user) return;
    try {
      setLoading(true);

      const { data: rawAssignments, error } = await supabase
        .from('task_work_assignments')
        .select('id, task_id, task_type, subtask_id, status, project_id, date')
        .eq('user_id', user.id)
        .not('status', 'in', "('completed','in_review','approved')")
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!rawAssignments || rawAssignments.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      const projectIds = [...new Set(rawAssignments.map((a) => a.project_id).filter(Boolean))] as string[];
      const { data: activeProjects } = await supabase.from('projects').select('id').eq('is_archived', false).in('id', projectIds);
      const activeProjectIds = new Set((activeProjects || []).map((p) => p.id));
      const filteredAssignments = rawAssignments.filter((a) => a.project_id && activeProjectIds.has(a.project_id));
      if (filteredAssignments.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      const projectIdsFiltered = [...new Set(filteredAssignments.map((a) => a.project_id).filter(Boolean))] as string[];
      const taskIds = filteredAssignments.filter((a) => a.task_type === 'task').map((a) => a.task_id);
      const subtaskIds = filteredAssignments.filter((a) => a.task_type === 'subtask' && a.subtask_id).map((a) => a.subtask_id!);

      const [projectsRes, tasksRes, subtasksRes] = await Promise.all([
        projectIdsFiltered.length > 0
          ? supabase.from('projects').select('id, name').in('id', projectIdsFiltered)
          : { data: [] },
        taskIds.length > 0
          ? supabase.from('tasks').select('id, title, deadline, estimated_duration, project_id, phase_id').in('id', taskIds)
          : { data: [] },
        subtaskIds.length > 0
          ? supabase.from('subtasks').select('id, title, deadline, estimated_duration, task_id').in('id', subtaskIds)
          : { data: [] },
      ]);

      const projectMap = new Map((projectsRes.data || []).map((p) => [p.id, p.name]));
      const taskMap = new Map((tasksRes.data || []).map((t) => [t.id, t]));

      const subtaskTaskIds = [...new Set((subtasksRes.data || []).map((s) => s.task_id).filter(Boolean))];
      const subtaskTasksRes =
        subtaskTaskIds.length > 0
          ? await supabase.from('tasks').select('id, project_id, phase_id').in('id', subtaskTaskIds)
          : { data: [] };
      const taskToProject = new Map((subtaskTasksRes.data || []).map((t) => [t.id, t.project_id]));
      const taskToPhaseId = new Map((subtaskTasksRes.data || []).map((t) => [t.id, (t as { phase_id?: string }).phase_id]));

      const phaseIds = new Set<string>();
      (tasksRes.data || []).forEach((t) => { if ((t as { phase_id?: string }).phase_id) phaseIds.add((t as { phase_id?: string }).phase_id!); });
      (subtaskTasksRes.data || []).forEach((t) => { if ((t as { phase_id?: string }).phase_id) phaseIds.add((t as { phase_id?: string }).phase_id!); });
      const { data: phasesData } = phaseIds.size > 0
        ? await supabase.from('phases').select('id, name').in('id', Array.from(phaseIds))
        : { data: [] };
      const phaseMap = new Map((phasesData || []).map((p) => [p.id, p.name]));

      const subtaskMap = new Map(
        (subtasksRes.data || []).map((s) => {
          const projectId = taskToProject.get(s.task_id);
          const phaseId = taskToPhaseId.get(s.task_id);
          return [
            s.id,
            {
              ...s,
              projectName: projectId ? projectMap.get(projectId) || 'Sin proyecto' : 'Sin proyecto',
              project_id: projectId,
              phaseName: phaseId ? phaseMap.get(phaseId) || null : null,
            },
          ];
        })
      );

      const enriched: TodayAssignment[] = filteredAssignments.map((a) => {
        const rawDate = (a as { date?: string }).date;
        if (a.task_type === 'subtask' && a.subtask_id) {
          const sub = subtaskMap.get(a.subtask_id);
          return {
            id: a.id,
            task_id: a.task_id,
            task_type: a.task_type,
            subtask_id: a.subtask_id,
            status: a.status,
            project_id: sub?.project_id || a.project_id,
            date: rawDate || '',
            title: sub?.title || '—',
            projectName: sub?.projectName || projectMap.get(a.project_id || '') || 'Sin proyecto',
            phaseName: sub?.phaseName ?? null,
            deadline: sub?.deadline || null,
            estimated_duration: sub?.estimated_duration || 0,
          };
        }
        const task = taskMap.get(a.task_id);
        const taskPhaseId = (task as { phase_id?: string })?.phase_id;
        return {
          id: a.id,
          task_id: a.task_id,
          task_type: a.task_type,
          subtask_id: null,
          status: a.status,
          project_id: a.project_id,
          date: rawDate || '',
          title: task?.title || '—',
          projectName: projectMap.get(a.project_id || '') || 'Sin proyecto',
          phaseName: taskPhaseId ? phaseMap.get(taskPhaseId) || null : null,
          deadline: task?.deadline || null,
          estimated_duration: task?.estimated_duration || 0,
        };
      });

      setAssignments(enriched);
    } catch (err) {
      console.error('Error cargando Mi día:', err);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayObj = startOfDay(new Date());

  const getDaysSinceAssigned = (dateStr: string) => {
    const d = startOfDay(new Date(dateStr + 'T12:00:00'));
    const days = differenceInDays(todayObj, d);
    return Math.max(0, days);
  };

  type RangeKey = 'hoy' | '1-2' | '3-7' | '8-14' | '15+';
  const RANGES: { key: RangeKey; label: string; minDays: number; maxDays: number }[] = [
    { key: 'hoy', label: 'Hoy', minDays: 0, maxDays: 0 },
    { key: '1-2', label: '1-2 días', minDays: 1, maxDays: 2 },
    { key: '3-7', label: '3-7 días', minDays: 3, maxDays: 7 },
    { key: '8-14', label: '8-14 días', minDays: 8, maxDays: 14 },
    { key: '15+', label: '15+ días', minDays: 15, maxDays: 999 },
  ];

  const getRangeKey = (days: number): RangeKey => {
    const r = RANGES.find((r) => days >= r.minDays && days <= r.maxDays);
    return r?.key ?? '15+';
  };

  const isDelayed = (days: number) => days > 0;

  const groupedByRange = assignments.reduce((acc, a) => {
    const days = getDaysSinceAssigned(a.date || today);
    const key = getRangeKey(days);
    if (!acc[key]) acc[key] = [];
    acc[key].push({ ...a, daysSinceAssigned: days });
    return acc;
  }, {} as Record<RangeKey, (TodayAssignment & { daysSinceAssigned: number })[]>);

  const orderedRangeKeys: RangeKey[] = ['hoy', '1-2', '3-7', '8-14', '15+'];

  const todayStr = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  if (loading) {
    return <SkeletonMiDia />;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Sun className="w-8 h-8 text-amber-500" />
          Mi día
        </h1>
        <p className="text-gray-600 mt-1 capitalize">{todayStr}</p>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <CheckSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">No tienes tareas asignadas pendientes</p>
          <p className="text-sm text-gray-500 mb-6">
            Ve a la vista de proyectos para asignarte tareas o revisar tu trabajo.
          </p>
          <Link
            to="/user/projects/all"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Ver todos los proyectos
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <p className="text-gray-600">
              <span className="font-semibold text-gray-800">{assignments.length}</span> tarea
              {assignments.length !== 1 ? 's' : ''} pendiente{assignments.length !== 1 ? 's' : ''}
            </p>
            <Link
              to="/user/projects/all"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              Gestionar en vista completa
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {orderedRangeKeys.map((rangeKey) => {
              const items = groupedByRange[rangeKey] || [];
              const rangeInfo = RANGES.find((r) => r.key === rangeKey)!;
              const hasDelayed = items.some((i) => isDelayed(i.daysSinceAssigned));
              return (
                <div
                  key={rangeKey}
                  className={`rounded-lg overflow-hidden flex flex-col min-h-[120px] ${
                    hasDelayed ? 'ring-2 ring-red-300 bg-red-50/30' : 'bg-white shadow'
                  }`}
                >
                  <div
                    className={`px-3 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
                      hasDelayed ? 'bg-red-100 border-red-200' : 'bg-gray-50'
                    }`}
                  >
                    <span className={`text-xs font-semibold uppercase tracking-wide ${hasDelayed ? 'text-red-700' : 'text-gray-600'}`}>
                      {rangeInfo.label}
                    </span>
                    <span className="text-xs font-medium text-gray-500">{items.length}</span>
                  </div>
                  <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto max-h-[400px]">
                    {items.length === 0 ? (
                      <li className="px-3 py-4 text-center text-xs text-gray-400">—</li>
                    ) : (
                      items.map((item) => {
                        const delayed = isDelayed(item.daysSinceAssigned);
                        return (
                          <li
                            key={item.id}
                            className={`px-3 py-2.5 flex flex-col gap-1 ${
                              delayed ? 'bg-red-50 border-l-4 border-red-500' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${delayed ? 'text-red-800' : 'text-gray-800'}`}>
                                  {item.title}
                                </p>
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  <PhaseBadge phaseName={item.phaseName} />
                                  <span className={`text-xs ${delayed ? 'text-red-600' : 'text-gray-500'}`}>
                                    {item.projectName}
                                  </span>
                                </div>
                              </div>
                              <TaskStatusDisplay status={item.status} className="text-xs shrink-0" />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              {item.deadline && (
                                <p className={`text-xs flex items-center gap-0.5 ${delayed ? 'text-red-600' : 'text-gray-500'}`}>
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(item.deadline), 'dd/MM')}
                                </p>
                              )}
                              {item.estimated_duration > 0 && (
                                <span className={`text-xs ${delayed ? 'text-red-600' : 'text-gray-500'}`}>
                                  {item.estimated_duration} min
                                </span>
                              )}
                            </div>
                            {delayed && (
                              <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {item.daysSinceAssigned} día{item.daysSinceAssigned !== 1 ? 's' : ''} retrasada
                              </p>
                            )}
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/user/projects/all"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <FolderOpen className="w-5 h-5" />
              Ir a todos los proyectos
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
