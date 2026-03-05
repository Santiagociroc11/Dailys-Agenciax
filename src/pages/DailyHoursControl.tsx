import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Clock, AlertTriangle, CheckCircle2, Users, TrendingUp, ChevronDown, ChevronUp, RotateCcw, LogIn } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DailyHoursUser {
  userId: string;
  userName: string;
  userEmail: string;
  totalMinutes: number;
  assignedTodayMinutes: number;
  extraMinutes: number;
  extraCount: number;
  reworkMinutes: number;
  taskCount: number;
  assignedTodayCount: number;
  actualMinutesToday: number;
  overdueCount: number;
  overdueMinutes: number;
  reworkCount: number;
  availableCount: number; // Subtareas que puede trabajar ahora (no bloqueadas por secuencia)
}

type StatusFilter = 'all' | 'ok' | 'behind' | 'overdue';

const TARGET_HOURS_PER_DAY = 8;
const TARGET_MINUTES_PER_DAY = TARGET_HOURS_PER_DAY * 60;

function fmtH(minutes: number) {
  return (minutes / 60).toFixed(1);
}

function StatusBadge({ status, deficit, deficitHours }: { status: 'ok' | 'behind' | 'idle' | 'overdue'; deficit?: number; deficitHours?: string }) {
  const map = {
    ok: { label: 'En meta', cls: 'bg-green-50 text-green-700 border-green-200' },
    behind: { label: 'Por debajo', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    idle: { label: 'Sin planificar', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    overdue: { label: 'Con retrasos', cls: 'bg-red-50 text-red-700 border-red-200' },
  };
  const { label, cls } = map[status];
  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <span className={`text-xs font-medium px-2.5 py-1 rounded-md border ${cls}`}>{label}</span>
      {deficit !== undefined && deficit > 0 && deficitHours && (
        <span className="text-[11px] text-gray-500 font-medium">Faltan {deficitHours}h</span>
      )}
    </div>
  );
}

function getUserStatus(u: DailyHoursUser): 'ok' | 'behind' | 'idle' | 'overdue' {
  if (u.overdueCount > 0) return 'overdue';
  if (u.totalMinutes >= TARGET_MINUTES_PER_DAY) return 'ok';
  if (u.totalMinutes === 0) return 'idle';
  return 'behind';
}

interface DailyHoursControlProps {
  embedded?: boolean;
}

export default function DailyHoursControl({ embedded }: DailyHoursControlProps) {
  const { isAdmin, user: currentUser, impersonateUser } = useAuth();
  const [dailyHoursControl, setDailyHoursControl] = useState<DailyHoursUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<'status' | 'name' | 'hours'>('status');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    fetchDailyHoursControl();
  }, []);

  async function fetchDailyHoursControl() {
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todayStart = new Date(todayStr + 'T00:00:00');
      const todayEnd = new Date(todayStr + 'T23:59:59.999');

      const { data: activeProjects } = await supabase.from('projects').select('id').eq('is_archived', false);
      const activeProjectIds = new Set((activeProjects || []).map((p) => p.id));

      const { data: users } = await supabase.from('users').select('id, name, email').not('is_active', 'eq', false);
      const userList = users || [];

      const todayStartISO = todayStart.toISOString();
      const todayEndISO = todayEnd.toISOString();

      const [
        { data: todayAssignments, error },
        { data: overdueAssignments, error: overdueError },
        { data: reworkRecords, error: reworkError },
        { data: workEvents, error: workEventsError },
        { data: reworkSessions, error: reworkSessionsError },
      ] = await Promise.all([
        supabase
          .from('task_work_assignments')
          .select('id, user_id, date, project_id, estimated_duration, actual_duration, created_at')
          .eq('date', todayStr),
        supabase
          .from('task_work_assignments')
          .select('user_id, date, project_id, estimated_duration')
          .lt('date', todayStr)
          .not('status', 'in', "('completed','in_review','approved')"),
        supabase
          .from('status_history')
          .select('changed_by, task_id, subtask_id')
          .eq('previous_status', 'returned')
          .in('new_status', ['completed', 'in_review'])
          .gte('changed_at', todayStartISO)
          .lte('changed_at', todayEndISO),
        supabase
          .from('work_events')
          .select('user_id, date, project_id, start_time, end_time')
          .eq('date', todayStr),
        supabase
          .from('work_sessions')
          .select('assignment_id, duration_minutes')
          .eq('session_type', 'completion')
          .gte('createdAt', todayStartISO)
          .lte('createdAt', todayEndISO),
      ]);

      if (error) throw error;
      if (overdueError) console.warn('Error cargando retrasadas:', overdueError);
      if (reworkError) console.warn('Error cargando retrabajos:', reworkError);
      if (workEventsError) console.warn('Error cargando actividades extras:', workEventsError);
      if (reworkSessionsError) console.warn('Error cargando tiempo de retrabajos:', reworkSessionsError);

      const filteredAssignments =
        activeProjectIds.size === 0
          ? (todayAssignments || [])
          : (todayAssignments || []).filter(
              (a: { project_id?: string | null }) =>
                !a.project_id || activeProjectIds.has(a.project_id)
            );

      const filteredOverdue =
        activeProjectIds.size === 0
          ? (overdueAssignments || [])
          : (overdueAssignments || []).filter(
              (a: { project_id?: string | null }) =>
                !a.project_id || activeProjectIds.has(a.project_id)
            );

      const filteredWorkEvents =
        activeProjectIds.size === 0
          ? (workEvents || [])
          : (workEvents || []).filter(
              (e: { project_id?: string | null }) =>
                !e.project_id || activeProjectIds.has(e.project_id)
            );

      const byUser = new Map<string, { total: number; assignedToday: number; extra: number; extraCount: number; rework: number; count: number; assignedTodayCount: number; actual: number; overdueCount: number; overdueMinutes: number; reworkCount: number; availableCount: number }>();

      userList.forEach((u) => {
        byUser.set(u.id, { total: 0, assignedToday: 0, extra: 0, extraCount: 0, rework: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0, reworkCount: 0, availableCount: 0 });
      });

      filteredAssignments.forEach((a: { user_id: string; estimated_duration?: number; actual_duration?: number | null; created_at?: string }) => {
        const uid = a.user_id;
        if (!byUser.has(uid)) {
          byUser.set(uid, { total: 0, assignedToday: 0, extra: 0, extraCount: 0, rework: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0, reworkCount: 0, availableCount: 0 });
        }
        const row = byUser.get(uid)!;
        const est = a.estimated_duration ?? 0;
        const actual = a.actual_duration ?? 0;

        row.total += est;
        row.count += 1;
        row.actual += actual;

        const createdAt = a.created_at ? new Date(a.created_at) : null;
        if (createdAt && createdAt >= todayStart && createdAt <= todayEnd) {
          row.assignedToday += est;
          row.assignedTodayCount += 1;
        }
      });

      filteredWorkEvents.forEach((e: { user_id: string; start_time: string; end_time: string }) => {
        const uid = e.user_id;
        if (!byUser.has(uid)) {
          byUser.set(uid, { total: 0, assignedToday: 0, extra: 0, extraCount: 0, rework: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0, reworkCount: 0, availableCount: 0 });
        }
        const row = byUser.get(uid)!;
        const [sh, sm] = (e.start_time || '00:00').split(':').map(Number);
        const [eh, em] = (e.end_time || '00:00').split(':').map(Number);
        const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
        row.extra += Math.max(0, durationMinutes);
        row.extraCount += 1;
      });

      filteredOverdue.forEach((a: { user_id: string; estimated_duration?: number }) => {
        const uid = a.user_id;
        if (!byUser.has(uid)) {
          byUser.set(uid, { total: 0, assignedToday: 0, extra: 0, extraCount: 0, rework: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0, reworkCount: 0, availableCount: 0 });
        }
        const row = byUser.get(uid)!;
        row.overdueCount += 1;
        row.overdueMinutes += a.estimated_duration ?? 0;
      });

      const reworkList = (reworkRecords || []) as { changed_by?: string | null; task_id?: string | null; subtask_id?: string | null }[];
      if (reworkList.length > 0 && activeProjectIds.size > 0) {
        const taskIds = [...new Set(reworkList.map((r) => r.task_id).filter(Boolean))] as string[];
        const subtaskIds = [...new Set(reworkList.map((r) => r.subtask_id).filter(Boolean))] as string[];
        const projectByTask = new Map<string, string>();
        const projectBySubtask = new Map<string, string>();

        if (taskIds.length > 0) {
          const { data: tasksData } = await supabase.from('tasks').select('id, project_id').in('id', taskIds);
          (tasksData || []).forEach((t: { id: string; project_id?: string | null }) => {
            if (t.project_id) projectByTask.set(t.id, t.project_id);
          });
        }
        if (subtaskIds.length > 0) {
          const { data: subsData } = await supabase.from('subtasks').select('id, task_id').in('id', subtaskIds);
          const parentTaskIds = [...new Set((subsData || []).map((s: { task_id: string }) => s.task_id).filter(Boolean))];
          if (parentTaskIds.length > 0) {
            const { data: parentTasks } = await supabase.from('tasks').select('id, project_id').in('id', parentTaskIds);
            const taskToProject = new Map((parentTasks || []).map((t: { id: string; project_id?: string | null }) => [t.id, t.project_id]));
            (subsData || []).forEach((s: { id: string; task_id: string }) => {
              const pid = taskToProject.get(s.task_id);
              if (pid) projectBySubtask.set(s.id, pid);
            });
          }
        }

        const filteredRework = reworkList.filter((r) => {
          const pid = r.task_id ? projectByTask.get(r.task_id) : r.subtask_id ? projectBySubtask.get(r.subtask_id) : null;
          return pid && activeProjectIds.has(pid);
        });

        filteredRework.forEach((r) => {
          const uid = r.changed_by;
          if (!uid) return;
          if (!byUser.has(uid)) {
            byUser.set(uid, { total: 0, assignedToday: 0, extra: 0, extraCount: 0, rework: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0, reworkCount: 0, availableCount: 0 });
          }
          byUser.get(uid)!.reworkCount += 1;
        });
      } else if (reworkList.length > 0 && activeProjectIds.size === 0) {
        reworkList.forEach((r) => {
          const uid = r.changed_by;
          if (!uid) return;
          if (!byUser.has(uid)) {
            byUser.set(uid, { total: 0, assignedToday: 0, extra: 0, extraCount: 0, rework: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0, reworkCount: 0, availableCount: 0 });
          }
          byUser.get(uid)!.reworkCount += 1;
        });
      }

      // Sumar tiempo de retrabajos hechos hoy (work_sessions completion para asignaciones de días anteriores)
      const sessionsList = (reworkSessions || []) as { assignment_id: string; duration_minutes?: number }[];
      if (sessionsList.length > 0) {
        const assignmentIds = [...new Set(sessionsList.map((s) => s.assignment_id))];
        const { data: reworkAssignments } = await supabase
          .from('task_work_assignments')
          .select('id, user_id, date, project_id')
          .in('id', assignmentIds)
          .lt('date', todayStr);

        const validAssignmentUsers = new Map<string, string>();
        (reworkAssignments || []).forEach((a: { id: string; user_id: string; project_id?: string | null }) => {
          if (activeProjectIds.size === 0 || !a.project_id || activeProjectIds.has(a.project_id)) {
            validAssignmentUsers.set(a.id, a.user_id);
          }
        });

        sessionsList.forEach((s) => {
          const uid = validAssignmentUsers.get(s.assignment_id);
          if (!uid) return;
          if (!byUser.has(uid)) {
            byUser.set(uid, { total: 0, assignedToday: 0, extra: 0, extraCount: 0, rework: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0, reworkCount: 0, availableCount: 0 });
          }
          byUser.get(uid)!.rework += s.duration_minutes ?? 0;
        });
      }

      // Actividades disponibles: subtareas que el usuario puede trabajar ahora (no bloqueadas por secuencia)
      const workableStatuses = ['pending', 'in_progress', 'in_review', 'returned', 'assigned'];
      const { data: availableSubtasksData } = await supabase
        .from('subtasks')
        .select(`
          id, task_id, assigned_to, status, sequence_order,
          tasks!inner(id, is_sequential, project_id, projects!inner(is_archived))
        `)
        .in('assigned_to', userList.map((u) => u.id))
        .in('status', workableStatuses);

      const workableSubtasks = (availableSubtasksData || []).filter(
        (s: { tasks?: { projects?: { is_archived?: boolean }; project_id?: string } }) => {
          const t = s.tasks as { projects?: { is_archived?: boolean }; project_id?: string } | undefined;
          if (t?.projects?.is_archived) return false;
          if (activeProjectIds.size > 0 && t?.project_id && !activeProjectIds.has(t.project_id)) return false;
          return true;
        }
      );

      const taskIdsForSeq = [...new Set(workableSubtasks.map((s: { task_id: string }) => s.task_id))];
      const { data: tasksSeqData } = await supabase.from('tasks').select('id, is_sequential').in('id', taskIdsForSeq);
      const taskSeqMap = new Map((tasksSeqData || []).map((t: { id: string; is_sequential?: boolean }) => [t.id, t.is_sequential ?? false]));

      // Obtener todas las subtareas de esos tasks para verificar dependencias secuenciales
      const { data: allSubsData } = await supabase.from('subtasks').select('task_id, sequence_order, status').in('task_id', taskIdsForSeq);
      const allSubsByTask = new Map<string, { sequence_order: number; status: string }[]>();
      (allSubsData || []).forEach((st: { task_id: string; sequence_order?: number; status: string }) => {
        const list = allSubsByTask.get(st.task_id) || [];
        list.push({ sequence_order: st.sequence_order ?? 0, status: st.status });
        allSubsByTask.set(st.task_id, list);
      });

      workableSubtasks.forEach((s: { assigned_to?: string; task_id: string; sequence_order?: number; tasks?: { is_sequential?: boolean } }) => {
        const uid = s.assigned_to;
        if (!uid || !byUser.has(uid)) return;
        let isAvailable = true;
        if (taskSeqMap.get(s.task_id) && (s.sequence_order ?? 0) > 1) {
          const taskSubs = allSubsByTask.get(s.task_id) || [];
          const groupedByOrder = new Map<number, typeof taskSubs>();
          taskSubs.forEach((st) => {
            const order = st.sequence_order;
            if (!groupedByOrder.has(order)) groupedByOrder.set(order, []);
            groupedByOrder.get(order)!.push(st);
          });
          const sortedOrders = Array.from(groupedByOrder.keys()).sort((a, b) => a - b);
          for (const prevOrder of sortedOrders) {
            if (prevOrder >= (s.sequence_order ?? 0)) break;
            const prevLevel = groupedByOrder.get(prevOrder) || [];
            if (!prevLevel.every((st) => st.status === 'approved')) {
              isAvailable = false;
              break;
            }
          }
        }
        if (isAvailable) byUser.get(uid)!.availableCount += 1;
      });

      const result: DailyHoursUser[] = Array.from(byUser.entries()).map(([uid, data]) => {
        const u = userList.find((u) => u.id === uid);
        return {
        userId: uid,
        userName: u?.name || u?.email || uid,
        userEmail: u?.email || '',
        totalMinutes: data.total + data.extra + data.rework + data.overdueMinutes,
        assignedTodayMinutes: data.assignedToday,
        extraMinutes: data.extra,
        extraCount: data.extraCount,
        reworkMinutes: data.rework,
        taskCount: data.count,
        assignedTodayCount: data.assignedTodayCount,
        actualMinutesToday: data.actual,
        overdueCount: data.overdueCount,
        overdueMinutes: data.overdueMinutes,
        reworkCount: data.reworkCount,
        availableCount: data.availableCount,
      };
      });

      setDailyHoursControl(result);
    } catch (e) {
      console.error('Error fetching daily hours control:', e);
      setDailyHoursControl([]);
    } finally {
      setLoading(false);
    }
  }

  const countOk = dailyHoursControl.filter((u) => getUserStatus(u) === 'ok').length;
  const countBehind = dailyHoursControl.filter((u) => getUserStatus(u) === 'behind' || getUserStatus(u) === 'idle').length;
  const countOverdue = dailyHoursControl.filter((u) => getUserStatus(u) === 'overdue').length;
  const totalPlanned = dailyHoursControl.reduce((s, u) => s + u.totalMinutes, 0);
  const totalOverdueItems = dailyHoursControl.reduce((s, u) => s + u.overdueCount, 0);
  const totalReworkToday = dailyHoursControl.reduce((s, u) => s + u.reworkCount, 0);

  const statusPriority = { overdue: 0, idle: 1, behind: 2, ok: 3 };

  const filteredUsers = dailyHoursControl.filter((u) => {
    if (filter === 'all') return true;
    const st = getUserStatus(u);
    if (filter === 'ok') return st === 'ok';
    if (filter === 'behind') return st === 'behind' || st === 'idle';
    if (filter === 'overdue') return st === 'overdue';
    return true;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'status') {
      cmp = statusPriority[getUserStatus(a)] - statusPriority[getUserStatus(b)];
    } else if (sortBy === 'name') {
      cmp = a.userName.localeCompare(b.userName);
    } else if (sortBy === 'hours') {
      cmp = b.totalMinutes - a.totalMinutes;
    }
    return sortAsc ? cmp : -cmp;
  });

  function handleSort(col: 'status' | 'name' | 'hours') {
    if (sortBy === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(col);
      setSortAsc(true);
    }
  }

  const SortIcon = ({ col }: { col: 'status' | 'name' | 'hours' }) => {
    if (sortBy !== col) return null;
    return sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-lg" />)}
          </div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'w-full mt-6' : 'p-6 w-full max-w-[1600px] mx-auto'}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className={embedded ? 'text-lg font-semibold text-gray-900' : 'text-2xl font-bold text-gray-900'}>Control de Jornada</h2>
            <p className="text-sm text-gray-500 mt-1 capitalize">
              {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            Meta diaria: <span className="font-bold text-gray-900">{TARGET_HOURS_PER_DAY}h</span> por persona
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`bg-white rounded-lg shadow p-4 text-left transition-all hover:shadow-md ${filter === 'all' ? 'ring-2 ring-blue-400' : ''}`}
        >
          <div className="flex items-center justify-between mb-1">
            <Users className="w-5 h-5 text-gray-400" />
            <span className="text-2xl font-bold text-gray-900">{dailyHoursControl.length}</span>
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Equipo Total</p>
          <p className="text-sm text-gray-600 mt-1">{fmtH(totalPlanned)}h planificadas hoy</p>
        </button>

        <button
          onClick={() => setFilter('ok')}
          className={`bg-white rounded-lg shadow p-4 text-left transition-all hover:shadow-md ${filter === 'ok' ? 'ring-2 ring-green-400' : ''}`}
        >
          <div className="flex items-center justify-between mb-1">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-2xl font-bold text-green-600">{countOk}</span>
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">En Meta</p>
          <p className="text-sm text-green-600 mt-1">{TARGET_HOURS_PER_DAY}h+ planificadas</p>
        </button>

        <button
          onClick={() => setFilter('behind')}
          className={`bg-white rounded-lg shadow p-4 text-left transition-all hover:shadow-md ${filter === 'behind' ? 'ring-2 ring-amber-400' : ''}`}
        >
          <div className="flex items-center justify-between mb-1">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            <span className="text-2xl font-bold text-amber-600">{countBehind}</span>
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Por Debajo</p>
          <p className="text-sm text-amber-600 mt-1">No alcanzan las {TARGET_HOURS_PER_DAY}h</p>
        </button>

        <button
          onClick={() => setFilter('overdue')}
          className={`bg-white rounded-lg shadow p-4 text-left transition-all hover:shadow-md ${filter === 'overdue' ? 'ring-2 ring-red-400' : ''}`}
        >
          <div className="flex items-center justify-between mb-1">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-2xl font-bold text-red-600">{countOverdue}</span>
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Con Retrasos</p>
          <p className="text-sm text-red-600 mt-1">{totalOverdueItems} tarea{totalOverdueItems !== 1 ? 's' : ''} vencida{totalOverdueItems !== 1 ? 's' : ''}</p>
        </button>

        <div className="bg-white rounded-lg shadow p-4 text-left border border-orange-200">
          <div className="flex items-center justify-between mb-1">
            <RotateCcw className="w-5 h-5 text-orange-500" />
            <span className="text-2xl font-bold text-orange-600">{totalReworkToday}</span>
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Retrabajos Hoy</p>
          <p className="text-sm text-orange-600 mt-1">Devueltas corregidas hoy</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('name')}
                >
                  <span className="flex items-center gap-1">Persona <SortIcon col="name" /></span>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none min-w-[120px]"
                  onClick={() => handleSort('status')}
                >
                  <span className="flex items-center gap-1">Estado <SortIcon col="status" /></span>
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-left min-w-[180px]">
                  Progreso Jornada
                </th>
                <th
                  className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('hours')}
                >
                  <span className="flex items-center justify-center gap-1">Planificado <SortIcon col="hours" /></span>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" title="Tiempo ya reportado/completado hoy">
                  Ejecutado
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Hoy
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" title="Subtareas que puede trabajar ahora (no bloqueadas). Si 0 = no tiene disponibles; si >0 y Hoy bajo = no se las han asignado">
                  Actividades disponibles
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" title="Reuniones, dailies, descansos, etc.">
                  Extras
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Retrasos
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" title="Tareas devueltas que se corrigieron hoy">
                  Retrabajos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500 italic">
                    {filter !== 'all' ? 'Nadie en esta categoría.' : 'No hay usuarios en el equipo.'}
                  </td>
                </tr>
              ) : (
                sortedUsers.map((u) => {
                  const status = getUserStatus(u);
                  const taskMinutes = u.totalMinutes - u.extraMinutes - u.reworkMinutes - u.overdueMinutes;
                  const pctTotal = Math.min(100, (u.totalMinutes / TARGET_MINUTES_PER_DAY) * 100);
                  const pctPrePlanned = Math.min(100, ((taskMinutes - u.assignedTodayMinutes) / TARGET_MINUTES_PER_DAY) * 100);
                  const pctAssignedToday = Math.min(100 - pctPrePlanned, (u.assignedTodayMinutes / TARGET_MINUTES_PER_DAY) * 100);
                  const pctExtra = Math.min(100 - pctPrePlanned - pctAssignedToday, (u.extraMinutes / TARGET_MINUTES_PER_DAY) * 100);
                  const pctRework = Math.min(100 - pctPrePlanned - pctAssignedToday - pctExtra, (u.reworkMinutes / TARGET_MINUTES_PER_DAY) * 100);
                  const pctOverdue = Math.min(100 - pctPrePlanned - pctAssignedToday - pctExtra - pctRework, (u.overdueMinutes / TARGET_MINUTES_PER_DAY) * 100);
                  const deficit = Math.max(0, TARGET_MINUTES_PER_DAY - u.totalMinutes);

                  return (
                    <tr key={u.userId} className="hover:bg-gray-50/50">
                      {/* Persona */}
                      <td className="px-4 py-3 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm">{u.userName}</span>
                          {isAdmin && currentUser?.id !== u.userId && (
                            <button
                              onClick={() => impersonateUser({ id: u.userId, name: u.userName, email: u.userEmail, role: 'user' })}
                              className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                              title="Ver como usuario"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                          <div className="text-xs text-gray-500">
                          {u.taskCount} tarea{u.taskCount !== 1 ? 's' : ''} hoy
                          {u.overdueCount > 0 && (
                            <span className="text-red-600"> + {u.overdueCount} retrasada{u.overdueCount !== 1 ? 's' : ''}</span>
                          )}
                          {u.extraCount > 0 && (
                            <span className="text-purple-600"> + {u.extraCount} extra{u.extraCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 min-w-[120px]">
                        <StatusBadge status={status} deficit={deficit} deficitHours={deficit > 0 ? fmtH(deficit) : undefined} />
                      </td>

                      {/* Barra Progreso */}
                      <td className="px-4 py-3 min-w-[180px]">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                              <div
                                className="h-full bg-emerald-600 transition-all"
                                style={{ width: `${pctPrePlanned}%` }}
                              />
                              <div
                                className="h-full bg-emerald-300 transition-all"
                                style={{ width: `${pctAssignedToday}%` }}
                              />
                              <div
                                className="h-full bg-purple-400 transition-all"
                                style={{ width: `${pctExtra}%` }}
                              />
                              <div
                                className="h-full bg-orange-400 transition-all"
                                style={{ width: `${pctRework}%` }}
                              />
                              <div
                                className="h-full bg-red-300 transition-all"
                                style={{ width: `${pctOverdue}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-gray-700 w-10 text-right shrink-0">
                            {pctTotal.toFixed(0)}%
                          </span>
                        </div>
                      </td>

                      {/* Horas planificadas */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-bold text-gray-900">{fmtH(u.totalMinutes)}h</span>
                        <span className="text-xs text-gray-400"> / {TARGET_HOURS_PER_DAY}h</span>
                      </td>

                      {/* Ejecutado */}
                      <td className="px-4 py-3 text-center">
                        {(u.actualMinutesToday + u.reworkMinutes) > 0 ? (
                          <span className="text-sm font-semibold text-blue-600">{fmtH(u.actualMinutesToday + u.reworkMinutes)}h</span>
                        ) : (
                          <span className="text-xs text-gray-400">--</span>
                        )}
                      </td>

                      {/* Asignado hoy */}
                      <td className="px-4 py-3 text-center">
                        {u.assignedTodayCount > 0 ? (
                          <div>
                            <span className="text-sm font-semibold text-emerald-700">{fmtH(u.assignedTodayMinutes)}h</span>
                            <div className="text-xs text-gray-500">{u.assignedTodayCount} tarea{u.assignedTodayCount !== 1 ? 's' : ''}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">--</span>
                        )}
                      </td>

                      {/* Actividades disponibles */}
                      <td className="px-4 py-3 text-center">
                        {u.availableCount > 0 ? (
                          <span className="text-sm font-semibold text-sky-600" title="Puede trabajar en estas actividades ahora">{u.availableCount}</span>
                        ) : (
                          <span className="text-xs text-gray-400" title="No tiene subtareas pendientes disponibles">0</span>
                        )}
                      </td>

                      {/* Extras */}
                      <td className="px-4 py-3 text-center">
                        {u.extraCount > 0 ? (
                          <div>
                            <span className="text-sm font-semibold text-purple-600">{fmtH(u.extraMinutes)}h</span>
                            <div className="text-xs text-purple-500">{u.extraCount} actividad{u.extraCount !== 1 ? 'es' : ''}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">--</span>
                        )}
                      </td>

                      {/* Retrasos */}
                      <td className="px-4 py-3 text-center">
                        {u.overdueCount > 0 ? (
                          <div>
                            <span className="text-sm font-bold text-red-600">{u.overdueCount}</span>
                            <div className="text-xs text-red-500">{fmtH(u.overdueMinutes)}h</div>
                          </div>
                        ) : (
                          <span className="text-xs text-green-500">0</span>
                        )}
                      </td>

                      {/* Retrabajos */}
                      <td className="px-4 py-3 text-center">
                        {u.reworkCount > 0 ? (
                          <div>
                            <span className="text-sm font-bold text-orange-600" title="Tareas devueltas corregidas hoy">{u.reworkCount}</span>
                            {u.reworkMinutes > 0 && (
                              <div className="text-xs text-orange-500">{fmtH(u.reworkMinutes)}h</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Leyenda */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" /> Planificado antes de hoy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-300 inline-block" /> Asignado hoy mismo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-purple-400 inline-block" /> Actividades extras (reuniones, dailies, etc.)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" /> Retrabajos hechos hoy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Tareas retrasadas (pendientes de días anteriores)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-300 inline-block" /> Sin planificar
          </span>
          <span className="flex items-center gap-1.5">
            <RotateCcw className="w-3 h-3 text-orange-500" /> Retrabajos = devueltas corregidas hoy
          </span>
          <span className="flex items-center gap-1.5">
            Actividades disponibles = subtareas que puede trabajar ahora (no bloqueadas por secuencia)
          </span>
          <span className="ml-auto">
            Retrasos = tareas de días anteriores sin completar
          </span>
        </div>
      </div>
    </div>
  );
}
