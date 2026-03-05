import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Clock } from 'lucide-react';

interface DailyHoursUser {
  userId: string;
  userName: string;
  totalMinutes: number;
  assignedTodayMinutes: number;
  taskCount: number;
  assignedTodayCount: number;
  actualMinutesToday: number;
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
      const todayStr = new Date().toISOString().split('T')[0];
      const todayStart = new Date(todayStr + 'T00:00:00');
      const todayEnd = new Date(todayStr + 'T23:59:59.999');

      const { data: activeProjects } = await supabase.from('projects').select('id').eq('is_archived', false);
      const activeProjectIds = (activeProjects || []).map((p) => p.id);

      const { data: users } = await supabase.from('users').select('id, name, email');
      const userList = users || [];

      if (activeProjectIds.length === 0) {
        setDailyHoursControl(
          userList.map((u) => ({
            userId: u.id,
            userName: u.name || u.email,
            totalMinutes: 0,
            assignedTodayMinutes: 0,
            taskCount: 0,
            assignedTodayCount: 0,
            actualMinutesToday: 0,
          }))
        );
        setLoading(false);
        return;
      }

      const { data: todayAssignments, error } = await supabase
        .from('task_work_assignments')
        .select('id, user_id, date, estimated_duration, actual_duration, created_at')
        .eq('date', todayStr)
        .in('project_id', activeProjectIds);

      if (error) throw error;

      const byUser = new Map<string, { total: number; assignedToday: number; count: number; assignedTodayCount: number; actual: number }>();

      userList.forEach((u) => {
        byUser.set(u.id, { total: 0, assignedToday: 0, count: 0, assignedTodayCount: 0, actual: 0 });
      });

      (todayAssignments || []).forEach((a: { user_id: string; estimated_duration?: number; actual_duration?: number | null; created_at?: string }) => {
        const uid = a.user_id;
        if (!byUser.has(uid)) {
          byUser.set(uid, { total: 0, assignedToday: 0, count: 0, assignedTodayCount: 0, actual: 0 });
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

      const result: DailyHoursUser[] = Array.from(byUser.entries()).map(([uid, data]) => ({
        userId: uid,
        userName: userList.find((u) => u.id === uid)?.name || userList.find((u) => u.id === uid)?.email || uid,
        totalMinutes: data.total,
        assignedTodayMinutes: data.assignedToday,
        taskCount: data.count,
        assignedTodayCount: data.assignedTodayCount,
        actualMinutesToday: data.actual,
      }));

      setDailyHoursControl(result.sort((a, b) => b.totalMinutes - a.totalMinutes));
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
                    <div className="flex items-center gap-3 text-sm">
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
