// Words and option lists for the News studio and the office TVs, copied from dash.html so the phone
// and the website say the same thing: ANN_POPUP_FREQ (:17844), ANN_CTA_PRESETS (:18888), the TV
// priority select (:19190), TV_INACTIVITY_OPTS / TV_OFFLINE_OPTS / TV_SHOW_OPTS / TV_PLATFORM_LABEL /
// TV_COMMANDS (:2850-2860). Render-pure: every "now" comes from the caller.

import type { Announcement } from '@/api/announcements';
import { announcementExpired, announcementScheduledFuture } from '@/api/announcements';
import type { NewsPriority, NewsType, PopupFrequency, TvCommand, TvDevice, TvPlaylist } from '@/api/newsroom';
import type { StatusTone } from '@/theme/tokens';

export const CTA_PRESETS = ['Explore Now', 'Watch Now', 'Apply Now', 'Learn More', 'Download Now', 'View Details'];

export const POPUP_FREQ: { value: PopupFrequency; label: string; hint: string }[] = [
  { value: 'once', label: 'Once only', hint: 'Once someone closes it, they will not see it again.' },
  { value: 'daily', label: 'Once a day', hint: 'Closing it hides it for the rest of the day; it returns tomorrow.' },
  {
    value: 'always',
    label: 'Every time they open DASH',
    hint: 'Shown every time someone opens DASH until it expires. Use sparingly — people can’t dismiss it for good.',
  },
];
export const popupFreqLabel = (v?: string | null) => POPUP_FREQ.find((f) => f.value === v)?.label ?? 'Once only';

export const NEWS_TYPES: { value: NewsType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'link', label: 'Link' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'excel', label: 'Spreadsheet' },
  { value: 'ppt', label: 'Slides' },
];
export const newsTypeLabel = (v?: string | null) => NEWS_TYPES.find((t) => t.value === v)?.label ?? 'Text';

/** What the file picker accepts for each type (the website's `accept`). */
export const FILE_TYPES: Record<'video' | 'excel' | 'ppt', string[]> = {
  video: ['video/*'],
  excel: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/comma-separated-values',
  ],
  ppt: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
};

export const PRIORITIES: { value: NewsPriority; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: 'Only affects office TVs.' },
  { value: 'high', label: 'High', hint: 'Shown first on office TVs.' },
  { value: 'low', label: 'Low', hint: 'Shown last on office TVs.' },
  { value: 'emergency', label: 'Emergency', hint: 'Interrupts every TV in these branches at once, until it expires or is deleted.' },
];
export const priorityLabel = (v?: string | null) => PRIORITIES.find((p) => p.value === v)?.label ?? 'Normal';

/** announcementStatus (dash.html:17807). */
export function postStatus(a: Announcement): { label: string; tone: StatusTone } {
  if (announcementExpired(a)) return { label: 'Expired', tone: 'failed' };
  if (announcementScheduledFuture(a)) return { label: 'Scheduled', tone: 'pending' };
  return { label: 'Published', tone: 'done' };
}

export const isPopup = (a: Pick<Announcement, 'kind'> | null | undefined) => a?.kind === 'popup';

export function branchesLabel(list?: string[] | null) {
  const b = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!b.length || b.includes('all')) return 'All branches';
  return b.join(', ');
}

// ── Office TVs ───────────────────────────────────────────────────────────────

export const TV_INACTIVITY: { value: string; label: string }[] = [
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '0', label: 'Never' },
];

export const TV_OFFLINE: { value: string; label: string }[] = [
  { value: '60', label: '1 minute' },
  { value: '180', label: '3 minutes' },
  { value: '300', label: '5 minutes' },
  { value: '600', label: '10 minutes' },
  { value: '900', label: '15 minutes' },
];

export const TV_SHOW_FOR: { value: string; label: string }[] = [
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '300', label: '5 minutes' },
  { value: '900', label: '15 minutes' },
  { value: '3600', label: '1 hour' },
];

const TV_PLATFORM: Record<string, string> = { 'android-tv': 'Android / Google TV', tizen: 'Samsung Tizen', webos: 'LG webOS', web: 'Web browser' };
export const tvPlatformLabel = (d: TvDevice) => (d.platform ? (TV_PLATFORM[d.platform] ?? d.platform) : 'Unknown');

export const TV_REMOTE: { command: Exclude<TvCommand, 'SHOW_ANNOUNCEMENT'>; label: string; hint: string }[] = [
  { command: 'SYNC', label: 'Sync now', hint: 'Fetches the latest posts' },
  { command: 'REFRESH', label: 'Refresh', hint: 'Redraws the screen' },
  { command: 'RELOAD', label: 'Reload app', hint: 'Restarts the TV app' },
  { command: 'CLEAR_CACHE', label: 'Clear cache', hint: 'Downloads every file again' },
  { command: 'RETURN_TO_PLAYLIST', label: 'Back to playlist', hint: 'Stops what was sent and returns to the playlist' },
];

export const tvOnline = (d: TvDevice) => d.status === 'online';

export function playlistName(d: TvDevice, playlists: TvPlaylist[]) {
  const id = d.config?.playlistId;
  if (!id) return 'All published posts';
  return playlists.find((p) => p.id === id)?.name ?? 'A playlist';
}

/** tvAgo (dash.html): 'just now', '5 minutes ago', '3 hours ago', '2 days ago', 'never'. */
export function agoLabel(iso: string | null | undefined, now: number) {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 15) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Posts a TV can show (tvUsableAnns dash.html:2862): not a pop-up, not expired. */
export const tvUsablePosts = (list: Announcement[]) => (list ?? []).filter((a) => a && a.id && !isPopup(a) && !announcementExpired(a));

/** The type as the studio names it ("Text", "Image", … and the auto-posted "Birthday"). */
export function postTypeLabel(a: Pick<Announcement, 'type'>) {
  if (a.type === 'birthday') return 'Birthday';
  if (a.type === 'anniversary') return 'Work anniversary';
  return newsTypeLabel(a.type);
}
