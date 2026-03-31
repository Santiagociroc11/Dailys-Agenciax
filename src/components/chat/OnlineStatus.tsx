import React from 'react';

interface OnlineStatusProps {
  isOnline: boolean;
  className?: string;
}

export function OnlineStatus({ isOnline, className = '' }: OnlineStatusProps) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-gray-300'} ${className}`}
      title={isOnline ? 'En línea' : 'Desconectado'}
      aria-hidden
    />
  );
}
