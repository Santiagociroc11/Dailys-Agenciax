import { apiUrl } from './apiBase';

export function chatHeaders(userId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  };
}

export async function chatFetch<T>(
  userId: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...chatHeaders(userId),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let err = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) err = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(err);
  }
  return res.json() as Promise<T>;
}
