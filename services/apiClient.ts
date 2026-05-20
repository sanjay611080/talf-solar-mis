
// Base URL of the talf-solar-backend API — configured via the VITE_API_BASE_URL
// environment variable (see .env), with a localhost fallback for development.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

const TOKEN_KEY = 'talf_mis_auth_token';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    console.error('Could not persist auth token', e);
  }
};

export const clearToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Thin fetch wrapper that attaches the JWT and normalizes error handling.
 * Throws an Error with the server's message on any non-2xx response.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(API_BASE + path, { ...options, headers });
  } catch {
    throw new Error('Cannot reach the backend. Is the talf-solar-backend server running on port 4000?');
  }

  if (response.status === 401) {
    clearToken();
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {
      /* response had no JSON body */
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
