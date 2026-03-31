import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AtSign, MessageCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useChatInAppAlerts } from '../contexts/ChatInAppAlertsContext';

interface ChatNotificationBellProps {
  className?: string;
}

export function ChatNotificationBell({ className = '' }: ChatNotificationBellProps) {
  const { user, isAdmin } = useAuth();
  const { pending, dismiss, clearAll } = useChatInAppAlerts();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user?.id) return null;

  const count = pending.length;
  const badge = count > 99 ? '99+' : String(count);

  const goToChannel = (channelId: string, messageId: string) => {
    const base = isAdmin ? '/chat' : '/user/chat';
    navigate(`${base}?channel=${encodeURIComponent(channelId)}`);
    dismiss(messageId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
        aria-label="Notificaciones del chat"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-sm font-semibold text-gray-800">Chat</span>
            {count > 0 && (
              <button
                type="button"
                onClick={() => clearAll()}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                Limpiar todo
              </button>
            )}
          </div>
          <div className="max-h-[min(70vh,320px)] overflow-y-auto">
            {count === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-500">No hay menciones ni DMs recientes</p>
            ) : (
              <ul className="divide-y divide-gray-50 py-1">
                {pending.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => goToChannel(a.channelId, a.id)}
                      className="flex w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                    >
                      <span className="mt-0.5 shrink-0">
                        {a.kind === 'mention' ? (
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                            <AtSign className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <MessageCircle className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-xs font-medium text-gray-900">
                          {a.kind === 'mention' ? 'Te mencionaron' : 'Mensaje directo'} · {a.channelLabel}
                        </span>
                        <span className="line-clamp-2 text-xs text-gray-500">
                          <span className="font-medium text-gray-600">{a.authorName}: </span>
                          {a.preview}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(a.id);
                        }}
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                        aria-label="Descartar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
