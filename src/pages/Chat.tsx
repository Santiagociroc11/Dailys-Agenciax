import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { supabase } from '../lib/supabase';
import { chatFetch } from '../lib/chatApi';
import { notifyChatUnreadTitleRefresh } from '../lib/chatUnreadEvents';
import { playChatMessageSound } from '../lib/chatMessageSound';
import { resolveMentionIds } from '../components/chat/messageMentions';
import type { ChatChannel, ChatMessage, ChatUser } from '../types/chat';
import { ChannelSidebar, type ChatProjectRef } from '../components/chat/ChannelSidebar';
import { ChannelHeader } from '../components/chat/ChannelHeader';
import { MessageList } from '../components/chat/MessageList';
import { MessageInput } from '../components/chat/MessageInput';
import { ThreadPanel } from '../components/chat/ThreadPanel';
import { CreateChannelModal } from '../components/chat/CreateChannelModal';
import { NewDmModal } from '../components/chat/NewDmModal';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { ChatNotificationBanner } from '../components/chat/ChatNotificationBanner';

export default function Chat() {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [createChannelProjectId, setCreateChannelProjectId] = useState<string | null>(null);
  const [modalDm, setModalDm] = useState(false);
  const [projectsList, setProjectsList] = useState<ChatProjectRef[]>([]);

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

  /** Clave estable de IDs para suscripción socket: mismo conjunto → no re-suscribir en vano. */
  const channelIdsKey = useMemo(
    () =>
      channels
        .map((c) => c.id)
        .sort()
        .join('\0'),
    [channels]
  );

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
      const totalUnread = data.channels.reduce((s, c) => s + (c.unread_count ?? 0), 0);
      setChannels(data.channels);
      notifyChatUnreadTitleRefresh({ totalUnread });
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

  const fetchProjectsList = useCallback(async () => {
    if (!user?.id) return;
    let q = supabase.from('projects').select('id,name').eq('is_archived', false).order('name');
    if (!isAdmin) {
      const ids = user.assigned_projects || [];
      if (ids.length === 0) {
        setProjectsList([]);
        return;
      }
      q = q.in('id', ids);
    }
    const { data, error } = await q;
    if (error) return;
    setProjectsList((data as ChatProjectRef[]) || []);
  }, [user?.id, isAdmin, user?.assigned_projects]);

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
        setChannels((prev) => {
          const next = prev.map((c) => (c.id === channelId ? { ...c, unread_count: 0 } : c));
          const totalUnread = next.reduce((s, c) => s + (c.unread_count ?? 0), 0);
          queueMicrotask(() => notifyChatUnreadTitleRefresh({ totalUnread }));
          return next;
        });
      } catch {
        /* ignore */
      }
    },
    [user?.id, socket]
  );

  const selectChannel = useCallback(
    async (id: string) => {
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
    [loadMessages, markRead]
  );

  useEffect(() => {
    fetchChannels();
    fetchAllUsers();
    fetchProjectsList();
  }, [fetchChannels, fetchAllUsers, fetchProjectsList]);

  const channelFromUrl = searchParams.get('channel');
  useEffect(() => {
    if (!channelFromUrl || channels.length === 0) return;
    const exists = channels.some((c) => c.id === channelFromUrl);
    if (!exists) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('channel');
          return next;
        },
        { replace: true }
      );
      toast.error('Canal no disponible');
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('channel');
        return next;
      },
      { replace: true }
    );
    void selectChannel(channelFromUrl);
  }, [channelFromUrl, channels, selectChannel, setSearchParams]);

  /**
   * Salas Socket.io por canal: el servidor emite `new_message` a `channel:<id>`.
   * Patrón tipo Slack / Discord (equipos pequeños–medianos): el cliente entra en **todas** las salas
   * de los canales donde es miembro, no solo en el abierto. Así llegan eventos para no leídos y
   * el título sin polling. Tras reconexión hay que volver a unirse (rooms no persisten en el socket nuevo).
   */
  useEffect(() => {
    if (!socket || !user?.id || !channelIdsKey) return;
    const ids = channelIdsKey.split('\0');
    const joinAll = () => {
      for (const id of ids) joinChannel(id);
    };
    joinAll();
    socket.on('connect', joinAll);
    return () => {
      socket.off('connect', joinAll);
      for (const id of ids) leaveChannel(id);
    };
  }, [socket, user?.id, channelIdsKey, joinChannel, leaveChannel]);

  useEffect(() => {
    if (!socket || !user?.id) return;

    const shouldPlayIncomingChatSound = (msg: ChatMessage): boolean => {
      if (msg.user_id === user.id || msg.is_deleted) return false;
      if (typeof document !== 'undefined' && document.hidden) return true;
      if (msg.channel_id !== selectedIdRef.current) return true;
      if (!msg.thread_id) return false;
      return msg.thread_id !== threadRootRef.current;
    };

    const onNew = (msg: ChatMessage) => {
      if (shouldPlayIncomingChatSound(msg)) {
        playChatMessageSound();
      }

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
        void fetchChannels();
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
  }, [socket, user, fetchChannels]);

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

  const openCreateChannel = useCallback(() => {
    setCreateChannelProjectId(null);
    setModalCreate(true);
  }, []);

  const openCreateChannelInProject = useCallback((projectId: string) => {
    setCreateChannelProjectId(projectId);
    setModalCreate(true);
  }, []);

  const closeCreateChannelModal = useCallback(() => {
    setModalCreate(false);
    setCreateChannelProjectId(null);
  }, []);

  const createChannel = async (name: string, description: string, projectId: string | null) => {
    if (!user?.id) return;
    await chatFetch(user.id, '/api/chat/channels', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        ...(projectId ? { project_id: projectId } : {}),
      }),
    });
    await fetchChannels();
    toast.success(projectId ? 'Canal creado en el proyecto' : 'Canal creado');
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
    <div className="flex min-h-[calc(100vh-10rem)] -mx-6 -mb-6 -mt-2 bg-gray-100 rounded-lg overflow-hidden border border-gray-200/60 shadow-sm">
      <ChannelSidebar
        channels={channels}
        projectsList={projectsList}
        selectedId={selectedId}
        currentUserId={user.id}
        onSelect={(id) => void selectChannel(id)}
        onlineUserIds={onlineUserIds}
        onCreateChannel={openCreateChannel}
        onCreateChannelInProject={openCreateChannelInProject}
        onNewDm={() => setModalDm(true)}
      />

      <div className="flex-1 flex min-w-0 min-h-0">
        <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-gray-200">
          <ChannelHeader
            channel={selectedChannel}
            memberCount={selectedChannel?.members?.length ?? 0}
            isConnected={isConnected}
          />
          <ChatNotificationBanner />
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

      <CreateChannelModal
        open={modalCreate}
        initialProjectId={createChannelProjectId}
        projectsList={projectsList}
        onClose={closeCreateChannelModal}
        onCreate={createChannel}
      />
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
