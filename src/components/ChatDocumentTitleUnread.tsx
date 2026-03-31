import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChatUnread } from '../contexts/ChatUnreadContext';

const BASE_TITLE = 'Dailys - Agencia X';

function applyTitle(total: number) {
  if (total > 0) {
    const n = total > 99 ? '99+' : String(total);
    document.title = `(${n}) ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
}

/**
 * Sincroniza el título de la pestaña con el total de no leídos (fuente: ChatUnreadProvider).
 */
export function ChatDocumentTitleUnread() {
  const { loading } = useAuth();
  const { totalUnread } = useChatUnread();

  useEffect(() => {
    if (loading) return;
    applyTitle(totalUnread);
  }, [loading, totalUnread]);

  useEffect(() => {
    return () => {
      document.title = BASE_TITLE;
    };
  }, []);

  return null;
}
