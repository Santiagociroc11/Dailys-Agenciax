import { supabase } from './supabase';

export interface UserMetrics {
  userId: string;
  userName: string;
  userEmail: string;
  tasksCompleted: number;
  tasksAssigned: number;
  tasksApproved: number;
  tasksReturned: number;
  completionRate: number;
  approvalRate: number;
  reworkRate: number;
  averageCompletionTime: number;
  efficiencyRatio: number;
  onTimeDeliveryRate: number;
  overdueTasks: number;
  upcomingDeadlines: number;
  averageTasksPerDay: number;
  tasksCompletedThisWeek: number;
  tasksCompletedThisMonth: number;
}

export interface ProjectMetrics {
  projectId: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  teamSize: number;
  averageTimePerTask: number;
  onSchedule: boolean;
  daysUntilDeadline: number;
}

export interface AreaMetrics {
  areaId: string;
  areaName: string;
  totalUsers: number;
  activeUsers: number;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  averageEfficiency: number;
  averageTasksPerUser: number;
  topPerformers: string[];
  // Nuevas métricas de utilización y capacidad
  averageUtilizationRate: number; // % promedio de utilización del área
  totalHoursWorked: number; // Horas totales trabajadas en el área
  totalCapacityHours: number; // Capacidad total del área (usuarios × horas estándar)
  capacityUtilization: number; // % de capacidad utilizada
  workloadDistribution: number; // Qué tan equilibrada está la carga (0-100)
  isOverloaded: boolean; // >95% utilización
  isUnderloaded: boolean; // <60% utilización
  recommendedAction: 'hire' | 'redistribute' | 'optimal' | 'consider_reduction';
  workloadPressure: 'high' | 'medium' | 'low';
  utilizationTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface UtilizationMetrics {
  userId: string;
  userName: string;
  userEmail: string;
  workingHoursPerDay: number; // Horas laborales estándar (ej: 8)
  // Métricas diarias
  averageHoursWorkedPerDay: number;
  utilizationRate: number; // % de utilización (tiempo trabajado / tiempo disponible)
  idleTime: number; // Tiempo no utilizado en minutos
  // Métricas semanales
  totalHoursThisWeek: number;
  expectedHoursThisWeek: number;
  weeklyUtilizationRate: number;
  // Métricas mensuales
  totalHoursThisMonth: number;
  expectedHoursThisMonth: number;
  monthlyUtilizationRate: number;
  // Análisis de patrones
  mostProductiveTimeOfDay: string;
  averageTaskDuration: number;
  workingDaysThisMonth: number;
  // Indicadores
  isUnderutilized: boolean; // < 70%
  isOverutilized: boolean; // > 110%
  consistencyScore: number; // Qué tan consistente es el horario (0-100)
}

/**
 * Obtiene métricas completas de un usuario calculadas en tiempo real
 */
export async function getUserMetrics(userId: string): Promise<UserMetrics> {
  try {
    // Obtener información del usuario
    const { data: userData } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', userId)
      .single();

    // Obtener todas las asignaciones de trabajo del usuario
    const { data: assignments } = await supabase
      .from('task_work_assignments')
      .select(`
        *,
        tasks (
          id, title, deadline, status, created_at,
          projects (name)
        )
      `)
      .eq('user_id', userId);

    // Obtener subtareas asignadas al usuario
    const { data: subtasks } = await supabase
      .from('subtasks')
      .select(`
        *,
        tasks (
          id, title, deadline, status, created_at, project_id,
          projects (name)
        )
      `)
      .eq('assigned_to', userId);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Combinar tareas y subtareas para análisis
    const allTasks = [
      ...(assignments || []).map(a => ({
        ...a,
        type: 'task',
        deadline: a.tasks?.deadline,
        taskTitle: a.tasks?.title,
        projectName: a.tasks?.projects?.name,
        taskStatus: a.tasks?.status,
        createdAt: a.tasks?.created_at
      })),
      ...(subtasks || []).map(s => ({
        ...s,
        type: 'subtask',
        deadline: s.deadline,
        taskTitle: s.title,
        projectName: s.tasks?.projects?.name,
        taskStatus: s.status,
        createdAt: s.created_at,
        estimated_duration: s.estimated_duration,
        actual_duration: null, // Las subtareas no tienen actual_duration en task_work_assignments
        status: s.status,
        user_id: userId
      }))
    ];

    // Calcular métricas básicas
    const tasksCompleted = allTasks.filter(t => 
      ['approved'].includes(t.taskStatus || t.status)
    ).length;

    const tasksAssigned = allTasks.length;
    const completionRate = tasksAssigned > 0 ? (tasksCompleted / tasksAssigned) * 100 : 0;

    // Tareas completadas esta semana
    const tasksCompletedThisWeek = allTasks.filter(t => {
      const isCompleted = ['approved'].includes(t.taskStatus || t.status);
      const completedRecently = t.updated_at && new Date(t.updated_at) >= weekAgo;
      return isCompleted && completedRecently;
    }).length;

    // Tareas completadas este mes
    const tasksCompletedThisMonth = allTasks.filter(t => {
      const isCompleted = ['approved'].includes(t.taskStatus || t.status);
      const completedRecently = t.updated_at && new Date(t.updated_at) >= monthAgo;
      return isCompleted && completedRecently;
    }).length;

    // Calcular eficiencia temporal (solo para task_work_assignments que tienen actual_duration)
    const tasksWithDuration = (assignments || []).filter(a => 
      a.actual_duration && a.estimated_duration && a.actual_duration > 0
    );
    
    const efficiencyRatio = tasksWithDuration.length > 0
      ? tasksWithDuration.reduce((acc, t) => 
          acc + (t.estimated_duration / t.actual_duration), 0
        ) / tasksWithDuration.length
      : 0;

    // Tiempo promedio de finalización
    const averageCompletionTime = tasksWithDuration.length > 0
      ? tasksWithDuration.reduce((acc, t) => acc + t.actual_duration, 0) / tasksWithDuration.length
      : 0;

    // Calcular entrega a tiempo
    const completedTasksWithDeadline = allTasks.filter(t => {
      const isCompleted = ['approved'].includes(t.taskStatus || t.status);
      return isCompleted && t.deadline;
    });

    const onTimeDeliveries = completedTasksWithDeadline.filter(t => {
      const completionDate = t.updated_at || t.end_time;
      return completionDate && new Date(completionDate) <= new Date(t.deadline);
    }).length;

    const onTimeDeliveryRate = completedTasksWithDeadline.length > 0
      ? (onTimeDeliveries / completedTasksWithDeadline.length) * 100
      : 0;

    // Tareas atrasadas (activas y con deadline pasado)
    const overdueTasks = allTasks.filter(t => {
      const isActive = !['approved'].includes(t.taskStatus || t.status);
      const isOverdue = t.deadline && new Date(t.deadline) < now;
      return isActive && isOverdue;
    }).length;

    // Próximos vencimientos (próximos 3 días)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = allTasks.filter(t => {
      const isActive = !['approved'].includes(t.taskStatus || t.status);
      const hasUpcomingDeadline = t.deadline && 
        new Date(t.deadline) >= now && 
        new Date(t.deadline) <= threeDaysFromNow;
      return isActive && hasUpcomingDeadline;
    }).length;

    // Promedio de tareas por día (últimos 30 días)
    const daysWithTasks = new Set(
      allTasks
        .filter(t => t.createdAt && new Date(t.createdAt) >= monthAgo)
        .map(t => new Date(t.createdAt).toDateString())
    ).size;
    
    const averageTasksPerDay = daysWithTasks > 0 
      ? allTasks.filter(t => t.createdAt && new Date(t.createdAt) >= monthAgo).length / daysWithTasks 
      : 0;

    return {
      userId,
      userName: userData?.name || 'Usuario',
      userEmail: userData?.email || '',
      tasksCompleted,
      tasksAssigned,
      tasksApproved: tasksCompleted,
      tasksReturned: 0,
      completionRate,
      approvalRate: 100,
      reworkRate: 0,
      averageCompletionTime,
      efficiencyRatio,
      onTimeDeliveryRate,
      overdueTasks,
      upcomingDeadlines,
      averageTasksPerDay,
      tasksCompletedThisWeek,
      tasksCompletedThisMonth
    };
  } catch (error) {
    console.error(`Error fetching metrics for user ${userId}:`, error);
    // Return empty metrics on error
    return {
      userId, userName: 'Error', userEmail: 'Error', tasksCompleted: 0, tasksAssigned: 0,
      completionRate: 0, averageCompletionTime: 0, efficiencyRatio: 0,
      onTimeDeliveryRate: 0, overdueTasks: 0, upcomingDeadlines: 0,
      averageTasksPerDay: 0, tasksCompletedThisWeek: 0, tasksCompletedThisMonth: 0,
      tasksApproved: 0, tasksReturned: 0, approvalRate: 0, reworkRate: 0,
    };
  }
}

/**
 * Obtiene métricas de calidad y rendimiento para todos los usuarios,
 * basándose en el historial de estados para mayor precisión.
 */
export async function getAllUsersMetrics(): Promise<UserMetrics[]> {
  try {
    // 1. Carga masiva de datos necesarios, similar a como lo hacía la lógica anterior que funcionaba.
    const [
      { data: users, error: usersError },
      { data: allTasks, error: tasksError },
      { data: allSubtasks, error: subtasksError }
    ] = await Promise.all([
      supabase.from('users').select('id, name, email'),
      supabase.from('tasks').select('id, assigned_users, status'),
      supabase.from('subtasks').select('id, task_id, assigned_to, status')
    ]);

    if (usersError || tasksError || subtasksError) {
      console.error("Error fetching batch data for metrics:", { usersError, tasksError, subtasksError });
      return [];
    }

    // Mapa para saber qué tareas tienen subtareas y no contarlas dos veces
    const tasksWithSubtasks = new Set(allSubtasks.map(st => st.task_id));
    const userMetrics = new Map<string, any>();

    // 2. Inicializar contadores para todos los usuarios
    users.forEach(user => {
      userMetrics.set(user.id, {
        userId: user.id,
        userName: user.name || 'Sin nombre',
        userEmail: user.email || 'Sin email',
        tasksAssigned: 0,
        tasksApproved: 0,
        tasksReturned: 0,
        tasksDelivered: 0, // Tareas que han sido entregadas (completed o in_review)
      });
    });

    // 3. Procesar subtareas (la unidad de trabajo principal)
    for (const subtask of allSubtasks) {
      if (subtask.assigned_to) {
        const metrics = userMetrics.get(subtask.assigned_to);
        if (metrics) {
          metrics.tasksAssigned++;
          if (subtask.status === 'approved') {
            metrics.tasksApproved++;
            metrics.tasksDelivered++; // Una tarea aprobada obviamente fue entregada primero
          } else if (subtask.status === 'returned') {
            metrics.tasksReturned++;
            metrics.tasksDelivered++; // Una tarea devuelta también fue entregada
          } else if (['completed', 'in_review'].includes(subtask.status)) {
            metrics.tasksDelivered++;
          }
        }
      }
    }

    // 4. Procesar tareas que no tienen subtareas (trabajo independiente)
    for (const task of allTasks) {
      if (!tasksWithSubtasks.has(task.id) && task.assigned_users && task.assigned_users.length > 0) {
         for (const userId of task.assigned_users) {
            const metrics = userMetrics.get(userId);
            if (metrics) {
                metrics.tasksAssigned++;
                 if (task.status === 'approved') {
                    metrics.tasksApproved++;
                    metrics.tasksDelivered++;
                } else if (task.status === 'returned') {
                    metrics.tasksReturned++;
                    metrics.tasksDelivered++;
                } else if (['completed', 'in_review'].includes(task.status)) {
                    metrics.tasksDelivered++;
                }
            }
        }
      }
    }

    // 5. Calcular las tasas y métricas finales
    const finalMetrics: UserMetrics[] = [];
    for (const metrics of userMetrics.values()) {
        const { tasksDelivered, tasksReturned, tasksApproved } = metrics;
        
        // El total de trabajo revisado es la suma de lo aprobado y lo devuelto.
        const totalReviewed = tasksApproved + tasksReturned;
        
        // La tasa de aprobación se calcula sobre el total revisado. Si no se ha revisado nada, es 100%.
        const approvalRate = totalReviewed > 0 ? (tasksApproved / totalReviewed) * 100 : 100;
        
        // La tasa de retrabajo se calcula sobre el total entregado.
        const reworkRate = tasksDelivered > 0 ? (tasksReturned / tasksDelivered) * 100 : 0;
      
        finalMetrics.push({
            ...metrics,
            tasksCompleted: tasksApproved, // Para la vista, las "completadas" son las que están aprobadas.
            completionRate: metrics.tasksAssigned > 0 ? (tasksApproved / metrics.tasksAssigned) * 100 : 0,
            approvalRate,
            reworkRate,
            // Métricas no relevantes para esta vista
            averageCompletionTime: 0, efficiencyRatio: 0, onTimeDeliveryRate: 0, overdueTasks: 0, upcomingDeadlines: 0, averageTasksPerDay: 0, tasksCompletedThisWeek: 0, tasksCompletedThisMonth: 0,
        });
    }

    // Devolver solo usuarios con tareas asignadas para no poblar la tabla con ceros.
    return finalMetrics
      .filter(m => m.tasksAssigned > 0)
      .sort((a, b) => (b.tasksApproved / b.tasksAssigned) - (a.tasksApproved / a.tasksAssigned));

  } catch (error) {
    console.error("Error in getAllUsersMetrics:", error);
    return [];
  }
}

/**
 * DEPRECATED: Esta función puede no ser precisa con la nueva lógica de negocio.
 * Se mantiene por si es usada en otros componentes, pero se recomienda migrar
 * a una versión que use `status_history` para métricas de calidad.
 */
export async function getAllUsersMetricsIncludingInactive(): Promise<UserMetrics[]> {
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, name, email, role');

  if (userError) {
    console.error('Error getting all users metrics (including inactive):', userError);
    return [];
  }

  const metricsPromises = (users || []).map(user => getUserMetrics(user.id));
  const allMetrics = await Promise.all(metricsPromises);

  // Ordenar por tasa de finalización descendente
  return allMetrics.sort((a, b) => b.completionRate - a.completionRate);
}

/**
 * Obtiene información de todos los usuarios registrados
 */
export async function getAllUsersInfo() {
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: false });

    return users || [];
  } catch (error) {
    console.error('Error getting users info:', error);
    return [];
  }
}

/**
 * Obtiene métricas de proyectos
 */
export async function getProjectMetrics(): Promise<ProjectMetrics[]> {
  try {
    const { data: projects } = await supabase
      .from('projects')
      .select('*');

    const projectMetrics: ProjectMetrics[] = [];

    for (const project of projects || []) {
      // Obtener tareas del proyecto
      const { data: tasks } = await supabase
        .from('tasks')
        .select(`
          *,
          subtasks (*)
        `)
        .eq('project_id', project.id);

      // Contar todas las tareas y subtareas
      let totalTasks = tasks?.length || 0;
      let completedTasks = tasks?.filter(t => ['approved'].includes(t.status)).length || 0;

      // Agregar subtareas al conteo
      tasks?.forEach(task => {
        if (task.subtasks) {
          totalTasks += task.subtasks.length;
          completedTasks += task.subtasks.filter((s: any) => ['approved'].includes(s.status)).length;
        }
      });

      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      // Obtener usuarios únicos del proyecto
      const uniqueUsers = new Set<string>();
      
      // Usuarios desde tareas principales
      tasks?.forEach(task => {
        if (task.assigned_users && task.assigned_users.length > 0) {
          task.assigned_users.forEach((userId: string) => {
            uniqueUsers.add(userId);
          });
        }
        // Usuarios desde subtareas
        if (task.subtasks && task.subtasks.length > 0) {
          task.subtasks.forEach((subtask: any) => {
            if (subtask.assigned_to) {
              uniqueUsers.add(subtask.assigned_to);
            }
          });
        }
      });

      const teamSize = uniqueUsers.size;

      // Calcular tiempo promedio (solo donde hay datos)
      const { data: taskAssignments } = await supabase
        .from('task_work_assignments')
        .select('actual_duration')
        .eq('project_id', project.id)
        .not('actual_duration', 'is', null);

      const averageTimePerTask = taskAssignments && taskAssignments.length > 0
        ? taskAssignments.reduce((acc, a) => acc + (a.actual_duration || 0), 0) / taskAssignments.length
        : 0;

      // Verificar si está en tiempo
      const daysUntilDeadline = project.deadline 
        ? Math.ceil((new Date(project.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const onSchedule = completionRate >= 75 && daysUntilDeadline > 0;

      projectMetrics.push({
        projectId: project.id,
        projectName: project.name,
        totalTasks,
        completedTasks,
        completionRate,
        teamSize,
        averageTimePerTask,
        onSchedule,
        daysUntilDeadline
      });
    }

    return projectMetrics;
  } catch (error) {
    console.error('Error getting project metrics:', error);
    return [];
  }
}

/**
 * Detecta problemas de rendimiento basado en umbrales
 */
export function analyzePerformance(metrics: UserMetrics) {
  const issues = [];

  if (metrics.efficiencyRatio < 0.7) {
    issues.push({
      type: 'low_efficiency',
      severity: metrics.efficiencyRatio < 0.5 ? 'high' : 'medium',
      message: `Eficiencia por debajo del promedio: ${(metrics.efficiencyRatio * 100).toFixed(1)}%`
    });
  }

  if (metrics.completionRate < 80) {
    issues.push({
      type: 'low_completion',
      severity: metrics.completionRate < 60 ? 'high' : 'medium',
      message: `Tasa de finalización baja: ${metrics.completionRate.toFixed(1)}%`
    });
  }

  if (metrics.onTimeDeliveryRate < 70) {
    issues.push({
      type: 'late_delivery',
      severity: metrics.onTimeDeliveryRate < 50 ? 'high' : 'medium',
      message: `Entregas tardías: ${(100 - metrics.onTimeDeliveryRate).toFixed(1)}% fuera de tiempo`
    });
  }

  if (metrics.overdueTasks > 3) {
    issues.push({
      type: 'overdue_tasks',
      severity: metrics.overdueTasks > 5 ? 'high' : 'medium',
      message: `${metrics.overdueTasks} tareas atrasadas`
    });
  }

  return issues;
}

/**
 * Obtiene estadísticas generales del equipo
 */
export async function getTeamStatistics() {
  try {
    const allMetrics = await getAllUsersMetrics();
    
    if (allMetrics.length === 0) {
      return {
        totalUsers: 0,
        averageEfficiency: 0,
        averageCompletionRate: 0,
        totalTasksCompleted: 0,
        totalOverdueTasks: 0
      };
    }

    const totalUsers = allMetrics.length;
    const averageEfficiency = allMetrics.reduce((acc, m) => acc + m.efficiencyRatio, 0) / totalUsers;
    const averageCompletionRate = allMetrics.reduce((acc, m) => acc + m.completionRate, 0) / totalUsers;
    const totalTasksCompleted = allMetrics.reduce((acc, m) => acc + m.tasksCompleted, 0);
    const totalOverdueTasks = allMetrics.reduce((acc, m) => acc + m.overdueTasks, 0);

    return {
      totalUsers,
      averageEfficiency,
      averageCompletionRate,
      totalTasksCompleted,
      totalOverdueTasks
    };
  } catch (error) {
    console.error('Error getting team statistics:', error);
    return {
      totalUsers: 0,
      averageEfficiency: 0,
      averageCompletionRate: 0,
      totalTasksCompleted: 0,
      totalOverdueTasks: 0
    };
  }
}

/**
 * Exporta métricas a CSV
 */
export function exportMetricsToCSV(metrics: UserMetrics[], filename: string) {
  const headers = [
    'Usuario',
    'Email',
    'Tareas Completadas',
    'Tareas Asignadas',
    'Tasa de Finalización (%)',
    'Tiempo Promedio (min)',
    'Eficiencia (%)',
    'Entrega a Tiempo (%)',
    'Tareas Atrasadas',
    'Próximos Vencimientos',
    'Promedio Diario'
  ];

  const rows = metrics.map(metric => [
    metric.userName,
    metric.userEmail,
    metric.tasksCompleted,
    metric.tasksAssigned,
    metric.completionRate.toFixed(1),
    Math.round(metric.averageCompletionTime),
    (metric.efficiencyRatio * 100).toFixed(1),
    metric.onTimeDeliveryRate.toFixed(1),
    metric.overdueTasks,
    metric.upcomingDeadlines,
    metric.averageTasksPerDay.toFixed(1)
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Calcula métricas de utilización para un usuario específico
 */
export async function getUserUtilizationMetrics(userId: string, workingHoursPerDay: number = 8): Promise<UtilizationMetrics> {
  try {
    // Obtener información del usuario
    const { data: user } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', userId)
      .single();

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    // Obtener todas las asignaciones de trabajo del mes
    const { data: workAssignments } = await supabase
      .from('task_work_assignments')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startOfMonth.toISOString().split('T')[0])
      .not('actual_duration', 'is', null);

    // Calcular métricas diarias
    const dailyWork = new Map<string, number>();
    const hourlyWork = new Map<number, number>();
    let totalMinutesWorked = 0;
    let totalTaskDurations: number[] = [];

    workAssignments?.forEach(assignment => {
      const date = assignment.date;
      const duration = assignment.actual_duration || 0;
      
      totalMinutesWorked += duration;
      totalTaskDurations.push(duration);
      
      // Agrupar por día
      dailyWork.set(date, (dailyWork.get(date) || 0) + duration);
      
      // Agrupar por hora si tenemos start_time
      if (assignment.start_time) {
        const hour = new Date(assignment.start_time).getHours();
        hourlyWork.set(hour, (hourlyWork.get(hour) || 0) + duration);
      }
    });

    // Calcular días trabajados
    const workingDaysThisMonth = dailyWork.size;
    const workingDaysThisWeek = Array.from(dailyWork.keys()).filter(date => {
      const workDate = new Date(date);
      return workDate >= startOfWeek;
    }).length;

    // Métricas diarias
    const averageHoursWorkedPerDay = workingDaysThisMonth > 0 
      ? (totalMinutesWorked / 60) / workingDaysThisMonth 
      : 0;
    
    const utilizationRate = (averageHoursWorkedPerDay / workingHoursPerDay) * 100;
    const idleTime = Math.max(0, (workingHoursPerDay * 60) - (totalMinutesWorked / workingDaysThisMonth || 0));

    // Métricas semanales
    const weeklyMinutes = Array.from(dailyWork.entries())
      .filter(([date]) => new Date(date) >= startOfWeek)
      .reduce((acc, [, minutes]) => acc + minutes, 0);
    
    const totalHoursThisWeek = weeklyMinutes / 60;
    const expectedHoursThisWeek = workingDaysThisWeek * workingHoursPerDay;
    const weeklyUtilizationRate = expectedHoursThisWeek > 0 
      ? (totalHoursThisWeek / expectedHoursThisWeek) * 100 
      : 0;

    // Métricas mensuales
    const totalHoursThisMonth = totalMinutesWorked / 60;
    const expectedHoursThisMonth = workingDaysThisMonth * workingHoursPerDay;
    const monthlyUtilizationRate = expectedHoursThisMonth > 0 
      ? (totalHoursThisMonth / expectedHoursThisMonth) * 100 
      : 0;

    // Hora más productiva
    let mostProductiveHour = 9; // Default
    let maxMinutes = 0;
    hourlyWork.forEach((minutes, hour) => {
      if (minutes > maxMinutes) {
        maxMinutes = minutes;
        mostProductiveHour = hour;
      }
    });
    
    const mostProductiveTimeOfDay = `${mostProductiveHour.toString().padStart(2, '0')}:00`;

    // Duración promedio de tareas
    const averageTaskDuration = totalTaskDurations.length > 0
      ? totalTaskDurations.reduce((acc, dur) => acc + dur, 0) / totalTaskDurations.length
      : 0;

    // Indicadores
    const isUnderutilized = utilizationRate < 70;
    const isOverutilized = utilizationRate > 110;

    // Score de consistencia (basado en la variación de horas diarias)
    const dailyHours = Array.from(dailyWork.values()).map(minutes => minutes / 60);
    const avgDaily = dailyHours.reduce((acc, h) => acc + h, 0) / dailyHours.length || 0;
    const variance = dailyHours.reduce((acc, h) => acc + Math.pow(h - avgDaily, 2), 0) / dailyHours.length || 0;
    const standardDeviation = Math.sqrt(variance);
    const consistencyScore = Math.max(0, 100 - (standardDeviation / avgDaily * 100)) || 0;

    return {
      userId,
      userName: user.name,
      userEmail: user.email,
      workingHoursPerDay,
      averageHoursWorkedPerDay,
      utilizationRate,
      idleTime,
      totalHoursThisWeek,
      expectedHoursThisWeek,
      weeklyUtilizationRate,
      totalHoursThisMonth,
      expectedHoursThisMonth,
      monthlyUtilizationRate,
      mostProductiveTimeOfDay,
      averageTaskDuration,
      workingDaysThisMonth,
      isUnderutilized,
      isOverutilized,
      consistencyScore
    };

  } catch (error) {
    console.error('Error calculating utilization metrics:', error);
    // Retornar métricas vacías en caso de error
    return {
      userId,
      userName: 'Usuario no encontrado',
      userEmail: '',
      workingHoursPerDay,
      averageHoursWorkedPerDay: 0,
      utilizationRate: 0,
      idleTime: workingHoursPerDay * 60,
      totalHoursThisWeek: 0,
      expectedHoursThisWeek: 0,
      weeklyUtilizationRate: 0,
      totalHoursThisMonth: 0,
      expectedHoursThisMonth: 0,
      monthlyUtilizationRate: 0,
      mostProductiveTimeOfDay: '09:00',
      averageTaskDuration: 0,
      workingDaysThisMonth: 0,
      isUnderutilized: true,
      isOverutilized: false,
      consistencyScore: 0
    };
  }
}

/**
 * Obtiene métricas de utilización para todos los usuarios
 */
export async function getAllUsersUtilizationMetrics(workingHoursPerDay: number = 8): Promise<UtilizationMetrics[]> {
  try {
    // Obtener solo usuarios que están asignados a al menos un proyecto
    const { data: users, error } = await supabase
      .from('users')
      .select('id, assigned_projects')
      .not('assigned_projects', 'is', null);

    if (error) throw error;

    // Filtrar localmente por si la base de datos devuelve un array vacío en lugar de nulo
    const activeUsers = users?.filter(u => u.assigned_projects && u.assigned_projects.length > 0) || [];
    
    if (!activeUsers.length) return [];

    const utilizationMetrics = await Promise.all(
      activeUsers.map(user => getUserUtilizationMetrics(user.id, workingHoursPerDay))
    );

    // No filtrar por días trabajados para incluir a todos los usuarios con asignaciones
    return utilizationMetrics;
  } catch (error) {
    console.error('Error getting all users utilization metrics:', error);
    return [];
  }
}

/**
 * Obtiene estadísticas de utilización del equipo
 */
export async function getTeamUtilizationStatistics(workingHoursPerDay: number = 8) {
  try {
    const allMetrics = await getAllUsersUtilizationMetrics(workingHoursPerDay);
    
    if (allMetrics.length === 0) {
      return {
        totalActiveUsers: 0,
        averageUtilizationRate: 0,
        underutilizedUsers: 0,
        overutilizedUsers: 0,
        totalHoursWorked: 0,
        totalExpectedHours: 0,
        teamEfficiencyScore: 0,
        averageConsistencyScore: 0
      };
    }

    const totalActiveUsers = allMetrics.length;
    const averageUtilizationRate = allMetrics.reduce((acc, m) => acc + m.utilizationRate, 0) / totalActiveUsers;
    const underutilizedUsers = allMetrics.filter(m => m.isUnderutilized).length;
    const overutilizedUsers = allMetrics.filter(m => m.isOverutilized).length;
    const totalHoursWorked = allMetrics.reduce((acc, m) => acc + m.totalHoursThisMonth, 0);
    const totalExpectedHours = allMetrics.reduce((acc, m) => acc + m.expectedHoursThisMonth, 0);
    const teamEfficiencyScore = totalExpectedHours > 0 ? (totalHoursWorked / totalExpectedHours) * 100 : 0;
    const averageConsistencyScore = allMetrics.reduce((acc, m) => acc + m.consistencyScore, 0) / totalActiveUsers;

    return {
      totalActiveUsers,
      averageUtilizationRate,
      underutilizedUsers,
      overutilizedUsers,
      totalHoursWorked,
      totalExpectedHours,
      teamEfficiencyScore,
      averageConsistencyScore
    };
  } catch (error) {
    console.error('Error getting team utilization statistics:', error);
    return {
      totalActiveUsers: 0,
      averageUtilizationRate: 0,
      underutilizedUsers: 0,
      overutilizedUsers: 0,
      totalHoursWorked: 0,
      totalExpectedHours: 0,
      teamEfficiencyScore: 0,
      averageConsistencyScore: 0
    };
  }
}

/**
 * Exporta métricas de utilización a CSV
 */
export function exportUtilizationToCSV(metrics: UtilizationMetrics[], filename: string) {
  const headers = [
    'Usuario',
    'Email',
    'Horas Estándar/Día',
    'Horas Promedio/Día',
    'Utilización (%)',
    'Tiempo Inactivo (min)',
    'Horas Esta Semana',
    'Utilización Semanal (%)',
    'Horas Este Mes',
    'Utilización Mensual (%)',
    'Hora Más Productiva',
    'Duración Promedio Tarea (min)',
    'Días Trabajados',
    'Subutilizado',
    'Sobreutilizado',
    'Score Consistencia'
  ];

  const rows = metrics.map(metric => [
    metric.userName,
    metric.userEmail,
    metric.workingHoursPerDay,
    metric.averageHoursWorkedPerDay.toFixed(1),
    metric.utilizationRate.toFixed(1),
    Math.round(metric.idleTime),
    metric.totalHoursThisWeek.toFixed(1),
    metric.weeklyUtilizationRate.toFixed(1),
    metric.totalHoursThisMonth.toFixed(1),
    metric.monthlyUtilizationRate.toFixed(1),
    metric.mostProductiveTimeOfDay,
    Math.round(metric.averageTaskDuration),
    metric.workingDaysThisMonth,
    metric.isUnderutilized ? 'Sí' : 'No',
    metric.isOverutilized ? 'Sí' : 'No',
    metric.consistencyScore.toFixed(1)
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Obtiene métricas por áreas de trabajo con enfoque en utilización y capacidad
 */
export async function getAreaMetrics(workingHoursPerDay: number = 8): Promise<AreaMetrics[]> {
  try {
    const { data: areas } = await supabase
      .from('areas')
      .select('*');

    const areaMetrics: AreaMetrics[] = [];

    for (const area of areas || []) {
      // Obtener usuarios asignados al área
      const { data: areaUsers } = await supabase
        .from('area_user_assignments')
        .select(`
          user_id,
          users (id, name, email)
        `)
        .eq('area_id', area.id);

      const totalUsers = areaUsers?.length || 0;
      const userIds = areaUsers?.map(au => au.user_id) || [];

      if (userIds.length === 0) {
        areaMetrics.push({
          areaId: area.id,
          areaName: area.name,
          totalUsers: 0,
          activeUsers: 0,
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          averageEfficiency: 0,
          averageTasksPerUser: 0,
          topPerformers: [],
          averageUtilizationRate: 0,
          totalHoursWorked: 0,
          totalCapacityHours: 0,
          capacityUtilization: 0,
          workloadDistribution: 0,
          isOverloaded: false,
          isUnderloaded: true,
          recommendedAction: 'hire',
          workloadPressure: 'low',
          utilizationTrend: 'stable'
        });
        continue;
      }

      // Obtener métricas de rendimiento de todos los usuarios del área
      const userMetrics = await Promise.all(
        userIds.map(userId => getUserMetrics(userId))
      );

      // Obtener métricas de utilización de todos los usuarios del área
      const utilizationMetrics = await Promise.all(
        userIds.map(userId => getUserUtilizationMetrics(userId, workingHoursPerDay))
      );

      // Filtrar usuarios activos (que tienen al menos una tarea)
      const activeUserMetrics = userMetrics.filter(m => m.tasksAssigned > 0);
      const activeUtilizationMetrics = utilizationMetrics.filter(m => m.workingDaysThisMonth > 0);

      // Calcular métricas básicas del área
      const totalTasks = userMetrics.reduce((acc, m) => acc + m.tasksAssigned, 0);
      const completedTasks = userMetrics.reduce((acc, m) => acc + m.tasksCompleted, 0);
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
      
      const averageEfficiency = activeUserMetrics.length > 0
        ? activeUserMetrics.reduce((acc, m) => acc + m.efficiencyRatio, 0) / activeUserMetrics.length
        : 0;

      const averageTasksPerUser = userIds.length > 0 ? totalTasks / userIds.length : 0;

      // Top performers (usuarios con mejor eficiencia)
      const topPerformers = activeUserMetrics
        .sort((a, b) => b.efficiencyRatio - a.efficiencyRatio)
        .slice(0, 3)
        .map(m => m.userName);

      // NUEVAS MÉTRICAS DE UTILIZACIÓN Y CAPACIDAD
      
      // Utilización promedio del área
      const averageUtilizationRate = activeUtilizationMetrics.length > 0
        ? activeUtilizationMetrics.reduce((acc, m) => acc + m.utilizationRate, 0) / activeUtilizationMetrics.length
        : 0;

      // Horas trabajadas y capacidad total
      const totalHoursWorked = utilizationMetrics.reduce((acc, m) => acc + m.totalHoursThisMonth, 0);
      const workingDaysThisMonth = Math.max(...utilizationMetrics.map(m => m.workingDaysThisMonth), 1);
      const totalCapacityHours = userIds.length * workingDaysThisMonth * workingHoursPerDay;
      const capacityUtilization = totalCapacityHours > 0 ? (totalHoursWorked / totalCapacityHours) * 100 : 0;

      // Distribución de carga de trabajo (qué tan equilibrada está)
      const utilizationRates = activeUtilizationMetrics.map(m => m.utilizationRate);
      const avgUtilization = utilizationRates.reduce((acc, rate) => acc + rate, 0) / utilizationRates.length || 0;
      const variance = utilizationRates.reduce((acc, rate) => acc + Math.pow(rate - avgUtilization, 2), 0) / utilizationRates.length || 0;
      const standardDeviation = Math.sqrt(variance);
      const workloadDistribution = Math.max(0, 100 - (standardDeviation / avgUtilization * 100)) || 0;

      // Indicadores de sobrecarga y subcarga
      const isOverloaded = capacityUtilization > 95;
      const isUnderloaded = capacityUtilization < 60;

      // Determinar presión de carga de trabajo
      let workloadPressure: 'high' | 'medium' | 'low';
      if (capacityUtilization > 90) workloadPressure = 'high';
      else if (capacityUtilization > 70) workloadPressure = 'medium';
      else workloadPressure = 'low';

      // Recomendación de acción
      let recommendedAction: 'hire' | 'redistribute' | 'optimal' | 'consider_reduction';
      if (isOverloaded && workloadDistribution < 60) {
        recommendedAction = 'hire'; // Sobrecarga general, necesita más personal
      } else if (isOverloaded && workloadDistribution >= 60) {
        recommendedAction = 'redistribute'; // Sobrecarga pero mal distribuida
      } else if (isUnderloaded && capacityUtilization < 40) {
        recommendedAction = 'consider_reduction'; // Muy poca utilización
      } else {
        recommendedAction = 'optimal'; // En rango aceptable
      }

      // Tendencia de utilización (simplificada, podrías mejorarla con datos históricos)
      let utilizationTrend: 'increasing' | 'stable' | 'decreasing';
      if (capacityUtilization > 85) utilizationTrend = 'increasing';
      else if (capacityUtilization < 50) utilizationTrend = 'decreasing';
      else utilizationTrend = 'stable';

      areaMetrics.push({
        areaId: area.id,
        areaName: area.name,
        totalUsers,
        activeUsers: activeUserMetrics.length,
        totalTasks,
        completedTasks,
        completionRate,
        averageEfficiency,
        averageTasksPerUser,
        topPerformers,
        averageUtilizationRate,
        totalHoursWorked,
        totalCapacityHours,
        capacityUtilization,
        workloadDistribution,
        isOverloaded,
        isUnderloaded,
        recommendedAction,
        workloadPressure,
        utilizationTrend
      });
    }

    // Ordenar por capacidad de utilización (más críticas primero)
    return areaMetrics.sort((a, b) => {
      // Priorizar áreas sobrecargadas o con problemas
      if (a.isOverloaded && !b.isOverloaded) return -1;
      if (!a.isOverloaded && b.isOverloaded) return 1;
      if (a.isUnderloaded && !b.isUnderloaded) return 1;
      if (!a.isUnderloaded && b.isUnderloaded) return -1;
      // Luego por utilización de capacidad
      return b.capacityUtilization - a.capacityUtilization;
    });
  } catch (error) {
    console.error('Error getting area metrics:', error);
    return [];
  }
}

/**
 * Obtiene el resumen de la vista daily_work_statistics existente
 */
export async function getDailyWorkStatistics(userId?: string, days: number = 30) {
  try {
    let query = supabase
      .from('daily_work_statistics')
      .select('*')
      .order('date', { ascending: false })
      .limit(days);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting daily work statistics:', error);
    return [];
  }
}