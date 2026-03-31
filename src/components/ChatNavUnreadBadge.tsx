import { useChatUnread } from '../contexts/ChatUnreadContext';

/** Badge compacto para el enlace Chat en sidebars (admin y usuario). */
export function ChatNavUnreadBadge() {
  const { totalUnread } = useChatUnread();
  if (totalUnread <= 0) return null;
  const label = totalUnread > 99 ? '99+' : String(totalUnread);
  return (
    <span
      className="ml-auto min-w-[1.25rem] shrink-0 rounded-full bg-indigo-500 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-white"
      aria-label={`${totalUnread} mensajes sin leer en el chat`}
    >
      {label}
    </span>
  );
}
