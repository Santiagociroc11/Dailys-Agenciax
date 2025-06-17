import { supabase } from './supabase';

export interface UserMetrics {
  userId: string;
  userName: string;
  userEmail: string;
  tasksCompleted: number;
  tasksAssigned: number;
  completionRate: number;
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
      t.taskStatus === 'completed' || t.status === 'completed'
    ).length;

    const tasksAssigned = allTasks.length;
    const completionRate = tasksAssigned > 0 ? (tasksCompleted / tasksAssigned) * 100 : 0;

    // Tareas completadas esta semana
    const tasksCompletedThisWeek = allTasks.filter(t => {
      const isCompleted = t.taskStatus === 'completed' || t.status === 'completed';
      const completedRecently = t.updated_at && new Date(t.updated_at) >= weekAgo;
      return isCompleted && completedRecently;
    }).length;

    // Tareas completadas este mes
    const tasksCompletedThisMonth = allTasks.filter(t => {
      const isCompleted = t.taskStatus === 'completed' || t.status === 'completed';
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
      const isCompleted = t.taskStatus === 'completed' || t.status === 'completed';
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
      const isActive = !['completed', 'approved'].includes(t.taskStatus || t.status);
      const isOverdue = t.deadline && new Date(t.deadline) < now;
      return isActive && isOverdue;
    }).length;

    // Próximos vencimientos (próximos 3 días)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = allTasks.filter(t => {
      const isActive = !['completed', 'approved'].includes(t.taskStatus || t.status);
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
      completionRate,
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
    console.error('Error calculating user metrics:', error);
    throw error;
  }
}

/**
 * Obtiene métricas de todos los usuarios (para administradores)
 */
export async function getAllUsersMetrics(): Promise<UserMetrics[]> {
  try {
    // Obtener todos los usuarios (sin filtrar por rol)
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, role');

    const metricsPromises = (users || []).map(user => getUserMetrics(user.id));
    const allMetrics = await Promise.all(metricsPromises);

    // Filtrar usuarios con actividad (que tengan al menos una tarea asignada)
    const activeUserMetrics = allMetrics.filter(metrics => metrics.tasksAssigned > 0);

    // Ordenar por tasa de finalización descendente
    return activeUserMetrics.sort((a, b) => b.completionRate - a.completionRate);
  } catch (error) {
    console.error('Error getting all users metrics:', error);
    return [];
  }
}

/**
 * Obtiene métricas de todos los usuarios incluyendo los sin actividad
 */
export async function getAllUsersMetricsIncludingInactive(): Promise<UserMetrics[]> {
  try {
    // Obtener todos los usuarios (sin filtrar por rol)
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, role');

    const metricsPromises = (users || []).map(user => getUserMetrics(user.id));
    const allMetrics = await Promise.all(metricsPromises);

    // Ordenar por tasa de finalización descendente
    return allMetrics.sort((a, b) => b.completionRate - a.completionRate);
  } catch (error) {
    console.error('Error getting all users metrics (including inactive):', error);
    return [];
  }
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
      let completedTasks = tasks?.filter(t => t.status === 'completed').length || 0;

      // Agregar subtareas al conteo
      tasks?.forEach(task => {
        if (task.subtasks) {
          totalTasks += task.subtasks.length;
          completedTasks += task.subtasks.filter((s: any) => s.status === 'completed').length;
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
    const { data: users } = await supabase
      .from('users')
      .select('id');

    if (!users) return [];

    const utilizationMetrics = await Promise.all(
      users.map(user => getUserUtilizationMetrics(user.id, workingHoursPerDay))
    );

    return utilizationMetrics.filter(metrics => metrics.workingDaysThisMonth > 0);
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
 * Obtiene métricas por áreas de trabajo
 */
export async function getAreaMetrics(): Promise<AreaMetrics[]> {
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

      // Obtener métricas de usuarios del área
      let totalTasks = 0;
      let completedTasks = 0;
      let totalEfficiency = 0;
      let activeUsers = 0;
      const userMetrics: { userId: string; name: string; efficiency: number; tasks: number }[] = [];

      for (const userId of userIds) {
        const metrics = await getUserMetrics(userId);
        if (metrics.tasksAssigned > 0) {
          activeUsers++;
          totalTasks += metrics.tasksAssigned;
          completedTasks += metrics.tasksCompleted;
          totalEfficiency += metrics.efficiencyRatio;
          
          const userName = areaUsers?.find(au => au.user_id === userId)?.users?.name || 'Usuario';
          userMetrics.push({
            userId,
            name: userName,
            efficiency: metrics.efficiencyRatio,
            tasks: metrics.tasksCompleted
          });
        }
      }

      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
      const averageEfficiency = activeUsers > 0 ? totalEfficiency / activeUsers : 0;
      const averageTasksPerUser = activeUsers > 0 ? totalTasks / activeUsers : 0;

      // Top 3 performers del área
      const topPerformers = userMetrics
        .sort((a, b) => b.efficiency - a.efficiency)
        .slice(0, 3)
        .map(u => u.name);

      areaMetrics.push({
        areaId: area.id,
        areaName: area.name,
        totalUsers,
        activeUsers,
        totalTasks,
        completedTasks,
        completionRate,
        averageEfficiency,
        averageTasksPerUser,
        topPerformers
      });
    }

    return areaMetrics.sort((a, b) => b.completionRate - a.completionRate);
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