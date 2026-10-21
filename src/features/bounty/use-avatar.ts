// Lazy profile photos for people who appear in bounty lists (leaderboard rows only say `hasAvatar`;
// the photo itself is fetched per person from GET /users/:id/avatar or /whitelist/:id/avatar, the
// same endpoints the website's <Avatar> uses). Kept in a module-level cache rather than TanStack
// Query on purpose: photos are base64 data URLs and the query cache is persisted to disk.

import { useEffect, useState } from 'react';

import { api, isApiError } from '@/api/client';

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function load(source: string, id: string) {
  const key = `${source}:${id}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    p = api
      .get<{ avatar?: string }>(`/${source}/${encodeURIComponent(id)}/avatar`)
      .then((r) => {
        const a = isApiError(r) ? '' : r.avatar || '';
        cache.set(key, a);
        return a;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

export function useLazyAvatar(source: string | undefined, id: string | undefined, enabled = true): string | null {
  const src = source === 'whitelist' ? 'whitelist' : 'users';
  const key = enabled && id ? `${src}:${id}` : null;
  // Remember which person the loaded photo belongs to, so a recycled row never shows someone else's.
  const [loaded, setLoaded] = useState<{ key: string; avatar: string } | null>(null);
  useEffect(() => {
    if (!key || !id) return;
    let alive = true;
    void load(src, id).then((avatar) => {
      if (alive) setLoaded({ key, avatar });
    });
    return () => {
      alive = false;
    };
  }, [key, src, id]);
  return key && loaded?.key === key ? loaded.avatar || null : null;
}
