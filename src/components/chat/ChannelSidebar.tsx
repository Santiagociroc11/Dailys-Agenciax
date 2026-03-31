import React, { useMemo, useState } from 'react';
import { Hash, Lock, MessageCircle, Plus, Search, FolderOpen, ChevronRight } from 'lucide-react';
import type { ChatChannel } from '../../types/chat';
import { OnlineStatus } from './OnlineStatus';

export interface ChatProjectRef {
  id: string;
  name: string;
}

interface ChannelSidebarProps {
  channels: ChatChannel[];
  /** Proyectos activos (ordenados) para anidar canales de tipo project */
  projectsList: ChatProjectRef[];
  selectedId: string | null;
  currentUserId: string;
  onSelect: (id: string) => void;
  onlineUserIds: Set<string>;
  onCreateChannel: () => void;
  onNewDm: () => void;
}

function channelDisplayName(c: ChatChannel) {
  return c.name.replace(/^\s*📁\s*/u, '').trim() || c.name;
}

function sumUnread(chs: ChatChannel[]) {
  return chs.reduce((s, c) => s + (c.unread_count ?? 0), 0);
}

export function ChannelSidebar({
  channels,
  projectsList,
  selectedId,
  currentUserId,
  onSelect,
  onlineUserIds,
  onCreateChannel,
  onNewDm,
}: ChannelSidebarProps) {
  const [q, setQ] = useState('');
  const [sectionCollapsed, setSectionCollapsed] = useState({ projects: false, custom: false, dm: false });
  /** true = carpeta de proyecto plegada */
  const [projectFolded, setProjectFolded] = useState<Record<string, boolean>>({});

  const { projectBundles, orphanProjectChannels, customCh, dmCh } = useMemo(() => {
    const t = q.toLowerCase().trim();
    const projectCh = channels.filter((c) => c.type === 'project');
    const customChAll = channels.filter((c) => c.type === 'custom');
    const dmChAll = channels.filter((c) => c.type === 'dm');

    const byPid = new Map<string, ChatChannel[]>();
    for (const c of projectCh) {
      const pid = c.project_id || '';
      if (!byPid.has(pid)) byPid.set(pid, []);
      byPid.get(pid)!.push(c);
    }
    const knownIds = new Set(projectsList.map((p) => p.id));

    const bundles = projectsList
      .map((p) => ({
        id: p.id,
        name: p.name,
        channels: [...(byPid.get(p.id) || [])].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((b) => b.channels.length > 0);

    const orphans = projectCh.filter((c) => !c.project_id || !knownIds.has(c.project_id));

    const matches = (c: ChatChannel) => !t || c.name.toLowerCase().includes(t);
    const matchesProj = (name: string) => !t || name.toLowerCase().includes(t);

    const filterBundles = t
      ? bundles
          .map((b) => ({
            ...b,
            channels: b.channels.filter((c) => matches(c) || matchesProj(b.name)),
          }))
          .filter((b) => b.channels.length > 0)
      : bundles;

    const filterOrphans = t ? orphans.filter(matches) : orphans;
    const filterCustom = t ? customChAll.filter(matches) : customChAll;
    const filterDm = t ? dmChAll.filter(matches) : dmChAll;

    return {
      projectBundles: filterBundles,
      orphanProjectChannels: filterOrphans,
      customCh: filterCustom,
      dmCh: filterDm,
    };
  }, [channels, projectsList, q]);

  const Row = ({ c, nested }: { c: ChatChannel; nested?: boolean }) => {
    const peerId =
      c.type === 'dm' && c.members?.length
        ? c.members.find((mid) => mid !== currentUserId) ?? null
        : null;
    const dmPeerOnline = peerId ? onlineUserIds.has(peerId) : false;
    const label = c.type === 'project' && nested ? channelDisplayName(c) : c.name;
    return (
      <button
        type="button"
        key={c.id}
        onClick={() => onSelect(c.id)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 min-w-0 ${
          nested ? 'pl-2' : ''
        } ${
          selectedId === c.id ? 'bg-indigo-100 text-indigo-900 font-medium' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {c.type === 'project' && !nested && <FolderOpen className="w-4 h-4 shrink-0 text-amber-600" />}
        {c.type === 'project' && nested && <Hash className="w-4 h-4 shrink-0 text-amber-700/80" />}
        {c.type === 'custom' && <Hash className="w-4 h-4 shrink-0 text-gray-500" />}
        {c.type === 'dm' && <Lock className="w-4 h-4 shrink-0 text-emerald-600" />}
        {c.type === 'dm' && <OnlineStatus isOnline={!!dmPeerOnline} className="mr-0.5" />}
        <span className="truncate flex-1">{label}</span>
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
    children,
  }: {
    title: string;
    keyId: 'projects' | 'custom' | 'dm';
    items: ChatChannel[];
    icon: React.ElementType;
    children?: React.ReactNode;
  }) => (
    <div className="mb-2">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700"
        onClick={() => setSectionCollapsed((s) => ({ ...s, [keyId]: !s[keyId] }))}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">{title}</span>
        <span>{sectionCollapsed[keyId] ? '+' : '−'}</span>
      </button>
      {!sectionCollapsed[keyId] && (children ?? <div className="space-y-0.5 pl-1">{items.map((c) => Row({ c }))}</div>)}
    </div>
  );

  const toggleProject = (projectId: string) => {
    setProjectFolded((s) => ({ ...s, [projectId]: !s[projectId] }));
  };

  const isProjectOpen = (projectId: string) => !projectFolded[projectId];

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
        <Section title="Proyectos" keyId="projects" items={[]} icon={FolderOpen}>
          <div className="space-y-1 pl-1">
            {projectBundles.map((bundle) => {
              const unread = sumUnread(bundle.channels);
              const open = isProjectOpen(bundle.id);
              return (
                <div key={bundle.id} className="rounded-lg">
                  <button
                    type="button"
                    className="flex items-center gap-1 w-full px-2 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 rounded-lg text-left min-w-0"
                    onClick={() => toggleProject(bundle.id)}
                  >
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                      aria-hidden
                    />
                    <FolderOpen className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="truncate flex-1 min-w-0">{bundle.name}</span>
                    {unread > 0 && (
                      <span className="shrink-0 text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="ml-2 pl-2 border-l border-gray-200 space-y-0.5 pb-1">
                      {bundle.channels.map((c) => (
                        <Row key={c.id} c={c} nested />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {orphanProjectChannels.length > 0 && (
              <div className="pt-1">
                <p className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Sin agrupar
                </p>
                <div className="space-y-0.5 border-l border-dashed border-gray-200 ml-2 pl-2">
                  {orphanProjectChannels.map((c) => (
                    <Row key={c.id} c={c} nested />
                  ))}
                </div>
              </div>
            )}
            {projectBundles.length === 0 && orphanProjectChannels.length === 0 && (
              <p className="text-sm text-gray-500 px-2 py-2">Ningún canal de proyecto</p>
            )}
          </div>
        </Section>
        <Section title="Canales" keyId="custom" items={customCh} icon={Hash} />
        <Section title="Mensajes directos" keyId="dm" items={dmCh} icon={Lock} />
        {!channels.length && <p className="text-sm text-gray-500 px-3 py-4 text-center">Sin canales</p>}
      </nav>
    </aside>
  );
}
