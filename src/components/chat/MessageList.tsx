import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ChatMessage } from '../../types/chat';
import type { ChatUser } from '../../types/chat';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  channelId: string;
  messages: ChatMessage[];
  usersById: Map<string, ChatUser>;
  currentUserId: string;
  isAdmin: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onThreadOpen: (m: ChatMessage) => void;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}

function dateLabel(d: Date): string {
  if (isToday(d)) return 'Hoy';
  if (isYesterday(d)) return 'Ayer';
  return format(d, "d 'de' MMMM yyyy", { locale: es });
}

export function MessageList({
  channelId,
  messages,
  usersById,
  currentUserId,
  isAdmin,
  hasMore,
  loadingMore,
  onLoadMore,
  onThreadOpen,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(messages.length);

  const ordered = useMemo(() => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [messages]);

  const withSeparators = useMemo(() => {
    const out: { type: 'date' | 'msg'; key: string; date?: Date; msg?: ChatMessage }[] = [];
    let lastDateKey = '';
    for (const m of ordered) {
      const d = new Date(m.created_at);
      const dk = format(d, 'yyyy-MM-dd');
      if (dk !== lastDateKey) {
        lastDateKey = dk;
        out.push({ type: 'date', key: `d-${dk}`, date: d });
      }
      out.push({ type: 'msg', key: m.id, msg: m });
    }
    return out;
  }, [ordered]);

  useEffect(() => {
    prevLen.current = 0;
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    prevLen.current = messages.length;
  }, [channelId]);

  useEffect(() => {
    if (messages.length > prevLen.current && messages.length > 0) {
      const newest = [...messages].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      if (newest?.user_id === currentUserId) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevLen.current = messages.length;
  }, [messages.length, messages, currentUserId]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 80) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto min-h-0 py-3"
      onScroll={onScroll}
    >
      {loadingMore && (
        <div className="text-center text-xs text-gray-400 py-2">Cargando mensajes anteriores…</div>
      )}
      {withSeparators.map((row) => {
        if (row.type === 'date' && row.date) {
          return (
            <div key={row.key} className="flex items-center gap-3 my-4 px-4">
              <div className="flex-1 h-px bg-gray-200/60" />
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                {dateLabel(row.date)}
              </span>
              <div className="flex-1 h-px bg-gray-200/60" />
            </div>
          );
        }
        if (row.type === 'msg' && row.msg) {
          return (
            <MessageItem
              key={row.msg.id}
              message={row.msg}
              usersById={usersById}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onReply={() => onThreadOpen(row.msg!)}
              onEdit={(content) => onEditMessage(row.msg!.id, content)}
              onDelete={() => onDeleteMessage(row.msg!.id)}
              onToggleReaction={(emoji) => onToggleReaction(row.msg!.id, emoji)}
            />
          );
        }
        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
