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
import { CHAT_UNREAD_TITLE_REFRESH } from '../lib/chatUnreadEvents';
import type { ChatChannel } from '../types/chat';

interface ChatUnreadContextValue {
  totalUnread: number;
  /** Última lista de canales del chat (para alertas in-app, salas socket, etc.) */
  channels: ChatChannel[];
  refresh: () => Promise<void>;
}

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { socket, joinChannel, leaveChannel } = useSocket();
  const [totalUnread, setTotalUnread] = useState(0);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [channelRoomIds, setChannelRoomIds] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channelRoomKey = useMemo(
    () =>
      [...channelRoomIds]
        .filter(Boolean)
        .sort()
        .join('\0'),
    [channelRoomIds]
  );

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setTotalUnread(0);
      setChannels([]);
      setChannelRoomIds([]);
      return;
    }
    try {
      const data = await chatFetch<{ channels: ChatChannel[] }>(user.id, '/api/chat/channels');
      const list = data.channels ?? [];
      setChannels(list);
      setChannelRoomIds(list.map((c) => c.id).filter(Boolean));
      const t = list.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
      setTotalUnread(t);
    } catch {
      setTotalUnread(0);
      setChannels([]);
      setChannelRoomIds([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!user?.id) {
      setTotalUnread(0);
      setChannels([]);
      return;
    }
    void refresh();
  }, [loading, user?.id, refresh]);

  useEffect(() => {
    const onCustom = (_e: Event) => {
      /* Siempre refrescar lista de canales: así se actualizan las salas socket al crear canal / cambiar membresía. */
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

  /**
   * Unirse a todas las salas `channel:<id>` mientras la sesión esté activa (no solo en la página Chat).
   * Si solo se unía desde Chat y al salir se hacía leave, dejaban de llegar `new_message` y no había
   * notificaciones de escritorio ni actualización fiable de no leídos fuera del chat.
   */
  useEffect(() => {
    if (!socket || !user?.id) return;
    const ids = channelRoomKey ? channelRoomKey.split('\0').filter(Boolean) : [];
    const joinAll = () => {
      for (const id of ids) joinChannel(id);
    };
    joinAll();
    socket.on('connect', joinAll);
    return () => {
      socket.off('connect', joinAll);
      for (const id of ids) leaveChannel(id);
    };
  }, [socket, user?.id, channelRoomKey, joinChannel, leaveChannel]);

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
    () => ({ totalUnread, channels, refresh }),
    [totalUnread, channels, refresh]
  );

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread(): ChatUnreadContextValue {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) {
    return { totalUnread: 0, channels: [], refresh: async () => {} };
  }
  return ctx;
}
