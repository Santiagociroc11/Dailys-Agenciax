import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { chatFetch } from '../lib/chatApi';
import {
  browserNotificationsSupported,
  CHAT_BROWSER_NOTIF_PREF_EVENT,
  CHAT_NOTIFICATION_ICON_URL,
  getChatBrowserNotificationsEnabled,
  shouldShowChatDesktopNotification,
  truncateForNotification,
} from '../lib/chatBrowserNotifications';
import type { ChatChannel, ChatMessage, ChatUser } from '../types/chat';

/**
 * Escucha new_message por socket y muestra Notification API si el usuario lo activó
 * y la pestaña está en segundo plano u otra pantalla (no el chat enfocado).
 *
 * Nota: si cierran la pestaña no hay socket; avisos en frío requieren Web Push (servidor).
 */
export function ChatBrowserNotifications() {
  const { user, loading, isAdmin } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const channelNamesRef = useRef<Map<string, string>>(new Map());
  const userNamesRef = useRef<Map<string, string>>(new Map());

  const refreshMeta = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [chData, uData] = await Promise.all([
        chatFetch<{ channels: ChatChannel[] }>(user.id, '/api/chat/channels'),
        chatFetch<{ users: ChatUser[] }>(user.id, '/api/chat/users'),
      ]);
      const cm = new Map<string, string>();
      for (const c of chData.channels ?? []) cm.set(c.id, c.name);
      channelNamesRef.current = cm;
      const um = new Map<string, string>();
      for (const u of uData.users ?? []) um.set(u.id, u.name || u.email || 'Usuario');
      userNamesRef.current = um;
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  useEffect(() => {
    if (loading || !user?.id) return;
    if (!getChatBrowserNotificationsEnabled()) return;
    if (Notification.permission !== 'granted') return;
    void refreshMeta();
  }, [loading, user?.id, refreshMeta]);

  useEffect(() => {
    const onPref = () => {
      if (!getChatBrowserNotificationsEnabled()) return;
      if (Notification.permission !== 'granted') return;
      void refreshMeta();
    };
    window.addEventListener(CHAT_BROWSER_NOTIF_PREF_EVENT, onPref);
    return () => window.removeEventListener(CHAT_BROWSER_NOTIF_PREF_EVENT, onPref);
  }, [refreshMeta]);

  useEffect(() => {
    if (loading || !user?.id) return;
    let status: PermissionStatus | null = null;
    const hook = async () => {
      try {
        status = await navigator.permissions.query({ name: 'notifications' as PermissionName });
        status.onchange = () => {
          if (Notification.permission === 'granted' && getChatBrowserNotificationsEnabled()) {
            void refreshMeta();
          }
        };
      } catch {
        /* Safari / algunos entornos no soportan query(notifications) */
      }
    };
    void hook();
    return () => {
      if (status) status.onchange = null;
    };
  }, [loading, user?.id, refreshMeta]);

  useEffect(() => {
    if (!socket || !user?.id) return;
    if (!browserNotificationsSupported()) return;

    const showNotification = (title: string, body: string, tag: string, onClick: () => void) => {
      const base: NotificationOptions = { body, tag, silent: false };
      try {
        const n = new Notification(title, { ...base, icon: CHAT_NOTIFICATION_ICON_URL });
        n.onclick = () => {
          onClick();
          n.close();
        };
        return;
      } catch (first) {
        try {
          const n = new Notification(title, base);
          n.onclick = () => {
            onClick();
            n.close();
          };
        } catch (second) {
          if (import.meta.env.DEV) {
            console.warn('[ChatBrowserNotifications] No se pudo mostrar la notificación:', first, second);
          }
        }
      }
    };

    const onNew = (msg: ChatMessage) => {
      if (!getChatBrowserNotificationsEnabled()) return;
      if (Notification.permission !== 'granted') return;
      if (msg.user_id === user.id) return;
      if (msg.is_deleted) return;
      if (!shouldShowChatDesktopNotification()) return;

      const title = channelNamesRef.current.get(msg.channel_id) ?? 'Dailys · Chat';
      const author = userNamesRef.current.get(msg.user_id) ?? 'Alguien';
      const preview = truncateForNotification(msg.content || '(sin texto)');
      const body = msg.thread_id ? `${author} en un hilo: ${preview}` : `${author}: ${preview}`;

      const chatPath = isAdmin ? '/chat' : '/user/chat';
      const channelId = msg.channel_id;

      showNotification(title, body, `dailys-chat-${msg.id}`, () => {
        window.focus();
        navigate(`${chatPath}?channel=${encodeURIComponent(channelId)}`);
      });
    };

    socket.on('new_message', onNew);
    return () => {
      socket.off('new_message', onNew);
    };
  }, [socket, user, isAdmin, navigate]);

  return null;
}
