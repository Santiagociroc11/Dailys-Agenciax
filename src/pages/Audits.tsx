import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { History, Filter, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const ENTITY_LABELS: Record<string, string> = {
  task: 'Tarea',
  subtask: 'Subtarea',
  user: 'Usuario',
  project: 'Proyecto',
  client: 'Cliente',
  project_template: 'Plantilla',
  area: 'Área',
  payroll: 'Nómina',
  assignment: 'Asignación',

const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  update: 'Actualizar',
  delete: 'Eliminar',
};

interface AuditRow {
  id: string;
  user_id: string;
  user_name: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field_name?: string;
  summary?: string;
  createdAt: string;
}

export default function Audits() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState<string>('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchLogs();
  }, [entityType, startDate, endDate]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_audit_logs', {
        entity_type: entityType || undefined,
        start_date: startDate,
        end_date: endDate,
        limit: 200,
      });
      if (error) throw error;
      setLogs((data as AuditRow[]) || []);
    } catch (err) {
      console.error('Error al cargar auditoría:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <History className="w-7 h-7" />
          Auditoría de cambios
        </h1>
        <p className="text-gray-600 mt-1">
          Registro de quién modificó qué y cuándo
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
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
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
            No hay registros de auditoría en el período seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Usuario</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Acción</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Resumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {log.createdAt
                        ? format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: es })
                        : '-'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{log.user_name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700">
                        {ENTITY_LABELS[log.entity_type] || log.entity_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          log.action === 'create'
                            ? 'bg-green-100 text-green-800'
                            : log.action === 'delete'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={log.summary || ''}>
                      {log.summary || log.field_name || '-'}
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
