import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Sun, CheckSquare, FolderOpen, ArrowRight, Calendar } from 'lucide-react';
import TaskStatusDisplay from '../components/TaskStatusDisplay';
import Loading from '../components/Loading';

interface TodayAssignment {
  id: string;
  task_id: string;
  task_type: string;
  subtask_id: string | null;
  status: string;
  project_id: string | null;
  title: string;
  projectName: string;
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
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data: rawAssignments, error } = await supabase
        .from('task_work_assignments')
        .select('id, task_id, task_type, subtask_id, status, project_id')
        .eq('user_id', user.id)
        .eq('date', today)
        .not('status', 'in', "('completed','in_review','approved')")
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!rawAssignments || rawAssignments.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      const projectIds = [...new Set(rawAssignments.map((a) => a.project_id).filter(Boolean))] as string[];
      const taskIds = rawAssignments.filter((a) => a.task_type === 'task').map((a) => a.task_id);
      const subtaskIds = rawAssignments.filter((a) => a.task_type === 'subtask' && a.subtask_id).map((a) => a.subtask_id!);

      const [projectsRes, tasksRes, subtasksRes] = await Promise.all([
        projectIds.length > 0
          ? supabase.from('projects').select('id, name').in('id', projectIds)
          : { data: [] },
        taskIds.length > 0
          ? supabase.from('tasks').select('id, title, deadline, estimated_duration, project_id').in('id', taskIds)
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
          ? await supabase.from('tasks').select('id, project_id').in('id', subtaskTaskIds)
          : { data: [] };
      const taskToProject = new Map((subtaskTasksRes.data || []).map((t) => [t.id, t.project_id]));

      const subtaskMap = new Map(
        (subtasksRes.data || []).map((s) => {
          const projectId = taskToProject.get(s.task_id);
          return [
            s.id,
            {
              ...s,
              projectName: projectId ? projectMap.get(projectId) || 'Sin proyecto' : 'Sin proyecto',
              project_id: projectId,
            },
          ];
        })
      );

      const enriched: TodayAssignment[] = rawAssignments.map((a) => {
        if (a.task_type === 'subtask' && a.subtask_id) {
          const sub = subtaskMap.get(a.subtask_id);
          return {
            id: a.id,
            task_id: a.task_id,
            task_type: a.task_type,
            subtask_id: a.subtask_id,
            status: a.status,
            project_id: sub?.project_id || a.project_id,
            title: sub?.title || '—',
            projectName: sub?.projectName || projectMap.get(a.project_id || '') || 'Sin proyecto',
            deadline: sub?.deadline || null,
            estimated_duration: sub?.estimated_duration || 0,
          };
        }
        const task = taskMap.get(a.task_id);
        return {
          id: a.id,
          task_id: a.task_id,
          task_type: a.task_type,
          subtask_id: null,
          status: a.status,
          project_id: a.project_id,
          title: task?.title || '—',
          projectName: projectMap.get(a.project_id || '') || 'Sin proyecto',
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

  const groupedByProject = assignments.reduce((acc, a) => {
    const key = a.projectName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {} as Record<string, TodayAssignment[]>);

  const todayStr = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <Loading message="Cargando tu día..." size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
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
          <p className="text-gray-600 mb-2">No tienes tareas asignadas para hoy</p>
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
              {assignments.length !== 1 ? 's' : ''} asignada{assignments.length !== 1 ? 's' : ''} para hoy
            </p>
            <Link
              to="/user/projects/all"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              Gestionar en vista completa
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-6">
            {Object.entries(groupedByProject).map(([projectName, items]) => (
              <div key={projectName} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-gray-800">{projectName}</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <li key={item.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{item.title}</p>
                        {item.deadline && (
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Vence: {format(new Date(item.deadline), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {item.estimated_duration > 0 && (
                          <span className="text-xs text-gray-500">{item.estimated_duration} min</span>
                        )}
                        <TaskStatusDisplay status={item.status} className="text-xs" />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
