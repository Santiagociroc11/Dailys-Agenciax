import React from 'react';

interface TypingIndicatorProps {
  names: string[];
}

export function TypingIndicator({ names }: TypingIndicatorProps) {
  if (!names.length) return null;
  const text =
    names.length === 1
      ? `${names[0]} está escribiendo…`
      : names.length === 2
        ? `${names[0]} y ${names[1]} están escribiendo…`
        : `${names.slice(0, 2).join(', ')} y otros están escribiendo…`;
  return (
    <div className="px-4 py-1 text-xs text-gray-500 italic animate-pulse" aria-live="polite">
      {text}
    </div>
  );
}
