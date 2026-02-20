/**
 * Caché en memoria para app_settings con TTL.
 * Reduce consultas repetidas a la base de datos.
 */

const TTL_MS = 60 * 1000; // 1 minuto

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() > entry.expiresAt;
}

export async function getCachedSetting<T>(
  key: string,
  fetchFn: () => Promise<T | null>
): Promise<T | null> {
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && !isExpired(cached)) {
    return cached.value;
  }

  const value = await fetchFn();
  if (value !== null && value !== undefined) {
    cache.set(key, {
      value,
      expiresAt: Date.now() + TTL_MS,
    });
  }
  return value;
}

/** Invalida la caché para una clave (ej. tras actualizar settings) */
export function invalidateSetting(key: string): void {
  cache.delete(key);
}

/** Invalida toda la caché de app_settings */
export function invalidateAll(): void {
  cache.clear();
}
