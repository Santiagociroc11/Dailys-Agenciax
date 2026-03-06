import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const VERSION_CHECK_INTERVAL = 30 * 1000; // 30 segundos (antes 60)
const VERSION_CHECK_INITIAL_DELAY = 3 * 1000; // 3 segundos tras cargar (antes 10)
const VERSION_DISMISS_REMIND_AFTER = 5 * 60 * 1000; // Re-mostrar toast tras 5 min si eligió "Más tarde"
const VERSION_SHOW_COOLDOWN = 2 * 60 * 1000; // No mostrar de nuevo en 2 min (evitar bucles por bugs)
const VERSION_MAX_SHOWS_PER_SESSION = 3; // Máximo recordatorios por sesión (evitar spam infinito)
const VERSION_CHECK_KEY = 'dailys_version_update_dismissed';
const VERSION_SHOW_COUNT_KEY = 'dailys_version_show_count';

export default function VersionUpdateChecker() {
  const toastIdRef = useRef<string | number | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastShowAtRef = useRef<number>(0);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const currentBuildTimestamp = __BUILD_TIMESTAMP__;

    async function checkForUpdate() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverTs = Number(data?.timestamp);
        const currentTs = Number(currentBuildTimestamp);
        if (!serverTs || !currentTs) return;
        // Solo mostrar cuando el servidor tiene una versión MÁS NUEVA (timestamp mayor)
        if (serverTs > currentTs) {
          const dismissedAt = sessionStorage.getItem(VERSION_CHECK_KEY);
          if (dismissedAt) {
            const elapsed = Date.now() - Number(dismissedAt);
            if (elapsed < VERSION_DISMISS_REMIND_AFTER) return; // No molestar hasta pasados 5 min
          }
          // Evitar bucles: si ya mostramos hace menos de 2 min, no repetir
          if (Date.now() - lastShowAtRef.current < VERSION_SHOW_COOLDOWN) return;
          // Evitar spam infinito: máximo N veces por sesión
          const count = parseInt(sessionStorage.getItem(VERSION_SHOW_COUNT_KEY) || '0', 10);
          if (count >= VERSION_MAX_SHOWS_PER_SESSION) return;
          showUpdateToast();
        }
      } catch {
        // Ignorar errores de red
      }
    }

    function showUpdateToast() {
      if (toastIdRef.current) return;
      lastShowAtRef.current = Date.now();
      toastIdRef.current = toast(
        (t) => (
          <div className="flex flex-col gap-3">
            <p className="font-medium text-gray-900">Nueva versión disponible</p>
            <p className="text-sm text-gray-600">
              Hay una actualización de la aplicación. Haz clic en Actualizar para cargar la nueva versión.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  sessionStorage.removeItem(VERSION_CHECK_KEY);
                  sessionStorage.removeItem(VERSION_SHOW_COUNT_KEY);
                  toast.dismiss(t);
                  toastIdRef.current = null;
                  if ('caches' in window) {
                    caches.keys().then((keys) =>
                      Promise.all(keys.map((k) => caches.delete(k)))
                    ).then(() => {
                      window.location.reload();
                    });
                  } else {
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Actualizar
              </button>
              <button
                onClick={() => {
                  sessionStorage.setItem(VERSION_CHECK_KEY, String(Date.now()));
                  const count = parseInt(sessionStorage.getItem(VERSION_SHOW_COUNT_KEY) || '0', 10);
                  sessionStorage.setItem(VERSION_SHOW_COUNT_KEY, String(count + 1));
                  toast.dismiss(t);
                  toastIdRef.current = null;
                }}
                className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors"
              >
                Más tarde
              </button>
            </div>
          </div>
        ),
        {
          duration: Infinity,
          id: 'version-update',
        }
      );
    }

    // Primera verificación tras 3 segundos (dar tiempo a que cargue la app)
    const initialTimeout = setTimeout(checkForUpdate, VERSION_CHECK_INITIAL_DELAY);

    // Verificaciones periódicas cada 30 segundos
    checkIntervalRef.current = setInterval(checkForUpdate, VERSION_CHECK_INTERVAL);

    // Verificar al volver a la pestaña (usuario regresa después de un tiempo)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimeout(initialTimeout);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
