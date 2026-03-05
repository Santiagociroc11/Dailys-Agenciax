import React, { useEffect, useState } from 'react';
import { getBottleneckAnalysis, type BottleneckRow } from '../lib/metrics';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Users, ChevronDown, ChevronRight, Download, HelpCircle } from 'lucide-react';

function exportToCSV(data: BottleneckRow[]) {
  const headers = ['Usuario', 'Email', 'Actividades esperando', 'Bloqueado por', 'Bloqueando a'];
  const rows = data.map((r) => [
    r.userName,
    r.userEmail,
    r.waitingCount,
    r.blockedBy.map((b) => `${b.userName} (${b.pendingCount})`).join('; '),
    r.blockedUsers.map((u) => `${u.userName} (${u.waitingCount})`).join('; '),
  ]);
  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuellos_botella_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BottleneckView() {
  const [data, setData] = useState<BottleneckRow[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    async function loadProjects() {
      const { data: projData } = await supabase
        .from('projects')
        .select('id, name')
        .eq('is_archived', false)
        .order('name');
      setProjects(projData || []);
    }
    loadProjects();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getBottleneckAnalysis(projectId || undefined);
      setData(result);
      setLoading(false);
    }
    load();
  }, [projectId]);

  const usersWithWaiting = data.filter((r) => r.waitingCount > 0).length;
  const usersBlocking = data.filter((r) => r.blockingCount > 0).length;
  const sorted = [...data].sort((a, b) => b.waitingCount - a.waitingCount);

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
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Cuellos de botella
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-gray-400 hover:text-gray-600"
              title="¿Qué significa esto?"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </h1>
          <p className="text-gray-600 mt-1">
            Actividades esperando activarse por dependencias secuenciales. Identifica quién bloquea a quién.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => exportToCSV(data)}
            disabled={data.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          <p className="font-medium mb-2">¿Qué muestra esta vista?</p>
          <p className="mb-2">
            <strong>Actividades esperando</strong> = subtareas con status pendiente cuyo nivel anterior (en tareas secuenciales) aún no está aprobado.
          </p>
          <p className="mb-2">
            <strong>Bloqueado por</strong> = usuarios que tienen subtareas en niveles anteriores sin aprobar.
          </p>
          <p>
            <strong>Bloqueando a</strong> = usuarios que tienen actividades esperando por este usuario.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg p-4 border-2 border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-700">Usuarios con actividades bloqueadas</p>
              <p className="text-2xl font-bold text-amber-900">{usersWithWaiting}</p>
            </div>
            <AlertTriangle className="w-10 h-10 text-amber-500" />
          </div>
        </div>
        <div className="rounded-lg p-4 border-2 border-orange-200 bg-orange-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-700">Usuarios bloqueando a otros</p>
              <p className="text-2xl font-bold text-orange-900">{usersBlocking}</p>
            </div>
            <Users className="w-10 h-10 text-orange-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">Análisis por usuario (ordenado: más actividades esperando primero)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-700 w-8" />
                <th className="px-6 py-3 font-medium text-gray-700">Usuario</th>
                <th className="px-6 py-3 font-medium text-gray-700 text-center">Actividades esperando</th>
                <th className="px-6 py-3 font-medium text-gray-700">Bloqueado por</th>
                <th className="px-6 py-3 font-medium text-gray-700">Bloqueando a</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const hasDetails = row.details.length > 0;
                const isExpanded = expandedId === row.userId;
                return (
                  <React.Fragment key={row.userId}>
                    <tr
                      className={`border-t hover:bg-gray-50 ${hasDetails ? 'cursor-pointer' : ''}`}
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : row.userId)}
                    >
                      <td className="px-6 py-4">
                        {hasDetails ? (
                          isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          )
                        ) : (
                          <span className="w-4" />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{row.userName}</p>
                          <p className="text-xs text-gray-500">{row.userEmail}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {row.waitingCount > 0 ? (
                          <span className="font-bold text-amber-600">{row.waitingCount}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {row.blockedBy.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.blockedBy.map((b) => (
                              <span
                                key={b.userId}
                                className="inline-block px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs"
                              >
                                {b.userName} ({b.pendingCount})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {row.blockedUsers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.blockedUsers.map((u) => (
                              <span
                                key={u.userId}
                                className="inline-block px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs"
                              >
                                {u.userName} ({u.waitingCount})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && row.details.length > 0 && (
                      <tr className="bg-amber-50/50">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="space-y-3">
                            <p className="text-xs font-semibold text-amber-800 uppercase">Detalle de actividades esperando</p>
                            {row.details.map((d) => (
                              <div
                                key={d.subtaskId}
                                className="p-3 bg-white rounded border border-amber-200 text-sm"
                              >
                                <p className="font-medium text-gray-900">{d.subtaskTitle}</p>
                                <p className="text-xs text-gray-600 mt-1">
                                  {d.taskTitle} · {d.projectName} · Nivel {d.sequenceOrder}
                                </p>
                                {d.blockedByUsers.length > 0 && (
                                  <p className="text-xs text-red-600 mt-2">
                                    Bloqueado por: {d.blockedByUsers.map((b) => b.userName).join(', ')}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            No hay cuellos de botella detectados. Las tareas secuenciales no tienen actividades esperando por otros.
          </div>
        )}
      </div>
    </div>
  );
}
