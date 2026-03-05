import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, AlertCircle } from 'lucide-react';

interface DailyHoursUser {
  userId: string;
  userName: string;
  totalMinutes: number;
  assignedTodayMinutes: number;
  taskCount: number;
  assignedTodayCount: number;
  actualMinutesToday: number;
  overdueCount: number;
  overdueMinutes: number;
}

const TARGET_HOURS_PER_DAY = 8;
const TARGET_MINUTES_PER_DAY = TARGET_HOURS_PER_DAY * 60;

export default function DailyHoursControl() {
  const [dailyHoursControl, setDailyHoursControl] = useState<DailyHoursUser[]>([]);
  const [loading, setLoading] = useState(true);

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

      const { data: users } = await supabase.from('users').select('id, name, email');
      const userList = users || [];

      const [
        { data: todayAssignments, error },
        { data: overdueAssignments, error: overdueError },
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
      ]);

      if (error) throw error;
      if (overdueError) console.warn('Error cargando retrasadas:', overdueError);

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

      const byUser = new Map<string, { total: number; assignedToday: number; count: number; assignedTodayCount: number; actual: number; overdueCount: number; overdueMinutes: number }>();

      userList.forEach((u) => {
        byUser.set(u.id, { total: 0, assignedToday: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0 });
      });

      filteredAssignments.forEach((a: { user_id: string; estimated_duration?: number; actual_duration?: number | null; created_at?: string }) => {
        const uid = a.user_id;
        if (!byUser.has(uid)) {
          byUser.set(uid, { total: 0, assignedToday: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0 });
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

      filteredOverdue.forEach((a: { user_id: string; estimated_duration?: number }) => {
        const uid = a.user_id;
        if (!byUser.has(uid)) {
          byUser.set(uid, { total: 0, assignedToday: 0, count: 0, assignedTodayCount: 0, actual: 0, overdueCount: 0, overdueMinutes: 0 });
        }
        const row = byUser.get(uid)!;
        row.overdueCount += 1;
        row.overdueMinutes += a.estimated_duration ?? 0;
      });

      const result: DailyHoursUser[] = Array.from(byUser.entries()).map(([uid, data]) => ({
        userId: uid,
        userName: userList.find((u) => u.id === uid)?.name || userList.find((u) => u.id === uid)?.email || uid,
        totalMinutes: data.total,
        assignedTodayMinutes: data.assignedToday,
        taskCount: data.count,
        assignedTodayCount: data.assignedTodayCount,
        actualMinutesToday: data.actual,
        overdueCount: data.overdueCount,
        overdueMinutes: data.overdueMinutes,
      }));

      setDailyHoursControl(
        result.sort((a, b) => {
          if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
          return b.totalMinutes - a.totalMinutes;
        })
      );
    } catch (e) {
      console.error('Error fetching daily hours control:', e);
      setDailyHoursControl([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-300 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Clock className="w-8 h-8 text-blue-600" />
          Control de Horas Diarias
        </h1>
        <p className="text-gray-600">
          Meta: {TARGET_HOURS_PER_DAY} horas/día por usuario. Verde oscuro = planificado antes. Verde claro = asignado hoy mismo.
        </p>
        {dailyHoursControl.some((u) => u.overdueCount > 0) && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="text-red-800 font-medium">
              {dailyHoursControl.filter((u) => u.overdueCount > 0).length} usuario
              {dailyHoursControl.filter((u) => u.overdueCount > 0).length !== 1 ? 's' : ''} con tareas retrasadas
              ({dailyHoursControl.reduce((s, u) => s + u.overdueCount, 0)} en total)
            </span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          {dailyHoursControl.length === 0 ? (
            <p className="text-gray-600 italic">No hay usuarios en el equipo.</p>
          ) : (
            dailyHoursControl.map((u) => {
              const meetsTarget = u.totalMinutes >= TARGET_MINUTES_PER_DAY;
              const pctTotal = (u.totalMinutes / TARGET_MINUTES_PER_DAY) * 100;
              const pctPrePlanned = ((u.totalMinutes - u.assignedTodayMinutes) / TARGET_MINUTES_PER_DAY) * 100;
              const pctAssignedToday = (u.assignedTodayMinutes / TARGET_MINUTES_PER_DAY) * 100;
              const barPrePlanned = Math.min(100, pctPrePlanned);
              const barAssignedToday = Math.min(100 - barPrePlanned, pctAssignedToday);
              const deficit = Math.max(0, TARGET_MINUTES_PER_DAY - u.totalMinutes);
              const totalHours = (u.totalMinutes / 60).toFixed(1);
              const assignedTodayHours = (u.assignedTodayMinutes / 60).toFixed(1);
              const actualHours = (u.actualMinutesToday / 60).toFixed(1);

              return (
                <div
                  key={u.userId}
                  className={`p-4 rounded-lg border ${
                    meetsTarget ? 'bg-green-50/50 border-green-200' : 'bg-amber-50/50 border-amber-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-medium text-gray-900">{u.userName}</span>
                    <div className="flex items-center gap-3 text-sm flex-wrap">
                      <span className="text-gray-600">
                        {u.taskCount} tarea{u.taskCount !== 1 ? 's' : ''} · {totalHours}h planificadas
                      </span>
                      {u.assignedTodayCount > 0 && (
                        <span className="text-green-700 font-medium">
                          {u.assignedTodayCount} asignada{u.assignedTodayCount !== 1 ? 's' : ''} hoy ({assignedTodayHours}h)
                        </span>
                      )}
                      {u.actualMinutesToday > 0 && (
                        <span className="text-blue-600">
                          {actualHours}h imputadas
                        </span>
                      )}
                      {u.overdueCount > 0 && (
                        <span className="text-red-600 font-medium flex items-center gap-1" title="Tareas con date anterior a hoy, sin completar">
                          <AlertCircle className="w-4 h-4" />
                          {u.overdueCount} retrasada{u.overdueCount !== 1 ? 's' : ''} ({(u.overdueMinutes / 60).toFixed(1)}h)
                        </span>
                      )}
                      {!meetsTarget && (
                        <span className="text-amber-700 font-medium">
                          Faltan {(deficit / 60).toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-700 transition-all"
                      style={{ width: `${barPrePlanned}%` }}
                      title="Planificado antes"
                    />
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{ width: `${barAssignedToday}%` }}
                      title="Asignado hoy"
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {Math.min(100, pctTotal).toFixed(0)}% de la meta (8h)
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
