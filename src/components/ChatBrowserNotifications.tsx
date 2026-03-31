import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { chatFetch } from '../lib/chatApi';
import {
  browserNotificationsSupported,
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
    if (!socket || !user?.id) return;
    if (!browserNotificationsSupported()) return;

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

      try {
        const n = new Notification(title, {
          body,
          icon: CHAT_NOTIFICATION_ICON_URL,
          tag: `dailys-chat-${msg.id}`,
        });
        n.onclick = () => {
          window.focus();
          n.close();
          navigate(`${chatPath}?channel=${encodeURIComponent(channelId)}`);
        };
      } catch {
        /* ignore */
      }
    };

    socket.on('new_message', onNew);
    return () => {
      socket.off('new_message', onNew);
    };
  }, [socket, user?.id, isAdmin, navigate]);

  return null;
}
