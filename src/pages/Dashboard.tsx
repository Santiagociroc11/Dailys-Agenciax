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
  // Métricas de productividad
  tasksCompleted: number;
  tasksCompletedThisWeek: number;
  tasksCompletedThisMonth: number;
  averageTasksPerDay: number;
  
  // Métricas de eficiencia temporal
  averageCompletionTime: number;
  efficiencyRatio: number; // tiempo real vs estimado
  onTimeDeliveryRate: number;
  
  // Métricas de calidad
  approvalRate: number; // tareas aprobadas vs devueltas
  reworkRate: number;
  
  // Métricas de carga de trabajo
  currentActiveTasks: number;
  upcomingDeadlines: number;
  overdueTasks: number;
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
      } else {
        await fetchUserMetrics(user?.id);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserMetrics(userId: string) {
    // Obtener estadísticas del usuario actual
    const { data: stats } = await supabase
      .from('daily_work_statistics')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30);

    // Obtener tareas completadas
    const { data: completedTasks } = await supabase
      .from('task_work_assignments')
      .select('*, tasks(deadline, status_history)')
      .eq('user_id', userId)
      .eq('status', 'completed');

    // Obtener tareas activas
    const { data: activeTasks } = await supabase
      .from('task_work_assignments')
      .select('*, tasks(deadline, status)')
      .eq('user_id', userId)
      .in('status', ['pending', 'in_progress']);

    // Calcular métricas
    const metrics = calculateUserMetrics(stats, completedTasks, activeTasks);
    setUserMetrics(metrics);
  }

  async function fetchTeamMetrics() {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('role', 'user');

    const teamStats: UserStats[] = [];
    
    for (const user of users || []) {
      await fetchUserMetrics(user.id);
      // Aquí podrías agregar la lógica para obtener métricas de cada usuario
    }
    
    setTeamMetrics(teamStats);
  }

  function calculateUserMetrics(
    dailyStats: any[], 
    completedTasks: any[], 
    activeTasks: any[]
  ): PerformanceMetrics {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Métricas básicas
    const tasksCompleted = completedTasks?.length || 0;
    const tasksCompletedThisWeek = completedTasks?.filter(t => 
      new Date(t.updated_at) >= weekAgo
    ).length || 0;
    const tasksCompletedThisMonth = completedTasks?.filter(t => 
      new Date(t.updated_at) >= monthAgo
    ).length || 0;

    // Eficiencia temporal
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

    // Tareas atrasadas
    const overdueTasks = activeTasks?.filter(t => 
      t.tasks?.deadline && new Date(t.tasks.deadline) < now
    ).length || 0;

    // Próximos vencimientos (próximos 3 días)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = activeTasks?.filter(t => 
      t.tasks?.deadline && 
      new Date(t.tasks.deadline) >= now && 
      new Date(t.tasks.deadline) <= threeDaysFromNow
    ).length || 0;

    return {
      tasksCompleted,
      tasksCompletedThisWeek,
      tasksCompletedThisMonth,
      averageTasksPerDay: dailyStats?.length > 0 
        ? dailyStats.reduce((acc, s) => acc + s.completed_tasks, 0) / dailyStats.length 
        : 0,
      averageCompletionTime: tasksWithDuration.length > 0
        ? tasksWithDuration.reduce((acc, t) => acc + t.actual_duration, 0) / tasksWithDuration.length
        : 0,
      efficiencyRatio,
      onTimeDeliveryRate,
      approvalRate: 0.85, // Esto requeriría más lógica para calcular
      reworkRate: 0.15,   // Esto requeriría más lógica para calcular
      currentActiveTasks: activeTasks?.length || 0,
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
          <h2 className="text-lg font-semibold mb-4">Métricas del Equipo</h2>
          <p className="text-gray-600 italic">
            🚧 Panel de administración del equipo en desarrollo...
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Aquí podrás ver métricas comparativas de todo el equipo, identificar usuarios 
            con mejor rendimiento y detectar áreas de mejora.
          </p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;