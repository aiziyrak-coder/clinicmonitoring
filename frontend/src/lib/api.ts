/**
 * API va WebSocket bazaviy URL — devda bo'sh (Vite proxy orqali bir xil origin),
 * productionda VITE_BACKEND_ORIGIN (masalan https://api.example.com).
 */
function normalizeOrigin(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/\/$/, '');
}

export const BACKEND_ORIGIN = normalizeOrigin(
  import.meta.env.VITE_BACKEND_ORIGIN as string | undefined,
);

/** Masalan: apiUrl('/api/infrastructure/') */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!BACKEND_ORIGIN) return p;
  return `${BACKEND_ORIGIN}${p}`;
}

/** Django Channels: /ws/monitoring/ */
export function getWebSocketMonitoringUrl(): string {
  if (BACKEND_ORIGIN) {
    try {
      const u = new URL(BACKEND_ORIGIN);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${u.host}/ws/monitoring/`;
    } catch {
      // fallback
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/monitoring/`;
}
