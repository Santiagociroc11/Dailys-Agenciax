import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { chatFetch } from '../lib/chatApi';
import { CHAT_UNREAD_TITLE_REFRESH, type ChatUnreadRefreshDetail } from '../lib/chatUnreadEvents';

interface ChatUnreadContextValue {
  totalUnread: number;
  refresh: () => Promise<void>;
}

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { socket } = useSocket();
  const [totalUnread, setTotalUnread] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setTotalUnread(0);
      return;
    }
    try {
      const data = await chatFetch<{ channels: { unread_count?: number }[] }>(user.id, '/api/chat/channels');
      const t = (data.channels ?? []).reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
      setTotalUnread(t);
    } catch {
      setTotalUnread(0);
    }
  }, [user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!user?.id) {
      setTotalUnread(0);
      return;
    }
    void refresh();
  }, [loading, user?.id, refresh]);

  useEffect(() => {
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<ChatUnreadRefreshDetail>).detail;
      if (typeof d?.totalUnread === 'number') {
        setTotalUnread(d.totalUnread);
        return;
      }
      void refresh();
    };
    window.addEventListener(CHAT_UNREAD_TITLE_REFRESH, onCustom);
    return () => window.removeEventListener(CHAT_UNREAD_TITLE_REFRESH, onCustom);
  }, [refresh]);

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

  useEffect(() => {
    if (!user?.id) return;
    const id = window.setInterval(() => void refresh(), 45_000);
    return () => window.clearInterval(id);
  }, [user?.id, refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && user?.id) void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user?.id, refresh]);

  const value = useMemo(
    () => ({ totalUnread, refresh }),
    [totalUnread, refresh]
  );

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread(): ChatUnreadContextValue {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) {
    return { totalUnread: 0, refresh: async () => {} };
  }
  return ctx;
}
