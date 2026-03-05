import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { apiUrl } from '../lib/apiBase';
import DailyHoursControl from './DailyHoursControl';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Target, 
  TrendingUp, 
  Briefcase,
  DollarSign
} from 'lucide-react';
import { getProjectHoursConsumed, getProjectCostConsumed } from '../lib/metrics';

interface PerformanceMetrics {
  tasksPending: number;
  todaysLoad: number;
  tasksInReview: number;
  tasksReturned: number;
  overdueTasks: number;
  tasksApprovedThisMonth: number;
  
  // Métricas para el dashboard individual (pueden mantenerse o simplificarse)
  tasksCompleted: number;
  tasksCompletedThisWeek: number;
  tasksCompletedThisMonth: number;
  averageTasksPerDay: number;
  averageCompletionTime: number;
  efficiencyRatio: number;
  onTimeDeliveryRate: number;
  approvalRate: number;
  reworkRate: number;
  currentActiveTasks: number;
  upcomingDeadlines: number;
}

interface BudgetAlert {
  projectId: string;
  projectName: string;
  hoursConsumed: number;
  budgetHours: number;
  percentConsumed: number;
  status: 'over' | 'warning';
  costConsumed?: { cost: number; currency: string }[];
  budgetAmount?: number | null;
}

interface ActivePayrollSummary {
  total: number;
  currency: string;
  count: number;
}

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [userMetrics, setUserMetrics] = useState<PerformanceMetrics | null>(null);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [activePayroll, setActivePayroll] = useState<ActivePayrollSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportSending, setReportSending] = useState<'morning' | 'evening' | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, [user, isAdmin]);

  async function sendAdminReport(type: 'morning' | 'evening') {
    setReportSending(type);
    try {
      const endpoint = type === 'morning' ? '/api/telegram/admin-morning-report' : '/api/telegram/admin-evening-report';
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || (type === 'morning' ? 'Panorama del día enviado.' : 'Resumen de entregas enviado.'));
      } else {
        toast.error(data.error || 'Error al enviar.');
      }
    } catch (e) {
      toast.error('Error de red.');
      console.error(e);
    } finally {
      setReportSending(null);
    }
  }

  async function fetchMetrics() {
    try {
      if (isAdmin) {
        setLoading(true);
        await Promise.all([fetchBudgetAlerts(), fetchActivePayroll()]);
      } else if (user?.id) {
        await fetchUserMetrics(user.id);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserMetrics(userId: string) {
    const metrics = await getUserMetrics(userId);
    setUserMetrics(metrics);
  }

  async function getUserMetrics(userId: string): Promise<PerformanceMetrics> {
    const { data: activeProjects } = await supabase.from('projects').select('id').eq('is_archived', false);
    const activeProjectIds = (activeProjects || []).map((p) => p.id);
    if (activeProjectIds.length === 0) {
      return calculateUserMetrics([], [], new Map(), new Map(), userId, 0);
    }
    const { data: completedTasks } = await supabase
      .from('task_work_assignments')
      .select('*, tasks(deadline, status_history)')
      .eq('user_id', userId)
      .in('status', ['completed', 'approved'])
      .in('project_id', activeProjectIds);

    const { data: activeTasks } = await supabase.from('tasks').select('id').in('project_id', activeProjectIds);
    const activeTaskIds = (activeTasks || []).map((t) => t.id).filter(Boolean);
    const { data: allUserSubtasks, error: subtasksError } = activeTaskIds.length > 0
      ? await supabase.from('subtasks').select('status, created_at, tasks(deadline)').eq('assigned_to', userId).in('task_id', activeTaskIds)
      : { data: [], error: null };

    if (subtasksError) {
      console.error('Error fetching user subtasks:', subtasksError);
    }
    const individualMetrics = calculateUserMetrics(completedTasks || [], allUserSubtasks || [], new Map(), new Map(), userId, 0);
    return individualMetrics;
  }

  async function fetchBudgetAlerts() {
    try {
      const [hoursMap, costRows, { data: projects }] = await Promise.all([
        getProjectHoursConsumed(),
        getProjectCostConsumed(),
        supabase.from('projects').select('id, name, budget_hours, budget_amount').eq('is_archived', false),
      ]);
      const costByProject: Record<string, { cost: number; currency: string }[]> = {};
      costRows.forEach((r) => {
        if (!costByProject[r.project_id]) costByProject[r.project_id] = [];
        costByProject[r.project_id].push({ cost: r.cost_consumed, currency: r.currency });
      });
      const alerts: BudgetAlert[] = [];
      (projects || []).forEach((p: { id: string; name: string; budget_hours?: number | null; budget_amount?: number | null }) => {
        if (p.budget_hours == null || p.budget_hours <= 0) return;
        const consumed = hoursMap[p.id] ?? 0;
        const percent = Math.round((consumed / p.budget_hours) * 100);
        if (percent >= 80) {
          alerts.push({
            projectId: p.id,
            projectName: p.name,
            hoursConsumed: consumed,
            budgetHours: p.budget_hours,
            percentConsumed: percent,
            status: percent >= 100 ? 'over' : 'warning',
            costConsumed: costByProject[p.id],
            budgetAmount: p.budget_amount,
          });
        }
      });
      setBudgetAlerts(alerts.sort((a, b) => b.percentConsumed - a.percentConsumed));
    } catch (e) {
      console.error('Error fetching budget alerts:', e);
      setBudgetAlerts([]);
    }
  }

  async function fetchActivePayroll() {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, monthly_salary, hourly_rate, currency')
        .not('is_active', 'eq', false);
      if (error) throw error;
      const byCurrency: Record<string, { total: number; count: number }> = {};
      const HOURS_PER_MONTH = 160;
      (users || []).forEach((u: { monthly_salary?: number | null; hourly_rate?: number | null; currency?: string }) => {
        const hasSalary = u.monthly_salary != null && u.monthly_salary > 0;
        const hasHourly = u.hourly_rate != null && u.hourly_rate > 0;
        const amount = hasSalary && u.monthly_salary
          ? u.monthly_salary
          : hasHourly && u.hourly_rate
            ? u.hourly_rate * HOURS_PER_MONTH
            : 0;
        if (amount <= 0) return;
        const cur = u.currency || 'COP';
        if (!byCurrency[cur]) byCurrency[cur] = { total: 0, count: 0 };
        byCurrency[cur].total += amount;
        byCurrency[cur].count += 1;
      });
      setActivePayroll(
        Object.entries(byCurrency).map(([currency, v]) => ({
          total: v.total,
          currency,
          count: v.count,
        }))
      );
    } catch (e) {
      console.error('Error fetching active payroll:', e);
      setActivePayroll([]);
    }
  }

  function calculateUserMetrics(
    completedTasks: any[],
    allUserSubtasks: any[],
    allTasksMap: Map<string, any>,
    allSubtasksByTaskMap: Map<string, any[]>,
    userId: string,
    _tasksInProgress_unused: number // Renombrado para indicar que no se usa
  ): PerformanceMetrics {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Métricas básicas de finalización (de task_work_assignments)
    const tasksCompleted = completedTasks?.length || 0;
    const tasksCompletedThisWeek = completedTasks?.filter(t => 
      new Date(t.updated_at) >= weekAgo
    ).length || 0;
    const tasksCompletedThisMonth = completedTasks?.filter(t => 
      new Date(t.updated_at) >= monthAgo
    ).length || 0;

    // Desglose de estado (de subtasks) - Mantenido para el dashboard individual
    const tasksDelivered = allUserSubtasks.filter(t => ['completed', 'in_review'].includes(t.status)).length;
    const tasksApprovedThisMonth = allUserSubtasks.filter(t => t.status === 'approved' && new Date(t.created_at) >= monthAgo).length;

    // Lógica para Tareas Disponibles (pending y no bloqueadas por secuencia)
    let availableCount = 0;
    const pendingSubtasks = allUserSubtasks.filter(s => s.status === 'pending');
    const processedParentTasks = new Set();

    for (const subtask of pendingSubtasks) {
      const parentTask = allTasksMap.get(subtask.task_id);

      if (!parentTask || !parentTask.is_sequential) {
        availableCount++; // No es secuencial, o no tiene padre, se cuenta si está pendiente
        continue;
      }

      if (processedParentTasks.has(parentTask.id)) continue;
      processedParentTasks.add(parentTask.id);

      const allSubtasksForTask = allSubtasksByTaskMap.get(parentTask.id) || [];
      const groupedByOrder = new Map<number, any[]>();
      allSubtasksForTask.forEach(s => {
        const order = s.sequence_order || 0;
        if (!groupedByOrder.has(order)) groupedByOrder.set(order, []);
        groupedByOrder.get(order)!.push(s);
      });
      const sortedOrders = Array.from(groupedByOrder.keys()).sort((a, b) => a - b);

      for (const order of sortedOrders) {
        const currentLevelSubtasks = groupedByOrder.get(order)!;
        if (currentLevelSubtasks.every(s => s.status === 'approved')) {
          continue;
        }
        
        let allPreviousApproved = true;
        for (const prevOrder of sortedOrders) {
          if (prevOrder >= order) break;
          if (!groupedByOrder.get(prevOrder)!.every(s => s.status === 'approved')) {
            allPreviousApproved = false;
            break;
          }
        }

        if (allPreviousApproved) {
          const userSubtasksInLevel = currentLevelSubtasks.filter(s => s.assigned_to === userId && s.status === 'pending');
          availableCount += userSubtasksInLevel.length;
        }
        break; 
      }
    }
    const tasksPending = availableCount;

    // Eficiencia temporal (de task_work_assignments)
    const tasksWithDuration = completedTasks?.filter(t => 
      t.actual_duration && t.estimated_duration
    ) || [];
    
    const efficiencyRatio = tasksWithDuration.length > 0 
      ? tasksWithDuration.reduce((acc, t) => acc + (t.estimated_duration / t.actual_duration), 0) / tasksWithDuration.length 
      : 1;

    // Entrega a tiempo
    const onTimeDeliveryRate = completedTasks?.length > 0
      ? completedTasks.filter(t => {
          if (!t.tasks?.deadline) return true;
          return new Date(t.updated_at) <= new Date(t.tasks.deadline);
        }).length / completedTasks.length
      : 0;

    const activeAndReturnedTasks = allUserSubtasks.filter(t => ['pending', 'in_progress', 'in_review', 'returned'].includes(t.status));

    // Tareas atrasadas
    const overdueTasks = activeAndReturnedTasks.filter(t => 
      t.tasks?.deadline && new Date(t.tasks.deadline) < now && t.status !== 'completed' && t.status !== 'approved'
    ).length || 0;

    // Próximos vencimientos (próximos 3 días)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = activeAndReturnedTasks.filter(t => 
      t.tasks?.deadline && 
      new Date(t.tasks.deadline) >= now && 
      new Date(t.tasks.deadline) <= threeDaysFromNow
    ).length || 0;

    return {
      tasksCompleted,
      tasksCompletedThisWeek,
      tasksCompletedThisMonth,
      averageTasksPerDay: tasksCompletedThisMonth / 30,
      tasksPending,
      todaysLoad: 0, // No se usa en el dashboard individual
      tasksInReview: tasksDelivered, // Reutilizar 'tasksDelivered' para 'tasksInReview'
      tasksReturned: allUserSubtasks.filter(t => t.status === 'returned').length,
      tasksApprovedThisMonth,
      averageCompletionTime: tasksWithDuration.length > 0
        ? tasksWithDuration.reduce((acc, t) => acc + t.actual_duration, 0) / tasksWithDuration.length
        : 0,
      efficiencyRatio,
      onTimeDeliveryRate,
      approvalRate: 0.85, // Esto requeriría más lógica para calcular
      reworkRate: 0.15,   // Esto requeriría más lógica para calcular
      currentActiveTasks: activeAndReturnedTasks.length,
      upcomingDeadlines,
      overdueTasks
    };
  }

  function getPerformanceLevel(efficiencyRatio: number): { level: string; color: string } {
    if (efficiencyRatio >= 1.2) return { level: 'Excelente', color: 'text-green-600' };
    if (efficiencyRatio >= 1.0) return { level: 'Bueno', color: 'text-blue-600' };
    if (efficiencyRatio >= 0.8) return { level: 'Regular', color: 'text-yellow-600' };
    return { level: 'Necesita Mejora', color: 'text-red-600' };
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-300 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAdmin ? 'Panel Principal' : 'Mi Dashboard'}
          </h1>
          <p className="text-gray-600 text-sm mt-0.5">
            {isAdmin 
              ? 'Control de jornada y resumen del equipo' 
              : `Bienvenido/a, ${user?.name || user?.email}`
            }
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => sendAdminReport('morning')}
              disabled={reportSending !== null}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {reportSending === 'morning' ? '…' : '📊 Panorama 10AM'}
            </button>
            <button
              onClick={() => sendAdminReport('evening')}
              disabled={reportSending !== null}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {reportSending === 'evening' ? '…' : '📋 Entregas 5PM'}
            </button>
          </div>
        )}
      </div>

      {!isAdmin && userMetrics && (
        <>
          {/* KPIs Principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Tareas Completadas</p>
                  <p className="text-2xl font-bold text-green-600">{userMetrics.tasksCompleted}</p>
                  <p className="text-xs text-gray-500">
                    {userMetrics.tasksCompletedThisWeek} esta semana
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Eficiencia</p>
                  <p className={`text-2xl font-bold ${getPerformanceLevel(userMetrics.efficiencyRatio).color}`}>
                    {(userMetrics.efficiencyRatio * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-gray-500">
                    {getPerformanceLevel(userMetrics.efficiencyRatio).level}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Entrega a Tiempo</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {(userMetrics.onTimeDeliveryRate * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-gray-500">Últimos 30 días</p>
                </div>
                <Clock className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Tareas Activas</p>
                  <p className="text-2xl font-bold text-purple-600">{userMetrics.currentActiveTasks}</p>
                  <p className="text-xs text-gray-500">
                    {userMetrics.overdueTasks} atrasadas
                  </p>
                </div>
                <Briefcase className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>

          {/* Métricas Detalladas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2 text-blue-600" />
                Métricas de Productividad
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Promedio diario de tareas:</span>
                  <span className="font-medium">{userMetrics.averageTasksPerDay.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tiempo promedio por tarea:</span>
                  <span className="font-medium">{Math.round(userMetrics.averageCompletionTime)} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tareas este mes:</span>
                  <span className="font-medium">{userMetrics.tasksCompletedThisMonth}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
                Alertas y Próximos Vencimientos
              </h3>
              <div className="space-y-3">
                {userMetrics.overdueTasks > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-red-800 font-medium">
                      ⚠️ {userMetrics.overdueTasks} tarea{userMetrics.overdueTasks > 1 ? 's' : ''} atrasada{userMetrics.overdueTasks > 1 ? 's' : ''}
                    </p>
                  </div>
                )}
                {userMetrics.upcomingDeadlines > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-yellow-800 font-medium">
                      📅 {userMetrics.upcomingDeadlines} tarea{userMetrics.upcomingDeadlines > 1 ? 's' : ''} vence{userMetrics.upcomingDeadlines > 1 ? 'n' : ''} en 3 días
                    </p>
                  </div>
                )}
                {userMetrics.overdueTasks === 0 && userMetrics.upcomingDeadlines === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <p className="text-green-800 font-medium">
                      ✅ No hay tareas atrasadas ni vencimientos próximos
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {isAdmin && (activePayroll.length > 0 || budgetAlerts.length > 0) && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {activePayroll.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Nómina Activa
              </h3>
              <div className="flex flex-wrap gap-3">
                {activePayroll.map((p) => (
                  <span key={p.currency} className="text-lg font-bold text-emerald-700">
                    {p.total.toLocaleString('es-CO')} {p.currency}
                    <span className="text-sm font-normal text-gray-500 ml-1">/ mes ({p.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {budgetAlerts.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-500">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Alertas de Presupuesto
              </h3>
              <div className="space-y-1.5">
                {budgetAlerts.slice(0, 3).map((a) => (
                  <div key={a.projectId} className="flex justify-between items-center text-sm">
                    <span className="font-medium text-gray-800 truncate">{a.projectName}</span>
                    <span className={`font-semibold shrink-0 ml-2 ${a.status === 'over' ? 'text-red-600' : 'text-amber-600'}`}>
                      {a.percentConsumed}%
                    </span>
                  </div>
                ))}
                {budgetAlerts.length > 3 && (
                  <p className="text-xs text-gray-500 pt-1">+{budgetAlerts.length - 3} más</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isAdmin && <DailyHoursControl embedded />}
    </div>
  );
};

export default Dashboard;