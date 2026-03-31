import { apiUrl } from './apiBase';
import { chatFetch } from './chatApi';

const LS_WEB_PUSH = 'dailys:web-push-enabled';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl('/api/push/vapid-public-key'));
    if (!res.ok) return null;
    const j = (await res.json()) as { configured?: boolean; publicKey?: string };
    return j.configured && j.publicKey ? j.publicKey : null;
  } catch {
    return null;
  }
}

export function isWebPushClientSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function getWebPushLocalEnabled(): boolean {
  try {
    return localStorage.getItem(LS_WEB_PUSH) === '1';
  } catch {
    return false;
  }
}

function setWebPushLocalEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(LS_WEB_PUSH, '1');
    else localStorage.removeItem(LS_WEB_PUSH);
  } catch {
    /* ignore */
  }
}

export async function subscribeWebPush(
  userId: string,
  chatBasePath: '/chat' | '/user/chat'
): Promise<{ ok: boolean; error?: string }> {
  if (!isWebPushClientSupported()) {
    return { ok: false, error: 'Este navegador no soporta push web' };
  }
  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    return { ok: false, error: 'El servidor no tiene configuradas las claves VAPID' };
  }

  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await reg.update();
  const ready = await navigator.serviceWorker.ready;

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return { ok: false, error: 'Permiso de notificaciones denegado' };
  }

  const existing = await ready.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const sub = await ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, error: 'Suscripción incompleta' };
  }

  await chatFetch(userId, '/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
      chatBasePath,
    }),
  });

  setWebPushLocalEnabled(true);
  return { ok: true };
}

export async function unsubscribeWebPush(userId: string): Promise<void> {
  const seen = new Set<string>();
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint && !seen.has(endpoint)) {
        seen.add(endpoint);
        try {
          await chatFetch(userId, '/api/push/unsubscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint }),
          });
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  setWebPushLocalEnabled(false);
}
