import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { ChatUser } from '../../types/chat';
import { MentionSuggestions } from './MentionSuggestions';
import { buildMentionToken, resolveMentionIds } from './messageMentions';
import type { Socket } from 'socket.io-client';

interface MessageInputProps {
  channelId: string | null;
  socket: Socket | null;
  users: ChatUser[];
  disabled?: boolean;
  placeholder?: string;
  threadParentId?: string | null;
  onSend: (content: string, mentions: string[], threadId?: string | null) => Promise<void>;
}

export function MessageInput({
  channelId,
  socket,
  users,
  disabled,
  placeholder = 'Escribe un mensaje…',
  threadParentId = null,
  onSend,
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentTyping = useRef(false);

  const emitTyping = useCallback(() => {
    if (!socket || !channelId) return;
    if (!sentTyping.current) {
      socket.emit('typing', { channelId });
      sentTyping.current = true;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('stop_typing', { channelId });
      sentTyping.current = false;
    }, 1200);
  }, [socket, channelId]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (socket && channelId && sentTyping.current) {
        socket.emit('stop_typing', { channelId });
      }
    };
  }, [socket, channelId]);

  const handleChange = (v: string, cursorPos: number) => {
    setValue(v);
    emitTyping();
    const before = v.slice(0, cursorPos);
    const at = before.lastIndexOf('@');
    if (at >= 0 && (at === 0 || /\s/.test(before[at - 1]))) {
      const after = before.slice(at + 1);
      if (!/\s/.test(after)) {
        setMentionOpen(true);
        setMentionQuery(after);
        setMentionStart(at);
        return;
      }
    }
    setMentionOpen(false);
    setMentionQuery('');
    setMentionStart(null);
  };

  const insertMention = (u: ChatUser) => {
    if (mentionStart === null) return;
    const token = buildMentionToken(u);
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + 1 + mentionQuery.length);
    setValue(`${before}@${token} ${after}`);
    setMentionOpen(false);
    setMentionQuery('');
    setMentionStart(null);
  };

  const submit = async () => {
    const text = value.trim();
    if (!text || disabled || !channelId) return;
    const mentions = resolveMentionIds(text, users);
    if (socket && channelId) {
      socket.emit('stop_typing', { channelId });
      sentTyping.current = false;
    }
    setValue('');
    await onSend(text, mentions, threadParentId);
  };

  return (
    <div className="border-t border-gray-200 p-3 bg-white shrink-0 relative">
      {mentionOpen && (
        <MentionSuggestions
          users={users}
          query={mentionQuery}
          onSelect={insertMention}
          onClose={() => setMentionOpen(false)}
        />
      )}
      <div className="flex gap-2 items-end">
        <textarea
          className="flex-1 min-h-[44px] max-h-32 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={2}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={submit}
          className="p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shrink-0"
          aria-label="Enviar"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
