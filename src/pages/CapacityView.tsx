import React, { useEffect, useState } from 'react';
import { getCapacityByUser } from '../lib/metrics';
import { Users, Clock, BarChart3 } from 'lucide-react';

export default function CapacityView() {
  const [capacity, setCapacity] = useState<Awaited<ReturnType<typeof getCapacityByUser>>>([]);
  const [loading, setLoading] = useState(true);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(5);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await getCapacityByUser(hoursPerDay, daysPerWeek);
      setCapacity(data);
      setLoading(false);
    }
    load();
  }, [hoursPerDay, daysPerWeek]);

  if (loading) {
    return (
      <div className="space-y-6 p-6 animate-pulse">
        <div>
          <div className="h-8 bg-gray-200 rounded w-48 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-64" />
        </div>
        <div className="flex gap-4">
          <div className="h-10 bg-gray-200 rounded w-24" />
          <div className="h-10 bg-gray-200 rounded w-24" />
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-4 border-b flex gap-4 items-center">
              <div className="h-8 w-8 bg-gray-200 rounded-full" />
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="h-4 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7" />
          Vista de Capacidad
        </h1>
        <p className="text-gray-600 mt-1">
          Horas asignadas vs disponibles por persona/semana
        </p>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Horas/día:</label>
          <input
            type="number"
            min="1"
            max="24"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Number(e.target.value) || 8)}
            className="w-16 p-2 border rounded-md"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Días/semana:</label>
          <input
            type="number"
            min="1"
            max="7"
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value) || 5)}
            className="w-16 p-2 border rounded-md"
          />
        </div>
        <span className="text-sm text-gray-500">
          Disponible: {hoursPerDay * daysPerWeek}h/semana
        </span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-700">Usuario</th>
              <th className="px-6 py-3 font-medium text-gray-700 text-right">Horas asignadas</th>
              <th className="px-6 py-3 font-medium text-gray-700 text-right">Horas disponibles</th>
              <th className="px-6 py-3 font-medium text-gray-700 text-right">Utilización</th>
            </tr>
          </thead>
          <tbody>
            {capacity.map((row) => (
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
                <td className="px-6 py-4 text-right">
                  <span className="font-medium">{row.assigned_hours.toFixed(1)}h</span>
                </td>
                <td className="px-6 py-4 text-right text-gray-600">
                  {row.available_hours}h
                </td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      row.utilization_percent > 100
                        ? 'bg-red-100 text-red-700'
                        : row.utilization_percent > 80
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    <Clock className="w-3 h-3 mr-1" />
                    {row.utilization_percent}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {capacity.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            No hay usuarios con proyectos asignados.
          </div>
        )}
      </div>
    </div>
  );
}
