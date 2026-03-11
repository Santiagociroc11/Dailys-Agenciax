import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { WORKABLE_STATUSES } from '../lib/userAccess';
import { useAuth } from '../contexts/AuthContext';
import { getWeekDays, getWeekRange } from '../lib/weekUtils';
import { Clock, AlertTriangle, CheckCircle2, Users, TrendingUp, ChevronDown, ChevronUp, RotateCcw, LogIn, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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
type ViewTab = 'day' | 'week';

interface DayCellData {
  planned: number;
  extra: number;
  actual: number;
  overdue: number;
  rework: number;
}

interface WeekUserData {
  userId: string;
  userName: string;
  userEmail: string;
  byDate: Record<string, DayCellData>;
  overdueCount: number;
  overdueMinutes: number;
}

interface TaskRowItem {
  dateStr: string;
  taskName: string;
  minutes: number;
  type: 'planned' | 'extra' | 'rework' | 'overdue';
}

/** Estructura tipo Gantt del asesor: task groups con sessions por día */
interface GanttTaskGroup {
  id: string;
  title: string;
  type: 'task' | 'subtask' | 'event';
  project_name?: string;
  parent_task_title?: string;
  estimated_duration?: number;
  event_type?: string;
  sessions: Record<string, Array<{
    id?: string;
    status?: string;
    estimated_duration?: number;
    actual_duration?: number;
    start_time?: string;
    end_time?: string;
    notes?: string;
    event_type?: string;
  }>>;
  workSessions?: Record<string, Array<{ duration_minutes?: number }>>;
}

interface TeamGanttUserData {
  userId: string;
  userName: string;
  userEmail: string;
  ganttData: GanttTaskGroup[];
  executedTimeData: Record<string, Record<string, number>>;
  offScheduleWorkData: Record<string, Record<string, number>>;
}

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
  const [activeTab, setActiveTab] = useState<ViewTab>('day');
  const [selectedWeekDate, setSelectedWeekDate] = useState(new Date());
  const [weekData, setWeekData] = useState<WeekUserData[]>([]);
  const [weekGanttData, setWeekGanttData] = useState<TeamGanttUserData[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);

  const weekDays = getWeekDays(selectedWeekDate);
  const startDate = weekDays[0].dateStr;
  const endDate = weekDays[6].dateStr;

  useEffect(() => {
    fetchDailyHoursControl();
  }, []);

  useEffect(() => {
    if (activeTab === 'week') {
      fetchWeeklyTeamGanttData(startDate, endDate);
    }
  }, [activeTab, startDate, endDate]);

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
      const workableStatuses = [...WORKABLE_STATUSES];
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

  async function fetchWeeklyTeamData(startDate: string, endDate: string) {
    setWeekLoading(true);
    try {
      const weekDaysForFetch = getWeekDays(new Date(startDate));
      const { data: activeProjects } = await supabase.from('projects').select('id').eq('is_archived', false);
      const activeProjectIds = new Set((activeProjects || []).map((p) => p.id));

      const { data: users } = await supabase.from('users').select('id, name, email').not('is_active', 'eq', false);
      const userList = users || [];

      const startISO = new Date(startDate + 'T00:00:00').toISOString();
      const endISO = new Date(endDate + 'T23:59:59.999').toISOString();

      const [
        { data: weekAssignments, error: assignErr },
        { data: weekWorkEvents, error: eventsErr },
        { data: weekWorkSessions, error: sessionsErr },
        { data: overdueAssignments, error: overdueErr },
      ] = await Promise.all([
        supabase
          .from('task_work_assignments')
          .select('id, user_id, date, project_id, estimated_duration, actual_duration, created_at')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('work_events')
          .select('user_id, date, project_id, start_time, end_time')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('work_sessions')
          .select('assignment_id, duration_minutes, createdAt, created_at')
          .gte('createdAt', startISO)
          .lte('createdAt', endISO),
        supabase
          .from('task_work_assignments')
          .select('user_id, date, project_id, estimated_duration')
          .lt('date', startDate)
          .not('status', 'in', "('completed','in_review','approved')"),
      ]);

      if (assignErr) throw assignErr;

      const filterByProject = (projectId: string | null) =>
        activeProjectIds.size === 0 || !projectId || activeProjectIds.has(projectId);

      const assignments = (weekAssignments || []).filter((a: { project_id?: string | null }) =>
        filterByProject(a.project_id)
      );
      const workEvents = (weekWorkEvents || []).filter((e: { project_id?: string | null }) =>
        filterByProject(e.project_id)
      );
      const overdue = (overdueAssignments || []).filter((a: { project_id?: string | null }) =>
        filterByProject(a.project_id)
      );

      const byUserDate = new Map<string, Map<string, DayCellData>>();
      userList.forEach((u) => {
        const dateMap = new Map<string, DayCellData>();
        weekDaysForFetch.forEach((d) => {
          dateMap.set(d.dateStr, { planned: 0, extra: 0, actual: 0, overdue: 0, rework: 0 });
        });
        byUserDate.set(u.id, dateMap);
      });

      assignments.forEach((a: { user_id: string; date: string; estimated_duration?: number; actual_duration?: number | null }) => {
        const map = byUserDate.get(a.user_id);
        if (!map) return;
        const cell = map.get(a.date);
        if (!cell) return;
        cell.planned += a.estimated_duration ?? 0;
      });

      workEvents.forEach((e: { user_id: string; date: string; start_time: string; end_time: string }) => {
        const map = byUserDate.get(e.user_id);
        if (!map) return;
        const cell = map.get(e.date);
        if (!cell) return;
        const [sh, sm] = (e.start_time || '00:00').split(':').map(Number);
        const [eh, em] = (e.end_time || '00:00').split(':').map(Number);
        const mins = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
        cell.extra += mins;
      });

      const sessionList = (weekWorkSessions || []) as { assignment_id: string; duration_minutes?: number; createdAt?: string; created_at?: string }[];
      if (sessionList.length > 0) {
        const assignmentIds = [...new Set(sessionList.map((s) => s.assignment_id))];
        const { data: assignData } = await supabase
          .from('task_work_assignments')
          .select('id, user_id, date, project_id')
          .in('id', assignmentIds);
        const assignMap = new Map((assignData || []).map((a: { id: string; user_id: string; date: string; project_id?: string | null }) => [a.id, a]));

        sessionList.forEach((s) => {
          const assign = assignMap.get(s.assignment_id);
          if (!assign || !filterByProject(assign.project_id)) return;
          const map = byUserDate.get(assign.user_id);
          if (!map) return;
          const createdAt = s.createdAt || s.created_at;
          const sessionDate = createdAt ? format(new Date(createdAt), 'yyyy-MM-dd') : assign.date;
          const cell = map.get(sessionDate);
          if (!cell) return;
          const mins = s.duration_minutes ?? 0;
          if (assign.date < sessionDate) {
            cell.rework += mins;
          } else {
            cell.actual += mins;
          }
        });
      }

      const overdueByUser = new Map<string, { count: number; minutes: number }>();
      overdue.forEach((a: { user_id: string; estimated_duration?: number }) => {
        const cur = overdueByUser.get(a.user_id) || { count: 0, minutes: 0 };
        cur.count += 1;
        cur.minutes += a.estimated_duration ?? 0;
        overdueByUser.set(a.user_id, cur);
      });

      const result: WeekUserData[] = userList.map((u) => {
        const dateMap = byUserDate.get(u.id)!;
        const byDate: Record<string, DayCellData> = {};
        dateMap.forEach((v, k) => { byDate[k] = v; });
        const od = overdueByUser.get(u.id) || { count: 0, minutes: 0 };
        if (od.count > 0) {
          const mondayCell = byDate[startDate];
          if (mondayCell) mondayCell.overdue = od.minutes;
        }
        return {
          userId: u.id,
          userName: u.name || u.email || u.id,
          userEmail: u.email || '',
          byDate,
          overdueCount: od.count,
          overdueMinutes: od.minutes,
        };
      });

      setWeekData(result);
    } catch (e) {
      console.error('Error fetching weekly team data:', e);
      setWeekData([]);
    } finally {
      setWeekLoading(false);
    }
  }

  async function fetchWeeklyTeamGanttData(startDate: string, endDate: string) {
    setWeekLoading(true);
    try {
      const weekDaysForFetch = getWeekDays(new Date(startDate));
      const { data: activeProjects } = await supabase.from('projects').select('id').eq('is_archived', false);
      const activeProjectIds = new Set((activeProjects || []).map((p) => p.id));
      const filterByProject = (projectId: string | null) =>
        activeProjectIds.size === 0 || !projectId || activeProjectIds.has(projectId);

      const { data: users } = await supabase.from('users').select('id, name, email').not('is_active', 'eq', false);
      const userList = users || [];
      const startISO = new Date(startDate + 'T00:00:00').toISOString();
      const endISO = new Date(endDate + 'T23:59:59.999').toISOString();

      const [
        { data: assignments, error: assignErr },
        { data: workEvents, error: eventsErr },
        { data: workSessions, error: sessionsErr },
      ] = await Promise.all([
        supabase
          .from('task_work_assignments')
          .select(`
            id, user_id, date, project_id, task_id, subtask_id, task_type, estimated_duration, actual_duration,
            start_time, end_time, status,
            tasks(id, title, description, project_id, phase_id, estimated_duration, priority, start_date, deadline, status, is_sequential, projects(name)),
            subtasks(id, title, description, task_id, estimated_duration, start_date, deadline, status, tasks(id, title, phase_id, projects(name)))
          `)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('work_events')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('work_sessions')
          .select('id, assignment_id, duration_minutes, createdAt, created_at')
          .gte('createdAt', startISO)
          .lte('createdAt', endISO),
      ]);

      if (assignErr) throw assignErr;

      const filterAssignments = (assignments || []).filter((a: { project_id?: string | null }) =>
        filterByProject(a.project_id)
      );
      const filterEvents = (workEvents || []).filter((e: { project_id?: string | null }) =>
        filterByProject(e.project_id)
      );

      const byUser = new Map<string, { taskGroups: Record<string, GanttTaskGroup> }>();
      userList.forEach((u) => byUser.set(u.id, { taskGroups: {} }));

      filterAssignments.forEach((a: { user_id: string; task_type?: string; task_id?: string; subtask_id?: string; date: string; tasks?: { title: string; projects?: { name: string } }; subtasks?: { title: string; tasks?: { title: string; projects?: { name: string } } }; project_id?: string | null }) => {
        const entry = byUser.get(a.user_id);
        if (!entry || !filterByProject(a.project_id)) return;
        const taskData = a.task_type === 'subtask' ? a.subtasks : a.tasks;
        if (!taskData) return;
        const taskKey = `${a.task_type}-${a.task_type === 'subtask' ? a.subtask_id : a.task_id}`;
        if (!entry.taskGroups[taskKey]) {
          let projectName = '';
          let parentTaskTitle = '';
          if (a.task_type === 'subtask' && (taskData as { tasks?: { title: string; projects?: { name: string } } }).tasks) {
            parentTaskTitle = (taskData as { tasks: { title: string; projects?: { name: string } } }).tasks.title;
            projectName = (taskData as { tasks: { projects?: { name: string } } }).tasks.projects?.name || '';
          } else if (a.task_type === 'task' && (taskData as { projects?: { name: string } }).projects) {
            projectName = (taskData as { projects: { name: string } }).projects.name || '';
          }
          entry.taskGroups[taskKey] = {
            id: taskKey,
            title: (taskData as { title: string }).title,
            type: (a.task_type as 'task' | 'subtask') || 'task',
            project_name: projectName,
            parent_task_title: parentTaskTitle,
            estimated_duration: (taskData as { estimated_duration?: number }).estimated_duration,
            sessions: {},
          };
        }
        const group = entry.taskGroups[taskKey];
        const dateStr = a.date;
        if (!group.sessions[dateStr]) group.sessions[dateStr] = [];
        const sess = a as { id: string; status?: string; estimated_duration?: number; actual_duration?: number; start_time?: string; end_time?: string; notes?: string };
        group.sessions[dateStr].push({
          id: sess.id,
          status: sess.status,
          estimated_duration: sess.estimated_duration,
          actual_duration: sess.actual_duration ?? undefined,
          start_time: sess.start_time,
          end_time: sess.end_time,
          notes: sess.notes,
        });
      });

      filterEvents.forEach((e: { user_id: string; id: string; date: string; start_time: string; end_time: string; title?: string; event_type?: string; description?: string; project_id?: string | null }) => {
        const entry = byUser.get(e.user_id);
        if (!entry || !filterByProject(e.project_id)) return;
        const [sh, sm] = (e.start_time || '00:00').split(':').map(Number);
        const [eh, em] = (e.end_time || '00:00').split(':').map(Number);
        const durationMinutes = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
        const eventKey = `event-${e.id}`;
        entry.taskGroups[eventKey] = {
          id: eventKey,
          title: e.title || 'Actividad',
          type: 'event',
          project_name: 'Actividad Adicional',
          estimated_duration: durationMinutes,
          event_type: e.event_type,
          sessions: {
            [e.date]: [{
              id: e.id,
              status: 'completed',
              estimated_duration: durationMinutes,
              actual_duration: durationMinutes,
              start_time: `${e.date}T${e.start_time}`,
              end_time: `${e.date}T${e.end_time}`,
              notes: e.description,
              event_type: e.event_type,
            }],
          },
        };
      });

      const sessionList = (workSessions || []) as Array<{
        assignment_id: string;
        duration_minutes?: number;
        createdAt?: string;
        created_at?: string;
      }>;
      let assignMap = new Map<string, { user_id: string; task_id: string; subtask_id?: string; task_type: string; date: string; project_id?: string | null }>();
      if (sessionList.length > 0) {
        const assignmentIds = [...new Set(sessionList.map((s) => s.assignment_id))];
        const { data: assignData } = await supabase
          .from('task_work_assignments')
          .select('id, user_id, task_id, subtask_id, task_type, date, project_id')
          .in('id', assignmentIds);
        assignMap = new Map((assignData || []).map((a: { id: string; user_id: string; task_id: string; subtask_id?: string; task_type: string; date: string; project_id?: string | null }) => [a.id, a]));
      }
      const sessionsByUserTask: Record<string, Record<string, Record<string, Array<{ duration_minutes?: number }>>>> = {};
      sessionList.forEach((s) => {
        const assign = assignMap.get(s.assignment_id);
        if (!assign || !filterByProject(assign.project_id)) return;
        const taskKey = `${assign.task_type}-${assign.task_type === 'subtask' ? assign.subtask_id : assign.task_id}`;
        const sessionDate = (s.createdAt || s.created_at)
          ? format(new Date(s.createdAt || s.created_at), 'yyyy-MM-dd')
          : assign.date;
        if (!sessionsByUserTask[assign.user_id]) sessionsByUserTask[assign.user_id] = {};
        if (!sessionsByUserTask[assign.user_id][taskKey]) sessionsByUserTask[assign.user_id][taskKey] = {};
        if (!sessionsByUserTask[assign.user_id][taskKey][sessionDate]) {
          sessionsByUserTask[assign.user_id][taskKey][sessionDate] = [];
        }
        sessionsByUserTask[assign.user_id][taskKey][sessionDate].push({
          duration_minutes: s.duration_minutes ?? 0,
        });
      });

      const result: TeamGanttUserData[] = userList.map((u) => {
        const taskGroups = Object.values(byUser.get(u.id)!.taskGroups);
        taskGroups.forEach((tg) => {
          const taskKey = tg.id;
          const ws = sessionsByUserTask[u.id]?.[taskKey];
          if (ws) tg.workSessions = ws;
        });

        const executedTimeData: Record<string, Record<string, number>> = {};
        for (const tg of taskGroups) {
          executedTimeData[tg.id] = {};
          for (const day of weekDaysForFetch) {
            if (tg.type === 'event') {
              const sess = tg.sessions[day.dateStr] || [];
              const total = sess.reduce((s, x) => s + (x.actual_duration ?? 0), 0);
              executedTimeData[tg.id][day.dateStr] = total;
            } else if (tg.workSessions?.[day.dateStr]) {
              const total = tg.workSessions[day.dateStr].reduce((s, x) => s + (x.duration_minutes ?? 0), 0);
              executedTimeData[tg.id][day.dateStr] = total;
            } else {
              const sess = tg.sessions[day.dateStr] || [];
              const fromActual = sess.reduce((s, x) => s + (x.actual_duration ?? 0), 0);
              executedTimeData[tg.id][day.dateStr] = fromActual;
            }
          }
        }

        const offScheduleWorkData: Record<string, Record<string, number>> = {};
        for (const tg of taskGroups) {
          const off: Record<string, number> = {};
          if (tg.workSessions) {
            for (const [dateStr, sessions] of Object.entries(tg.workSessions)) {
              const planned = tg.sessions[dateStr] || [];
              if (planned.length === 0) {
                const total = sessions.reduce((s, x) => s + (x.duration_minutes ?? 0), 0);
                if (total > 0) off[dateStr] = total;
              }
            }
          }
          offScheduleWorkData[tg.id] = off;
        }

        const sortedGantt = taskGroups.sort((a, b) => {
          const getEarliest = (t: GanttTaskGroup) => {
            let earliest = '23:59';
            for (const sess of Object.values(t.sessions).flat()) {
              const st = sess.start_time;
              if (st) {
                const timeOnly = st.includes('T') ? st.split('T')[1]?.substring(0, 5) : st;
                if (timeOnly && timeOnly < earliest) earliest = timeOnly;
              }
            }
            return earliest;
          };
          return getEarliest(a).localeCompare(getEarliest(b));
        });

        return {
          userId: u.id,
          userName: u.name || u.email || u.id,
          userEmail: u.email || '',
          ganttData: sortedGantt,
          executedTimeData,
          offScheduleWorkData,
        };
      });

      setWeekGanttData(result);
    } catch (e) {
      console.error('Error fetching weekly team Gantt:', e);
      setWeekGanttData([]);
    } finally {
      setWeekLoading(false);
    }
  }

  async function fetchUserWeekTasks(userId: string, startDate: string, endDate: string): Promise<TaskRowItem[]> {
    try {
      const { data: activeProjects } = await supabase.from('projects').select('id').eq('is_archived', false);
      const activeProjectIds = new Set((activeProjects || []).map((p) => p.id));
      const filterByProject = (projectId: string | null) =>
        activeProjectIds.size === 0 || !projectId || activeProjectIds.has(projectId);

      const [assignRes, eventsRes] = await Promise.all([
        supabase
          .from('task_work_assignments')
          .select('id, date, task_id, subtask_id, task_type, estimated_duration, project_id')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('work_events')
          .select('date, project_id, start_time, end_time, title')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate),
      ]);

      const rows: TaskRowItem[] = [];
      const assignments = (assignRes.data || []).filter((a: { project_id?: string | null }) =>
        filterByProject(a.project_id)
      );
      const taskIds = [...new Set(assignments.map((a: { task_id?: string }) => a.task_id).filter(Boolean))];
      const subtaskIds = [...new Set(assignments.map((a: { subtask_id?: string }) => a.subtask_id).filter(Boolean))];

      const taskTitles = new Map<string, string>();
      const subtaskTitles = new Map<string, string>();
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase.from('tasks').select('id, title').in('id', taskIds);
        (tasks || []).forEach((t: { id: string; title: string }) => taskTitles.set(t.id, t.title || 'Tarea'));
      }
      if (subtaskIds.length > 0) {
        const { data: subs } = await supabase.from('subtasks').select('id, title, task_id').in('id', subtaskIds);
        (subs || []).forEach((s: { id: string; title: string; task_id: string }) => {
          const taskTitle = taskTitles.get(s.task_id) || '';
          subtaskTitles.set(s.id, `${taskTitle} › ${s.title || 'Subtarea'}`);
        });
      }

      assignments.forEach((a: { date: string; task_id?: string; subtask_id?: string; task_type?: string; estimated_duration?: number }) => {
        const mins = a.estimated_duration ?? 0;
        const name = a.subtask_id ? subtaskTitles.get(a.subtask_id) : a.task_id ? taskTitles.get(a.task_id) : 'Tarea';
        rows.push({ dateStr: a.date, taskName: name || 'Tarea', minutes: mins, type: 'planned' });
      });

      (eventsRes.data || []).filter((e: { project_id?: string | null }) => filterByProject(e.project_id)).forEach(
        (e: { date: string; start_time: string; end_time: string; title?: string }) => {
          const [sh, sm] = (e.start_time || '00:00').split(':').map(Number);
          const [eh, em] = (e.end_time || '00:00').split(':').map(Number);
          const mins = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
          rows.push({ dateStr: e.date, taskName: e.title || 'Actividad extra', minutes: mins, type: 'extra' });
        }
      );

      return rows.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.taskName.localeCompare(b.taskName));
    } catch (e) {
      console.error('Error fetching user week tasks:', e);
      return [];
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

  function goToPreviousWeek() {
    const d = new Date(selectedWeekDate);
    d.setDate(d.getDate() - 7);
    setSelectedWeekDate(d);
  }
  function goToNextWeek() {
    const d = new Date(selectedWeekDate);
    d.setDate(d.getDate() + 7);
    setSelectedWeekDate(d);
  }
  function goToThisWeek() {
    setSelectedWeekDate(new Date());
  }

  return (
    <div className={embedded ? 'w-full mt-6' : 'p-6 w-full max-w-[1600px] mx-auto'}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className={embedded ? 'text-lg font-semibold text-gray-900' : 'text-2xl font-bold text-gray-900'}>Control de Jornada</h2>
            <p className="text-sm text-gray-500 mt-1 capitalize">
              {activeTab === 'day'
                ? format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })
                : getWeekRange(selectedWeekDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setActiveTab('day')}
                className={`px-3 py-1.5 text-sm font-medium ${activeTab === 'day' ? 'bg-blue-100 text-blue-800' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Vista día
              </button>
              <button
                onClick={() => setActiveTab('week')}
                className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 ${activeTab === 'week' ? 'bg-blue-100 text-blue-800' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <Calendar className="w-4 h-4" />
                Vista semana
              </button>
            </div>
            {activeTab === 'week' && (
              <div className="flex items-center gap-1 border border-gray-300 rounded-lg p-1">
                <button onClick={goToPreviousWeek} className="p-1.5 hover:bg-gray-100 rounded" title="Semana anterior">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={goToThisWeek} className="px-2 py-1 text-xs font-medium hover:bg-gray-100 rounded" title="Ir a esta semana">
                  Hoy
                </button>
                <button onClick={goToNextWeek} className="p-1.5 hover:bg-gray-100 rounded" title="Semana siguiente">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="text-right text-sm text-gray-500">
              Meta diaria: <span className="font-bold text-gray-900">{TARGET_HOURS_PER_DAY}h</span> por persona
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'week' ? (
        <TeamWeekGantt
          weekGanttData={weekGanttData}
          weekDays={weekDays}
          loading={weekLoading}
          fmtH={fmtH}
          isAdmin={!!isAdmin}
          currentUserId={currentUser?.id}
          impersonateUser={impersonateUser}
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function isDayPassed(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > dayDate;
}

function GanttDayCell({
  taskGroup,
  day,
  executedTimeData,
  offScheduleWorkData,
  fmtH,
}: {
  taskGroup: GanttTaskGroup;
  day: { dateStr: string; dayShort: string; dayNumber: string; isToday: boolean };
  executedTimeData: Record<string, Record<string, number>>;
  offScheduleWorkData: Record<string, Record<string, number>>;
  fmtH: (m: number) => string;
}) {
  const sessions = taskGroup.sessions[day.dateStr] || [];
  const plannedSessions = sessions.filter((s) => s.start_time && s.end_time);
  const realExecuted = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
  const offSchedule = offScheduleWorkData[taskGroup.id]?.[day.dateStr] || 0;
  const hasOffSchedule = offSchedule > 0;

  return (
    <div className="p-1 min-h-[50px] border-r border-gray-200">
      {hasOffSchedule && (
        <div className="space-y-1 mb-1">
          <div className="text-xs p-1 rounded border bg-orange-100 border-orange-300 relative" title={`🕒 FUERA DE CRONOGRAMA: ${(offSchedule / 60).toFixed(1)}h`}>
            <div className="absolute inset-0 bg-orange-200 opacity-60" />
            <div className="relative z-10 text-orange-800 font-medium">
              <div className="text-center">🕒 EXTRA</div>
              <div className="text-center">{(offSchedule / 60).toFixed(1)}h</div>
            </div>
          </div>
        </div>
      )}
      {sessions.length > 0 ? (
        <div className="space-y-1">
          {plannedSessions.map((session, idx) => {
            const startTime = session.start_time ? new Date(session.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
            const endTime = session.end_time ? new Date(session.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
            let plannedMinutes = 0;
            if (session.start_time && session.end_time) {
              plannedMinutes = Math.max(0, (new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000);
            }
            const executedMinutes = realExecuted + offSchedule;
            const maxTime = Math.max(plannedMinutes, executedMinutes);
            const executedPercent = maxTime > 0 ? (executedMinutes / maxTime) * 100 : 0;
            const isNonCompliant = isDayPassed(day.dateStr) && executedMinutes === 0 && taskGroup.type !== 'event';

            let bgClass, barClass;
            if (taskGroup.type === 'event') {
              bgClass = 'bg-purple-50 border-purple-200';
              barClass = 'bg-purple-200';
            } else if (isNonCompliant) {
              bgClass = 'bg-red-50 border-red-200';
              barClass = 'bg-red-200';
            } else {
              bgClass = 'bg-blue-50 border-blue-200';
              barClass = 'bg-blue-200';
            }

            return (
              <div key={idx} className={`text-xs p-1 rounded border ${bgClass} relative overflow-hidden`} title={`${startTime}-${endTime} | P:${(plannedMinutes / 60).toFixed(1)}h E:${(executedMinutes / 60).toFixed(1)}h`}>
                <div className={`absolute inset-0 ${barClass} opacity-50`} />
                {(executedMinutes > 0 || taskGroup.type === 'event') && (
                  <div
                    className={`absolute inset-y-0 left-0 ${taskGroup.type === 'event' ? 'bg-purple-400' : executedMinutes >= plannedMinutes ? 'bg-green-400' : 'bg-green-300'} opacity-70`}
                    style={{ width: taskGroup.type === 'event' ? '100%' : `${Math.min(executedPercent, 100)}%` }}
                  />
                )}
                <div className="relative z-10">
                  <div className="font-medium text-gray-800">{startTime && endTime ? `${startTime}-${endTime}` : 'Sin horario'}</div>
                  <div className="flex justify-between text-xs">
                    {taskGroup.type === 'event' ? (
                      <><span>📅 {(plannedMinutes / 60).toFixed(1)}h</span><span>✅ Ejecutado</span></>
                    ) : (
                      <><span>P:{(plannedMinutes / 60).toFixed(1)}h</span><span>E:{(executedMinutes / 60).toFixed(1)}h</span></>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {sessions.filter((s) => !s.start_time || !s.end_time).map((session, idx) => {
            const plannedMinutes = session.estimated_duration || 0;
            const executedMinutes = realExecuted + offSchedule;
            const isNonCompliant = isDayPassed(day.dateStr) && executedMinutes === 0;
            const bgClass = isNonCompliant ? 'bg-red-100 border-red-300 text-red-700' : 'bg-gray-100 border-gray-300 text-gray-700';
            const barClass = isNonCompliant ? 'bg-red-300' : 'bg-green-300';

            return (
              <div key={`no-${idx}`} className={`text-xs p-1 rounded border ${bgClass} relative overflow-hidden`} title={`Sin horario | P:${(plannedMinutes / 60).toFixed(1)}h E:${(executedMinutes / 60).toFixed(1)}h`}>
                {executedMinutes > 0 && (
                  <div className={`absolute inset-y-0 left-0 ${barClass} opacity-50`} style={{ width: `${Math.min((executedMinutes / plannedMinutes) * 100, 100)}%` }} />
                )}
                <div className="relative z-10">
                  <div>{isNonCompliant ? '⚠️ INCUMPLIDO' : 'Sin horario'}</div>
                  <div className="flex justify-between"><span>P:{(plannedMinutes / 60).toFixed(1)}h</span><span>E:{(executedMinutes / 60).toFixed(1)}h</span></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-gray-400 text-center pt-2">-</div>
      )}
    </div>
  );
}

function TeamWeekGantt({
  weekGanttData,
  weekDays,
  loading,
  fmtH,
  isAdmin,
  currentUserId,
  impersonateUser,
}: {
  weekGanttData: TeamGanttUserData[];
  weekDays: ReturnType<typeof getWeekDays>;
  loading: boolean;
  fmtH: (m: number) => string;
  isAdmin: boolean;
  currentUserId?: string;
  impersonateUser?: (u: { id: string; name: string; email: string; role: string }) => void;
}) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-9 gap-2 mb-4">
            <div className="font-medium text-sm text-gray-700 p-1 min-h-[50px] flex items-center">Persona / Tarea</div>
            {weekDays.map((d) => (
              <div key={d.dateStr} className={`text-center p-1 text-sm min-h-[50px] flex flex-col justify-center relative ${d.isToday ? 'bg-blue-100 text-blue-800 font-medium border-2 border-blue-400 rounded-lg' : 'bg-gray-50 text-gray-700'}`}>
                {d.isToday && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 rounded-full font-bold shadow-sm">HOY</div>}
                <div className="font-medium">{d.dayShort}</div>
                <div className="text-xs">{d.dayNumber}</div>
              </div>
            ))}
            <div className="text-center p-1 text-xs bg-gray-100 text-gray-700 min-h-[50px] flex flex-col justify-center">
              <div className="font-medium">TOTAL</div>
              <div className="text-xs text-gray-500">P/E</div>
            </div>
          </div>

          {weekGanttData.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No hay datos para esta semana.</div>
          ) : (
            weekGanttData.map((u) => {
              const isExpanded = expandedUserId === u.userId;
              return (
                <div key={u.userId} className="mb-3 border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    className="grid grid-cols-9 gap-2 bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedUserId(isExpanded ? null : u.userId)}
                  >
                    <div className="p-2 flex items-center gap-2 col-span-1">
                      <button type="button" className="p-0.5 rounded hover:bg-gray-200 shrink-0 text-gray-500">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <span className="font-medium text-gray-900 text-sm truncate">{u.userName}</span>
                      {isAdmin && currentUserId !== u.userId && impersonateUser && (
                        <button
                          onClick={(e) => { e.stopPropagation(); impersonateUser({ id: u.userId, name: u.userName, email: u.userEmail, role: 'user' }); }}
                          className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 shrink-0"
                          title="Ver como usuario"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {weekDays.map((d) => {
                      const totalP = u.ganttData.reduce((s, tg) => {
                        const sess = tg.sessions[d.dateStr] || [];
                        return s + sess.reduce((a, x) => a + (x.start_time && x.end_time ? Math.max(0, (new Date(x.end_time!).getTime() - new Date(x.start_time!).getTime()) / 60000) : (x.estimated_duration || 0)), 0);
                      }, 0);
                      const totalE = u.ganttData.reduce((s, tg) => s + (u.executedTimeData[tg.id]?.[d.dateStr] || 0) + (u.offScheduleWorkData[tg.id]?.[d.dateStr] || 0), 0);
                      return (
                        <div key={d.dateStr} className="p-1 text-center text-xs font-medium">
                          <div>P:{(totalP / 60).toFixed(1)}h</div>
                          <div>E:{(totalE / 60).toFixed(1)}h</div>
                        </div>
                      );
                    })}
                    <div className="p-1 text-center text-xs font-bold bg-gray-200">
                      <div>P:{(u.ganttData.reduce((s, tg) => s + Object.values(tg.sessions).flat().reduce((a, x) => {
                        if (x.start_time && x.end_time) return a + Math.max(0, (new Date(x.end_time).getTime() - new Date(x.start_time).getTime()) / 60000);
                        return a + (x.estimated_duration || 0);
                      }, 0), 0) / 60).toFixed(1)}h</div>
                      <div>E:{(u.ganttData.reduce((s, tg) => s + Object.values(u.executedTimeData[tg.id] || {}).reduce((a, v) => a + v, 0) + Object.values(u.offScheduleWorkData[tg.id] || {}).reduce((a, v) => a + v, 0), 0) / 60).toFixed(1)}h</div>
                    </div>
                  </div>

                  {isExpanded && u.ganttData.length > 0 && (
                    <>
                      {u.ganttData.map((taskGroup) => {
                        const totalTaskHours = weekDays.reduce((total, day) => {
                          const sess = taskGroup.sessions[day.dateStr] || [];
                          const dayTotal = sess.reduce((sum, s) => {
                            if (s.start_time && s.end_time) return sum + Math.max(0, (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000);
                            return sum + (s.estimated_duration || 0);
                          }, 0);
                          return total + dayTotal;
                        }, 0);
                        const totalExecuted = weekDays.reduce((total, day) => {
                          if (taskGroup.type === 'event') {
                            const sess = taskGroup.sessions[day.dateStr] || [];
                            return total + sess.reduce((a, x) => a + (x.actual_duration || 0), 0);
                          }
                          return total + (u.executedTimeData[taskGroup.id]?.[day.dateStr] || 0) + (u.offScheduleWorkData[taskGroup.id]?.[day.dateStr] || 0);
                        }, 0);

                        return (
                          <div key={taskGroup.id} className="grid grid-cols-9 gap-2 border-t border-gray-100">
                            <div className={`p-2 font-medium text-sm border-r border-gray-200 min-h-[50px] ${taskGroup.type === 'event' ? 'bg-purple-50 text-purple-800' : 'bg-gray-50 text-gray-800'}`}>
                              <div className="font-medium">{taskGroup.type === 'event' ? '📅 ' : ''}{taskGroup.title}</div>
                              <div className="text-xs text-gray-500">{taskGroup.type === 'subtask' ? 'Subtarea' : taskGroup.type === 'event' ? `Actividad (${taskGroup.event_type || 'extra'})` : 'Tarea'}</div>
                              {taskGroup.parent_task_title && <div className="text-xs text-gray-500 mt-1">T.P: {taskGroup.parent_task_title}</div>}
                            </div>
                            {weekDays.map((day) => (
                              <GanttDayCell
                                key={day.dateStr}
                                taskGroup={taskGroup}
                                day={day}
                                executedTimeData={u.executedTimeData}
                                offScheduleWorkData={u.offScheduleWorkData}
                                fmtH={fmtH}
                              />
                            ))}
                            <div className="p-1 bg-gray-50 border-l border-gray-200 text-center text-xs min-h-[50px] flex flex-col justify-center">
                              <div className="text-gray-700">P:{(totalTaskHours / 60).toFixed(1)}h</div>
                              <div className="text-gray-700">E:{(totalExecuted / 60).toFixed(1)}h</div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> Planificado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Ejecutado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-200 inline-block" /> Incumplimiento</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-200 inline-block" /> Fuera de cronograma</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-200 inline-block" /> Actividad adicional</span>
        <span className="text-gray-600">P = Planificado | E = Ejecutado</span>
      </div>
    </div>
  );
}
