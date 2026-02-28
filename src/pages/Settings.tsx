import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { apiUrl } from '../lib/apiBase';
import { Settings as SettingsIcon, FlaskConical, FileText, CheckCircle, AlertCircle, ExternalLink, Copy } from 'lucide-react';

const ADMIN_TELEGRAM_ID_KEY = 'admin_telegram_chat_id';
const BOT_LINK = 'https://t.me/agenciaxbot';

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
        setTelegramId((data.value as { id?: string })?.id || '');
      }
      if (error && error.code !== 'PGRST116') {
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
          message: '¡Esta es una notificación de prueba desde Dailys! 🎉',
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
        toast.success('¡Notificación administrativa de prueba enviada!');
      } else {
        toast.error(`Error al enviar la prueba: ${result.error}`);
      }
    } catch (error) {
      toast.error('Error de red al enviar la notificación de prueba.');
      console.error(error);
    }
  };

  const copyBotLink = () => {
    navigator.clipboard.writeText(BOT_LINK);
    toast.success('Enlace copiado al portapapeles');
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

  const testPayloads: Record<string, () => Promise<{ success: boolean; error?: string; message?: string; sentCount?: number; totalUsers?: number }>> = {
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
    'task-reassigned': () =>
      fetch(apiUrl('/api/telegram/task-available'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: user?.id ? [user.id] : [],
          taskTitle: 'Tarea de prueba disponible',
          projectName: 'Proyecto Demo',
          reason: 'reassigned',
        }),
      }).then((r) => r.json()),
    'task-unblocked': () =>
      fetch(apiUrl('/api/telegram/task-available'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: user?.id ? [user.id] : [],
          taskTitle: 'Tarea de prueba disponible',
          projectName: 'Proyecto Demo',
          reason: 'unblocked',
        }),
      }).then((r) => r.json()),
    'task-returned': () =>
      fetch(apiUrl('/api/telegram/task-available'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: user?.id ? [user.id] : [],
          taskTitle: 'Tarea de prueba disponible',
          projectName: 'Proyecto Demo',
          reason: 'returned',
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

  const tabs = [
    { id: 'config' as const, label: 'Configuración', icon: SettingsIcon },
    { id: 'pruebas' as const, label: 'Pruebas', icon: FlaskConical },
    { id: 'log' as const, label: 'Log', icon: FileText },
  ];
  const [activeTab, setActiveTab] = useState<'config' | 'pruebas' | 'log'>('config');

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Configuración de Administrador
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestiona las notificaciones de Telegram y el sistema
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <nav className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
                  }`}
                >
                  <Icon className="w-4 h-4" strokeWidth={2} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab: Configuración */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            {/* Status card */}
            <div
              className={`rounded-2xl border p-6 shadow-sm transition-shadow hover:shadow ${
                telegramId
                  ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
                  : 'border-amber-200 bg-gradient-to-br from-amber-50 to-white'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                      telegramId ? 'bg-emerald-100' : 'bg-amber-100'
                    }`}
                  >
                    {telegramId ? (
                      <CheckCircle className="h-6 w-6 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-6 w-6 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {telegramId ? 'Notificaciones activas' : 'Configuración pendiente'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {telegramId
                        ? 'Las notificaciones se envían correctamente al chat configurado.'
                        : 'Configura un ID de chat para recibir alertas importantes.'}
                    </p>
                    {telegramId && (
                      <p className="mt-2 font-mono text-sm text-slate-700 bg-white/80 px-2 py-1 rounded-lg inline-block">
                        {telegramId}
                      </p>
                    )}
                  </div>
                </div>
                {telegramId && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                    Activo
                  </span>
                )}
              </div>
            </div>

            {/* Setup guide - solo si no configurado */}
            {!telegramId && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900 mb-4">Cómo configurar</h3>
                <ol className="space-y-4">
                  {[
                    { step: 1, title: 'Abre Telegram', desc: `Busca @agenciaxbot o abre ${BOT_LINK}` },
                    { step: 2, title: 'Envía /start', desc: 'El bot te dará tu ID de chat' },
                    { step: 3, title: 'Copia el ID', desc: 'Número positivo (personal) o negativo (grupo)' },
                    { step: 4, title: 'Pégalo abajo', desc: 'Guarda y envía una prueba' },
                  ].map(({ step, title, desc }) => (
                    <li key={step} className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                        {step}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">{title}</p>
                        <p className="text-sm text-slate-600">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Bot link card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-2">Enlace del bot</h3>
              <p className="text-sm text-slate-600 mb-3">
                Comparte este enlace con los usuarios para que configuren sus notificaciones.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800 truncate">
                  {BOT_LINK}
                </code>
                <button
                  onClick={copyBotLink}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  Copiar
                </button>
                <a
                  href={BOT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir
                </a>
              </div>
            </div>

            {/* Form */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <label htmlFor="telegramId" className="block text-sm font-medium text-slate-700 mb-2">
                ID del Chat de Telegram
              </label>
              <input
                id="telegramId"
                type="text"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="-1001234567890 (grupo) o 123456789 (personal)"
                disabled={isLoading}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-500"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={sendTestNotification}
                  disabled={!telegramId || isLoading}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Probar notificación
                </button>
                <button
                  onClick={sendTestAdminNotification}
                  disabled={!telegramId || isLoading}
                  className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Probar notificación admin
                </button>
              </div>
            </div>

            {/* Info - solo si configurado */}
            {telegramId && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6">
                <h3 className="text-base font-semibold text-blue-900 mb-3">Notificaciones automáticas</h3>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li>• <strong>Tareas completadas/bloqueadas</strong> — cuando un usuario cambia el estado</li>
                  <li>• <strong>En revisión / Aprobadas / Devueltas</strong> — cuando tú actúas como admin</li>
                  <li>• <strong>Reasignaciones</strong> — cuando cambias el responsable</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Tab: Pruebas */}
        {activeTab === 'pruebas' && (
          <div className="space-y-6">
            {telegramId ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-1">Panel de pruebas</h2>
                  <p className="text-sm text-slate-600 mb-6">
                    Las notificaciones de admin van al chat configurado. Las de usuario van a tu Telegram si tienes <code className="rounded bg-slate-100 px-1">telegram_chat_id</code> en tu perfil.
                  </p>

                  <div className="space-y-6">
                    <TestSection
                      title="Admin"
                      description="Notificaciones que reciben los administradores"
                      tests={[
                        { key: 'test', label: 'Mensaje de prueba' },
                        { key: 'test-admin', label: 'Tarea aprobada (test-admin)' },
                        { key: 'admin-completed', label: 'Tarea completada' },
                        { key: 'admin-blocked', label: 'Tarea bloqueada' },
                        { key: 'admin-in-review', label: 'En revisión' },
                        { key: 'admin-approved', label: 'Tarea aprobada' },
                        { key: 'admin-returned', label: 'Tarea devuelta' },
                        { key: 'admin-reassigned', label: 'Reasignación' },
                      ]}
                      runTest={runTest}
                      testLoading={testLoading}
                      isTestDisabled={isTestDisabled}
                      testPayloads={testPayloads}
                      telegramId={telegramId}
                      apiUrl={apiUrl}
                    />
                    <TestSection
                      title="Usuario"
                      description="Notificaciones que reciben los usuarios asignados"
                      tests={[
                        { key: 'user-task-in-review', label: 'Tu tarea en revisión' },
                        { key: 'task-reassigned', label: 'Tarea disponible (reasignada)' },
                        { key: 'task-unblocked', label: 'Tarea disponible (desbloqueada)' },
                        { key: 'task-returned', label: 'Tarea disponible (devuelta)' },
                      ]}
                      runTest={runTest}
                      testLoading={testLoading}
                      isTestDisabled={isTestDisabled}
                      testPayloads={testPayloads}
                      telegramId={telegramId}
                      apiUrl={apiUrl}
                      requireUser
                      userId={user?.id}
                    />
                    <TestSection
                      title="Cron / Programadas"
                      description="Recordatorios y resúmenes automáticos"
                      tests={[
                        { key: 'deadline-reminders', label: 'Recordatorios de vencimiento' },
                        { key: 'daily-summary', label: 'Resumen diario' },
                        { key: 'budget-check', label: 'Alerta de presupuesto' },
                      ]}
                      runTest={runTest}
                      testLoading={testLoading}
                      isTestDisabled={isTestDisabled}
                      testPayloads={testPayloads}
                      telegramId={telegramId}
                      apiUrl={apiUrl}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-12 text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
                <p className="text-amber-800 font-medium">
                  Configura el ID de Telegram en la pestaña <strong>Configuración</strong> para poder probar.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Log */}
        {activeTab === 'log' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Log de notificaciones</h2>
              <p className="text-sm text-slate-600 mb-6">
                Historial de envíos (últimos 30 días). Los registros se eliminan automáticamente.
              </p>

              <div className="flex flex-wrap gap-3 mb-6">
                <select
                  value={logFilter.type || ''}
                  onChange={(e) => setLogFilter((f) => ({ ...f, type: e.target.value || undefined }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="">Todos los estados</option>
                  <option value="success">success</option>
                  <option value="failed">failed</option>
                  <option value="skipped">skipped</option>
                </select>
                <button
                  onClick={fetchLog}
                  disabled={logLoading}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {logLoading ? 'Cargando...' : 'Cargar log'}
                </button>
              </div>

              {logStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <StatCard label="Total" value={logStats.total} />
                  <StatCard label="Enviadas" value={logStats.success} variant="success" />
                  <StatCard label="Fallidas" value={logStats.failed} variant="error" />
                  <StatCard label="Omitidas" value={logStats.skipped} variant="warning" />
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="max-h-[400px] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Fecha</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Destinatario</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {logEntries.length === 0 && !logLoading && (
                        <tr>
                          <td colSpan={5} className="px-4 py-16 text-center">
                            <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                            <p className="text-slate-500 text-sm">Haz clic en &quot;Cargar log&quot; para ver el historial</p>
                          </td>
                        </tr>
                      )}
                      {logEntries.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(e.timestamp).toLocaleString('es-ES')}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700">{e.type}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{e.recipientLabel || e.recipient}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={e.status} />
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate" title={e.error || e.details || ''}>
                            {e.error || e.details || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function TestSection({
  title,
  description,
  tests,
  runTest,
  testLoading,
  isTestDisabled,
  testPayloads,
  telegramId,
  apiUrl,
  requireUser,
  userId,
}: {
  title: string;
  description: string;
  tests: { key: string; label: string }[];
  runTest: (key: string, fn: () => Promise<unknown>) => void;
  testLoading: string | null;
  isTestDisabled: boolean;
  testPayloads: Record<string, () => Promise<unknown>>;
  telegramId: string;
  apiUrl: (path: string) => string;
  requireUser?: boolean;
  userId?: string;
}) {
  const getTestFn = (key: string) => {
    if (key === 'test') {
      return () =>
        fetch(apiUrl('/api/telegram/test'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: telegramId, message: '¡Prueba desde Dailys! 🎉' }),
        }).then((r) => r.json());
    }
    if (key === 'test-admin') {
      return () =>
        fetch(apiUrl('/api/telegram/test-admin'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).then((r) => r.json());
    }
    return testPayloads[key];
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">{description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {tests.map(({ key, label }) => {
          const disabled = isTestDisabled || (requireUser && !userId);
          const fn = getTestFn(key);
          return (
            <button
              key={key}
              onClick={() => fn && runTest(key, fn)}
              disabled={disabled || !fn}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span className="truncate">{label}</span>
              {testLoading === key && (
                <span className="shrink-0 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: number;
  variant?: 'default' | 'success' | 'error' | 'warning';
}) {
  const styles = {
    default: 'bg-slate-50 border-slate-200 text-slate-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    error: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${styles[variant]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    success: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status as keyof typeof styles] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

export default Settings;
