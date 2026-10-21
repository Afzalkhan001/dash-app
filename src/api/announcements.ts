// Announcements (server.js ~L8820-9120). The list never carries file bytes — each image, banner and
// celebration photo is fetched on its own, as JSON holding a data URL:
//
//   GET /announcements              → rows (ANNOUNCEMENT_LIST_FIELDS ~L8820), my company only, TV-only
//                                     uploads already removed. Today's birthday / work-anniversary
//                                     rows also carry their `photo` inline.
//   GET /announcements/:id/media    → { fileData, fileName }   image / video / excel / ppt / pop-up art
//   GET /announcements/:id/banner   → { homeBannerImage, homeBannerImageName }   Home banner artwork
//   GET /announcements/:id/photo    → { photo }   a celebration card's CURRENT photo of the employee
//
// Who sees what is decided in the page, exactly as on the web (dash.html announcementVisible
// ~L17812): published (not scheduled for later, not past expiry), branch matches mine, and the
// auto-posted birthday / anniversary cards only while HR has that auto-schedule switched on.
// Pop-ups never appear in the feed. Creating and managing announcements stays on the website.

import { useQuery } from '@tanstack/react-query';

import { api, isApiError, unwrap } from '@/api/client';
import { type Tenant, useMyProfile, useMyTenant } from '@/api/me';
import { createBlobCache, useLazyBlob } from '@/api/people';
import { useSession } from '@/auth/session';

export type AnnouncementType = 'text' | 'link' | 'image' | 'video' | 'excel' | 'ppt' | 'birthday' | 'anniversary';

export type Announcement = {
  id: string;
  title?: string;
  body?: string;
  type?: AnnouncementType | string;
  linkUrl?: string;
  ctaText?: string;
  branches?: string[];
  expiresAt?: string | null; // YYYY-MM-DD, visible until the end of that day
  scheduledAt?: string | null; // ISO; not published before then
  createdBy?: string;
  createdByRole?: string;
  createdAt?: string;
  tenantId?: string;
  hasMedia?: boolean;
  fileName?: string;
  hasHomeBanner?: boolean;
  kind?: string; // 'popup' | 'announcement'
  popupFrequency?: string;
  targetName?: string;
  years?: number;
  targetEmployeeId?: string;
  autoKind?: string;
  jobTitle?: string;
  department?: string;
  fullBleed?: boolean;
  hasPhoto?: boolean;
};

// ── Lazy files (kept out of the persisted query cache) ──────────────────────

const fetchJson = async <T,>(path: string): Promise<T> => {
  const r = await api.get<T>(path);
  if (isApiError(r)) throw new Error(r.error);
  return r;
};

export const annMediaCache = createBlobCache(
  async (id) => (await fetchJson<{ fileData?: string }>(`/announcements/${encodeURIComponent(id)}/media`)).fileData || '',
  6,
);
export const annBannerCache = createBlobCache(
  async (id) => (await fetchJson<{ homeBannerImage?: string }>(`/announcements/${encodeURIComponent(id)}/banner`)).homeBannerImage || '',
  8,
);
export const annPhotoCache = createBlobCache(
  async (id) => (await fetchJson<{ photo?: string }>(`/announcements/${encodeURIComponent(id)}/photo`)).photo || '',
  40,
);

export const useAnnouncementMedia = (a: Announcement | null | undefined, enabled = true) =>
  useLazyBlob(annMediaCache, a?.hasMedia ? a.id : null, enabled && !!a?.hasMedia);

export const useAnnouncementBanner = (a: Announcement | null | undefined, enabled = true) =>
  useLazyBlob(annBannerCache, a?.hasHomeBanner ? a.id : null, enabled && !!a?.hasHomeBanner);

export const useCelebrationPhoto = (a: Announcement | null | undefined, enabled = true) =>
  useLazyBlob(annPhotoCache, a && isCelebration(a) ? a.id : null, enabled && !!a?.hasPhoto);

// ── List ─────────────────────────────────────────────────────────────────────

export function useAnnouncements() {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['announcements', 'list', userId],
    enabled: !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<(Announcement & { photo?: string })[]>('/announcements', signal));
      const rows = Array.isArray(r) ? r : [];
      // Today's celebration photos arrive inline. They go to the in-memory cache, not the query cache.
      return rows
        .filter((a) => a && a.id)
        .map(({ photo, ...a }) => {
          if (typeof photo === 'string' && photo) annPhotoCache.set(a.id, photo);
          return { ...a, hasPhoto: !!a.hasPhoto || !!photo } as Announcement;
        });
    },
    staleTime: 60_000,
  });
}

// ── Visibility (dash.html ~L17805-17833) ─────────────────────────────────────

export const isCelebration = (a: Announcement) => a.type === 'birthday' || a.type === 'anniversary';
export const annIsPopup = (a: Announcement) => a.kind === 'popup';

// Both compared on the phone's own clock, as the web compares on the browser's.
export function announcementExpired(a: Announcement) {
  if (!a.expiresAt) return false;
  return new Date(`${a.expiresAt}T23:59:59`) < new Date();
}
export function announcementScheduledFuture(a: Announcement) {
  return !!a.scheduledAt && new Date(a.scheduledAt) > new Date();
}

export function announcementVisible(a: Announcement, userLocation: string, tenant: Tenant | null | undefined) {
  if (announcementExpired(a) || announcementScheduledFuture(a)) return false;
  if (a.type === 'birthday' && !tenant?.birthdayAutoOn) return false;
  if (a.type === 'anniversary' && !tenant?.anniversaryAutoOn) return false;
  if (userLocation === 'ALL_BRANCHES') return true;
  const branches = a.branches && a.branches.length ? a.branches : ['all'];
  if (branches.includes('all')) return true;
  if (!userLocation) return false;
  return branches.some((b) => String(b).toLowerCase() === String(userLocation).toLowerCase());
}

const newestFirst = (a: Announcement, b: Announcement) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

// What this person sees: the feed (no pop-ups, newest first) and the Home-banner subset.
export function useVisibleAnnouncements() {
  const q = useAnnouncements();
  const profile = useMyProfile();
  const tenant = useMyTenant();
  const sessionLocation = useSession((s) => (typeof s.user?.location === 'string' ? s.user.location : ''));
  const location = (typeof profile.data?.location === 'string' ? profile.data.location : '') || sessionLocation || '';
  const live = (q.data ?? []).filter((a) => announcementVisible(a, location, tenant.data)).sort(newestFirst);
  const feed = live.filter((a) => !annIsPopup(a));
  return {
    ...q,
    feed,
    banners: feed.filter((a) => a.hasHomeBanner),
    refetch: () => Promise.all([q.refetch(), tenant.refetch()]),
  };
}

// ── Display helpers ──────────────────────────────────────────────────────────

export const ANN_TYPE_LABEL: Record<string, string> = {
  text: 'Update',
  link: 'Link',
  image: 'Image',
  video: 'Video',
  excel: 'Spreadsheet',
  ppt: 'Presentation',
  birthday: 'Birthday',
  anniversary: 'Work anniversary',
};

// The web's default wishes when a card has no message of its own (birthdayCardMsg ~L17975,
// anniversaryCardMsg ~L18274).
export const BIRTHDAY_WISH = 'Wishing you a fantastic year ahead, filled with joy, health, and success!';
export const ANNIVERSARY_WISH = 'Thank you for your dedication, hard work, and the amazing impact you continue to make.';

// A link typed without a scheme opens as https, like the web's pop-up does; anything that is not
// http(s) is not opened at all.
export function safeLink(raw?: string | null) {
  const link = String(raw || '').trim();
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(link) || /^(javascript|data|vbscript|file|about|blob):/i.test(link)) return null;
  return `https://${link.replace(/^\/+/, '')}`;
}
