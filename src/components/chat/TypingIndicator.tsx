import React from 'react';

interface TypingIndicatorProps {
  names: string[];
}

export function TypingIndicator({ names }: TypingIndicatorProps) {
  if (!names.length) return null;
  const text =
    names.length === 1
      ? `${names[0]} está escribiendo`
      : names.length === 2
        ? `${names[0]} y ${names[1]} están escribiendo`
        : `${names.slice(0, 2).join(', ')} y otros están escribiendo`;
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-4 py-1.5 text-xs text-gray-500" aria-live="polite">
      <span className="italic">{text}</span>
      <span className="inline-flex items-end gap-0.5 h-3 pb-0.5" aria-hidden>
        <span className="chat-typing-dot inline-block w-1 h-1 rounded-full bg-gray-400" />
        <span className="chat-typing-dot inline-block w-1 h-1 rounded-full bg-gray-400" />
        <span className="chat-typing-dot inline-block w-1 h-1 rounded-full bg-gray-400" />
      </span>
    </div>
  );
}
