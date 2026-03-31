import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ChatUser } from '../../types/chat';
import { OnlineStatus } from './OnlineStatus';

interface NewDmModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  users: ChatUser[];
  onlineUserIds: Set<string>;
  onStartDm: (otherUserId: string) => Promise<void>;
}

export function NewDmModal({
  open,
  onClose,
  currentUserId,
  users,
  onlineUserIds,
  onStartDm,
}: NewDmModalProps) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  const list = useMemo(() => {
    const t = q.toLowerCase().trim();
    return users
      .filter((u) => u.id !== currentUserId)
      .filter((u) => {
        if (!t) return true;
        return (
          (u.name || '').toLowerCase().includes(t) || (u.email || '').toLowerCase().includes(t)
        );
      })
      .slice(0, 20);
  }, [users, q, currentUserId]);

  if (!open) return null;

  const pick = async (id: string) => {
    setLoading(true);
    try {
      await onStartDm(id);
      setQ('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative max-h-[80vh] flex flex-col">
        <button
          type="button"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Mensaje directo</h2>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          placeholder="Buscar usuario…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="overflow-y-auto flex-1 min-h-0 border border-gray-100 rounded-lg">
          {list.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={loading}
              className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              onClick={() => pick(u.id)}
            >
              <OnlineStatus isOnline={onlineUserIds.has(u.id)} />
              <span className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-medium">
                {(u.name || u.email || '?').charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-800 block truncate">{u.name || u.email}</span>
                {u.email && u.name && <span className="text-xs text-gray-500 truncate block">{u.email}</span>}
              </span>
            </button>
          ))}
          {!list.length && <p className="p-4 text-sm text-gray-500 text-center">Sin resultados</p>}
        </div>
      </div>
    </div>
  );
}
