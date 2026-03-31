import React from 'react';
import { X } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import type { ChatUser } from '../../types/chat';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import type { Socket } from 'socket.io-client';

interface ThreadPanelProps {
  open: boolean;
  onClose: () => void;
  channelId: string;
  parent: ChatMessage | null;
  replies: ChatMessage[];
  usersById: Map<string, ChatUser>;
  mentionUsers: ChatUser[];
  currentUserId: string;
  isAdmin: boolean;
  socket: Socket | null;
  onRefreshThread: () => void;
  onSendReply: (content: string, mentions: string[]) => Promise<void>;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}

export function ThreadPanel({
  open,
  onClose,
  channelId,
  parent,
  replies,
  usersById,
  mentionUsers,
  currentUserId,
  isAdmin,
  socket,
  onRefreshThread,
  onSendReply,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
}: ThreadPanelProps) {
  if (!open || !parent) return null;

  const ordered = [...replies].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <aside className="w-full max-w-md border-l border-gray-200 bg-gray-50 flex flex-col h-full shrink-0 shadow-inner">
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white shrink-0">
        <h2 className="font-semibold text-gray-900 text-sm">Hilo</h2>
        <button type="button" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" onClick={onClose} aria-label="Cerrar hilo">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 py-2">
        <MessageItem
          message={parent}
          usersById={usersById}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onReply={() => {}}
          onEdit={(c) => onEditMessage(parent.id, c)}
          onDelete={() => onDeleteMessage(parent.id)}
          onToggleReaction={(em) => onToggleReaction(parent.id, em)}
        />
        <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          {ordered.length} {ordered.length === 1 ? 'respuesta' : 'respuestas'}
        </div>
        {ordered.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            usersById={usersById}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onReply={() => {}}
            onEdit={(c) => onEditMessage(m.id, c)}
            onDelete={() => onDeleteMessage(m.id)}
            onToggleReaction={(em) => onToggleReaction(m.id, em)}
          />
        ))}
      </div>
      <MessageInput
        channelId={channelId}
        socket={socket}
        users={mentionUsers}
        placeholder="Responder en el hilo…"
        threadParentId={parent.id}
        onSend={async (content, mentions) => {
          await onSendReply(content, mentions);
          onRefreshThread();
        }}
      />
    </aside>
  );
}
