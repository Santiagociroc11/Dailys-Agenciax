import React from 'react';
import type { ChatChannel } from '../../types/chat';

interface ChannelHeaderProps {
  channel: ChatChannel | null;
  memberCount: number;
  isConnected: boolean;
}

export function ChannelHeader({ channel, memberCount, isConnected }: ChannelHeaderProps) {
  const connection = (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-gray-500 shrink-0"
      title={isConnected ? 'Conectado en tiempo real' : 'Reconectando…'}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}
        aria-hidden
      />
      <span className="hidden sm:inline">{isConnected ? 'En vivo' : 'Reconectando…'}</span>
    </span>
  );

  if (!channel) {
    return (
      <header className="h-14 border-b border-gray-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] flex items-center justify-between px-4 bg-white shrink-0">
        <span className="text-gray-500 text-sm">Selecciona un canal</span>
        {connection}
      </header>
    );
  }
  return (
    <header className="h-14 border-b border-gray-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] flex items-center justify-between px-4 bg-white shrink-0 gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-gray-900 truncate tracking-tight">{channel.name}</h1>
        {channel.description && <p className="text-xs text-gray-500 truncate mt-0.5">{channel.description}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-500 tabular-nums">
          {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}
        </span>
        {connection}
      </div>
    </header>
  );
}
