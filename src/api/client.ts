// The one place the app talks to the DASH API. Behaviour deliberately mirrors the web client
// (dash.html apiFetch/apiGet/apiPost, ~line 30042) so both clients treat the server the same way:
//   - auth is `Authorization: Bearer <token>` only (the server has no cookies),
//   - per-route timeouts match the web's (12s default, 30s audit/bounty, 20s WhatsApp send-otp),
//   - requests never throw: every call resolves to the parsed JSON, or to `{ error }`,
//   - a 401 with code 'auth_required' means the session is gone, so we sign out once.
// Caching/de-duplication is left to TanStack Query rather than re-implemented here.

import { API_URL } from '@/config';
import { isDemoToken } from '@/demo/config';
import { demoFetch } from '@/demo/server';

export type ApiError = { error: string; status?: number; code?: string };
export type ApiResult<T> = T | ApiError;

export const isApiError = (r: unknown): r is ApiError =>
  !!r && typeof r === 'object' && typeof (r as ApiError).error === 'string';

type AuthBridge = {
  getToken: () => string | null;
  getActorId: () => string | null; // staff user id for withActor(); null for vendors
  onSignedOut: () => void;
};

let bridge: AuthBridge = { getToken: () => null, getActorId: () => null, onSignedOut: () => {} };

// The session store registers itself here, which keeps this module free of a store import cycle.
export function setAuthBridge(b: AuthBridge) {
  bridge = b;
}

function timeoutFor(path: string) {
  if (path.startsWith('/audit_log') || path.startsWith('/bounty')) return 30000;
  if (path.startsWith('/auth/phone/send-otp')) return 20000;
  return 12000;
}

let signedOutHandled = false;
export function resetSignedOutGuard() {
  signedOutHandled = false;
}

type FetchOpts = { method?: string; body?: unknown; timeoutMs?: number; signal?: AbortSignal };

// True while the in-app demo account (8328617610 / 123456; dev and preview builds, never store
// builds) is signed in — as any of its roles (every demo token starts with 'demo-', see demo/config.ts).
export const isDemoSession = () => isDemoToken(bridge.getToken());

export async function apiFetch<T = any>(path: string, opts: FetchOpts = {}): Promise<ApiResult<T>> {
  const method = (opts.method || 'GET').toUpperCase();
  // The demo account never talks to DASH: its requests are answered on the phone (demo/server.ts).
  // The token tells the demo which role is asking (demo/personas.ts).
  if (isDemoSession()) return demoFetch(method, path, opts.body, bridge.getToken());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? timeoutFor(path));
  // Let a caller (e.g. TanStack Query unmounting a screen) cancel the request too.
  opts.signal?.addEventListener('abort', () => controller.abort());

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = bridge.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(API_URL + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: `Server error ${res.status}: unexpected response` };
    }
    if (!res.ok && data && typeof data === 'object' && !Array.isArray(data)) {
      if (!data.error) data.error = `Server error (${res.status})`;
      data.status = res.status;
    }
    if (res.status === 401 && data?.code === 'auth_required' && !signedOutHandled && token) {
      signedOutHandled = true;
      bridge.onSignedOut();
    }
    return data;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { error: 'Request timed out — the server took too long to respond.' };
    }
    return { error: 'Cannot reach DASH. Check your internet connection and try again.' };
  } finally {
    clearTimeout(timer);
  }
}

// Same as the web's withActor(): attach the signed-in user's id as performedById when the caller
// didn't set an actor. The server overwrites it with the real session user anyway; this only keeps
// request bodies identical to the website's.
function withActor(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const b = { ...(body as Record<string, unknown>) };
  const actor = bridge.getActorId();
  if (actor && b.performedById === undefined && b.actorId === undefined) b.performedById = actor;
  return b;
}

export const api = {
  get: <T = any>(path: string, signal?: AbortSignal) => apiFetch<T>(path, { signal }),
  post: <T = any>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body: withActor(body ?? {}) }),
  put: <T = any>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body: withActor(body ?? {}) }),
  del: <T = any>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

// For TanStack Query: turn `{ error }` into a thrown Error so queries get a proper error state.
export class ApiRequestError extends Error {
  status?: number;
  code?: string;
  constructor(e: ApiError) {
    super(e.error);
    this.status = e.status;
    this.code = e.code;
  }
}

export async function unwrap<T>(p: Promise<ApiResult<T>>): Promise<T> {
  const r = await p;
  if (isApiError(r)) throw new ApiRequestError(r);
  return r;
}

// Headers for things fetched outside apiFetch (expo-image sources, file downloads).
export function authHeaders(): Record<string, string> {
  const token = bridge.getToken();
  return token && !isDemoToken(token) ? { Authorization: `Bearer ${token}` } : {};
}
