import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { chatFetch } from '../lib/chatApi';
import { resolveMentionIds } from '../components/chat/messageMentions';
import type { ChatChannel, ChatMessage, ChatUser } from '../types/chat';
import { ChannelSidebar } from '../components/chat/ChannelSidebar';
import { ChannelHeader } from '../components/chat/ChannelHeader';
import { MessageList } from '../components/chat/MessageList';
import { MessageInput } from '../components/chat/MessageInput';
import { ThreadPanel } from '../components/chat/ThreadPanel';
import { CreateChannelModal } from '../components/chat/CreateChannelModal';
import { NewDmModal } from '../components/chat/NewDmModal';
import { TypingIndicator } from '../components/chat/TypingIndicator';

export default function Chat() {
  const { user, isAdmin } = useAuth();
  const { socket, joinChannel, leaveChannel, onlineUserIds, isConnected } = useSocket();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
  const [threadOpen, setThreadOpen] = useState(false);
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [threadReplies, setThreadReplies] = useState<ChatMessage[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [modalCreate, setModalCreate] = useState(false);
  const [modalDm, setModalDm] = useState(false);

  const prevChannelRef = useRef<string | null>(null);
  const oldestIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const threadRootRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    threadRootRef.current = threadParent?.id ?? null;
  }, [threadParent?.id]);

  const usersById = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers]);

  const mentionUsers = useMemo(() => {
    const ch = channels.find((c) => c.id === selectedId);
    if (!ch?.members?.length) return allUsers;
    const set = new Set(ch.members);
    return allUsers.filter((u) => set.has(u.id));
  }, [channels, selectedId, allUsers]);

  const fetchChannels = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await chatFetch<{ channels: ChatChannel[] }>(user.id, '/api/chat/channels');
      setChannels(data.channels);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar canales');
    }
  }, [user?.id]);

  const fetchAllUsers = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await chatFetch<{ users: ChatUser[] }>(user.id, '/api/chat/users');
      setAllUsers(data.users);
    } catch {
      /* optional */
    }
  }, [user?.id]);

  const loadMessages = useCallback(
    async (channelId: string, append: boolean) => {
      if (!user?.id) return;
      const qs = new URLSearchParams({ limit: '50' });
      if (append && oldestIdRef.current) qs.set('before', oldestIdRef.current);
      const path = `/api/chat/channels/${channelId}/messages?${qs}`;
      const data = await chatFetch<{ messages: ChatMessage[]; has_more: boolean }>(user.id, path);
      if (append) {
        setMessages((prev) => [...prev, ...data.messages]);
      } else {
        setMessages(data.messages);
      }
      setHasMore(data.has_more);
      const batch = data.messages;
      if (batch.length) {
        oldestIdRef.current = batch[batch.length - 1].id;
      } else if (!append) {
        oldestIdRef.current = null;
      }
    },
    [user?.id]
  );

  const markRead = useCallback(
    async (channelId: string) => {
      if (!user?.id) return;
      try {
        await chatFetch(user.id, `/api/chat/channels/${channelId}/read`, { method: 'POST', body: '{}' });
        socket?.emit('mark_read', { channelId });
        setChannels((prev) =>
          prev.map((c) => (c.id === channelId ? { ...c, unread_count: 0 } : c))
        );
      } catch {
        /* ignore */
      }
    },
    [user?.id, socket]
  );

  const selectChannel = useCallback(
    async (id: string) => {
      if (prevChannelRef.current) {
        leaveChannel(prevChannelRef.current);
      }
      prevChannelRef.current = id;
      joinChannel(id);
      setSelectedId(id);
      setThreadOpen(false);
      setThreadParent(null);
      setThreadReplies([]);
      setTypingUserIds(new Set());
      setLoadingChannel(true);
      oldestIdRef.current = null;
      try {
        await loadMessages(id, false);
        await markRead(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al cargar mensajes');
      } finally {
        setLoadingChannel(false);
      }
    },
    [joinChannel, leaveChannel, loadMessages, markRead]
  );

  useEffect(() => {
    fetchChannels();
    fetchAllUsers();
  }, [fetchChannels, fetchAllUsers]);

  useEffect(() => {
    if (!socket || !user?.id) return;

    const onNew = (msg: ChatMessage) => {
      if (msg.thread_id) {
        if (msg.thread_id === threadRootRef.current) {
          setThreadReplies((prev) => {
            if (prev.some((p) => p.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.thread_id ? { ...m, reply_count: (m.reply_count || 0) + 1 } : m
          )
        );
        return;
      }
      if (msg.channel_id !== selectedIdRef.current) {
        void fetchChannels();
        return;
      }
      setMessages((prev) => {
        if (prev.some((p) => p.id === msg.id)) return prev;
        return [msg, ...prev];
      });
      void fetchChannels();
    };

    const onUpdated = (msg: ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      setThreadReplies((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      if (threadParent?.id === msg.id) setThreadParent(msg);
    };

    const onDeleted = (payload: { id: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== payload.id));
      setThreadReplies((prev) => prev.filter((m) => m.id !== payload.id));
      if (threadParent?.id === payload.id) {
        setThreadOpen(false);
        setThreadParent(null);
      }
    };

    const onReaction = (msg: ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      setThreadReplies((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      if (threadParent?.id === msg.id) setThreadParent(msg);
    };

    const onTyping = (p: { user_id: string; channel_id: string }) => {
      if (p.channel_id !== selectedIdRef.current || p.user_id === user.id) return;
      setTypingUserIds((s) => new Set(s).add(p.user_id));
    };

    const onStopTyping = (p: { user_id: string; channel_id: string }) => {
      if (p.channel_id !== selectedIdRef.current) return;
      setTypingUserIds((s) => {
        const n = new Set(s);
        n.delete(p.user_id);
        return n;
      });
    };

    socket.on('new_message', onNew);
    socket.on('message_updated', onUpdated);
    socket.on('message_deleted', onDeleted);
    socket.on('reaction_updated', onReaction);
    socket.on('user_typing', onTyping);
    socket.on('user_stopped_typing', onStopTyping);

    return () => {
      socket.off('new_message', onNew);
      socket.off('message_updated', onUpdated);
      socket.off('message_deleted', onDeleted);
      socket.off('reaction_updated', onReaction);
      socket.off('user_typing', onTyping);
      socket.off('user_stopped_typing', onStopTyping);
    };
  }, [socket, user?.id, fetchChannels]);

  useEffect(() => {
    return () => {
      if (prevChannelRef.current) leaveChannel(prevChannelRef.current);
    };
  }, [leaveChannel]);

  const selectedChannel = channels.find((c) => c.id === selectedId) ?? null;

  const typingNames = [...typingUserIds]
    .map((id) => usersById.get(id)?.name || usersById.get(id)?.email || 'Alguien')
    .filter(Boolean);

  const loadMore = useCallback(async () => {
    if (!selectedId || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadMessages(selectedId, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingMore(false);
    }
  }, [selectedId, hasMore, loadingMore, loadMessages]);

  const openThread = useCallback(
    async (m: ChatMessage) => {
      if (!user?.id || !selectedId) return;
      threadRootRef.current = m.id;
      setThreadParent(m);
      setThreadOpen(true);
      try {
        const data = await chatFetch<{ parent: ChatMessage; replies: ChatMessage[] }>(
          user.id,
          `/api/chat/channels/${selectedId}/threads/${m.id}`
        );
        setThreadParent(data.parent);
        setThreadReplies(data.replies);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al cargar hilo');
      }
    },
    [user?.id, selectedId]
  );

  const refreshThread = useCallback(async () => {
    const tid = threadRootRef.current;
    const chId = selectedIdRef.current;
    if (!user?.id || !chId || !tid) return;
    try {
      const data = await chatFetch<{ parent: ChatMessage; replies: ChatMessage[] }>(
        user.id,
        `/api/chat/channels/${chId}/threads/${tid}`
      );
      setThreadParent(data.parent);
      setThreadReplies(data.replies);
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  const sendMessage = async (content: string, mentions: string[], threadId?: string | null) => {
    if (!user?.id || !selectedId) return;
    await chatFetch(user.id, `/api/chat/channels/${selectedId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, mentions, thread_id: threadId || null }),
    });
    await fetchChannels();
  };

  const editMessage = async (id: string, content: string) => {
    if (!user?.id) return;
    const mentions = resolveMentionIds(content, mentionUsers.length ? mentionUsers : allUsers);
    await chatFetch(user.id, `/api/chat/messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content, mentions }),
    });
  };

  const deleteMessage = async (id: string) => {
    if (!user?.id) return;
    await chatFetch(user.id, `/api/chat/messages/${id}`, { method: 'DELETE' });
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user?.id) return;
    await chatFetch(user.id, `/api/chat/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  };

  const createChannel = async (name: string, description: string) => {
    if (!user?.id) return;
    await chatFetch(user.id, '/api/chat/channels', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    await fetchChannels();
    toast.success('Canal creado');
  };

  const startDm = async (otherUserId: string) => {
    if (!user?.id) return;
    const data = await chatFetch<{ channel: ChatChannel }>(user.id, '/api/chat/channels/dm', {
      method: 'POST',
      body: JSON.stringify({ other_user_id: otherUserId }),
    });
    await fetchChannels();
    await selectChannel(data.channel.id);
    toast.success('Conversación abierta');
  };

  if (!user) return null;

  return (
    <div className="flex min-h-[calc(100vh-10rem)] -mx-6 -mb-6 -mt-2 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
      <ChannelSidebar
        channels={channels}
        selectedId={selectedId}
        currentUserId={user.id}
        onSelect={(id) => void selectChannel(id)}
        onlineUserIds={onlineUserIds}
        onCreateChannel={() => setModalCreate(true)}
        onNewDm={() => setModalDm(true)}
      />

      <div className="flex-1 flex min-w-0 min-h-0">
        <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-gray-200">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              {isConnected ? (
                <span className="text-emerald-600">● En vivo</span>
              ) : (
                <span className="text-amber-600">○ Reconectando…</span>
              )}
            </span>
          </div>
          <ChannelHeader channel={selectedChannel} memberCount={selectedChannel?.members?.length ?? 0} />
          {loadingChannel ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>
          ) : selectedId ? (
            <>
              <MessageList
                channelId={selectedId}
                messages={messages}
                usersById={usersById}
                currentUserId={user.id}
                isAdmin={isAdmin}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                onThreadOpen={openThread}
                onEditMessage={editMessage}
                onDeleteMessage={deleteMessage}
                onToggleReaction={toggleReaction}
              />
              <TypingIndicator names={typingNames} />
              <MessageInput
                channelId={selectedId}
                socket={socket}
                users={mentionUsers.length ? mentionUsers : allUsers}
                onSend={sendMessage}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm px-6 text-center">
              Elige un canal a la izquierda para comenzar a chatear.
            </div>
          )}
        </div>

        {selectedId && (
        <ThreadPanel
          open={threadOpen}
          onClose={() => {
            setThreadOpen(false);
            setThreadParent(null);
            setThreadReplies([]);
          }}
          channelId={selectedId}
          parent={threadParent}
          replies={threadReplies}
          usersById={usersById}
          mentionUsers={mentionUsers.length ? mentionUsers : allUsers}
          currentUserId={user.id}
          isAdmin={isAdmin}
          socket={socket}
          onRefreshThread={refreshThread}
          onSendReply={async (content, mentions) => {
            if (!selectedId || !threadParent) return;
            await chatFetch(user.id, `/api/chat/channels/${selectedId}/messages`, {
              method: 'POST',
              body: JSON.stringify({ content, mentions, thread_id: threadParent.id }),
            });
            await refreshThread();
            await fetchChannels();
          }}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          onToggleReaction={toggleReaction}
        />
        )}
      </div>

      <CreateChannelModal open={modalCreate} onClose={() => setModalCreate(false)} onCreate={createChannel} />
      <NewDmModal
        open={modalDm}
        onClose={() => setModalDm(false)}
        currentUserId={user.id}
        users={allUsers}
        onlineUserIds={onlineUserIds}
        onStartDm={startDm}
      />
    </div>
  );
}
