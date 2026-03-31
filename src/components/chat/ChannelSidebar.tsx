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
  /** Abre el modal de nuevo canal ya asociado a un proyecto */
  onCreateChannelInProject: (projectId: string) => void;
  onNewDm: () => void;
}

function channelDisplayName(c: ChatChannel) {
  return c.name.replace(/^\s*📁\s*/u, '').trim() || c.name;
}

function sumUnread(chs: ChatChannel[]) {
  return chs.reduce((s, c) => s + (c.unread_count ?? 0), 0);
}

function sumMessages(chs: ChatChannel[]) {
  return chs.reduce((s, c) => s + (c.message_count ?? 0), 0);
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ChannelSidebar({
  channels,
  projectsList,
  selectedId,
  currentUserId,
  onSelect,
  onlineUserIds,
  onCreateChannel,
  onCreateChannelInProject,
  onNewDm,
}: ChannelSidebarProps) {
  const [q, setQ] = useState('');
  const [sectionCollapsed, setSectionCollapsed] = useState({ projects: false, custom: false, dm: false });
  /** true = carpeta de proyecto plegada */
  const [projectFolded, setProjectFolded] = useState<Record<string, boolean>>({});

  const {
    projectBundles,
    orphanProjectChannels,
    orphanCustomChannels,
    customCh,
    dmCh,
    sectionProjectsUnread,
    sectionProjectsMessages,
    sectionCustomUnread,
    sectionCustomMessages,
    sectionDmUnread,
    sectionDmMessages,
  } = useMemo(() => {
    const t = q.toLowerCase().trim();
    const projectCh = channels.filter((c) => c.type === 'project');
    const customChAll = channels.filter((c) => c.type === 'custom');
    const dmChAll = channels.filter((c) => c.type === 'dm');
    const customGlobalAll = customChAll.filter((c) => !c.project_id);

    const byPid = new Map<string, ChatChannel[]>();
    for (const c of channels) {
      if (c.type === 'dm') continue;
      const pid = c.project_id || '';
      if (!pid) continue;
      if (c.type === 'project' || c.type === 'custom') {
        if (!byPid.has(pid)) byPid.set(pid, []);
        byPid.get(pid)!.push(c);
      }
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
    const orphanCustom = customChAll.filter((c) => c.project_id && !knownIds.has(c.project_id));

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
    const filterOrphanCustom = t ? orphanCustom.filter(matches) : orphanCustom;
    const filterCustom = t ? customGlobalAll.filter(matches) : customGlobalAll;
    const filterDm = t ? dmChAll.filter(matches) : dmChAll;

    let sectionProjectsUnread = 0;
    let sectionProjectsMessages = 0;
    filterBundles.forEach((b) => {
      b.channels.forEach((c) => {
        sectionProjectsUnread += c.unread_count ?? 0;
        sectionProjectsMessages += c.message_count ?? 0;
      });
    });
    filterOrphans.forEach((c) => {
      sectionProjectsUnread += c.unread_count ?? 0;
      sectionProjectsMessages += c.message_count ?? 0;
    });
    filterOrphanCustom.forEach((c) => {
      sectionProjectsUnread += c.unread_count ?? 0;
      sectionProjectsMessages += c.message_count ?? 0;
    });

    let sectionCustomUnread = 0;
    let sectionCustomMessages = 0;
    filterCustom.forEach((c) => {
      sectionCustomUnread += c.unread_count ?? 0;
      sectionCustomMessages += c.message_count ?? 0;
    });

    let sectionDmUnread = 0;
    let sectionDmMessages = 0;
    filterDm.forEach((c) => {
      sectionDmUnread += c.unread_count ?? 0;
      sectionDmMessages += c.message_count ?? 0;
    });

    return {
      projectBundles: filterBundles,
      orphanProjectChannels: filterOrphans,
      orphanCustomChannels: filterOrphanCustom,
      customCh: filterCustom,
      dmCh: filterDm,
      sectionProjectsUnread,
      sectionProjectsMessages,
      sectionCustomUnread,
      sectionCustomMessages,
      sectionDmUnread,
      sectionDmMessages,
    };
  }, [channels, projectsList, q]);

  const Row = ({ c, nested }: { c: ChatChannel; nested?: boolean }) => {
    const peerId =
      c.type === 'dm' && c.members?.length
        ? c.members.find((mid) => mid !== currentUserId) ?? null
        : null;
    const dmPeerOnline = peerId ? onlineUserIds.has(peerId) : false;
    const label =
      nested && c.type === 'project' ? channelDisplayName(c) : c.name;
    const unread = c.unread_count ?? 0;
    const total = c.message_count ?? 0;
    const hasNew = unread > 0 && selectedId !== c.id;
    return (
      <button
        type="button"
        key={c.id}
        onClick={() => onSelect(c.id)}
        title={hasNew ? `${unread} mensaje(s) nuevo(s)` : total ? `${formatCount(total)} mensajes` : undefined}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 min-w-0 ${
          nested ? 'pl-2' : ''
        } ${
          selectedId === c.id
            ? 'bg-indigo-100 text-indigo-900 font-medium ring-1 ring-indigo-200'
            : hasNew
              ? 'text-gray-800 bg-emerald-50/70 border-l-[3px] border-emerald-500 hover:bg-emerald-50'
              : 'text-gray-700 hover:bg-gray-100 border-l-[3px] border-transparent'
        }`}
      >
        {hasNew && (
          <span
            className="w-2 h-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] animate-pulse"
            aria-hidden
          />
        )}
        {!hasNew && <span className="w-2 shrink-0" aria-hidden />}
        {c.type === 'project' && !nested && <FolderOpen className="w-4 h-4 shrink-0 text-amber-600" />}
        {c.type === 'project' && nested && <Hash className="w-4 h-4 shrink-0 text-amber-700/80" />}
        {c.type === 'custom' && nested && <Hash className="w-4 h-4 shrink-0 text-violet-600" />}
        {c.type === 'custom' && !nested && <Hash className="w-4 h-4 shrink-0 text-gray-500" />}
        {c.type === 'dm' && <Lock className="w-4 h-4 shrink-0 text-emerald-600" />}
        {c.type === 'dm' && <OnlineStatus isOnline={!!dmPeerOnline} className="mr-0.5" />}
        <span className={`truncate flex-1 min-w-0 ${hasNew ? 'font-medium' : ''}`}>{label}</span>
        {total > 0 && (
          <span className="shrink-0 text-[10px] text-gray-400 tabular-nums" title="Mensajes en el canal">
            {formatCount(total)}
          </span>
        )}
        {unread > 0 && (
          <span className="shrink-0 text-[10px] font-semibold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center tabular-nums">
            {unread > 99 ? '99+' : unread}
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
    sectionUnread = 0,
    sectionMessages = 0,
  }: {
    title: string;
    keyId: 'projects' | 'custom' | 'dm';
    items: ChatChannel[];
    icon: React.ElementType;
    children?: React.ReactNode;
    sectionUnread?: number;
    sectionMessages?: number;
  }) => {
    const hasSectionNew = sectionUnread > 0;
    return (
      <div className="mb-2">
        <button
          type="button"
          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 min-w-0"
          onClick={() => setSectionCollapsed((s) => ({ ...s, [keyId]: !s[keyId] }))}
        >
          {hasSectionNew && (
            <span
              className="w-1.5 h-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse"
              title="Hay mensajes nuevos en esta sección"
              aria-hidden
            />
          )}
          {!hasSectionNew && <span className="w-1.5 shrink-0" aria-hidden />}
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left truncate">{title}</span>
          <span className="flex items-center gap-1 shrink-0 normal-case font-normal">
            {sectionMessages > 0 && (
              <span
                className="text-[10px] text-gray-400 tabular-nums"
                title="Mensajes en esta sección"
              >
                {formatCount(sectionMessages)}
              </span>
            )}
            {sectionUnread > 0 && (
              <span className="text-[10px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full min-w-[1.1rem] text-center tabular-nums">
                {sectionUnread > 99 ? '99+' : sectionUnread}
              </span>
            )}
          </span>
          <span className="shrink-0 w-3 text-center">{sectionCollapsed[keyId] ? '+' : '−'}</span>
        </button>
        {!sectionCollapsed[keyId] && (children ?? <div className="space-y-0.5 pl-1">{items.map((c) => Row({ c }))}</div>)}
      </div>
    );
  };

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
        <Section
          title="Proyectos"
          keyId="projects"
          items={[]}
          icon={FolderOpen}
          sectionUnread={sectionProjectsUnread}
          sectionMessages={sectionProjectsMessages}
        >
          <div className="space-y-1 pl-1">
            {projectBundles.map((bundle) => {
              const unread = sumUnread(bundle.channels);
              const msgTotal = sumMessages(bundle.channels);
              const open = isProjectOpen(bundle.id);
              const folderNew = unread > 0;
              return (
                <div key={bundle.id} className="rounded-lg">
                  <div className="flex items-center gap-0.5 min-w-0 group/proj">
                    <button
                      type="button"
                      className={`flex items-center gap-1 flex-1 min-w-0 px-2 py-2 text-sm font-medium rounded-lg text-left ${
                        folderNew
                          ? 'text-gray-900 bg-emerald-50/50 border-l-[3px] border-emerald-500'
                          : 'text-gray-800 hover:bg-gray-50 border-l-[3px] border-transparent'
                      }`}
                      onClick={() => toggleProject(bundle.id)}
                      title={folderNew ? `${unread} nuevo(s) en este proyecto` : msgTotal ? `${formatCount(msgTotal)} mensajes` : undefined}
                    >
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                        aria-hidden
                      />
                      {folderNew && (
                        <span
                          className="w-1.5 h-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse"
                          aria-hidden
                        />
                      )}
                      {!folderNew && <span className="w-1.5 shrink-0" aria-hidden />}
                      <FolderOpen className="w-4 h-4 shrink-0 text-amber-600" />
                      <span className="truncate flex-1 min-w-0">{bundle.name}</span>
                      {msgTotal > 0 && (
                        <span className="shrink-0 text-[10px] text-gray-400 tabular-nums font-normal">
                          {formatCount(msgTotal)}
                        </span>
                      )}
                      {unread > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center tabular-nums">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      title="Canal en este proyecto"
                      className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 shrink-0 opacity-100 md:opacity-0 md:group-hover/proj:opacity-100 focus:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateChannelInProject(bundle.id);
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
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
            {(orphanProjectChannels.length > 0 || orphanCustomChannels.length > 0) && (
              <div className="pt-1">
                <p className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Sin agrupar
                </p>
                <div className="space-y-0.5 border-l border-dashed border-gray-200 ml-2 pl-2">
                  {orphanProjectChannels.map((c) => (
                    <Row key={c.id} c={c} nested />
                  ))}
                  {orphanCustomChannels.map((c) => (
                    <Row key={c.id} c={c} nested />
                  ))}
                </div>
              </div>
            )}
            {projectBundles.length === 0 &&
              orphanProjectChannels.length === 0 &&
              orphanCustomChannels.length === 0 && (
              <p className="text-sm text-gray-500 px-2 py-2">Ningún canal de proyecto</p>
            )}
          </div>
        </Section>
        <Section
          title="Canales globales"
          keyId="custom"
          items={customCh}
          icon={Hash}
          sectionUnread={sectionCustomUnread}
          sectionMessages={sectionCustomMessages}
        />
        <Section
          title="Mensajes directos"
          keyId="dm"
          items={dmCh}
          icon={Lock}
          sectionUnread={sectionDmUnread}
          sectionMessages={sectionDmMessages}
        />
        {!channels.length && <p className="text-sm text-gray-500 px-3 py-4 text-center">Sin canales</p>}
      </nav>
    </aside>
  );
}
