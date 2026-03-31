const STORAGE_KEY = 'dailys:chat-browser-notifications';

/** Disparado al cambiar la preferencia en la misma pestaña (storage solo avisa otras pestañas). */
export const CHAT_BROWSER_NOTIF_PREF_EVENT = 'dailys:chat-browser-notif-pref';

/** Misma URL que en index.html (favicon) para notificaciones del sistema */
export const CHAT_NOTIFICATION_ICON_URL = 'https://i.imgur.com/uQrmMqG.png';

function normalizePathname(pathname: string): string {
  const p = pathname.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

export function pathnameIsChat(pathname: string): boolean {
  const p = normalizePathname(pathname);
  return p === '/chat' || p === '/user/chat';
}

export function getChatBrowserNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setChatBrowserNotificationsEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(CHAT_BROWSER_NOTIF_PREF_EVENT));
    }
  } catch {
    /* ignore */
  }
}

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Mostrar aviso del sistema solo si el usuario no está viendo activamente el chat en esta pestaña
 * (misma ventana, otra pestaña → ya no está "visible" y debe avisar).
 */
export function shouldShowChatDesktopNotification(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const onChat = pathnameIsChat(window.location.pathname);
  const visible =
    'visibilityState' in document
      ? document.visibilityState === 'visible'
      : !document.hidden;
  return !(onChat && visible);
}

export function truncateForNotification(text: string, max = 140): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Solicita permiso y guarda preferencia. Devuelve true si quedó concedido y activado.
 */
export async function requestChatBrowserNotificationPermission(): Promise<boolean> {
  if (!browserNotificationsSupported()) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    setChatBrowserNotificationsEnabled(false);
    return false;
  }
  setChatBrowserNotificationsEnabled(true);
  return true;
}
