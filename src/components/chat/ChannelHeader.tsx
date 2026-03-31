import React from 'react';
import type { ChatChannel } from '../../types/chat';

interface ChannelHeaderProps {
  channel: ChatChannel | null;
  memberCount: number;
}

export function ChannelHeader({ channel, memberCount }: ChannelHeaderProps) {
  if (!channel) {
    return (
      <header className="h-14 border-b border-gray-200 flex items-center px-4 bg-white shrink-0">
        <span className="text-gray-500 text-sm">Selecciona un canal</span>
      </header>
    );
  }
  return (
    <header className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white shrink-0">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-gray-900 truncate">{channel.name}</h1>
        {channel.description && <p className="text-xs text-gray-500 truncate">{channel.description}</p>}
      </div>
      <span className="text-xs text-gray-500 shrink-0 ml-2">
        {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}
      </span>
    </header>
  );
}
