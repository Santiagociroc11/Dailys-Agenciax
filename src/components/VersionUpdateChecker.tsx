import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const VERSION_CHECK_INTERVAL = 60 * 1000; // 1 minuto
const VERSION_CHECK_KEY = 'dailys_version_update_dismissed';

export default function VersionUpdateChecker() {
  const toastIdRef = useRef<string | number | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          if (sessionStorage.getItem(VERSION_CHECK_KEY)) return;
          showUpdateToast();
        }
      } catch {
        // Ignorar errores de red
      }
    }

    function showUpdateToast() {
      if (toastIdRef.current) return;
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
                  sessionStorage.setItem(VERSION_CHECK_KEY, '1');
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

    // Primera verificación tras 10 segundos (dar tiempo a que cargue la app)
    const initialTimeout = setTimeout(checkForUpdate, 10_000);

    // Verificaciones periódicas
    checkIntervalRef.current = setInterval(checkForUpdate, VERSION_CHECK_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);

  return null;
}
