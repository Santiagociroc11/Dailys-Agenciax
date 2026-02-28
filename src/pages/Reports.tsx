import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  Filter,
  Download,
  Users,
  Clock,
  Target,
  Award,
  FolderOpen,
  Layers,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  LayoutDashboard,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  getAllUsersMetrics,
  getProjectMetrics,
  getAreaMetrics,
  exportMetricsToCSV,
  getAllUsersUtilizationMetrics,
  getTeamUtilizationStatistics,
  exportUtilizationToCSV,
  getHoursForBilling,
  getCostByUser,
  getCostByArea,
  getCostByClient,
  getCapacityByUser,
  getDateRangeForPeriod,
  type UserMetrics,
  type ProjectMetrics as ProjectMetricsType,
  type AreaMetrics,
  type UtilizationMetrics,
  type PeriodType,
  type HoursForBillingRow,
  type CostByUserRow,
  type CostByAreaRow,
  type CostByClientRow
} from '../lib/metrics';

interface DetailedMetrics {
  userId: string;
  userName: string;
  userEmail: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  averageCompletionTime: number;
  efficiencyRatio: number;
  onTimeDeliveryRate: number;
  overdueTasks: number;
  weeklyTrend: number[];
  monthlyTrend: number[];
  topAreas: string[];
  mostProductiveDay: string;
  averageTasksPerDay: number;
}

interface ProjectMetrics {
  projectId: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  averageTimePerTask: number;
  teamSize: number;
  onSchedule: boolean;
  daysUntilDeadline: number;
}

type TabType = 'overview' | 'projects' | 'users' | 'areas' | 'utilization' | 'cost';

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes pasado' },
  { value: 'custom', label: 'Rango personalizado' },
];

export default function Reports() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [userMetrics, setUserMetrics] = useState<UserMetrics[]>([]);
  const [projectMetrics, setProjectMetrics] = useState<ProjectMetricsType[]>([]);
  const [areaMetrics, setAreaMetrics] = useState<AreaMetrics[]>([]);
  const [areaCosts, setAreaCosts] = useState<CostByAreaRow[]>([]);
  const [utilizationMetrics, setUtilizationMetrics] = useState<UtilizationMetrics[]>([]);
  const [costMetrics, setCostMetrics] = useState<CostByUserRow[]>([]);
  const [costByClient, setCostByClient] = useState<CostByClientRow[]>([]);
  const [capacityData, setCapacityData] = useState<Awaited<ReturnType<typeof getCapacityByUser>>>([]);
  const [billingHours, setBillingHours] = useState<HoursForBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingHours, setExportingHours] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [exportClientFilter, setExportClientFilter] = useState<string>('');

  const dateRange = getDateRangeForPeriod(period, customStart, customEnd);

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then((res) => {
      const r = res as { data?: { id: string; name: string }[] | null };
      setClients(Array.isArray(r.data) ? r.data : []);
    });
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [activeTab, period, customStart, customEnd]);

  async function fetchMetrics() {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'overview':
          const [projects, capacity, hours, cost, costClient] = await Promise.all([
            getProjectMetrics(),
            getCapacityByUser(8, 5),
            getHoursForBilling(dateRange.startDate, dateRange.endDate),
            getCostByUser(dateRange.startDate, dateRange.endDate),
            getCostByClient(dateRange.startDate, dateRange.endDate),
          ]);
          setProjectMetrics(projects);
          setCapacityData(capacity);
          setBillingHours(hours);
          setCostMetrics(cost);
          setCostByClient(costClient);
          break;
        case 'users':
          const users = await getAllUsersMetrics();
          setUserMetrics(users);
          break;
        case 'projects':
          const proj = await getProjectMetrics();
          setProjectMetrics(proj);
          break;
        case 'areas':
          const [areas, costs] = await Promise.all([
            getAreaMetrics(),
            getCostByArea(dateRange.startDate, dateRange.endDate),
          ]);
          setAreaMetrics(areas);
          setAreaCosts(costs);
          break;
        case 'utilization':
          const utilization = await getAllUsersUtilizationMetrics(8);
          setUtilizationMetrics(utilization);
          break;
        case 'cost':
          const [costData, costClientData] = await Promise.all([
            getCostByUser(dateRange.startDate, dateRange.endDate),
            getCostByClient(dateRange.startDate, dateRange.endDate),
          ]);
          setCostMetrics(costData);
          setCostByClient(costClientData);
          break;
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  async function exportHoursForBilling(clientId?: string) {
    setExportingHours(true);
    try {
      const rows = await getHoursForBilling(dateRange.startDate, dateRange.endDate);
      const filtered = clientId ? rows.filter((r: HoursForBillingRow) => r.client_id === clientId) : rows;
      const headers = ['Cliente', 'Proyecto', 'Usuario', 'Email', 'Horas', 'Minutos', 'Tareas'];
      const csvRows = filtered.map((r: HoursForBillingRow) => [
        r.client_name || '—',
        r.project_name,
        r.user_name || '—',
        r.user_email || '—',
        r.total_hours.toFixed(2),
        r.total_minutes,
        r.task_count,
      ]);
      const csvContent = [headers, ...csvRows].map((row) => row.join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `horas_facturacion_${clientId ? `cliente_${clientId}_` : ''}${dateRange.startDate}_${dateRange.endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting hours:', error);
    } finally {
      setExportingHours(false);
    }
  }

  function exportCurrentData() {
    const filename = `estadisticas_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
    
    switch (activeTab) {
      case 'users':
        exportMetricsToCSV(userMetrics, filename);
        break;
      case 'projects':
        exportProjectsToCSV(projectMetrics, filename);
        break;
      case 'areas':
        exportAreasToCSV(areaMetrics, filename);
        break;
      case 'utilization':
        exportUtilizationToCSV(utilizationMetrics, filename);
        break;
      case 'cost':
        exportCostToCSV(costMetrics, filename);
        break;
    }
  }

  function exportCostToCSV(data: CostByUserRow[], filename: string) {
    const headers = ['Usuario', 'Email', 'Horas', 'Coste (real)', 'Coste/h efectiva', 'Moneda'];
    const rows = data.map((m) => [
      m.user_name,
      m.user_email,
      m.total_hours.toFixed(2),
      m.total_cost ?? '—',
      m.effective_cost_per_hour ?? '—',
      m.currency,
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportProjectsToCSV(data: ProjectMetricsType[], filename: string) {
    const headers = ['Proyecto', 'Tareas Totales', 'Completadas', '% Completado', 'Equipo', 'Tiempo Promedio', 'En Tiempo', 'Días Restantes'];
    const rows = data.map(p => [
      p.projectName,
      p.totalTasks,
      p.completedTasks,
      p.completionRate.toFixed(1),
      p.teamSize,
      Math.round(p.averageTimePerTask),
      p.onSchedule ? 'Sí' : 'No',
      p.daysUntilDeadline
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAreasToCSV(data: AreaMetrics[], filename: string) {
    const headers = [
      'Área', 'Usuarios Totales', 'Usuarios Activos', 'Tareas Totales', 'Completadas', '% Completado', 
      'Eficiencia Promedio', 'Utilización Promedio (%)', 'Horas Trabajadas', 'Capacidad Total (h)', 
      'Utilización Capacidad (%)', 'Distribución Carga (%)', 'Sobrecargada', 'Subcargada', 
      'Recomendación', 'Presión Trabajo', 'Tendencia', 'Top Performers'
    ];
    const rows = data.map(a => [
      a.areaName,
      a.totalUsers,
      a.activeUsers,
      a.totalTasks,
      a.completedTasks,
      a.completionRate.toFixed(1),
      (a.averageEfficiency * 100).toFixed(1),
      a.averageUtilizationRate.toFixed(1),
      Math.round(a.totalHoursWorked),
      Math.round(a.totalCapacityHours),
      a.capacityUtilization.toFixed(1),
      a.workloadDistribution.toFixed(1),
      a.isOverloaded ? 'Sí' : 'No',
      a.isUnderloaded ? 'Sí' : 'No',
      a.recommendedAction,
      a.workloadPressure,
      a.utilizationTrend,
      a.topPerformers.join('; ')
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs = [
    { id: 'overview' as TabType, label: 'Resumen', icon: LayoutDashboard },
    { id: 'projects' as TabType, label: 'Proyectos', icon: FolderOpen },
    { id: 'users' as TabType, label: 'Equipo', icon: Users },
    { id: 'utilization' as TabType, label: 'Utilización', icon: Clock },
    { id: 'cost' as TabType, label: 'Facturación', icon: DollarSign },
    { id: 'areas' as TabType, label: 'Áreas', icon: Layers },
  ];

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-lg font-medium text-yellow-800">Acceso Restringido</h2>
          <p className="text-yellow-700">Solo los administradores pueden acceder a las estadísticas generales.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="flex space-x-4 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-200 rounded w-24"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Centro de mando</h1>
          <p className="text-gray-600">
            Estado de proyectos, equipo y facturación. Todo lo que necesitas para dirigir el día a día.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab !== 'overview' && (
            <button
              onClick={exportCurrentData}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </button>
          )}
          <div className="flex items-center gap-2">
            <select
              value={exportClientFilter}
              onChange={(e) => setExportClientFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Todos los clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => exportHoursForBilling(exportClientFilter || undefined)}
              disabled={exportingHours}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Clock className="w-4 h-4 mr-2" />
              {exportingHours ? 'Exportando...' : 'Horas para facturar'}
            </button>
          </div>
        </div>
      </div>

      {/* Filtro por período */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-100">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-700">Período:</span>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodType)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-500">a</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        <span className="text-sm text-gray-500">
          {dateRange.startDate} — {dateRange.endDate}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-md font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <OverviewSummary
          projects={projectMetrics}
          capacity={capacityData}
          billingHours={billingHours}
          cost={costMetrics}
          costByClient={costByClient}
          dateRange={dateRange}
          onNavigateProjects={() => setActiveTab('projects')}
          onNavigateCapacity={() => navigate('/capacity')}
          onNavigateCost={() => setActiveTab('cost')}
        />
      )}
      {activeTab === 'users' && <UsersMetrics metrics={userMetrics} />}
      {activeTab === 'projects' && <ProjectsMetrics metrics={projectMetrics} />}
      {activeTab === 'areas' && <AreasMetrics metrics={areaMetrics} costs={areaCosts} />}
      {activeTab === 'utilization' && <UtilizationReport metrics={utilizationMetrics} />}
      {activeTab === 'cost' && <CostReport metrics={costMetrics} costByClient={costByClient} />}
    </div>
  );
}

function OverviewSummary({
  projects,
  capacity,
  billingHours,
  cost,
  costByClient,
  dateRange,
  onNavigateProjects,
  onNavigateCapacity,
  onNavigateCost,
}: {
  projects: ProjectMetricsType[];
  capacity: Awaited<ReturnType<typeof getCapacityByUser>>;
  billingHours: HoursForBillingRow[];
  cost: CostByUserRow[];
  costByClient: CostByClientRow[];
  dateRange: { startDate: string; endDate: string };
  onNavigateProjects: () => void;
  onNavigateCapacity: () => void;
  onNavigateCost: () => void;
}) {
  const projectsAtRisk = projects.filter((p) => !p.onSchedule || p.daysUntilDeadline < 7);
  const overloaded = capacity.filter((r) => r.utilization_percent > 100);
  const totalHours = billingHours.reduce((acc, r) => acc + r.total_hours, 0);
  const totalCost = cost.reduce((acc, m) => acc + (m.total_cost ?? 0), 0);

  return (
    <div className="space-y-6">
      <p className="text-gray-600">
        Período: <strong>{dateRange.startDate}</strong> — <strong>{dateRange.endDate}</strong>
      </p>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border-2 border-gray-200 p-4 hover:border-blue-300 transition-colors">
          <p className="text-sm font-medium text-gray-600">Proyectos en riesgo</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{projectsAtRisk.length}</p>
          <p className="text-xs text-gray-500 mt-1">Atrasados o con &lt;7 días</p>
          <button
            onClick={onNavigateProjects}
            className="mt-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Ver proyectos <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div
          className="bg-white rounded-lg border-2 border-gray-200 p-4 hover:border-amber-300 transition-colors cursor-pointer"
          onClick={onNavigateCapacity}
        >
          <p className="text-sm font-medium text-gray-600">Personas sobrecargadas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{overloaded.length}</p>
          <p className="text-xs text-gray-500 mt-1">Más de 100% de capacidad</p>
          <p className="mt-3 flex items-center gap-1 text-sm text-amber-600 font-medium">
            Ver carga del equipo <ArrowRight className="w-4 h-4" />
          </p>
        </div>

        <div
          className="bg-white rounded-lg border-2 border-gray-200 p-4 hover:border-emerald-300 transition-colors cursor-pointer"
          onClick={onNavigateCost}
        >
          <p className="text-sm font-medium text-gray-600">Horas facturables</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalHours.toFixed(1)}h</p>
          <p className="text-xs text-gray-500 mt-1">En el período seleccionado</p>
          <p className="mt-3 flex items-center gap-1 text-sm text-emerald-600 font-medium">
            Ver facturación <ArrowRight className="w-4 h-4" />
          </p>
        </div>

        <div
          className="bg-white rounded-lg border-2 border-gray-200 p-4 hover:border-indigo-300 transition-colors cursor-pointer"
          onClick={onNavigateCost}
        >
          <p className="text-sm font-medium text-gray-600">Coste del período</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totalCost > 0 ? totalCost.toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Según tarifas configuradas</p>
          <p className="mt-3 flex items-center gap-1 text-sm text-indigo-600 font-medium">
            Ver detalle <ArrowRight className="w-4 h-4" />
          </p>
        </div>
      </div>

      {/* Proyectos en riesgo */}
      {projectsAtRisk.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-red-50 flex justify-between items-center">
            <h3 className="font-medium text-red-900">Proyectos que requieren atención</h3>
            <button
              onClick={onNavigateProjects}
              className="text-sm text-red-700 hover:text-red-800 font-medium"
            >
              Ver todos →
            </button>
          </div>
          <div className="divide-y">
            {projectsAtRisk.slice(0, 5).map((p) => (
              <div key={p.projectId} className="px-6 py-4 hover:bg-gray-50 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">{p.projectName}</p>
                  <p className="text-sm text-gray-600">
                    {p.completionRate.toFixed(0)}% completado · {p.completedTasks}/{p.totalTasks} tareas
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      p.daysUntilDeadline < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {p.daysUntilDeadline < 0
                      ? `${Math.abs(p.daysUntilDeadline)} días atrasado`
                      : `${p.daysUntilDeadline} días restantes`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personas sobrecargadas */}
      {overloaded.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-amber-50 flex justify-between items-center">
            <h3 className="font-medium text-amber-900">Personas sobrecargadas</h3>
            <button
              onClick={onNavigateCapacity}
              className="text-sm text-amber-700 hover:text-amber-800 font-medium"
            >
              Ver carga completa →
            </button>
          </div>
          <div className="divide-y">
            {overloaded.slice(0, 5).map((r) => (
              <div key={r.user_id} className="px-6 py-4 hover:bg-gray-50 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">{r.user_name}</p>
                  <p className="text-sm text-gray-600">{r.user_email}</p>
                </div>
                <div className="text-right">
                  <span className="font-medium text-amber-700">{r.assigned_hours.toFixed(1)}h</span>
                  <span className="text-gray-500 text-sm ml-1">({r.utilization_percent}% de capacidad)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coste por cliente */}
      {costByClient.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-indigo-50 flex justify-between items-center">
            <h3 className="font-medium text-indigo-900">Coste por cliente (período)</h3>
            <button
              onClick={onNavigateCost}
              className="text-sm text-indigo-700 hover:text-indigo-800 font-medium"
            >
              Ver facturación →
            </button>
          </div>
          <div className="divide-y max-h-48 overflow-y-auto">
            {(() => {
              const byClient = costByClient.reduce((acc, r) => {
                if (!acc[r.client_id]) acc[r.client_id] = { name: r.client_name, byCur: {} as Record<string, number> };
                acc[r.client_id].byCur[r.currency] = (acc[r.client_id].byCur[r.currency] || 0) + r.cost_consumed;
                return acc;
              }, {} as Record<string, { name: string; byCur: Record<string, number> }>);
              return Object.entries(byClient).map(([cid, v]) => (
                <div key={cid} className="px-6 py-3 hover:bg-gray-50 flex justify-between items-center">
                  <span className="font-medium text-gray-900">{v.name}</span>
                  <span className="text-sm font-semibold text-indigo-600">
                    {Object.entries(v.byCur).map(([cur, tot], i) => (
                      <span key={cur}>{i > 0 && ' · '}{tot.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {cur}</span>
                    ))}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {projectsAtRisk.length === 0 && overloaded.length === 0 && costByClient.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
          <p className="font-medium text-emerald-800">Todo bajo control</p>
          <p className="text-sm text-emerald-700 mt-1">
            No hay proyectos en riesgo ni personas sobrecargadas. Revisa los otros tabs para más detalle.
          </p>
        </div>
      )}
    </div>
  );
}

function CostReport({ metrics, costByClient = [] }: { metrics: CostByUserRow[]; costByClient?: CostByClientRow[] }) {
  const totalHours = metrics.reduce((acc, m) => acc + m.total_hours, 0);
  const totalCost = metrics.reduce((acc, m) => acc + (m.total_cost ?? 0), 0);
  const withRate = metrics.filter(m => m.total_cost != null && m.total_cost > 0).length;
  const avgCostPerHour = totalHours > 0 && totalCost > 0 ? totalCost / totalHours : null;

  return (
    <div className="space-y-6">
      <p className="text-gray-600 text-sm">
        <strong>Coste real:</strong> suma de sueldos mensuales (empleados) o horas × tarifa (freelancers). <strong>Coste/h efectiva:</strong> sueldo ÷ horas trabajadas — más alto = menos eficiente (trabajan menos horas por el mismo sueldo).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-emerald-50 rounded-lg p-4">
          <p className="text-sm text-emerald-600 font-medium">Total horas</p>
          <p className="text-2xl font-bold text-emerald-900">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="bg-indigo-50 rounded-lg p-4">
          <p className="text-sm text-indigo-600 font-medium">Coste total (real)</p>
          <p className="text-2xl font-bold text-indigo-900">
            {totalCost > 0 ? totalCost.toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '—'}
          </p>
        </div>
        <div className="bg-amber-50 rounded-lg p-4">
          <p className="text-sm text-amber-600 font-medium">Coste/h promedio</p>
          <p className="text-2xl font-bold text-amber-900">
            {avgCostPerHour != null ? avgCostPerHour.toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '—'}
          </p>
        </div>
        <div className="bg-amber-50 rounded-lg p-4">
          <p className="text-sm text-amber-600 font-medium">Usuarios con sueldo/tarifa</p>
          <p className="text-2xl font-bold text-amber-900">{withRate} / {metrics.length}</p>
        </div>
      </div>

      {costByClient.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <h3 className="px-6 py-3 bg-indigo-50 font-medium text-indigo-900">Coste por cliente</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Coste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(() => {
                const byClient = costByClient.reduce((acc, r) => {
                  if (!acc[r.client_id]) acc[r.client_id] = { name: r.client_name, byCur: {} as Record<string, number> };
                  acc[r.client_id].byCur[r.currency] = (acc[r.client_id].byCur[r.currency] || 0) + r.cost_consumed;
                  return acc;
                }, {} as Record<string, { name: string; byCur: Record<string, number> }>);
                return Object.entries(byClient).map(([cid, v]) => (
                  <tr key={cid} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{v.name}</td>
                    <td className="px-6 py-4 text-right font-semibold text-indigo-600">
                      {Object.entries(v.byCur).map(([cur, tot], i) => (
                        <span key={cur}>{i > 0 && ' · '}{tot.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {cur}</span>
                      ))}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h3 className="px-6 py-3 bg-gray-50 font-medium text-gray-900">Coste por usuario</h3>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Horas</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Coste (real)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Coste/h efectiva</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {metrics.map((m) => {
              const isHighCostPerHour = m.effective_cost_per_hour != null && avgCostPerHour != null && m.effective_cost_per_hour > avgCostPerHour * 1.2;
              return (
                <tr key={m.user_id} className={`hover:bg-gray-50 ${isHighCostPerHour ? 'bg-red-50' : ''}`}>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{m.user_name}</p>
                      <p className="text-xs text-gray-500">{m.user_email}</p>
                      {isHighCostPerHour && (
                        <span className="inline-block mt-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded">
                          Alto coste/h — trabaja menos horas
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">{m.total_hours.toFixed(1)}h</td>
                  <td className="px-6 py-4 text-right font-medium">
                    {m.total_cost != null
                      ? `${m.total_cost.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ${m.currency}`
                      : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.effective_cost_per_hour != null ? (
                      <span className={isHighCostPerHour ? 'font-semibold text-red-700' : 'text-gray-600'}>
                        {m.effective_cost_per_hour.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {m.currency}/h
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Componente para métricas de utilización
function UtilizationReport({ metrics }: { metrics: UtilizationMetrics[] }) {
  const totalUsers = metrics.length;
  const avgUtilization = metrics.length > 0 
    ? metrics.reduce((acc, m) => acc + m.utilizationRate, 0) / metrics.length 
    : 0;
  const underutilized = metrics.filter(m => m.isUnderutilized).length;
  const overutilized = metrics.filter(m => m.isOverutilized).length;
  const totalHoursWorked = metrics.reduce((acc, m) => acc + m.totalHoursThisMonth, 0);
  const avgConsistency = metrics.length > 0 
    ? metrics.reduce((acc, m) => acc + m.consistencyScore, 0) / metrics.length 
    : 0;

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Usuarios Activos</p>
              <p className="text-2xl font-bold text-blue-900">{totalUsers}</p>
            </div>
            <Users className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Utilización Promedio</p>
              <p className="text-2xl font-bold text-green-900">{avgUtilization.toFixed(0)}%</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Horas Trabajadas</p>
              <p className="text-2xl font-bold text-yellow-900">{Math.round(totalHoursWorked)}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Consistencia Media</p>
              <p className="text-2xl font-bold text-purple-900">{avgConsistency.toFixed(0)}%</p>
            </div>
            <Target className="w-8 h-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Alertas */}
      {(underutilized > 0 || overutilized > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {underutilized > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
                <div>
                  <h4 className="font-medium text-yellow-800">Subutilización</h4>
                                     <p className="text-sm text-yellow-700">{underutilized} usuarios con utilización &lt; 70%</p>
                </div>
              </div>
            </div>
          )}
          
          {overutilized > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
                <div>
                  <h4 className="font-medium text-red-800">Sobreutilización</h4>
                                     <p className="text-sm text-red-700">{overutilized} usuarios con utilización &gt; 110%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabla de utilización */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Utilización por Usuario</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Horas/Día
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilización
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Esta Semana
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Este Mes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pico actividad
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Consistencia
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics.map((metric, index) => (
                <tr key={metric.userId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{metric.userName}</div>
                      <div className="text-sm text-gray-500">{metric.userEmail}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {metric.averageHoursWorkedPerDay.toFixed(1)}h
                    </div>
                    <div className="text-xs text-gray-500">
                      de {metric.workingHoursPerDay}h estándar
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`text-sm font-medium ${
                        metric.utilizationRate >= 90 ? 'text-green-600' : 
                        metric.utilizationRate >= 70 ? 'text-blue-600' : 
                        metric.utilizationRate >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {metric.utilizationRate.toFixed(1)}%
                      </div>
                      <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            metric.utilizationRate >= 90 ? 'bg-green-500' : 
                            metric.utilizationRate >= 70 ? 'bg-blue-500' : 
                            metric.utilizationRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, metric.utilizationRate)}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {metric.totalHoursThisWeek.toFixed(1)}h
                    </div>
                    <div className="text-xs text-gray-500">
                      {metric.weeklyUtilizationRate.toFixed(0)}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {metric.totalHoursThisMonth.toFixed(1)}h
                    </div>
                    <div className="text-xs text-gray-500">
                      {metric.monthlyUtilizationRate.toFixed(0)}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {metric.mostProductiveTimeOfDay}
                    </div>
                    <div className="text-xs text-gray-500">
                      {Math.round(metric.averageTaskDuration)} min/tarea
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${
                      metric.consistencyScore >= 80 ? 'text-green-600' : 
                      metric.consistencyScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {metric.consistencyScore.toFixed(0)}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-1">
                      {metric.isUnderutilized && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Subutilizado
                        </span>
                      )}
                      {metric.isOverutilized && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Sobreutilizado
                        </span>
                      )}
                      {!metric.isUnderutilized && !metric.isOverutilized && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Óptimo
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Componente para métricas de usuarios
function UsersMetrics({ metrics }: { metrics: UserMetrics[] }) {
  const totalTasks = metrics.reduce((acc, m) => acc + m.tasksCompleted, 0);
  const avgApprovalRate = metrics.length > 0 
    ? metrics.reduce((acc, m) => acc + m.approvalRate, 0) / metrics.length 
    : 0;
  const avgReworkRate = metrics.length > 0
    ? metrics.reduce((acc, m) => acc + m.reworkRate, 0) / metrics.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Usuarios Activos</p>
              <p className="text-2xl font-bold text-blue-900">{metrics.length}</p>
            </div>
            <Users className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Tareas Aprobadas</p>
              <p className="text-2xl font-bold text-green-900">{totalTasks}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Tasa Aprobación Media</p>
              <p className="text-2xl font-bold text-purple-900">{avgApprovalRate.toFixed(0)}%</p>
            </div>
            <Target className="w-8 h-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium">Tasa Retrabajo Media</p>
              <p className="text-2xl font-bold text-orange-900">{avgReworkRate.toFixed(1)}%</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Rendimiento por Usuario</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Asignadas / Aprobadas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tasa de Aprobación
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tasa de Retrabajo
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics.map((metric, index) => (
                <tr key={metric.userId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{metric.userName}</div>
                      <div className="text-sm text-gray-500">{metric.userEmail}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {metric.tasksAssigned} / <span className="font-bold text-green-600">{metric.tasksApproved}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      ({metric.completionRate.toFixed(0)}% completado)
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`text-sm font-medium mr-2 ${
                        metric.approvalRate >= 95 ? 'text-green-600' : 
                        metric.approvalRate >= 85 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {metric.approvalRate.toFixed(1)}%
                      </div>
                       <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                          className={`h-2.5 rounded-full ${
                            metric.approvalRate >= 95 ? 'bg-green-500' : 
                            metric.approvalRate >= 85 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${metric.approvalRate}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`text-sm font-medium mr-2 ${
                        metric.reworkRate <= 5 ? 'text-green-600' : 
                        metric.reworkRate <= 15 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {metric.reworkRate.toFixed(1)}%
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full ${
                            metric.reworkRate <= 5 ? 'bg-green-500' : 
                            metric.reworkRate <= 15 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${metric.reworkRate * 2}%` }} // Multiplicar para mejor visualización
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Componente para métricas de proyectos
function ProjectsMetrics({ metrics }: { metrics: ProjectMetricsType[] }) {
  const totalProjects = metrics.length;
  const onScheduleProjects = metrics.filter(p => p.onSchedule).length;
  const avgCompletion = metrics.length > 0 
    ? metrics.reduce((acc, m) => acc + m.completionRate, 0) / metrics.length 
    : 0;
  const totalTeamMembers = metrics.reduce((acc, m) => acc + m.teamSize, 0);

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Proyectos Activos</p>
              <p className="text-2xl font-bold text-blue-900">{totalProjects}</p>
            </div>
            <FolderOpen className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">En Tiempo</p>
              <p className="text-2xl font-bold text-green-900">{onScheduleProjects}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Progreso Promedio</p>
              <p className="text-2xl font-bold text-purple-900">{avgCompletion.toFixed(0)}%</p>
            </div>
            <BarChart3 className="w-8 h-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium">Miembros de Equipo</p>
              <p className="text-2xl font-bold text-orange-900">{totalTeamMembers}</p>
            </div>
            <Users className="w-8 h-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Lista de proyectos */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Estado de Proyectos</h3>
        </div>
        
        <div className="p-6">
          <div className="space-y-4">
            {metrics.map((project) => (
              <div key={project.projectId} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-medium text-gray-900">{project.projectName}</h4>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    project.onSchedule 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {project.onSchedule ? 'En Tiempo' : 'Atrasado'}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Progreso</p>
                    <p className="font-medium">{project.completionRate.toFixed(1)}%</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${Math.min(project.completionRate, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-gray-600">Tareas</p>
                    <p className="font-medium">{project.completedTasks}/{project.totalTasks}</p>
                  </div>
                  
                  <div>
                    <p className="text-gray-600">Equipo</p>
                    <p className="font-medium">{project.teamSize} personas</p>
                  </div>
                  
                  <div>
                    <p className="text-gray-600">Tiempo Promedio</p>
                    <p className="font-medium">{Math.round(project.averageTimePerTask)} min</p>
                  </div>
                  
                  <div>
                    <p className="text-gray-600">Días Restantes</p>
                    <p className={`font-medium ${
                      project.daysUntilDeadline < 0 ? 'text-red-600' :
                      project.daysUntilDeadline < 7 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {project.daysUntilDeadline < 0 
                        ? `${Math.abs(project.daysUntilDeadline)} días atrasado`
                        : `${project.daysUntilDeadline} días`
                      }
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente para métricas de áreas con enfoque en utilización
function AreasMetrics({ metrics, costs = [] }: { metrics: AreaMetrics[]; costs?: CostByAreaRow[] }) {
  const totalAreas = metrics.length;
  const overloadedAreas = metrics.filter(m => m.isOverloaded).length;
  const underloadedAreas = metrics.filter(m => m.isUnderloaded).length;
  const avgCapacityUtilization = metrics.length > 0 
    ? metrics.reduce((acc, m) => acc + m.capacityUtilization, 0) / metrics.length 
    : 0;
  const costMap = new Map(costs.map((c) => [c.area_id, c]));
  const totalCostByAreas = costs.reduce((acc, c) => acc + c.total_cost, 0);

  const getRecommendationText = (action: string) => {
    switch (action) {
      case 'hire': return 'Contratar Personal';
      case 'redistribute': return 'Redistribuir Carga';
      case 'consider_reduction': return 'Considerar Reducción';
      default: return 'Óptimo';
    }
  };

  const getPressureColor = (pressure: string) => {
    switch (pressure) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-green-600 bg-green-100';
    }
  };

  const getRecommendationColor = (action: string) => {
    switch (action) {
      case 'hire': return 'bg-red-100 text-red-800';
      case 'redistribute': return 'bg-yellow-100 text-yellow-800';
      case 'consider_reduction': return 'bg-blue-100 text-blue-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumen de capacidad */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Áreas Totales</p>
              <p className="text-2xl font-bold text-blue-900">{totalAreas}</p>
            </div>
            <Layers className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Utilización Promedio</p>
              <p className="text-2xl font-bold text-green-900">{avgCapacityUtilization.toFixed(0)}%</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Sobrecargadas</p>
              <p className="text-2xl font-bold text-red-900">{overloadedAreas}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Subutilizadas</p>
              <p className="text-2xl font-bold text-yellow-900">{underloadedAreas}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-indigo-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-indigo-600 font-medium">Coste total áreas</p>
              <p className="text-2xl font-bold text-indigo-900">
                {totalCostByAreas > 0
                  ? totalCostByAreas.toLocaleString('es-CO', { maximumFractionDigits: 0 })
                  : '—'}
              </p>
              <p className="text-xs text-indigo-600 mt-1">Período seleccionado</p>
            </div>
            <DollarSign className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
      </div>

      {/* Alertas críticas */}
      {(overloadedAreas > 0 || underloadedAreas > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {overloadedAreas > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
                <div>
                  <h4 className="font-medium text-red-800">⚠️ Áreas Críticas</h4>
                  <p className="text-sm text-red-700">{overloadedAreas} áreas necesitan más personal urgentemente</p>
                </div>
              </div>
            </div>
          )}
          
          {underloadedAreas > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center">
                <Clock className="w-5 h-5 text-yellow-600 mr-2" />
                <div>
                  <h4 className="font-medium text-yellow-800">💡 Oportunidades</h4>
                  <p className="text-sm text-yellow-700">{underloadedAreas} áreas con capacidad disponible para optimizar</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de áreas con métricas de capacidad */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">📊 Análisis de Capacidad y Recursos por Área</h3>
          <p className="text-sm text-gray-600 mt-1">Utilización de capacidad y recomendaciones para optimización de recursos</p>
        </div>
        
        <div className="p-6">
          <div className="space-y-6">
            {metrics.map((area) => (
              <div key={area.areaId} className={`border rounded-lg p-6 transition-all duration-200 ${
                area.isOverloaded ? 'border-red-200 bg-red-50' : 
                area.isUnderloaded ? 'border-yellow-200 bg-yellow-50' : 
                'border-gray-200 hover:bg-gray-50'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <h4 className="text-xl font-semibold text-gray-900">{area.areaName}</h4>
                    {area.isOverloaded && <span className="text-red-600 text-lg">🔥</span>}
                    {area.isUnderloaded && <span className="text-blue-600 text-lg">💤</span>}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPressureColor(area.workloadPressure)}`}>
                      Presión: {area.workloadPressure === 'high' ? 'Alta' : 
                               area.workloadPressure === 'medium' ? 'Media' : 'Baja'}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRecommendationColor(area.recommendedAction)}`}>
                      {getRecommendationText(area.recommendedAction)}
                    </span>
                  </div>
                </div>
                
                {/* Métricas principales */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{area.activeUsers}/{area.totalUsers}</div>
                    <div className="text-sm text-gray-600">Personal</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-indigo-600">
                      {(costMap.get(area.areaId)?.total_cost ?? 0) > 0
                        ? (costMap.get(area.areaId)?.total_cost ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })
                        : '—'}
                    </div>
                    <div className="text-sm text-gray-600">
                      {(costMap.get(area.areaId)?.total_cost ?? 0) > 0
                        ? `${costMap.get(area.areaId)?.currency ?? 'COP'} · ${costMap.get(area.areaId)?.total_hours.toFixed(1)}h`
                        : 'Sin tarifas'}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${
                      area.capacityUtilization >= 95 ? 'text-red-600' : 
                      area.capacityUtilization >= 80 ? 'text-yellow-600' : 
                      area.capacityUtilization >= 60 ? 'text-green-600' : 'text-blue-600'
                    }`}>
                      {area.capacityUtilization.toFixed(0)}%
                    </div>
                    <div className="text-sm text-gray-600">Utilización</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{Math.round(area.totalHoursWorked)}h</div>
                    <div className="text-sm text-gray-600">Horas Trabajadas</div>
                  </div>
                  
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${
                      area.workloadDistribution >= 80 ? 'text-green-600' : 
                      area.workloadDistribution >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {area.workloadDistribution.toFixed(0)}%
                    </div>
                    <div className="text-sm text-gray-600">Distribución</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{area.completedTasks}/{area.totalTasks}</div>
                    <div className="text-sm text-gray-600">Tareas</div>
                  </div>
                </div>

                {/* Barra de utilización de capacidad */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Utilización de Capacidad</span>
                    <span>{area.capacityUtilization.toFixed(1)}% ({Math.round(area.totalHoursWorked)}h / {Math.round(area.totalCapacityHours)}h)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div 
                      className={`h-4 rounded-full transition-all duration-300 ${
                        area.capacityUtilization >= 95 ? 'bg-red-500' : 
                        area.capacityUtilization >= 80 ? 'bg-yellow-500' : 
                        area.capacityUtilization >= 60 ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(area.capacityUtilization, 100)}%` }}
                    ></div>
                  </div>
                  {area.capacityUtilization > 100 && (
                    <div className="text-xs text-red-600 mt-1 font-medium">
                      ⚠️ Sobrepasando capacidad en {(area.capacityUtilization - 100).toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* Recomendaciones específicas */}
                <div className="mb-4">
                  {area.recommendedAction === 'hire' && (
                    <div className="bg-red-100 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center text-red-800">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        <span className="font-medium">Recomendación: Contratar más personal</span>
                      </div>
                      <p className="text-sm text-red-700 mt-1">
                        El área está sobrecargada ({area.capacityUtilization.toFixed(0)}% de utilización). 
                        Se recomienda contratar personal adicional para mantener la calidad del trabajo.
                      </p>
                    </div>
                  )}
                  
                  {area.recommendedAction === 'redistribute' && (
                    <div className="bg-yellow-100 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-center text-yellow-800">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        <span className="font-medium">Recomendación: Redistribuir carga de trabajo</span>
                      </div>
                      <p className="text-sm text-yellow-700 mt-1">
                        La carga está mal distribuida ({area.workloadDistribution.toFixed(0)}% de equilibrio). 
                        Considera reasignar tareas entre el equipo.
                      </p>
                    </div>
                  )}
                  
                  {area.recommendedAction === 'consider_reduction' && (
                    <div className="bg-blue-100 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center text-blue-800">
                        <Clock className="w-4 h-4 mr-2" />
                        <span className="font-medium">Oportunidad: Capacidad disponible</span>
                      </div>
                      <p className="text-sm text-blue-700 mt-1">
                        Baja utilización ({area.capacityUtilization.toFixed(0)}%). 
                        Considera reasignar recursos o tomar más proyectos.
                      </p>
                    </div>
                  )}
                  
                  {area.recommendedAction === 'optimal' && (
                    <div className="bg-green-100 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center text-green-800">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        <span className="font-medium">Estado: Óptimo</span>
                      </div>
                      <p className="text-sm text-green-700 mt-1">
                        El área está funcionando en un rango óptimo de utilización ({area.capacityUtilization.toFixed(0)}%).
                      </p>
                    </div>
                  )}
                </div>

                {/* Top performers */}
                {area.topPerformers.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-600 mb-2">🏆 Top Performers</div>
                    <div className="flex flex-wrap gap-2">
                      {area.topPerformers.map((performer, index) => (
                        <span 
                          key={index}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            index === 0 ? 'bg-yellow-100 text-yellow-800' :
                            index === 1 ? 'bg-gray-100 text-gray-800' :
                            'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'} {performer}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 