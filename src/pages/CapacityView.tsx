import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCapacityByUser } from '../lib/metrics';
import { Users, AlertTriangle, CheckCircle, UserPlus, Download, HelpCircle } from 'lucide-react';

type CapacityRow = Awaited<ReturnType<typeof getCapacityByUser>>[number];

function exportToCSV(data: CapacityRow[], hoursPerWeek: number) {
  const headers = ['Usuario', 'Email', 'Horas asignadas (pendientes)', 'Horas disponibles/semana', 'Carga %', 'Estado'];
  const rows = data.map((r) => {
    const status = r.utilization_percent > 100 ? 'Sobrecargado' : r.utilization_percent >= 70 ? 'Óptimo' : 'Disponible';
    return [r.user_name, r.user_email, r.assigned_hours.toFixed(1), hoursPerWeek, `${r.utilization_percent}%`, status];
  });
  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `capacidad_equipo_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CapacityView() {
  const navigate = useNavigate();
  const [capacity, setCapacity] = useState<CapacityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [showHelp, setShowHelp] = useState(false);

  const hoursPerWeek = hoursPerDay * daysPerWeek;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await getCapacityByUser(hoursPerDay, daysPerWeek);
      setCapacity(data);
      setLoading(false);
    }
    load();
  }, [hoursPerDay, daysPerWeek]);

  const overloaded = capacity.filter((r) => r.utilization_percent > 100);
  const optimal = capacity.filter((r) => r.utilization_percent >= 70 && r.utilization_percent <= 100);
  const available = capacity.filter((r) => r.utilization_percent < 70);

  const sorted = [...capacity].sort((a, b) => b.utilization_percent - a.utilization_percent);

  function getStatus(row: CapacityRow) {
    if (row.utilization_percent > 100) return { label: 'Sobrecargado', color: 'red', icon: AlertTriangle };
    if (row.utilization_percent >= 70) return { label: 'Óptimo', color: 'emerald', icon: CheckCircle };
    return { label: 'Disponible', color: 'blue', icon: UserPlus };
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6 animate-pulse">
        <div>
          <div className="h-8 bg-gray-200 rounded w-64 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-96" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Planificación de carga
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-gray-400 hover:text-gray-600"
              title="¿Qué significa esto?"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </h1>
          <p className="text-gray-600 mt-1">
            ¿Quién puede tomar más trabajo? ¿Quién está sobrecargado? Usa esto para asignar tareas con criterio.
          </p>
        </div>
        <button
          onClick={() => exportToCSV(capacity, hoursPerWeek)}
          disabled={capacity.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Ayuda */}
      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          <p className="font-medium mb-2">¿Qué muestra esta vista?</p>
          <p className="mb-2">
            <strong>Horas asignadas</strong> = suma de las estimaciones de todas las tareas y subtareas pendientes (no aprobadas) que tiene cada persona.
          </p>
          <p className="mb-2">
            <strong>Horas disponibles</strong> = capacidad semanal según la jornada (ej: 8h/día × 5 días = 40h).
          </p>
          <p>
            Si alguien tiene &gt;100% está sobrecargado. Si tiene &lt;70% tiene margen para asignarle más trabajo.
          </p>
        </div>
      )}

      {/* Resumen visual */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="rounded-lg p-4 border-2 border-red-200 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors"
          onClick={() => navigate('/tasks')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">Sobrecargados</p>
              <p className="text-2xl font-bold text-red-900">{overloaded.length}</p>
              <p className="text-xs text-red-600 mt-1">Más de 100% de capacidad</p>
            </div>
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
        </div>
        <div className="rounded-lg p-4 border-2 border-emerald-200 bg-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">Óptimos</p>
              <p className="text-2xl font-bold text-emerald-900">{optimal.length}</p>
              <p className="text-xs text-emerald-600 mt-1">70–100% de capacidad</p>
            </div>
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
        </div>
        <div
          className="rounded-lg p-4 border-2 border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors"
          onClick={() => navigate('/tasks')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Disponibles</p>
              <p className="text-2xl font-bold text-blue-900">{available.length}</p>
              <p className="text-xs text-blue-600 mt-1">Pueden tomar más trabajo</p>
            </div>
            <UserPlus className="w-10 h-10 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Config */}
      <div className="flex flex-wrap gap-4 items-center p-3 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium text-gray-700">Jornada estándar:</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="24"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Math.max(1, Math.min(24, Number(e.target.value) || 8)))}
            className="w-14 p-2 border rounded-md text-sm"
          />
          <span className="text-gray-600">h/día</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="7"
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Math.max(1, Math.min(7, Number(e.target.value) || 5)))}
            className="w-14 p-2 border rounded-md text-sm"
          />
          <span className="text-gray-600">días/semana</span>
        </div>
        <span className="text-sm text-gray-500">= {hoursPerWeek}h disponibles por persona</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">Carga por persona (ordenado: más cargados primero)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-700">Usuario</th>
                <th className="px-6 py-3 font-medium text-gray-700 text-right">Trabajo pendiente</th>
                <th className="px-6 py-3 font-medium text-gray-700 text-right">Disponible</th>
                <th className="px-6 py-3 font-medium text-gray-700 w-48">Carga</th>
                <th className="px-6 py-3 font-medium text-gray-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const status = getStatus(row);
                const Icon = status.icon;
                const pct = Math.min(row.utilization_percent, 120);
                return (
                  <tr key={row.user_id} className="border-t hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900">{row.user_name}</p>
                          <p className="text-xs text-gray-500">{row.user_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {row.assigned_hours.toFixed(1)}h
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {row.available_hours}h
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2.5 min-w-[80px]">
                          <div
                            className={`h-2.5 rounded-full ${
                              status.color === 'red'
                                ? 'bg-red-500'
                                : status.color === 'emerald'
                                ? 'bg-emerald-500'
                                : 'bg-blue-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600 w-10">{row.utilization_percent}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          status.color === 'red'
                            ? 'bg-red-100 text-red-700'
                            : status.color === 'emerald'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {capacity.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            No hay usuarios con proyectos asignados. Asigna proyectos a usuarios para ver su carga.
          </div>
        )}
      </div>
    </div>
  );
}
