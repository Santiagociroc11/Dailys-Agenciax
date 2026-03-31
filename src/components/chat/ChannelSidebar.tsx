import React, { useMemo, useState } from 'react';
import { Hash, Lock, MessageCircle, Plus, Search, FolderOpen } from 'lucide-react';
import type { ChatChannel } from '../../types/chat';
import { OnlineStatus } from './OnlineStatus';

interface ChannelSidebarProps {
  channels: ChatChannel[];
  selectedId: string | null;
  currentUserId: string;
  onSelect: (id: string) => void;
  onlineUserIds: Set<string>;
  onCreateChannel: () => void;
  onNewDm: () => void;
}

export function ChannelSidebar({
  channels,
  selectedId,
  currentUserId,
  onSelect,
  onlineUserIds,
  onCreateChannel,
  onNewDm,
}: ChannelSidebarProps) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState({ project: false, custom: false, dm: false });

  const filtered = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return channels;
    return channels.filter((c) => c.name.toLowerCase().includes(t));
  }, [channels, q]);

  const projectCh = filtered.filter((c) => c.type === 'project');
  const customCh = filtered.filter((c) => c.type === 'custom');
  const dmCh = filtered.filter((c) => c.type === 'dm');

  const Row = ({ c }: { c: ChatChannel }) => {
    const peerId =
      c.type === 'dm' && c.members?.length
        ? c.members.find((mid) => mid !== currentUserId) ?? null
        : null;
    const dmPeerOnline = peerId ? onlineUserIds.has(peerId) : false;
    return (
      <button
        type="button"
        key={c.id}
        onClick={() => onSelect(c.id)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 min-w-0 ${
          selectedId === c.id ? 'bg-indigo-100 text-indigo-900 font-medium' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {c.type === 'project' && <FolderOpen className="w-4 h-4 shrink-0 text-amber-600" />}
        {c.type === 'custom' && <Hash className="w-4 h-4 shrink-0 text-gray-500" />}
        {c.type === 'dm' && <Lock className="w-4 h-4 shrink-0 text-emerald-600" />}
        {c.type === 'dm' && <OnlineStatus isOnline={!!dmPeerOnline} className="mr-0.5" />}
        <span className="truncate flex-1">{c.name}</span>
        {(c.unread_count ?? 0) > 0 && (
          <span className="shrink-0 text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
            {c.unread_count! > 99 ? '99+' : c.unread_count}
          </span>
        )}
      </button>
    );
  };

  const Section = ({
    title,
    keyId,
    items,
    icon: Icon,
  }: {
    title: string;
    keyId: keyof typeof collapsed;
    items: ChatChannel[];
    icon: React.ElementType;
  }) => (
    <div className="mb-2">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700"
        onClick={() => setCollapsed((s) => ({ ...s, [keyId]: !s[keyId] }))}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">{title}</span>
        <span>{collapsed[keyId] ? '+' : '−'}</span>
      </button>
      {!collapsed[keyId] && <div className="space-y-0.5 pl-1">{items.map((c) => Row({ c }))}</div>}
    </div>
  );

  return (
    <aside className="w-64 border-r border-gray-200 bg-white flex flex-col h-full shrink-0">
      <div className="p-3 border-b border-gray-100 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-8 pr-2 py-2 text-sm border border-gray-200 rounded-lg"
              placeholder="Buscar canales…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            type="button"
            title="Nuevo canal"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            onClick={onCreateChannel}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Mensaje directo"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-emerald-700"
            onClick={onNewDm}
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto min-h-0 p-2">
        <Section title="Proyectos" keyId="project" items={projectCh} icon={FolderOpen} />
        <Section title="Canales" keyId="custom" items={customCh} icon={Hash} />
        <Section title="Mensajes directos" keyId="dm" items={dmCh} icon={Lock} />
        {!filtered.length && <p className="text-sm text-gray-500 px-3 py-4 text-center">Sin canales</p>}
      </nav>
    </aside>
  );
}
