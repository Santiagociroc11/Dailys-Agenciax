import React, { useRef, useEffect } from 'react';

const DEFAULT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👀', '🎉'];

interface ReactionPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ onPick, onClose }: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="flex flex-wrap gap-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg ring-1 ring-black/5 z-50 min-w-[200px]"
      role="menu"
    >
      {DEFAULT_EMOJIS.map((em) => (
        <button
          key={em}
          type="button"
          className="text-xl hover:bg-gray-100 rounded p-1 leading-none transition-transform duration-100 hover:scale-110"
          onClick={() => {
            onPick(em);
            onClose();
          }}
        >
          {em}
        </button>
      ))}
    </div>
  );
}
