// Birthdays and work anniversaries this week, for Home. useCelebrations() works them out (null when
// there are none, so Home leaves the section out instead of keeping an empty slot); <CelebrationsCard
// data={…}/> draws them as a sideways row of frosted kit AvatarTiles (docs/REFERENCE-COMPONENTS.md
// item 7, Payno "Recent Recipients"): the person's photo (or initials), their name, and one short line
// that says what and when — "🎂 Today", "🎉 Wed" (a cake for a birthday, a party popper for a work
// anniversary; the screen reader hears it in words: "Priya Sharma, birthday, today").
//
// Worked out the way the server's celebration sweep does it (server.js processCelebrationAnnouncements
// ~L9427): the calendar month/day of `dob` / `dateJoined` against India's calendar day, years of
// service = this year − joining year (joining day itself is not an anniversary), resigned people
// skipped. Shown only where the website shows celebrations at all — HR's "Auto-schedule Birthday /
// Work Anniversary" switches (tenant.birthdayAutoOn / anniversaryAutoOn) and the Announcements
// module for this person.
//
// Today's entries also come from the auto-posted cards themselves (GET /announcements), so they
// show for everyone. Upcoming days come from the directory: anniversaries for all (joining date is
// on every directory row), birthdays only where the server sends a date of birth (CEO / COO /
// Super Admin / HR) — the app never asks for more than the directory gives.

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { type Announcement, isCelebration, useVisibleAnnouncements } from '@/api/announcements';
import { useMyTenant } from '@/api/me';
import type { DirectoryPerson } from '@/api/people';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeAnnouncements } from '@/features/more/menu';
import { companyShortName, usePeople } from '@/features/people/directory';
import { useCelebrationPhotos, usePeoplePhotos } from '@/features/people/photos';
import { dateLabel } from '@/features/visitors/format';
import { dayLabel, todayIst } from '@/lib/dates';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { type AvatarTileItem, AvatarTiles, SectionHeader } from '@/ui';

type Kind = 'birthday' | 'anniversary';
export type CelebrationEntry = {
  key: string;
  kind: Kind;
  offset: number; // days from today (0..6)
  ymd: string;
  name: string;
  years?: number;
  person?: DirectoryPerson;
  ann?: Announcement;
};

type Entry = CelebrationEntry;

const WINDOW_DAYS = 7;

// Calendar fields straight from the stored string, as the server's monthDayYearOf does.
function monthDayYear(v?: string | null) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return { y: +m[1]!, m: +m[2]!, d: +m[3]! };
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

function nextDays(today?: string) {
  const ymd = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : todayIst();
  const base = Date.parse(`${ymd}T00:00:00Z`);
  return Array.from({ length: WINDOW_DAYS }, (_, offset) => {
    const d = new Date(base + offset * 86400000);
    return { offset, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), ymd: d.toISOString().slice(0, 10) };
  });
}

const norm = (s?: string | null) => String(s || '').trim().toLowerCase();

export function computeCelebrations(opts: {
  roster: DirectoryPerson[];
  todaysCards: Announcement[];
  birthdays: boolean;
  anniversaries: boolean;
  fromDirectory: boolean;
  /** Today's IST date (YYYY-MM-DD) from useTodayIst(), so render stays pure. */
  today?: string;
}): Entry[] {
  const days = nextDays(opts.today);
  const roster = (Array.isArray(opts.roster) ? opts.roster : []).filter((p) => p && typeof p === 'object');
  const cards = (Array.isArray(opts.todaysCards) ? opts.todaysCards : []).filter((a) => a && a.id != null);
  const out: Entry[] = [];
  if (opts.fromDirectory) {
    for (const p of roster) {
      if (String(p.resigned) === 'true' || !p.name) continue;
      if (opts.birthdays) {
        const md = monthDayYear(p.dob);
        const day = md && days.find((x) => x.m === md.m && x.d === md.d);
        if (day) out.push({ key: `b:${p.id}`, kind: 'birthday', offset: day.offset, ymd: day.ymd, name: p.name, person: p });
      }
      if (opts.anniversaries) {
        const md = monthDayYear(p.dateJoined);
        const day = md && days.find((x) => x.m === md.m && x.d === md.d);
        const years = day && md ? day.y - md.y : 0;
        if (day && years > 0) out.push({ key: `a:${p.id}`, kind: 'anniversary', offset: day.offset, ymd: day.ymd, name: p.name, years, person: p });
      }
    }
  }
  // Today's auto-posted cards: attach to the matching entry, or add the person from the card.
  for (const a of cards) {
    const kind = a.type as Kind;
    const tid = String(a.targetEmployeeId || '');
    const person = (tid ? roster.find((p) => p.id === tid || p.id === `wl:${tid}`) : undefined) ?? roster.find((p) => norm(p.name) === norm(a.targetName));
    const existing = out.find((e) => e.kind === kind && e.offset === 0 && ((person && e.person?.id === person.id) || norm(e.name) === norm(a.targetName)));
    if (existing) {
      existing.ann = a;
      if (kind === 'anniversary' && Number.isFinite(a.years)) existing.years = a.years;
      continue;
    }
    out.push({
      key: `${kind[0]}:ann:${a.id}`,
      kind,
      offset: 0,
      ymd: days[0]!.ymd,
      name: a.targetName || person?.name || 'A colleague',
      years: kind === 'anniversary' && Number.isFinite(a.years) ? a.years : undefined,
      person,
      ann: a,
    });
  }
  return out.sort((a, b) => a.offset - b.offset || (a.kind === b.kind ? 0 : a.kind === 'birthday' ? -1 : 1) || a.name.localeCompare(b.name));
}

// When, short enough for a 96 dp tile: Today / Tomorrow, then the weekday ("Wed" — the window is one
// week, so the weekday is never ambiguous). Spoken in full ("Wednesday, 21 Oct"). `today` comes from
// useTodayIst(), so render never reads the clock.
function whenShort(e: Entry) {
  if (e.offset === 0) return 'Today';
  if (e.offset === 1) return 'Tomorrow';
  return dayLabel(e.ymd, { weekday: 'short' });
}
function whenSpoken(e: Entry, today: string) {
  if (e.offset === 0) return 'today';
  if (e.offset === 1) return 'tomorrow';
  return dateLabel(e.ymd, today);
}

// The kind as a small glyph in the tile's one line (the words say it for screen readers).
const KIND_GLYPH: Record<Kind, string> = { birthday: '🎂', anniversary: '🎉' };

// A week of a large company can hold many: the row scrolls, and stays a row.
const MAX_TILES = 20;

export type Celebrations = { entries: CelebrationEntry[]; company: string };

/**
 * This week's birthdays and work anniversaries for Home, or null when there is nothing to show (not
 * on for this company or person, still loading, or nobody this week) — then render nothing.
 */
export function useCelebrations(): Celebrations | null {
  const today = useTodayIst();
  const role = useSession((s) => s.user?.role);
  const tenant = useMyTenant().data;
  const birthdays = !!tenant?.birthdayAutoOn;
  const anniversaries = !!tenant?.anniversaryAutoOn;
  const allowed = canSeeAnnouncements(role, tenant) && (birthdays || anniversaries);
  const { roster, isLoading } = usePeople(allowed);
  const ann = useVisibleAnnouncements();

  if (!allowed || isLoading || ann.isLoading) return null;

  const entries = computeCelebrations({
    roster,
    todaysCards: (Array.isArray(ann.feed) ? ann.feed : []).filter((a) => a && isCelebration(a)),
    birthdays,
    anniversaries,
    fromDirectory: tenant?.orgEnabled !== false,
    today,
  });
  if (!entries.length) return null;
  return { entries, company: companyShortName(tenant?.name) };
}

/**
 * Home's celebrations: "Celebrations" (overline "This week") over a sideways row of AvatarTiles, soonest
 * first. A tile opens the person's profile (my own entry opens My profile), or the auto-posted card
 * when the person isn't in the directory. Pass useCelebrations()'s result; render it only when that is
 * not null.
 */
export function CelebrationsCard({ data }: { data: Celebrations }) {
  const router = useRouter();
  const me = useSession((s) => s.user?.id);
  const today = useTodayIst();
  const entries = (Array.isArray(data?.entries) ? data.entries : []).slice(0, MAX_TILES);
  // Photos: directory photos (only rows that say they have one), else the posted card's photo.
  const personPhoto = usePeoplePhotos(entries.map((e) => e.person));
  const cardPhoto = useCelebrationPhotos(entries.filter((e) => !e.person && !!e.ann).map((e) => e.ann!));
  if (!entries.length) return null;

  const company = data.company;
  const open = (e: Entry) => {
    if (e.person && e.person.id === me) router.push('/profile');
    else if (e.person) router.push(`/people/${encodeURIComponent(e.person.id)}`);
    else if (e.ann) router.push(`/announcements/${encodeURIComponent(e.ann.id)}`);
  };
  const whatOf = (e: Entry, isMe: boolean) =>
    e.kind === 'birthday'
      ? isMe
        ? 'your birthday'
        : 'birthday'
      : e.years
        ? `${e.years} ${e.years === 1 ? 'year' : 'years'} at ${company}`
        : 'work anniversary';

  const tiles: AvatarTileItem[] = entries.map((e) => {
    const isMe = !!me && e.person?.id === me;
    const name = isMe ? 'You' : e.name;
    const canOpen = !!e.person || !!e.ann;
    return {
      key: e.key,
      name,
      uri: e.person ? personPhoto(e.person) : e.ann ? cardPhoto(e.ann) : null,
      sub: `${KIND_GLYPH[e.kind] ?? ''} ${whenShort(e)}`.trim(),
      onPress: canOpen ? () => open(e) : undefined,
      accessibilityLabel: `${isMe ? 'You' : e.name}, ${whatOf(e, isMe)}, ${whenSpoken(e, today)}`,
      hint: canOpen ? (isMe ? 'Opens your profile' : e.person ? 'Opens their profile' : 'Opens the announcement') : undefined,
    };
  });

  return (
    <View style={styles.section}>
      <SectionHeader title="Celebrations" overline="This week" />
      <AvatarTiles items={tiles} accessibilityLabel="Birthdays and work anniversaries this week" />
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xxs },
}));
