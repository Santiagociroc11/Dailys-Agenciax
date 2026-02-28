import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { apiUrl } from '../lib/apiBase';

const ADMIN_TELEGRAM_ID_KEY = 'admin_telegram_chat_id';

interface LogEntry {
  id: string;
  timestamp: string;
  type: string;
  recipient: string;
  recipientLabel?: string;
  status: string;
  details?: string;
  error?: string;
}

interface LogStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  byType: Record<string, { success: number; failed: number; skipped: number }>;
}

const Settings = () => {
  const [telegramId, setTelegramId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testLoading, setTestLoading] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logStats, setLogStats] = useState<LogStats | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logFilter, setLogFilter] = useState<{ type?: string; status?: string }>({});
  const { user } = useAuth();

  useEffect(() => {
    const fetchAdminId = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', ADMIN_TELEGRAM_ID_KEY)
        .single();
      
      if (data && data.value) {
        setTelegramId((data.value as any)?.id || '');
      }
      if (error && error.code !== 'PGRST116') { // Ignore 'no rows found'
        console.error('Error fetching admin Telegram ID:', error);
        toast.error('Error al cargar la configuración.');
      }
      setIsLoading(false);
    };

    fetchAdminId();
  }, []);

  const fetchLog = async () => {
    setLogLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (logFilter.type) params.set('type', logFilter.type);
      if (logFilter.status) params.set('status', logFilter.status);
      const res = await fetch(apiUrl(`/api/telegram/log?${params}`));
      const data = await res.json();
      if (data.success) {
        setLogEntries(data.entries || []);
        setLogStats(data.stats || null);
      } else {
        toast.error('Error al cargar el log.');
      }
    } catch (e) {
      toast.error('Error al cargar el log.');
      console.error(e);
    } finally {
      setLogLoading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    const { error } = await supabase.from('app_settings').upsert({
      key: ADMIN_TELEGRAM_ID_KEY,
      value: { id: telegramId },
    });

    if (error) {
      toast.error('Error al guardar el ID de Telegram.');
      console.error('Error saving admin Telegram ID:', error);
    } else {
      toast.success('¡Configuración guardada correctamente!');
      await fetch(apiUrl('/api/settings/invalidate-cache'), { method: 'POST' }).catch(() => {});
    }
    setIsLoading(false);
  };
  
  const sendTestNotification = async () => {
    if (!telegramId) {
        toast.error('Por favor, guarda un ID de chat antes de enviar una prueba.');
        return;
    }
    try {
        const response = await fetch(apiUrl('/api/telegram/test'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: telegramId,
                message: '¡Esta es una notificación de prueba desde Dailys! 🎉'
            }),
        });
        const result = await response.json();
        if (result.success) {
            toast.success('¡Notificación de prueba enviada!');
        } else {
            toast.error(`Error al enviar la prueba: ${result.error}`);
        }
    } catch (error) {
        toast.error('Error de red al enviar la notificación de prueba.');
        console.error(error);
    }
  };

  const sendTestAdminNotification = async () => {
    if (!telegramId) {
        toast.error('Por favor, guarda un ID de chat antes de enviar una prueba.');
        return;
    }
    try {
        const response = await fetch(apiUrl('/api/telegram/test-admin'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        const result = await response.json();
        if (result.success) {
            toast.success('¡Notificación administrativa de prueba enviada! Verifica que llegue el mensaje sobre una tarea aprobada.');
        } else {
            toast.error(`Error al enviar la prueba: ${result.error}`);
        }
    } catch (error) {
        toast.error('Error de red al enviar la notificación de prueba.');
        console.error(error);
    }
  };

  const runTest = async (
    key: string,
    fn: () => Promise<{ success: boolean; error?: string; message?: string; sentCount?: number; totalUsers?: number }>
  ) => {
    setTestLoading(key);
    try {
      const result = await fn();
      if (result.success) {
        const sent = result.sentCount ?? result.totalUsers;
        if (typeof sent === 'number' && result.totalUsers != null && sent < result.totalUsers) {
          toast.success(
            sent === 0
              ? `API OK. Enviadas: 0/${result.totalUsers}. Configura telegram_chat_id en Tu Configuración para recibir.`
              : `Enviadas: ${sent}/${result.totalUsers}.`
          );
        } else {
          toast.success(result.message || 'Notificación enviada correctamente.');
        }
        fetchLog();
      } else {
        toast.error(result.error || 'Error al enviar.');
      }
    } catch (e) {
      toast.error('Error de red.');
      console.error(e);
    } finally {
      setTestLoading(null);
    }
  };

  const testPayloads = {
    'admin-completed': () =>
      fetch(apiUrl('/api/telegram/admin-notification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: 'Tarea de prueba - Login',
          userName: 'Usuario Demo',
          projectName: 'Proyecto Demo',
          areaName: 'Desarrollo',
          status: 'completed',
          adminName: user?.name || 'Admin',
        }),
      }).then((r) => r.json()),
    'admin-blocked': () =>
      fetch(apiUrl('/api/telegram/admin-notification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: 'Tarea de prueba - API',
          userName: 'Usuario Demo',
          projectName: 'Proyecto Demo',
          areaName: 'Backend',
          status: 'blocked',
          blockReason: 'Esperando respuesta del cliente',
          adminName: user?.name || 'Admin',
        }),
      }).then((r) => r.json()),
    'admin-in-review': () =>
      fetch(apiUrl('/api/telegram/admin-notification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: 'Tarea de prueba - Diseño',
          userName: 'Usuario Demo',
          projectName: 'Proyecto Demo',
          areaName: 'Diseño',
          status: 'in_review',
          adminName: user?.name || 'Admin',
        }),
      }).then((r) => r.json()),
    'admin-approved': () =>
      fetch(apiUrl('/api/telegram/admin-notification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: 'Tarea de prueba - Documentación',
          userName: 'Usuario Demo',
          projectName: 'Proyecto Demo',
          areaName: 'QA',
          status: 'approved',
          adminName: user?.name || 'Admin',
        }),
      }).then((r) => r.json()),
    'admin-returned': () =>
      fetch(apiUrl('/api/telegram/admin-notification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: 'Tarea de prueba - Revisión',
          userName: 'Usuario Demo',
          projectName: 'Proyecto Demo',
          areaName: 'Desarrollo',
          status: 'returned',
          returnFeedback: 'Por favor corregir el formato de fechas.',
          adminName: user?.name || 'Admin',
        }),
      }).then((r) => r.json()),
    'admin-reassigned': () =>
      fetch(apiUrl('/api/telegram/admin-notification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: 'Tarea de prueba - Migración',
          previousUserName: 'Usuario Anterior',
          newUserName: 'Usuario Nuevo',
          projectName: 'Proyecto Demo',
          areaName: 'DevOps',
          status: 'reassigned',
          adminName: user?.name || 'Admin',
        }),
      }).then((r) => r.json()),
    'user-task-in-review': () =>
      fetch(apiUrl('/api/telegram/user-task-in-review'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: user?.id ? [user.id] : [],
          taskTitle: 'Tarea de prueba - Tu tarea en revisión',
          projectName: 'Proyecto Demo',
          adminName: user?.name || 'Admin',
        }),
      }).then((r) => r.json()),
    'task-available': (reason: string) => () =>
      fetch(apiUrl('/api/telegram/task-available'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: user?.id ? [user.id] : [],
          taskTitle: 'Tarea de prueba disponible',
          projectName: 'Proyecto Demo',
          reason,
        }),
      }).then((r) => r.json()),
    'deadline-reminders': () =>
      fetch(apiUrl('/api/telegram/deadline-reminders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 1 }),
      }).then((r) => r.json()),
    'daily-summary': () =>
      fetch(apiUrl('/api/telegram/daily-summary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then((r) => r.json()),
    'budget-check': () =>
      fetch(apiUrl('/api/telegram/budget-check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 80 }),
      }).then((r) => r.json()),
  };

  const isTestDisabled = !telegramId || isLoading;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Configuración de Administrador</h1>
      
      {/* Estado de configuración */}
      {telegramId ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <h2 className="text-lg font-semibold text-green-800">
                ✅ Notificaciones Configuradas
              </h2>
            </div>
            <span className="text-sm text-green-600 bg-green-100 px-3 py-1 rounded-full">
              Activo
            </span>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-green-700">
              <strong>ID configurado:</strong> <span className="font-mono bg-green-100 px-2 py-1 rounded">{telegramId}</span>
            </p>
            <p className="text-sm text-green-600">
              Las notificaciones globales del sistema se están enviando correctamente.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full mr-3"></div>
            <h2 className="text-lg font-semibold text-orange-800">
              ⚠️ Configuración Pendiente
            </h2>
          </div>
          <p className="text-sm text-orange-700">
            No hay notificaciones de Telegram configuradas. Configure un ID para recibir alertas importantes del sistema.
          </p>
        </div>
      )}
      
      {/* Instrucciones paso a paso - Solo si no está configurado */}
      {!telegramId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-blue-800 mb-4">
          📋 Cómo configurar las notificaciones de Telegram (Paso a paso)
        </h2>
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">1</div>
            <div>
              <p className="font-medium text-gray-800">Abre Telegram en tu teléfono o computadora</p>
              <p className="text-sm text-gray-600">
                Busca el bot: <span className="font-mono bg-gray-100 px-2 py-1 rounded text-blue-600">@agenciaxbot</span>
                <br />
                <span className="text-xs text-gray-500">O haz clic aquí para abrir directamente: </span>
                <a href="https://t.me/agenciaxbot" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                  https://t.me/agenciaxbot
                </a>
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">2</div>
            <div>
              <p className="font-medium text-gray-800">Escribe el comando <span className="font-mono bg-gray-100 px-2 py-1 rounded">/start</span></p>
              <p className="text-sm text-gray-600">El bot te dará tu ID de chat automáticamente</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">3</div>
            <div>
              <p className="font-medium text-gray-800">Copia el ID y pégalo en el campo de abajo</p>
              <p className="text-sm text-gray-600">Para chat personal: será un número positivo (ej: 123456789)</p>
              <p className="text-sm text-gray-600">Para grupo: será un número negativo (ej: -1001234567890)</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">4</div>
            <div>
              <p className="font-medium text-gray-800">Haz clic en "Guardar" y luego "Enviar Notificación de Prueba"</p>
              <p className="text-sm text-gray-600">¡Listo! Ya recibirás notificaciones importantes del sistema</p>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Información sobre notificaciones automáticas */}
      {telegramId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-blue-800 mb-3">🤖 Notificaciones Automáticas Activas</h3>
          <div className="space-y-3 text-sm text-blue-700">
            <div>
              <p className="font-semibold mb-1">📋 Acciones de Usuarios:</p>
              <p>• ✅ <strong>Tareas completadas:</strong> Cuando un usuario marca una tarea como completada <span className="text-xs">(+ tiempo de trabajo)</span></p>
              <p>• 🚫 <strong>Tareas bloqueadas:</strong> Cuando un usuario bloquea una tarea con motivo <span className="text-xs">(+ tiempo antes del bloqueo)</span></p>
            </div>
            <div>
              <p className="font-semibold mb-1">👩‍💼 Acciones Administrativas:</p>
              <p>• 🔍 <strong>En revisión:</strong> Cuando pones una tarea en revisión <span className="text-xs">(+ tiempo hasta revisión)</span></p>
              <p>• ✅ <strong>Aprobadas:</strong> Cuando apruebas una tarea completada <span className="text-xs">(+ tiempo de revisión + tiempo total del ciclo)</span></p>
              <p>• 🔄 <strong>Devueltas:</strong> Cuando devuelves una tarea con feedback <span className="text-xs">(+ tiempo en revisión)</span></p>
            </div>
            <p className="text-xs text-blue-600 mt-2">💡 <strong>Info incluida:</strong> Usuario asignado, área de trabajo, admin que hizo la acción, título de tarea, proyecto, feedback (cuando aplique)</p>
            <p className="text-xs text-blue-600 mt-1">⏱️ <strong>Tiempos incluidos:</strong> Cada notificación muestra los tiempos relevantes (trabajo, revisión, ciclo total) para análisis de rendimiento</p>
          </div>
        </div>
      )}

      {/* Aviso importante para el administrador */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h3 className="font-medium text-amber-800 mb-2">💡 Información del bot:</h3>
        <p className="text-sm text-amber-700">
          Comparte este enlace con todos los usuarios del sistema: 
          <a href="https://t.me/agenciaxbot" target="_blank" rel="noopener noreferrer" className="font-mono bg-amber-100 px-2 py-1 rounded text-amber-800 hover:underline ml-1">
            https://t.me/agenciaxbot
          </a>
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="telegramId" className="block text-sm font-medium text-gray-700 mb-1">
            {telegramId ? 'Modificar ID del Chat de Telegram' : 'ID del Chat de Telegram para Notificaciones Globales'}
          </label>
          <p className="text-xs text-gray-500 mb-2">
            {telegramId 
              ? 'Puedes cambiar el ID si necesitas usar un chat o canal diferente.'
              : 'Este ID se usará para enviar notificaciones importantes a un grupo o canal de administradores.'
            }
          </p>
          <input
            id="telegramId"
            type="text"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="Ej: -1001234567890 (para grupo) o 123456789 (para chat personal)"
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
            <button 
              onClick={handleSave} 
              disabled={isLoading}
              className={`px-4 py-2 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed ${
                telegramId 
                  ? 'bg-orange-600 hover:bg-orange-700' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Guardando...' : (telegramId ? 'Actualizar Configuración' : 'Guardar Configuración')}
            </button>
            <button 
              onClick={sendTestNotification} 
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {telegramId ? '🧪 Probar Notificación' : 'Enviar Notificación de Prueba'}
            </button>
            <button 
              onClick={sendTestAdminNotification} 
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {telegramId ? '🎯 Probar Notificación Admin' : 'Probar Notificación Administrativa'}
            </button>
        </div>
      </div>

      {/* Panel de pruebas de todas las notificaciones */}
      {telegramId && (
        <div className="mt-10 pt-8 border-t border-gray-200">
          <h2 className="text-xl font-bold mb-2">🧪 Panel de pruebas de notificaciones</h2>
          <p className="text-sm text-gray-600 mb-4">
            Prueba cada tipo de notificación del sistema. Las de <strong>admin</strong> van al chat configurado arriba. Las de <strong>usuario</strong> van a tu Telegram si tienes <code className="bg-gray-100 px-1 rounded">telegram_chat_id</code> en tu perfil.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <TestButton
              label="Mensaje de prueba"
              onClick={() => runTest('test', () => fetch(apiUrl('/api/telegram/test'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: telegramId, message: '¡Prueba desde Dailys! 🎉' }),
              }).then((r) => r.json()))}
              disabled={isTestDisabled}
              loading={testLoading === 'test'}
            />
            <TestButton
              label="Admin: Tarea aprobada (test-admin)"
              onClick={() => runTest('test-admin', () => fetch(apiUrl('/api/telegram/test-admin'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              }).then((r) => r.json()))}
              disabled={isTestDisabled}
              loading={testLoading === 'test-admin'}
            />
            <TestButton
              label="Admin: Tarea completada"
              onClick={() => runTest('admin-completed', () => testPayloads['admin-completed']())}
              disabled={isTestDisabled}
              loading={testLoading === 'admin-completed'}
            />
            <TestButton
              label="Admin: Tarea bloqueada"
              onClick={() => runTest('admin-blocked', () => testPayloads['admin-blocked']())}
              disabled={isTestDisabled}
              loading={testLoading === 'admin-blocked'}
            />
            <TestButton
              label="Admin: En revisión"
              onClick={() => runTest('admin-in-review', () => testPayloads['admin-in-review']())}
              disabled={isTestDisabled}
              loading={testLoading === 'admin-in-review'}
            />
            <TestButton
              label="Admin: Tarea aprobada"
              onClick={() => runTest('admin-approved', () => testPayloads['admin-approved']())}
              disabled={isTestDisabled}
              loading={testLoading === 'admin-approved'}
            />
            <TestButton
              label="Admin: Tarea devuelta"
              onClick={() => runTest('admin-returned', () => testPayloads['admin-returned']())}
              disabled={isTestDisabled}
              loading={testLoading === 'admin-returned'}
            />
            <TestButton
              label="Admin: Reasignación"
              onClick={() => runTest('admin-reassigned', () => testPayloads['admin-reassigned']())}
              disabled={isTestDisabled}
              loading={testLoading === 'admin-reassigned'}
            />
            <TestButton
              label="Usuario: Tu tarea en revisión"
              onClick={() => runTest('user-task-in-review', () => testPayloads['user-task-in-review']())}
              disabled={isTestDisabled || !user?.id}
              loading={testLoading === 'user-task-in-review'}
            />
            <TestButton
              label="Usuario: Tarea disponible (reasignada)"
              onClick={() => runTest('task-reassigned', () => testPayloads['task-available']('reassigned')())}
              disabled={isTestDisabled || !user?.id}
              loading={testLoading === 'task-reassigned'}
            />
            <TestButton
              label="Usuario: Tarea disponible (desbloqueada)"
              onClick={() => runTest('task-unblocked', () => testPayloads['task-available']('unblocked')())}
              disabled={isTestDisabled || !user?.id}
              loading={testLoading === 'task-unblocked'}
            />
            <TestButton
              label="Usuario: Tarea disponible (devuelta)"
              onClick={() => runTest('task-returned', () => testPayloads['task-available']('returned')())}
              disabled={isTestDisabled || !user?.id}
              loading={testLoading === 'task-returned'}
            />
            <TestButton
              label="Recordatorios de vencimiento"
              onClick={() => runTest('deadline', () => testPayloads['deadline-reminders']())}
              disabled={isTestDisabled}
              loading={testLoading === 'deadline'}
            />
            <TestButton
              label="Resumen diario"
              onClick={() => runTest('daily', () => testPayloads['daily-summary']())}
              disabled={isTestDisabled}
              loading={testLoading === 'daily'}
            />
            <TestButton
              label="Alerta de presupuesto"
              onClick={() => runTest('budget', () => testPayloads['budget-check']())}
              disabled={isTestDisabled}
              loading={testLoading === 'budget'}
            />
          </div>
        </div>
      )}

      {/* Log de notificaciones Telegram */}
      <div className="mt-10 pt-8 border-t border-gray-200">
        <h2 className="text-xl font-bold mb-2">📋 Log de notificaciones Telegram</h2>
        <p className="text-sm text-gray-600 mb-4">
          Historial de envíos (últimos 30 días). Los registros se eliminan automáticamente después de 30 días.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={logFilter.type || ''}
            onChange={(e) => setLogFilter((f) => ({ ...f, type: e.target.value || undefined }))}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Todos los tipos</option>
            <option value="test">test</option>
            <option value="admin-notification">admin-notification</option>
            <option value="task-available">task-available</option>
            <option value="user-task-in-review">user-task-in-review</option>
            <option value="deadline-reminder">deadline-reminder</option>
            <option value="daily-summary">daily-summary</option>
            <option value="budget-alert">budget-alert</option>
          </select>
          <select
            value={logFilter.status || ''}
            onChange={(e) => setLogFilter((f) => ({ ...f, status: e.target.value || undefined }))}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
            <option value="skipped">skipped</option>
          </select>
          <button
            onClick={fetchLog}
            disabled={logLoading}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {logLoading ? 'Cargando...' : 'Cargar log'}
          </button>
        </div>

        {logStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-lg font-semibold">{logStats.total}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <p className="text-xs text-green-600">Enviadas</p>
              <p className="text-lg font-semibold text-green-700">{logStats.success}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <p className="text-xs text-red-600">Fallidas</p>
              <p className="text-lg font-semibold text-red-700">{logStats.failed}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
              <p className="text-xs text-amber-600">Omitidas</p>
              <p className="text-lg font-semibold text-amber-700">{logStats.skipped}</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Fecha</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Tipo</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Destinatario</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Estado</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logEntries.length === 0 && !logLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    Haz clic en &quot;Cargar log&quot; para ver el historial.
                  </td>
                </tr>
              )}
              {logEntries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleString('es-ES')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{e.type}</td>
                  <td className="px-3 py-2">{e.recipientLabel || e.recipient}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        e.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : e.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 max-w-xs truncate" title={e.error || e.details || ''}>
                    {e.error || e.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function TestButton({
  label,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed rounded-md border border-gray-200 text-left transition-colors"
    >
      {loading ? 'Enviando...' : label}
    </button>
  );
}

export default Settings; 