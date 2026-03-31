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
  const bubbleVariant = isOwn ? ('outgoing' as const) : ('incoming' as const);

  if (message.is_deleted) {
    return (
      <div className="px-4 py-2 text-center text-sm text-gray-400 italic">Mensaje eliminado</div>
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
      className="group relative px-4 py-2 hover:bg-gray-50/60 rounded-lg transition-colors duration-150"
      onMouseLeave={() => {
        setMenu(false);
        setPicker(false);
      }}
    >
      <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`flex items-start gap-2 max-w-[min(88%,32rem)] ${
            isOwn ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
            style={{ backgroundColor: `hsl(${hue}, 55%, 48%)` }}
          >
            {label.charAt(0).toUpperCase()}
          </div>

          <div className={`min-w-0 flex-1 flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
            <div
              className={`flex w-full items-baseline gap-2 flex-wrap ${
                isOwn ? 'flex-row-reverse justify-end' : 'justify-start'
              }`}
            >
              <span className="font-semibold text-gray-900 text-sm tracking-tight">{label}</span>
              <span className="text-xs text-gray-400 font-light">
                {format(new Date(message.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                {message.is_edited && <span className="ml-1">(editado)</span>}
              </span>
            </div>

            {editing ? (
              <div className={`mt-1 flex w-full flex-wrap gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                <input
                  className="min-w-0 flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-shadow duration-150"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                />
                <button type="button" className="text-sm text-indigo-600 shrink-0" onClick={saveEdit}>
                  Guardar
                </button>
                <button
                  type="button"
                  className="text-sm text-gray-500 shrink-0"
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div
                className={`mt-0.5 text-sm whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${
                  isOwn
                    ? 'bg-indigo-600 text-white rounded-br-md shadow-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md border border-gray-100/80'
                }`}
              >
                {renderContentWithMentions(
                  message.content,
                  message.mentions || [],
                  usersById,
                  bubbleVariant
                )}
              </div>
            )}

            {message.reactions?.length > 0 && (
              <div className={`flex flex-wrap gap-1 mt-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                {message.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => onToggleReaction(r.emoji)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors duration-150 hover:shadow-sm ${
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

          <div
            className={`relative z-10 shrink-0 flex flex-col items-center gap-0.5 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
              isOwn ? '-ml-0.5' : ''
            }`}
          >
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-all duration-150"
              title="Reaccionar"
              onClick={() => setPicker((p) => !p)}
            >
              <Smile className="w-4 h-4" />
            </button>
            {picker && (
              <div className={`absolute top-8 z-40 ${isOwn ? 'right-0' : 'left-0'}`}>
                <ReactionPicker onPick={(em) => onToggleReaction(em)} onClose={() => setPicker(false)} />
              </div>
            )}
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-all duration-150"
              title="Hilo"
              onClick={onReply}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <div className="relative">
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-all duration-150"
                onClick={() => setMenu((m) => !m)}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menu && (
                <div
                  className={`absolute top-full z-40 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg ring-1 ring-black/5 py-1 min-w-[120px] ${
                    isOwn ? 'right-0' : 'left-0'
                  }`}
                >
                  {isOwn && (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors duration-100"
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
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors duration-100"
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
        </div>
      </div>

      {message.reply_count > 0 && (
        <div className={`mt-1 flex w-full ${isOwn ? 'justify-end pr-10' : 'justify-start pl-10'}`}>
          <button
            type="button"
            className="text-xs text-indigo-500 font-medium hover:underline transition-colors duration-150"
            onClick={onReply}
          >
            {message.reply_count} {message.reply_count === 1 ? 'respuesta' : 'respuestas'}
          </button>
        </div>
      )}
    </div>
  );
}
