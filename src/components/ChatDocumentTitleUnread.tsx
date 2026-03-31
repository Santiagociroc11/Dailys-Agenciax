import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { chatFetch } from '../lib/chatApi';
import { CHAT_UNREAD_TITLE_REFRESH } from '../lib/chatUnreadEvents';

const BASE_TITLE = 'Dailys - Agencia X';

function applyTitle(total: number) {
  if (total > 0) {
    const n = total > 99 ? '99+' : String(total);
    document.title = `(${n}) ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
}

/**
 * Muestra el total de mensajes de chat sin leer en el título de la pestaña del navegador.
 */
export function ChatDocumentTitleUnread() {
  const { user, loading } = useAuth();
  const { socket } = useSocket();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      document.title = BASE_TITLE;
      return;
    }
    try {
      const data = await chatFetch<{ channels: { unread_count?: number }[] }>(user.id, '/api/chat/channels');
      const total = (data.channels ?? []).reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
      applyTitle(total);
    } catch {
      document.title = BASE_TITLE;
    }
  }, [user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!user?.id) {
      document.title = BASE_TITLE;
      return;
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 45_000);
    return () => {
      window.clearInterval(interval);
      document.title = BASE_TITLE;
    };
  }, [loading, user?.id, refresh]);

  useEffect(() => {
    const onCustom = () => void refresh();
    window.addEventListener(CHAT_UNREAD_TITLE_REFRESH, onCustom);
    return () => window.removeEventListener(CHAT_UNREAD_TITLE_REFRESH, onCustom);
  }, [refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && user?.id) void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user?.id, refresh]);

  useEffect(() => {
    if (!socket || !user?.id) return;
    const schedule = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => void refresh(), 500);
    };
    socket.on('new_message', schedule);
    socket.on('message_deleted', schedule);
    return () => {
      socket.off('new_message', schedule);
      socket.off('message_deleted', schedule);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [socket, user?.id, refresh]);

  return null;
}
