/** Evento para actualizar de inmediato el contador en la pestaña y en la navegación */
export const CHAT_UNREAD_TITLE_REFRESH = 'dailys:chat-unread-title-refresh';

export interface ChatUnreadRefreshDetail {
  /** Si viene definido, los oyentes pueden actualizar sin volver a pedir /channels */
  totalUnread?: number;
}

export function notifyChatUnreadTitleRefresh(detail?: ChatUnreadRefreshDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_UNREAD_TITLE_REFRESH, { detail: detail ?? {} }));
  }
}
