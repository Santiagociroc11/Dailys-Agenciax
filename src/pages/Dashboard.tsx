import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Target, 
  TrendingUp, 
  Calendar,
  BarChart3,
  Users,
  Briefcase
} from 'lucide-react';

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

interface UserStats {
  userId: string;
  userName: string;
  metrics: PerformanceMetrics;
}

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [userMetrics, setUserMetrics] = useState<PerformanceMetrics | null>(null);
  const [teamMetrics, setTeamMetrics] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, [user, isAdmin]);

  async function fetchMetrics() {
    try {
      if (isAdmin) {
        await fetchTeamMetrics();
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
    // Obtener tareas completadas (incluyendo aprobadas)
    const { data: completedTasks } = await supabase
      .from('task_work_assignments')
      .select('*, tasks(deadline, status_history)')
      .eq('user_id', userId)
      .in('status', ['completed', 'approved']);

    // Obtener todas las subtareas del usuario para un desglose de estado detallado
    const { data: allUserSubtasks, error: subtasksError } = await supabase
      .from('subtasks')
      .select('status, created_at, tasks(deadline)')
      .eq('assigned_to', userId);

    if (subtasksError) {
      console.error('Error fetching user subtasks:', subtasksError);
    }
    
    // NOTA: Esta función ahora solo se usa para el dashboard individual.
    // Los parámetros de equipo se calculan directamente en fetchTeamMetrics.
    const individualMetrics = calculateUserMetrics(completedTasks || [], allUserSubtasks || [], new Map(), new Map(), userId, 0);
    return individualMetrics;
  }

  async function fetchTeamMetrics() {
    setLoading(true);
    try {
      // 1. Obtener todos los datos necesarios en paralelo
      const [
        { data: users, error: usersError },
        { data: allTasks, error: tasksError },
        { data: allSubtasks, error: subtasksError },
        { data: allAssignments, error: assignmentsError }
      ] = await Promise.all([
        supabase.from('users').select('id, name, email'),
        supabase.from('tasks').select('id, is_sequential, status, assigned_users, feedback'),
        supabase.from('subtasks').select('id, task_id, assigned_to, status, sequence_order, feedback'),
        supabase.from('task_work_assignments').select('user_id, date, status, updated_at')
      ]);

      if (usersError || tasksError || subtasksError || assignmentsError) {
        console.error("Error fetching batch data:", { usersError, tasksError, subtasksError, assignmentsError });
        setTeamMetrics([]);
        return;
      }

      // 2. Procesar datos para búsquedas eficientes
      const allTasksMap = new Map(allTasks.map(task => [task.id, task]));
      const allSubtasksByTaskMap = new Map<string, any[]>();
      allSubtasks.forEach(subtask => {
        if (!allSubtasksByTaskMap.has(subtask.task_id)) {
          allSubtasksByTaskMap.set(subtask.task_id, []);
        }
        allSubtasksByTaskMap.get(subtask.task_id)!.push(subtask);
      });

      const todayStr = new Date().toISOString().split('T')[0];
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      // 3. Calcular métricas para cada usuario
      const teamStats = users.map(user => {
        const userSubtasks = allSubtasks.filter(s => s.assigned_to === user.id);
        const userAssignments = allAssignments.filter(a => a.user_id === user.id);
        const userTasks = allTasks.filter(t => t.assigned_users?.includes(user.id));

        // Métrica: Carga de Hoy
        const todaysLoad = userAssignments.filter(a => a.date === todayStr && !['completed', 'approved'].includes(a.status)).length;
        
        // Métrica: Atrasadas
        const overdueTasks = userAssignments.filter(a => a.date < todayStr && !['completed', 'approved'].includes(a.status)).length;
        
        // Métrica: En Revisión (considera tasks y subtasks)
        const subtasksInReview = userSubtasks.filter(s => ['completed', 'in_review'].includes(s.status)).length;
        const tasksInReview = userTasks.filter(t => ['completed', 'in_review'].includes(t.status)).length;
        const totalTasksInReview = subtasksInReview + tasksInReview;
        
        // Métrica: Devueltas (considera tasks y subtasks)
        const subtasksReturned = userSubtasks.filter(s => s.status === 'returned').length;
        const tasksReturned = userTasks.filter(t => t.status === 'returned').length;
        const totalTasksReturned = subtasksReturned + tasksReturned;
        
        // Métrica: Aprobadas (Mes) - Lógica corregida
        const approvedSubtasks = userSubtasks.filter(subtask => {
          if (subtask.status !== 'approved' || !subtask.feedback) return false;
          
          let feedbackData: any = {};
          if (typeof subtask.feedback === 'string') {
              try { feedbackData = JSON.parse(subtask.feedback); } catch { return false; }
          } else if (typeof subtask.feedback === 'object' && subtask.feedback !== null) {
              feedbackData = subtask.feedback;
          }
          
          const approvalDateStr = feedbackData.reviewed_at || feedbackData.approved_at;
          if (!approvalDateStr) return false;
      
          return new Date(approvalDateStr) >= monthAgo;
        }).length;
      
        const approvedTasks = userTasks.filter(task => {
            if (task.status !== 'approved' || !task.feedback) return false;
        
            let feedbackData: any = {};
            if (typeof task.feedback === 'string') {
                try { feedbackData = JSON.parse(task.feedback); } catch { return false; }
            } else if (typeof task.feedback === 'object' && task.feedback !== null) {
                feedbackData = task.feedback;
            }
        
            const approvalDateStr = feedbackData.reviewed_at || feedbackData.approved_at;
            if (!approvalDateStr) return false;
        
            return new Date(approvalDateStr) >= monthAgo;
        }).length;
      
        const tasksApprovedThisMonth = approvedSubtasks + approvedTasks;

        // Métrica: Pendientes (Disponibles) - La lógica compleja
        let availableCount = 0;
        const pendingSubtasks = userSubtasks.filter(s => s.status === 'pending');
        const processedParentTasks = new Set();

        for (const subtask of pendingSubtasks) {
          const parentTask = allTasksMap.get(subtask.task_id);
          if (!parentTask || !parentTask.is_sequential) {
            availableCount++;
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
            if (currentLevelSubtasks.every(s => s.status === 'approved')) continue;
            
            let allPreviousApproved = true;
            for (const prevOrder of sortedOrders) {
              if (prevOrder >= order) break;
              if (!groupedByOrder.get(prevOrder)!.every(s => s.status === 'approved')) {
                allPreviousApproved = false;
                break;
              }
            }
            if (allPreviousApproved) {
              const userSubtasksInLevel = currentLevelSubtasks.filter(s => s.assigned_to === user.id && s.status === 'pending');
              availableCount += userSubtasksInLevel.length;
            }
            break; 
          }
        }
        const tasksPending = availableCount;

        return {
          userId: user.id,
          userName: user.name || user.email,
          metrics: {
            tasksPending,
            todaysLoad,
            tasksInReview: totalTasksInReview,
            tasksReturned: totalTasksReturned,
            overdueTasks,
            tasksApprovedThisMonth,
          } as PerformanceMetrics,
        };
      });

      setTeamMetrics(teamStats);
    } catch (error) {
      console.error("Error in fetchTeamMetrics:", error);
      setTeamMetrics([]);
    } finally {
      setLoading(false);
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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">
          {isAdmin ? 'Dashboard de Equipo' : 'Mi Dashboard'}
        </h1>
        <p className="text-gray-600">
          {isAdmin 
            ? 'Métricas de rendimiento del equipo' 
            : `Bienvenido/a, ${user?.name || user?.email}`
          }
        </p>
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

      {isAdmin && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Users className="w-6 h-6 mr-2 text-gray-800" />
            Métricas del Equipo
          </h2>
          {loading ? (
             <div className="py-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-800 mx-auto mb-2"></div>
                <p>Calculando métricas del equipo...</p>
              </div>
          ) : teamMetrics.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3">Usuario</th>
                      <th scope="col" className="px-6 py-3 text-center">Carga Activa</th>
                      <th scope="col" className="px-6 py-3 text-center">Pendientes</th>
                      <th scope="col" className="px-6 py-3 text-center">En Revisión</th>
                      <th scope="col" className="px-6 py-3 text-center">Devueltas</th>
                      <th scope="col" className="px-6 py-3 text-center">Aprobadas (Mes)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMetrics
                      .sort((a, b) => (b.metrics.todaysLoad + b.metrics.overdueTasks) - (a.metrics.todaysLoad + a.metrics.overdueTasks))
                      .map(({ userId, userName, metrics }) => (
                      <tr key={userId} className="bg-white border-b hover:bg-gray-50">
                        <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                          {userName}
                        </th>
                        <td className="px-6 py-4 text-center">
                          <div className="font-bold text-lg">{metrics.todaysLoad + metrics.overdueTasks}</div>
                          {metrics.overdueTasks > 0 && (
                            <div className="text-red-500 text-xs" title={`${metrics.overdueTasks} tareas atrasadas`}>
                              {metrics.overdueTasks} atrasada{metrics.overdueTasks > 1 ? 's' : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">{metrics.tasksPending}</td>
                        <td className="px-6 py-4 text-center">
                           {metrics.tasksInReview > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-1 text-sm font-bold leading-none text-blue-800 bg-blue-100 rounded-full">{metrics.tasksInReview}</span>
                          ) : ( 0 )}
                        </td>
                         <td className="px-6 py-4 text-center">
                          {metrics.tasksReturned > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-1 text-sm font-bold leading-none text-orange-800 bg-orange-100 rounded-full">{metrics.tasksReturned}</span>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-green-600">{metrics.tasksApprovedThisMonth}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h3 className="text-md font-semibold text-gray-800 mb-3">Leyenda de la Tabla</h3>
                <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
                  <li><strong className="font-semibold text-gray-900">Carga Activa:</strong> Total de tareas asignadas al usuario. El texto rojo debajo indica cuántas de ellas están atrasadas.</li>
                  <li><strong className="font-semibold text-gray-900">Pendientes:</strong> Tareas disponibles que el usuario podría auto-asignarse (su "backlog" personal).</li>
                  <li><strong className="font-semibold text-gray-900">En Revisión:</strong> Tareas entregadas por el usuario que esperan tu aprobación.</li>
                  <li><strong className="font-semibold text-gray-900">Devueltas:</strong> Tareas que devolviste para corrección. Es un indicador de calidad.</li>
                  <li><strong className="font-semibold text-gray-900">Aprobadas (Mes):</strong> Total de tareas finalizadas y aprobadas en los últimos 30 días.</li>
                </ul>
              </div>
            </>
          ) : (
            <p className="text-gray-600 italic">No hay datos de equipo para mostrar o se están cargando.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;