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
  clearChatNotifBannerPreference,
  getChatNotifBannerDeferred,
  getChatNotifBannerDone,
  setChatNotifBannerDeferred,
  setChatNotifBannerDone,
} from '../../lib/chatNotificationBannerState';
import {
  fetchVapidPublicKey,
  getWebPushLocalEnabled,
  isWebPushClientSupported,
  subscribeWebPush,
} from '../../lib/webPushClient';

function notificationsActuallyOn(): boolean {
  if (getWebPushLocalEnabled()) return true;
  return (
    browserNotificationsSupported() &&
    Notification.permission === 'granted' &&
    getChatBrowserNotificationsEnabled()
  );
}

function resolveInitialSetupComplete(): boolean {
  if (getChatNotifBannerDeferred()) return false;
  if (notificationsActuallyOn()) return true;
  return false;
}

export function ChatNotificationBanner() {
  const { user, isAdmin } = useAuth();
  const [setupComplete, setSetupComplete] = useState(resolveInitialSetupComplete);
  const [deferred, setDeferred] = useState(getChatNotifBannerDeferred);
  const [busy, setBusy] = useState(false);
  const [pushServerReady, setPushServerReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isWebPushClientSupported()) {
        if (!cancelled) setPushServerReady(false);
        return;
      }
      const k = await fetchVapidPublicKey();
      if (!cancelled) setPushServerReady(!!k);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (setupComplete && !deferred) {
      setChatNotifBannerDone();
    }
  }, [setupComplete, deferred]);

  useEffect(() => {
    if (!getChatNotifBannerDone()) return;
    if (!notificationsActuallyOn()) {
      clearChatNotifBannerPreference();
      setSetupComplete(false);
    }
  }, []);

  const chatBasePath = isAdmin ? ('/chat' as const) : ('/user/chat' as const);

  if (!browserNotificationsSupported() && !isWebPushClientSupported()) {
    return (
      <div className="shrink-0 border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-800">
        Tu navegador no permite notificaciones de escritorio ni push web en esta vista.
      </div>
    );
  }

  const hidePromoForever = () => {
    setDeferred(true);
    setChatNotifBannerDeferred();
  };

  const markSetupDone = () => {
    setSetupComplete(true);
    setChatNotifBannerDone();
  };

  const activateNotifications = async () => {
    if (pushServerReady && user?.id) {
      setBusy(true);
      try {
        let r: { ok: boolean; error?: string } = { ok: false };
        try {
          r = await subscribeWebPush(user.id, chatBasePath);
        } catch {
          r = { ok: false, error: 'Error de red o del servidor al registrar push' };
        }
        if (r.ok) {
          setChatBrowserNotificationsEnabled(true);
          markSetupDone();
          toast.success('Notificaciones activadas: también cuando cierres la pestaña');
          return;
        }
        if (Notification.permission === 'denied') {
          toast.error(r.error || 'Permiso denegado');
          return;
        }
        if (Notification.permission === 'granted') {
          setChatBrowserNotificationsEnabled(true);
          markSetupDone();
          toast.success(
            r.error
              ? 'Avisos con la app abierta activados (push no se pudo registrar; revisa red o servidor)'
              : 'Notificaciones activadas mientras tengas la app abierta'
          );
          return;
        }
        const ok = await requestChatBrowserNotificationPermission();
        if (ok) {
          markSetupDone();
          toast.success('Notificaciones activadas mientras tengas la app abierta');
        } else {
          toast.error(r.error || 'No se pudo completar la activación');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const ok = await requestChatBrowserNotificationPermission();
      if (ok) {
        markSetupDone();
        toast.success('Notificaciones activadas mientras tengas la app abierta');
      } else {
        toast.error('Sin permiso no se pueden mostrar avisos');
      }
    } finally {
      setBusy(false);
    }
  };

  const showPromo = !deferred && !setupComplete;

  if (!showPromo) {
    return null;
  }

  const pushConfigured = pushServerReady === true;

  return (
    <div className="shrink-0 border-b border-gray-100 bg-gray-50/90">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 text-xs">
        <div className="text-gray-600 leading-snug space-y-1">
          {pushServerReady === null && (
            <p className="text-gray-500">Comprobando notificaciones…</p>
          )}
          {pushServerReady === false && (
            <p>
              <span className="font-medium text-gray-800">Notificaciones del chat.</span> Te avisamos con la app abierta
              (pestaña en segundo plano u otra página). En el servidor no hay push con pestaña cerrada: configura{' '}
              <code className="text-[10px] bg-gray-200/80 px-1 rounded">VAPID_*</code> en{' '}
              <code className="text-[10px] bg-gray-200/80 px-1 rounded">.env</code>.
            </p>
          )}
          {pushConfigured && (
            <p>
              <span className="font-medium text-gray-800">Un solo permiso.</span> Avisos del chat con la app abierta y,
              si el navegador lo permite, también cuando cierres esta pestaña (HTTPS en producción).
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busy || pushServerReady === null || !user}
            onClick={activateNotifications}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors duration-150 disabled:opacity-50"
          >
            {busy ? '…' : 'Activar notificaciones'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={hidePromoForever}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors duration-150 text-[11px]"
          >
            Más tarde
          </button>
        </div>
      </div>
    </div>
  );
}
