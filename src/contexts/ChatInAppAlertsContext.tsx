import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { useChatUnread } from './ChatUnreadContext';
import { chatFetch } from '../lib/chatApi';
import { truncateForNotification } from '../lib/chatBrowserNotifications';
import type { ChatChannel, ChatMessage, ChatUser } from '../types/chat';

export type ChatInAppAlertKind = 'mention' | 'dm';

export interface ChatInAppAlert {
  id: string;
  kind: ChatInAppAlertKind;
  channelId: string;
  channelLabel: string;
  authorName: string;
  preview: string;
  createdAt: number;
}

interface ChatInAppAlertsContextValue {
  pending: ChatInAppAlert[];
  dismiss: (messageId: string) => void;
  clearAll: () => void;
}

const ChatInAppAlertsContext = createContext<ChatInAppAlertsContextValue | null>(null);

const MAX_PENDING = 40;
const MAX_SEEN_IDS = 400;

function channelLabel(c: ChatChannel | undefined): string {
  if (!c) return 'Chat';
  const n = (c.name || 'Canal').replace(/^\s*📁\s*/u, '').trim();
  return n || c.name || 'Chat';
}

export function ChatInAppAlertsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const { socket } = useSocket();
  const { channels } = useChatUnread();
  const navigate = useNavigate();
  const [pending, setPending] = useState<ChatInAppAlert[]>([]);

  const channelsByIdRef = useRef<Map<string, ChatChannel>>(new Map());
  const usersByIdRef = useRef<Map<string, ChatUser>>(new Map());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    channelsByIdRef.current = new Map(channels.map((c) => [c.id, c]));
  }, [channels]);

  useEffect(() => {
    if (loading || !user?.id) {
      usersByIdRef.current = new Map();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await chatFetch<{ users: ChatUser[] }>(user.id, '/api/chat/users');
        if (cancelled) return;
        const m = new Map<string, ChatUser>();
        for (const u of data.users ?? []) m.set(u.id, u);
        usersByIdRef.current = m;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user?.id]);

  const dismiss = useCallback((messageId: string) => {
    setPending((prev) => prev.filter((p) => p.id !== messageId));
  }, []);

  const clearAll = useCallback(() => {
    setPending([]);
  }, []);

  const navigateToChannel = useCallback(
    (channelId: string) => {
      const base = isAdmin ? '/chat' : '/user/chat';
      navigate(`${base}?channel=${encodeURIComponent(channelId)}`);
    },
    [navigate, isAdmin]
  );

  useEffect(() => {
    if (!socket || !user?.id) return;
    const myId = user.id;

    const consumeOnce = (messageId: string): boolean => {
      if (seenMessageIdsRef.current.has(messageId)) return false;
      seenMessageIdsRef.current.add(messageId);
      if (seenMessageIdsRef.current.size > MAX_SEEN_IDS) {
        const arr = [...seenMessageIdsRef.current];
        seenMessageIdsRef.current = new Set(arr.slice(-200));
      }
      return true;
    };

    const onNew = (msg: ChatMessage) => {
      if (msg.user_id === myId || msg.is_deleted) return;
      if (!consumeOnce(msg.id)) return;

      const ch = channelsByIdRef.current.get(msg.channel_id);
      const mentions = msg.mentions || [];
      const isMention = mentions.includes(myId);
      const isDm = ch?.type === 'dm';
      if (!isMention && !isDm) return;

      const author = usersByIdRef.current.get(msg.user_id);
      const authorName = (author?.name && author.name.trim()) || author?.email || 'Alguien';
      const preview = truncateForNotification(msg.content || '(sin texto)', 100);
      const label = channelLabel(ch);
      const kind: ChatInAppAlertKind = isMention ? 'mention' : 'dm';

      const alert: ChatInAppAlert = {
        id: msg.id,
        kind,
        channelId: msg.channel_id,
        channelLabel: label,
        authorName,
        preview,
        createdAt: Date.now(),
      };

      setPending((prev) => {
        if (prev.some((p) => p.id === msg.id)) return prev;
        return [alert, ...prev].slice(0, MAX_PENDING);
      });

      const title =
        kind === 'mention' ? `Te mencionaron en ${label}` : `Mensaje directo · ${authorName}`;
      const description = kind === 'mention' ? `${authorName}: ${preview}` : preview;

      toast.message(title, {
        description,
        duration: 6500,
        classNames: {
          toast: 'rounded-xl border border-indigo-100 bg-white shadow-lg',
        },
        action: {
          label: 'Ver chat',
          onClick: () => navigateToChannel(msg.channel_id),
        },
      });
    };

    socket.on('new_message', onNew);
    return () => {
      socket.off('new_message', onNew);
    };
  }, [socket, user?.id, navigateToChannel]);

  const value = useMemo(
    () => ({ pending, dismiss, clearAll }),
    [pending, dismiss, clearAll]
  );

  return <ChatInAppAlertsContext.Provider value={value}>{children}</ChatInAppAlertsContext.Provider>;
}

export function useChatInAppAlerts(): ChatInAppAlertsContextValue {
  const ctx = useContext(ChatInAppAlertsContext);
  if (!ctx) {
    return { pending: [], dismiss: () => {}, clearAll: () => {} };
  }
  return ctx;
}
