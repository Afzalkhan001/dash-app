// Everything in DASH is India time (the server stores work_date as the IST calendar date), so the
// app formats in Asia/Kolkata regardless of the phone's own timezone.
//
// The app's one way of writing each kind of value (feature helpers wrap these, never re-implement them):
//   date       dateLabel()    'Mon, 19 Oct' — the year only when it isn't this year ('Sun, 19 Oct 2025')
//   time       timeOf()       '9:42 AM'   (hmLabel() for a stored 'HH:MM': '09:30' → '9:30 AM')
//   date+time  stampLabel()   'Mon, 19 Oct, 9:42 AM'
//   duration   durationLabel() '7h 50m' / '50m' — never '7:50'
//   month      monthYear()    'October 2026' / 'Oct 2026'
// Month and weekday names come from fixed tables, not Intl: en-IN writes September as 'Sept' on newer
// ICU, adds a comma before the year after a weekday ('Mon, 6 Oct, 2026'), and the am/pm marker's case
// and spacing differ between phones.

const TZ = 'Asia/Kolkata';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function istParts(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
}

export const todayIst = () => istParts().date;
export const thisMonthIst = () => todayIst().slice(0, 7);

export function greeting(d = new Date()) {
  const h = istParts(d).hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Dates ────────────────────────────────────────────────────────────────────
// A 'YYYY-MM-DD' (or anything starting with one) as its parts; null when it is not a real date.
function ymdParts(ymd: unknown) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof ymd === 'string' ? ymd.trim() : '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo, d));
  if (!Number.isFinite(t.getTime()) || t.getUTCMonth() !== mo || t.getUTCDate() !== d) return null;
  return { y, mo, d, wd: t.getUTCDay() };
}

// A server timestamp as epoch ms; NaN when missing or malformed.
const instantOf = (iso: unknown) => (typeof iso === 'string' && iso.trim() ? Date.parse(iso) : NaN);

/**
 * A YYYY-MM-DD calendar date (no time) — e.g. holidays, work_date — with Intl-style options
 * (weekday / day / month / year). The default is 'Mon, 19 Oct'; '—' when the date is not real.
 * Prefer dateLabel(), which adds the year only when it isn't this year.
 */
export function dayLabel(ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const p = ymdParts(ymd);
  if (!p) return '—';
  const wd = opts.weekday === 'long' ? WEEKDAYS_LONG[p.wd] : opts.weekday ? WEEKDAYS[p.wd] : '';
  const mon = opts.month === 'long' ? MONTHS_LONG[p.mo] : opts.month ? MONTHS[p.mo] : '';
  const rest = [opts.day ? String(p.d) : '', mon, opts.year ? String(p.y) : ''].filter(Boolean).join(' ');
  return wd && rest ? `${wd}, ${rest}` : wd || rest;
}

// The India calendar date of a value: a 'YYYY-MM-DD' as given, an ISO instant converted to IST; ''
// when it is neither.
export function istDateOf(value?: string | null) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return ymdParts(v) ? v : '';
  const t = instantOf(v);
  return Number.isFinite(t) ? istParts(new Date(t)).date : '';
}

/**
 * 'Mon, 19 Oct' ('Sun, 19 Oct 2025' outside this year) for a 'YYYY-MM-DD' date or an ISO instant (its
 * India calendar date); '—' when missing or malformed. Pass `today` (useTodayIst()) during render so
 * render never reads the clock; without it the year is judged against today.
 */
export function dateLabel(value?: string | null, today?: string) {
  const ymd = istDateOf(value);
  if (!ymd) return '—';
  const thisYear = (today || todayIst()).slice(0, 4);
  return dayLabel(ymd, { weekday: 'short', day: 'numeric', month: 'short', ...(ymd.slice(0, 4) !== thisYear && { year: 'numeric' }) });
}

/** 'Monday, 19 Oct 2026' — the long form, always with the year. */
export function longDate(d = new Date()) {
  return dayLabel(istParts(d).date, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

/** 'YYYY-MM' → 'October 2026' ('Oct 2026' with style 'short'); '—' when it is not a month. */
export function monthYear(ym?: string | null, style: 'long' | 'short' = 'long') {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(typeof ym === 'string' ? ym.trim() : '');
  if (!m) return '—';
  const i = Number(m[2]) - 1;
  return `${style === 'short' ? MONTHS[i] : MONTHS_LONG[i]} ${m[1]}`;
}

// ── Times ────────────────────────────────────────────────────────────────────
/** A stored 24-hour 'HH:MM' (or 'H:MM', 'HH:MM:SS') → '9:30 AM'. A malformed value is shown as given; '—' when missing. */
export function hmLabel(hm?: string | null) {
  if (typeof hm !== 'string' || !hm.trim()) return '—';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(hm.trim());
  if (!m) return hm.trim();
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return hm.trim();
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A server timestamp as India time: '9:42 AM' ('—' when missing or malformed, never a RangeError). */
export function timeOf(iso?: string | null) {
  const t = instantOf(iso);
  if (!Number.isFinite(t)) return '—';
  const p = istParts(new Date(t));
  return hmLabel(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`);
}

/** A server timestamp → 'Mon, 19 Oct, 9:42 AM' (India time; the year only when it isn't this year). '—' when missing or malformed. */
export function stampLabel(iso?: string | null, today?: string) {
  if (!Number.isFinite(instantOf(iso))) return '—';
  return `${dateLabel(iso, today)}, ${timeOf(iso)}`;
}

// ── Durations ────────────────────────────────────────────────────────────────
/** Minutes → '7h 50m' / '50m' — the one way a duration is written (never '7:50'); '—' when missing. */
export function durationLabel(min?: number | null) {
  if (typeof min !== 'number' || !Number.isFinite(min)) return '—';
  const n = Math.max(0, Math.round(min));
  // Whole hours drop the minutes ("4h", never "4h 0m"), per docs/DESIGN.md §0C.
  if (n >= 60 && n % 60 === 0) return `${n / 60}h`;
  return (n >= 60 ? `${Math.floor(n / 60)}h ` : '') + `${n % 60}m`;
}
/** The same as durationLabel (kept for older callers). */
export const minutesToHM = durationLabel;

export function daysUntil(ymd: string) {
  const a = Date.parse(`${todayIst()}T00:00:00Z`);
  const b = Date.parse(`${ymd}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

// Monday-first week (Mon..Sun) containing the given IST date, as YYYY-MM-DD strings.
export function weekOf(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - dow + i);
    return x.toISOString().slice(0, 10);
  });
}
