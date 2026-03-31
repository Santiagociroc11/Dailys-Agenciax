const LS_BANNER = 'dailys:chat-notif-banner';

/** Usuario pulsó "Más tarde": no volver a mostrar el aviso inicial. */
export function getChatNotifBannerDeferred(): boolean {
  try {
    return localStorage.getItem(LS_BANNER) === 'later';
  } catch {
    return false;
  }
}

export function setChatNotifBannerDeferred(): void {
  try {
    localStorage.setItem(LS_BANNER, 'later');
  } catch {
    /* ignore */
  }
}

/** Ya configuró notificaciones: ocultar el bloque promocional. */
export function getChatNotifBannerDone(): boolean {
  try {
    return localStorage.getItem(LS_BANNER) === 'done';
  } catch {
    return false;
  }
}

export function setChatNotifBannerDone(): void {
  try {
    localStorage.setItem(LS_BANNER, 'done');
  } catch {
    /* ignore */
  }
}

export function clearChatNotifBannerPreference(): void {
  try {
    localStorage.removeItem(LS_BANNER);
  } catch {
    /* ignore */
  }
}
