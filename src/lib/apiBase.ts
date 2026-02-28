/**
 * URL base para llamadas a la API.
 * Si VITE_API_URL está definido (ej: frontend y backend en hosts distintos), se usa.
 * Si no, se usa '' para peticiones relativas (mismo origen).
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
