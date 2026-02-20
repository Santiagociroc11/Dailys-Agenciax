import React, { useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface TaskComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string | Date;
}

interface TaskCommentsProps {
  comments: TaskComment[];
  onAdd: (content: string) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
  currentUserId?: string;
  users: { id: string; name?: string; email?: string }[];
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
}

export function TaskComments({
  comments,
  onAdd,
  onDelete,
  currentUserId,
  users,
  disabled = false,
  placeholder = 'Escribe un comentario...',
  emptyMessage = 'Sin comentarios. Sé el primero en comentar.',
}: TaskCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);

  const getUserName = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    return u?.name || u?.email || 'Usuario';
  };

  const handleSubmit = async () => {
    const content = newComment.trim();
    if (!content || disabled) return;
    setSending(true);
    try {
      await onAdd(content);
      setNewComment('');
    } finally {
      setSending(false);
    }
  };

  const sortedComments = [...comments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
      <div className="px-3 py-2 bg-white border-b border-gray-100 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-medium text-gray-700">
          Comentarios {comments.length > 0 && `(${comments.length})`}
        </span>
      </div>
      <div className="p-3 space-y-3 max-h-64 overflow-y-auto">
        {sortedComments.length === 0 ? (
          <p className="text-sm text-gray-500 py-2 italic">{emptyMessage}</p>
        ) : (
          sortedComments.map((c) => (
            <div
              key={c.id}
              className="flex gap-2 group"
            >
              <div className="flex-1 min-w-0 bg-white rounded-lg px-3 py-2 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-indigo-600">
                    {getUserName(c.user_id)}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">
                      {format(new Date(c.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                    </span>
                    {onDelete && currentUserId === c.user_id && !disabled && (
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-600 rounded transition-all"
                        aria-label="Eliminar comentario"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{c.content}</p>
              </div>
            </div>
          ))
        )}
        {!disabled && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              placeholder={placeholder}
              className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!newComment.trim() || sending}
              className="flex items-center gap-1 px-3 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
