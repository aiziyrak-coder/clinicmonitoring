import { create } from 'zustand';

import { apiUrl } from './lib/api';

type AuthState = {
  checked: boolean;
  authenticated: boolean;
  username: string | null;
  clinicName: string | null;
  csrfToken: string;
  checkSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  checked: false,
  authenticated: false,
  username: null,
  clinicName: null,
  csrfToken: '',

  checkSession: async () => {
    const r = await fetch(apiUrl('/api/auth/session/'), { credentials: 'include' });
    const d = (await r.json()) as {
      authenticated?: boolean;
      username?: string;
      csrfToken?: string;
      clinic?: { name?: string };
    };
    set({
      checked: true,
      authenticated: Boolean(d.authenticated),
      username: d.username ?? null,
      clinicName: d.clinic?.name ?? null,
      csrfToken: d.csrfToken ?? '',
    });
  },

  login: async (username, password) => {
    await get().checkSession();
    const csrf = get().csrfToken;
    const r = await fetch(apiUrl('/api/auth/login/'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrf,
      },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { detail?: string };
      return { ok: false, error: err.detail ?? 'Kirish rad etildi.' };
    }
    const d = (await r.json()) as { username?: string; clinic?: { name?: string } };
    set({
      authenticated: true,
      username: d.username ?? null,
      clinicName: d.clinic?.name ?? null,
    });
    await get().checkSession();
    return { ok: true };
  },

  logout: async () => {
    const csrf = get().csrfToken;
    await fetch(apiUrl('/api/auth/logout/'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrf,
      },
    });
    set({ authenticated: false, username: null, clinicName: null });
    await get().checkSession();
  },
}));

/** Barcha API so'rovlarida cookie + POST uchun CSRF. */
export function apiHeaders(method: string, csrf: string, extra?: HeadersInit): HeadersInit {
  const m = method.toUpperCase();
  const h: Record<string, string> = {};
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => {
      h[k] = v;
    });
  }
  if (m !== 'GET' && m !== 'HEAD' && csrf) {
    h['X-CSRFToken'] = csrf;
  }
  return h;
}

/** Session cookie + CSRF (DRF SessionAuthentication). */
export function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const csrf = useAuthStore.getState().csrfToken;
  const m = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (m !== 'GET' && m !== 'HEAD' && csrf) {
    headers.set('X-CSRFToken', csrf);
  }
  return fetch(apiUrl(path), { ...init, credentials: 'include', headers });
}
