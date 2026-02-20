import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Filter, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const ACTIVITY_LABELS: Record<string, string> = {
  assigned: 'Asignación',
  in_progress: 'En progreso',
  completed: 'Entrega',
  in_review: 'En revisión',
  approved: 'Aprobado',
  returned: 'Devuelto',
  blocked: 'Bloqueado',
  pending: 'Pendiente',
};

interface ActivityRow {
  id: string;
  activity_type: string;
  activity_label: string;
  item_type: 'task' | 'subtask';
  item_id: string;
  item_title: string;
  project_name: string;
  changed_by: string | null;
  actor_name: string;
  previous_status: string | null;
  changed_at: string;
}

interface UserOption {
  id: string;
  name: string;
}

export default function ActivityReport() {
  const [logs, setLogs] = useState<ActivityRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>('');
  const [activityType, setActivityType] = useState<string>('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    supabase.from('users').select('id, name').order('name').then((res) => {
      const { data } = res as { data: UserOption[] | null };
      setUsers(data || []);
    });
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [userId, activityType, startDate, endDate]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_activity_log', {
        user_id: userId || undefined,
        activity_type: activityType || undefined,
        start_date: startDate,
        end_date: endDate,
        limit: 300,
      });
      if (error) throw error;
      setLogs((data as ActivityRow[]) || []);
    } catch (err) {
      console.error('Error al cargar reporte de actividad:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  const activityTypes = Object.entries(ACTIVITY_LABELS);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Activity className="w-7 h-7" />
          Reporte de actividad
        </h1>
        <p className="text-gray-600 mt-1">
          Log de asignaciones, entregas, revisiones y cambios de estado
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <span className="text-gray-500">a</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm min-w-[180px]"
          >
            <option value="">Todos los usuarios</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Todas las actividades</option>
            {activityTypes.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay actividad registrada en el período seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Actividad</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Quién</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Proyecto</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Tarea / Subtarea</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {log.changed_at
                        ? format(new Date(log.changed_at), "dd/MM/yyyy HH:mm", { locale: es })
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          log.activity_type === 'assigned'
                            ? 'bg-blue-100 text-blue-800'
                            : log.activity_type === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.activity_type === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : log.activity_type === 'returned'
                            ? 'bg-amber-100 text-amber-800'
                            : log.activity_type === 'in_review'
                            ? 'bg-purple-100 text-purple-800'
                            : log.activity_type === 'blocked'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {log.activity_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{log.actor_name}</td>
                    <td className="px-4 py-3 text-gray-600">{log.project_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-xs truncate" title={log.item_title}>
                      {log.item_title || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600 text-xs">
                        {log.item_type === 'subtask' ? 'Subtarea' : 'Tarea'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
