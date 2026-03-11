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
  const [weekLoading, setWeekLoading] = useState(false);

  const weekDays = getWeekDays(selectedWeekDate);
  const startDate = weekDays[0].dateStr;
  const endDate = weekDays[6].dateStr;

  useEffect(() => {
    fetchDailyHoursControl();
  }, []);

  useEffect(() => {
    if (activeTab === 'week') {
      fetchWeeklyTeamData(startDate, endDate);
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
          weekData={weekData}
          weekDays={weekDays}
          loading={weekLoading}
          targetMinutes={TARGET_MINUTES_PER_DAY}
          fmtH={fmtH}
          isAdmin={!!isAdmin}
          currentUserId={currentUser?.id}
          impersonateUser={impersonateUser}
          fetchUserTasks={fetchUserWeekTasks}
          startDate={startDate}
          endDate={endDate}
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

function TeamWeekGantt({
  weekData,
  weekDays,
  loading,
  targetMinutes,
  fmtH,
  isAdmin,
  currentUserId,
  impersonateUser,
  fetchUserTasks,
  startDate,
  endDate,
}: {
  weekData: WeekUserData[];
  weekDays: ReturnType<typeof getWeekDays>;
  loading: boolean;
  targetMinutes: number;
  fmtH: (m: number) => string;
  isAdmin: boolean;
  currentUserId?: string;
  impersonateUser?: (u: { id: string; name: string; email: string; role: string }) => void;
  fetchUserTasks?: (userId: string, startDate: string, endDate: string) => Promise<TaskRowItem[]>;
  startDate?: string;
  endDate?: string;
}) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<TaskRowItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  async function handleToggleExpand(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setExpandedTasks([]);
      return;
    }
    setExpandedUserId(userId);
    if (fetchUserTasks && startDate && endDate) {
      setTasksLoading(true);
      try {
        const tasks = await fetchUserTasks(userId, startDate, endDate);
        setExpandedTasks(tasks);
      } finally {
        setTasksLoading(false);
      }
    } else {
      setExpandedTasks([]);
    }
  }

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
        <div className="min-w-[900px]">
          <div className="grid gap-0" style={{ gridTemplateColumns: `minmax(140px, 1fr) repeat(7, minmax(90px, 1fr)) minmax(70px, 1fr)` }}>
            <div className="px-3 py-2 font-medium text-sm text-gray-700 bg-gray-50 border-b border-r border-gray-200">Persona</div>
            {weekDays.map((d) => (
              <div
                key={d.dateStr}
                className={`px-2 py-2 text-center text-sm border-b border-r border-gray-200 ${
                  d.isToday ? 'bg-blue-100 text-blue-800 font-medium' : 'bg-gray-50 text-gray-700'
                }`}
              >
                {d.isToday && <span className="block text-[10px] font-bold text-red-600 mb-0.5">HOY</span>}
                <div className="font-medium">{d.dayShort}</div>
                <div className="text-xs">{d.dayNumber}</div>
              </div>
            ))}
            <div className="px-2 py-2 text-center text-xs font-medium bg-gray-100 text-gray-700 border-b border-gray-200">TOTAL</div>
          </div>

          {weekData.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No hay datos para esta semana.</div>
          ) : (
            weekData.map((u) => {
              let totalWeek = 0;
              const cells = weekDays.map((d) => {
                const cell = u.byDate[d.dateStr] || { planned: 0, extra: 0, actual: 0, overdue: 0, rework: 0 };
                const total = cell.planned + cell.extra + cell.overdue + cell.rework;
                totalWeek += total;
                const pctTotal = Math.min(100, (total / targetMinutes) * 100);
                const taskPart = cell.planned + cell.overdue;
                const pctTask = total > 0 ? Math.min(100, (taskPart / total) * 100) : 0;
                const pctExtra = total > 0 ? Math.min(100 - pctTask, (cell.extra / total) * 100) : 0;
                const pctRework = total > 0 ? Math.min(100 - pctTask - pctExtra, (cell.rework / total) * 100) : 0;
                const pctOverdue = total > 0 ? 100 - pctTask - pctExtra - pctRework : 0;

                return (
                  <div
                    key={`${u.userId}-${d.dateStr}`}
                    className="px-2 py-2 border-b border-r border-gray-100 min-h-[60px] flex flex-col justify-center"
                  >
                    {total > 0 ? (
                      <>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex mb-1">
                          <div className="h-full bg-emerald-600" style={{ width: `${Math.max(0, pctTask - (cell.overdue / total) * 100) || 0}%` }} />
                          <div className="h-full bg-red-300" style={{ width: `${(cell.overdue / total) * 100}%` }} />
                          <div className="h-full bg-purple-400" style={{ width: `${pctExtra}%` }} />
                          <div className="h-full bg-orange-400" style={{ width: `${pctRework}%` }} />
                        </div>
                        <div className="text-xs font-semibold text-gray-800">{fmtH(total)}h</div>
                        {cell.actual > 0 && (
                          <div className="text-[10px] text-blue-600" title="Ejecutado">E: {fmtH(cell.actual)}h</div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">--</span>
                    )}
                  </div>
                );
              });

              return (
                <React.Fragment key={u.userId}>
                  <div className="contents">
                    <div
                      className="px-3 py-2 border-b border-r border-gray-200 flex items-center gap-2 min-w-0 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleToggleExpand(u.userId)}
                    >
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-gray-200 shrink-0 text-gray-500"
                        onClick={(e) => { e.stopPropagation(); handleToggleExpand(u.userId); }}
                        title={expandedUserId === u.userId ? 'Contraer' : 'Expandir tareas'}
                      >
                        {expandedUserId === u.userId ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
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
                      {u.overdueCount > 0 && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded shrink-0" title="Tareas retrasadas">
                          +{u.overdueCount}
                        </span>
                      )}
                    </div>
                    {cells}
                    <div className="px-2 py-2 border-b border-gray-200 text-center">
                      <span className="text-sm font-bold text-gray-800">{fmtH(totalWeek)}h</span>
                    </div>
                  </div>
                  {expandedUserId === u.userId && (
                    <div
                      className="col-span-full grid gap-0 border-b border-gray-200 bg-gray-50/80"
                      style={{ gridTemplateColumns: `minmax(140px, 1fr) repeat(7, minmax(90px, 1fr)) minmax(70px, 1fr)` }}
                    >
                      <div className="px-3 py-2 text-xs font-medium text-gray-600 col-span-full">
                        Desglose por tarea
                      </div>
                      {tasksLoading ? (
                        <div className="col-span-full px-3 py-4 text-sm text-gray-500">Cargando...</div>
                      ) : expandedTasks.length === 0 ? (
                        <div className="col-span-full px-3 py-4 text-sm text-gray-500">Sin tareas en esta semana</div>
                      ) : (
                        expandedTasks.map((t, i) => {
                          const dayCells = weekDays.map((d) => {
                            const match = t.dateStr === d.dateStr;
                            return (
                              <div key={d.dateStr} className="px-2 py-1 border-r border-gray-100 text-center">
                                {match ? (
                                  <span className="text-xs text-gray-700" title={t.taskName}>
                                    {fmtH(t.minutes)}h
                                  </span>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </div>
                            );
                          });
                          return (
                            <React.Fragment key={i}>
                              <div className="px-3 py-1 text-xs text-gray-700 truncate border-r border-gray-200" title={t.taskName}>
                                {t.taskName}
                              </div>
                              {dayCells}
                              <div className="px-2 py-1 text-center">
                                <span className="text-xs font-medium">{fmtH(t.minutes)}h</span>
                              </div>
                            </React.Fragment>
                          );
                        })
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" /> Tareas</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Retrasos</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-400 inline-block" /> Extras</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" /> Retrabajos</span>
        <span className="text-blue-600">E = Ejecutado</span>
      </div>
    </div>
  );
}
