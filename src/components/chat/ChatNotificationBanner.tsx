import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import {
  browserNotificationsSupported,
  getChatBrowserNotificationsEnabled,
  requestChatBrowserNotificationPermission,
  setChatBrowserNotificationsEnabled,
} from '../../lib/chatBrowserNotifications';
import {
  fetchVapidPublicKey,
  getWebPushLocalEnabled,
  isWebPushClientSupported,
  subscribeWebPush,
  unsubscribeWebPush,
} from '../../lib/webPushClient';

export function ChatNotificationBanner() {
  const { user, isAdmin } = useAuth();
  const [enabledLocal, setEnabledLocal] = useState(getChatBrowserNotificationsEnabled);
  const [pushOn, setPushOn] = useState(getWebPushLocalEnabled);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushServerReady, setPushServerReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isWebPushClientSupported()) {
        setPushServerReady(false);
        return;
      }
      const k = await fetchVapidPublicKey();
      if (!cancelled) setPushServerReady(!!k);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chatBasePath = isAdmin ? ('/chat' as const) : ('/user/chat' as const);

  if (!browserNotificationsSupported() && !isWebPushClientSupported()) {
    return (
      <div className="px-4 py-2 text-xs text-amber-800 border-b border-amber-100 bg-amber-50/60">
        Tu navegador no permite notificaciones de escritorio ni push web en esta vista.
      </div>
    );
  }

  const turnOffLocal = () => {
    setChatBrowserNotificationsEnabled(false);
    setEnabledLocal(false);
    toast.message('Avisos del sistema desactivados');
  };

  const turnOnLocal = async () => {
    if (Notification.permission === 'granted') {
      setChatBrowserNotificationsEnabled(true);
      setEnabledLocal(true);
      toast.success('Avisos activados');
      return;
    }
    const ok = await requestChatBrowserNotificationPermission();
    setEnabledLocal(ok);
    if (ok) {
      toast.success('Te avisaremos con la pestaña en segundo plano u otra sección de la app');
    } else {
      toast.error('Sin permiso no se pueden mostrar avisos del sistema');
    }
  };

  const activeLocal = enabledLocal && Notification.permission === 'granted';

  const enablePush = async () => {
    if (!user?.id) return;
    setPushBusy(true);
    try {
      const r = await subscribeWebPush(user.id, chatBasePath);
      if (r.ok) {
        setPushOn(true);
        toast.success('Push activado: puedes cerrar la pestaña y seguir recibiendo avisos en este equipo');
      } else {
        toast.error(r.error || 'No se pudo activar push');
      }
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    if (!user?.id) return;
    setPushBusy(true);
    try {
      await unsubscribeWebPush(user.id);
      setPushOn(false);
      toast.message('Push desactivado en este dispositivo');
    } finally {
      setPushBusy(false);
    }
  };

  const showPushRow = isWebPushClientSupported() && Boolean(user);

  return (
    <div className="border-b border-gray-100 bg-gray-50/90 divide-y divide-gray-100">
      {browserNotificationsSupported() && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 text-xs">
          <p className="text-gray-600 leading-snug">
            {activeLocal ? (
              <>
                <span className="font-medium text-gray-800">Avisos en esta pestaña.</span> Solo cuando Dailys sigue
                abierto en segundo plano u otra página interna.
              </>
            ) : (
              <>Avisos mientras la app sigue abierta (sin cerrar la pestaña).</>
            )}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {activeLocal ? (
              <button
                type="button"
                onClick={turnOffLocal}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors duration-150"
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                onClick={turnOnLocal}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors duration-150"
              >
                Activar avisos (pestaña abierta)
              </button>
            )}
          </div>
        </div>
      )}

      {showPushRow && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 text-xs">
          <p className="text-gray-600 leading-snug">
            {pushServerReady === null && (
              <span className="text-gray-500">Comprobando si el servidor permite push…</span>
            )}
            {pushServerReady === false && (
              <span className="text-gray-500">
                Push con pestaña cerrada no está disponible: falta configurar VAPID en el servidor (variables{' '}
                <code className="text-[10px] bg-gray-200/80 px-1 rounded">VAPID_PUBLIC_KEY</code>,{' '}
                <code className="text-[10px] bg-gray-200/80 px-1 rounded">VAPID_PRIVATE_KEY</code>,{' '}
                <code className="text-[10px] bg-gray-200/80 px-1 rounded">VAPID_SUBJECT</code>).
              </span>
            )}
            {pushServerReady === true && (
              <>
                <span className="font-medium text-gray-800">Push web.</span> Avisos aunque cierres esta pestaña
                (el navegador puede seguir en segundo plano). Requiere HTTPS en producción.
              </>
            )}
          </p>
          {pushServerReady === true && user && (
            <div className="flex items-center gap-2 shrink-0">
              {pushOn ? (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={disablePush}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors duration-150 disabled:opacity-50"
                >
                  Quitar push de este equipo
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={enablePush}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors duration-150 disabled:opacity-50"
                >
                  {pushBusy ? '…' : 'Activar push (pestaña cerrada)'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
