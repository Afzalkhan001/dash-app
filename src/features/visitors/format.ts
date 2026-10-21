// Labels and small formatters for the Visitors screens. Status words are the app's plain set
// (Waiting / Approved / Rejected …) for the web's VISIT_STATUS_META keys (dash.html ~L35197); India
// time throughout. Every formatter here tolerates a missing or malformed value (Intl throws a
// RangeError on an invalid date, which would crash a render).

import type { Visit } from '@/api/visitors';
import { dateLabel as libDateLabel, timeOf } from '@/lib/dates';
import type { StatusTone } from '@/theme/tokens';

/** Guards an API list once: a non-array becomes [], and null / non-object rows are dropped. */
export const asVisits = (x: unknown): Visit[] => (Array.isArray(x) ? x.filter((v): v is Visit => !!v && typeof v === 'object') : []);

export const VISIT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Waiting', tone: 'pending' },
  approved: { label: 'Approved', tone: 'done' },
  rejected: { label: 'Rejected', tone: 'failed' },
  no_response: { label: 'No answer', tone: 'pending' },
  checked_out: { label: 'Left', tone: 'neutral' }, // matches the "Left" time on the visit sheet
};

export const visitStatus = (s?: string) => VISIT_STATUS[s || ''] ?? { label: String(s || '—').replace(/_/g, ' '), tone: 'neutral' as StatusTone };

export const INVITE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: 'Active', tone: 'done' },
  used: { label: 'Used', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'failed' },
};

export const inviteStatus = (s?: string) => INVITE_STATUS[s || ''] ?? { label: String(s || '—'), tone: 'neutral' as StatusTone };

const validIso = (iso?: string | null): iso is string => typeof iso === 'string' && !!iso && !Number.isNaN(new Date(iso).getTime());

// ── Dates and times: the app's one way to write them (lib/dates) ─────────────
// Dates read "Mon, 19 Oct" (the year only outside this year), times "9:42 AM", and a moment both:
// "Mon, 19 Oct, 9:42 AM". Shared by Visitors, Help & support, My tasks, Bounty rewards, People and
// Announcements. Pass `today` (useTodayIst()) when calling during render, so render never reads the
// clock and "this year" flips at New Year.

/** "Mon, 19 Oct" ("Mon, 19 Oct 2025" outside this year) for a YYYY-MM-DD or an ISO instant; '—' when missing or malformed. */
export const dateLabel = (value?: string | null, today?: string) => libDateLabel(value, today);

// "10:42 AM" for an ISO timestamp ('—' when missing or malformed): lib/dates timeOf, with the meridiem
// kept on the time by a no-break space, like the invitation windows below.
export const clockOf = (iso?: string | null) =>
  validIso(iso) ? timeOf(iso).replace(/[\s ]*([ap])\.?\s?m\.?$/i, (_m, a: string) => ` ${a.toUpperCase()}M`) : '—';

/** "Mon, 19 Oct, 9:42 AM" for an ISO timestamp (the app's one way, lib/dates stampLabel); '' when missing or malformed. */
export function stampLabel(iso?: string | null, today?: string) {
  return validIso(iso) ? `${dateLabel(iso, today)}, ${clockOf(iso)}` : '';
}

// ASCII punctuation and symbols, Latin-1 punctuation and the General Punctuation block (dashes,
// quotes, bullets). Letters in any script and digits are kept.
const PUNCT = /[!-/:-@[-`{-~¡-¿‐-⁯]/g;
const BRACKETED = /[([{][^)\]}]*[)\]}]?/g;

const wordsOf = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w.replace(PUNCT, ''))
    .filter(Boolean);

/**
 * The words of a name that can give an initial. A bracketed note is dropped ("Manoj (Blue Dart)" →
 * ["Manoj"]) and punctuation is stripped, so an avatar never shows "M(". When the note is all there
 * is ("(Courier)"), its words are used instead. Pass `nameWords(n).join(' ')` to the kit's <Avatar>.
 */
export function nameWords(name?: string | null): string[] {
  const raw = typeof name === 'string' ? name : '';
  const main = wordsOf(raw.replace(BRACKETED, ' '));
  return main.length ? main : wordsOf(raw);
}

export const initials = (name?: string | null) =>
  nameWords(name)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

const NBSP = ' ';

/**
 * "+91 98480 22113" for an Indian mobile however it was stored (919848022113, +919848022113,
 * 09848022113 or 9848022113). Anything else (a landline, a foreign number) is shown as given, and a
 * missing value is ''. The groups are joined with non-breaking spaces, so a wrapping line never
 * splits the number. Display only: dial with the raw digits.
 */
export function phoneLabel(v?: string | number | null) {
  const raw = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const d = raw.replace(/\D/g, '');
  const local = raw.startsWith('+')
    ? d.length === 12 && d.startsWith('91')
      ? d.slice(2)
      : ''
    : d.length === 12 && d.startsWith('91')
      ? d.slice(2)
      : d.length === 11 && d.startsWith('0')
        ? d.slice(1)
        : d.length === 10
          ? d
          : '';
  if (!/^[6-9]\d{9}$/.test(local)) return raw;
  return `+91${NBSP}${local.slice(0, 5)}${NBSP}${local.slice(5)}`;
}

// What the web accepts before asking the server (visitMobileOk): 10 digits, or 91 + 10, or 0 + 10.
export function mobileOk(v: string) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 10 || (d.length === 12 && d.startsWith('91')) || (d.length === 11 && d.startsWith('0'));
}

const HM = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

// 'HH:MM' (24-hour, as invitations store it) → { clock: '3:00', half: 'PM' }; null when malformed.
function hmParts(hm?: string | null) {
  const m = typeof hm === 'string' ? HM.exec(hm.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  return { clock: `${((h + 11) % 12) + 1}:${m[2]}`, half: h < 12 ? 'AM' : 'PM' };
}

// '15:00' → '3:00 PM' (12-hour, like every other time in the app). A malformed value is shown as given.
export function hmLabel(hm?: string | null) {
  const p = hmParts(hm);
  if (p) return `${p.clock}${NBSP}${p.half}`;
  return typeof hm === 'string' ? hm.trim() : '';
}

/**
 * An invitation's optional window, 12-hour: "3:00 – 4:00 PM" (one meridiem when both ends share it),
 * "11:30 AM – 1:00 PM", "From 3:00 PM" or "Until 4:00 PM"; '' when neither end is set.
 */
export function timeWindow(from?: string, to?: string) {
  const a = hmParts(from);
  const b = hmParts(to);
  if (a && b && a.half === b.half) return `${a.clock} – ${b.clock}${NBSP}${a.half}`;
  const start = hmLabel(from);
  const end = hmLabel(to);
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return '';
}
