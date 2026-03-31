import React, { useEffect, useRef } from 'react';
import type { ChatUser } from '../../types/chat';

interface MentionSuggestionsProps {
  users: ChatUser[];
  query: string;
  onSelect: (u: ChatUser) => void;
  onClose: () => void;
}

export function MentionSuggestions({ users, query, onSelect, onClose }: MentionSuggestionsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const q = query.toLowerCase().trim();
  const filtered = users.filter((u) => {
    const n = (u.name || '').toLowerCase();
    const e = (u.email || '').toLowerCase();
    return !q || n.includes(q) || e.includes(q);
  }).slice(0, 8);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  if (!filtered.length) return null;

  return (
    <div
      ref={ref}
      className="absolute left-0 bottom-full mb-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50"
      role="listbox"
    >
      {filtered.map((u) => (
        <button
          key={u.id}
          type="button"
          role="option"
          className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2"
          onClick={() => onSelect(u)}
        >
          <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-medium">
            {(u.name || u.email || '?').charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="font-medium text-gray-800 block truncate">{u.name || u.email}</span>
            {u.email && u.name && <span className="text-xs text-gray-500 truncate block">{u.email}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
