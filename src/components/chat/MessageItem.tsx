import React, { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MessageSquare, MoreHorizontal, Pencil, Smile, Trash2 } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import type { ChatUser } from '../../types/chat';
import { renderContentWithMentions } from './messageMentions';
import { ReactionPicker } from './ReactionPicker';

interface MessageItemProps {
  message: ChatMessage;
  usersById: Map<string, ChatUser>;
  currentUserId: string;
  isAdmin: boolean;
  onReply: () => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
  onToggleReaction: (emoji: string) => void;
}

function avatarColor(id: string) {
  const hues = [220, 280, 340, 200, 160, 30];
  let h = 0;
  for (let i = 0; i < id.length; i++) h += id.charCodeAt(i);
  return hues[h % hues.length];
}

export function MessageItem({
  message,
  usersById,
  currentUserId,
  isAdmin,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
}: MessageItemProps) {
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const author = usersById.get(message.user_id);
  const label = author?.name || author?.email || 'Usuario';
  const hue = avatarColor(message.user_id);
  const isOwn = message.user_id === currentUserId;
  const canDelete = isOwn || isAdmin;

  if (message.is_deleted) {
    return (
      <div className="px-4 py-2 text-sm text-gray-400 italic">Mensaje eliminado</div>
    );
  }

  const saveEdit = () => {
    const t = editText.trim();
    if (!t) return;
    onEdit(t);
    setEditing(false);
  };

  return (
    <div
      className="group px-4 py-2 hover:bg-gray-50/80 rounded-lg relative"
      onMouseLeave={() => {
        setMenu(false);
        setPicker(false);
      }}
    >
      <div className="flex gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold text-white shrink-0"
          style={{ backgroundColor: `hsl(${hue}, 55%, 48%)` }}
        >
          {label.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{label}</span>
            <span className="text-xs text-gray-400">
              {format(new Date(message.created_at), "d MMM yyyy, HH:mm", { locale: es })}
              {message.is_edited && <span className="ml-1">(editado)</span>}
            </span>
          </div>
          {editing ? (
            <div className="mt-1 flex gap-2">
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
              />
              <button type="button" className="text-sm text-indigo-600" onClick={saveEdit}>
                Guardar
              </button>
              <button type="button" className="text-sm text-gray-500" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-800 whitespace-pre-wrap break-words mt-0.5">
              {renderContentWithMentions(message.content, message.mentions || [], usersById)}
            </div>
          )}
          {message.reactions?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {message.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onToggleReaction(r.emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                    r.user_ids?.includes(currentUserId)
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="text-gray-600">{r.user_ids?.length || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 opacity-0 group-hover:opacity-100 flex items-start gap-1 relative">
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-200 text-gray-500"
            title="Reaccionar"
            onClick={() => setPicker((p) => !p)}
          >
            <Smile className="w-4 h-4" />
          </button>
          {picker && (
            <div className="absolute right-0 top-8 z-40">
              <ReactionPicker onPick={(em) => onToggleReaction(em)} onClose={() => setPicker(false)} />
            </div>
          )}
          <button type="button" className="p-1 rounded hover:bg-gray-200 text-gray-500" title="Hilo" onClick={onReply}>
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-200 text-gray-500"
            onClick={() => setMenu((m) => !m)}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-8 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
              {isOwn && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => {
                    setEditing(true);
                    setEditText(message.content);
                    setMenu(false);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => {
                    onDelete();
                    setMenu(false);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {message.reply_count > 0 && (
        <button
          type="button"
          className="ml-12 mt-1 text-xs text-indigo-600 hover:underline"
          onClick={onReply}
        >
          {message.reply_count} {message.reply_count === 1 ? 'respuesta' : 'respuestas'}
        </button>
      )}
    </div>
  );
}
