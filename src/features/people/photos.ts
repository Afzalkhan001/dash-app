// Photos for a short horizontal row of people (the kit's AvatarTiles takes plain URIs, so the lazy
// per-row hooks — usePersonPhoto, useCelebrationPhoto — can't be called inside its map).
//
// useBlobMap reads a handful of keys from one of the lazy blob caches (api/people createBlobCache),
// fetches the ones that are allowed and not loaded yet (a recent failure is not retried until it is
// stale, exactly as useLazyBlob does), keeps them from being evicted while the row is on screen, and
// re-renders as each one arrives. Keep the list short (a row of tiles, not a whole directory).

import { useEffect, useSyncExternalStore } from 'react';

import { annPhotoCache, type Announcement } from '@/api/announcements';
import { avatarCache, type BlobCache, type DirectoryPerson } from '@/api/people';

type Want = { key: string; fetch: boolean };

// One line per key: "<key>|1" (fetch it) or "<key>|0" (read only, e.g. a photo that came inline).
const encode = (list: Want[]) => list.map((w) => `${w.key}|${w.fetch ? 1 : 0}`).join('\n');
const decode = (s: string): Want[] =>
  s
    ? s.split('\n').map((line) => {
        const at = line.lastIndexOf('|');
        return { key: line.slice(0, at), fetch: line.slice(at + 1) === '1' };
      })
    : [];

/** What the cache holds for each key: the photo (data URL or path), or null while loading / when there is none. */
function mapOf(cache: BlobCache, keys: string[], stamp: string): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!keys.length || !stamp) return out;
  for (const k of keys) out[k] = cache.get(k) || null;
  return out;
}

export function useBlobMap(cache: BlobCache, wants: Want[]): Record<string, string | null> {
  const list = (Array.isArray(wants) ? wants : []).filter((w) => !!w && !!w.key);
  const keys = list.map((w) => w.key);
  const joined = encode(list);
  // A short string that changes whenever one of these keys arrives, so the map is rebuilt then.
  const stamp = useSyncExternalStore(cache.subscribe, () =>
    keys
      .map((k) => {
        const v = cache.get(k);
        return v === undefined ? '-' : String(v.length);
      })
      .join(','),
  );
  useEffect(() => {
    const items = decode(joined);
    const releases = items.map((w) => cache.retain(w.key));
    for (const w of items) {
      if (!w.fetch || cache.get(w.key) !== undefined) continue;
      if (cache.status(w.key) === 'error' && !cache.staleError(w.key)) continue;
      cache.load(w.key).catch(() => {});
    }
    return () => releases.forEach((release) => release());
  }, [cache, joined]);
  return mapOf(cache, keys, stamp);
}

type PhotoPerson = Pick<DirectoryPerson, 'id' | 'hasAvatar' | 'pending'> & { ghost?: boolean };

/** Profile photos for a short list of people (same rule as usePersonPhoto: only rows that say they have one). */
export function usePeoplePhotos(people: (PhotoPerson | null | undefined)[]) {
  const list = (Array.isArray(people) ? people : []).filter((p): p is PhotoPerson => !!p && p.id != null);
  const map = useBlobMap(
    avatarCache,
    list.filter((p) => !p.pending && !p.ghost && !!p.hasAvatar).map((p) => ({ key: String(p.id), fetch: true })),
  );
  return (p: PhotoPerson | null | undefined) => (p ? (map[String(p.id)] ?? null) : null);
}

/** Colleague photos for a short list of birthday / work-anniversary posts (inline ones need no fetch). */
export function useCelebrationPhotos(posts: Announcement[]) {
  const list = (Array.isArray(posts) ? posts : []).filter((a) => !!a && a.id != null);
  const map = useBlobMap(
    annPhotoCache,
    list.map((a) => ({ key: String(a.id), fetch: !!a.hasPhoto })),
  );
  return (a: Announcement) => map[String(a.id)] ?? null;
}
