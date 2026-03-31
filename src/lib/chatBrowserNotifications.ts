const STORAGE_KEY = 'dailys:chat-browser-notifications';

/** Misma URL que en index.html (favicon) para notificaciones del sistema */
export const CHAT_NOTIFICATION_ICON_URL = 'https://i.imgur.com/uQrmMqG.png';

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
  } catch {
    /* ignore */
  }
}

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Pestaña en segundo plano u otra ruta distinta al chat (mensaje visible en la propia vista del chat). */
export function shouldShowChatDesktopNotification(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.hidden) return true;
  const p = window.location.pathname;
  return p !== '/chat' && p !== '/user/chat';
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
