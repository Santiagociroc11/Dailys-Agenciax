/** Evento para actualizar de inmediato el contador en la pestaña del navegador */
export const CHAT_UNREAD_TITLE_REFRESH = 'dailys:chat-unread-title-refresh';

export function notifyChatUnreadTitleRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHAT_UNREAD_TITLE_REFRESH));
  }
}
