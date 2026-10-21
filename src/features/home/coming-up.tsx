// "Coming up" on Home (docs/REFERENCE-COMPONENTS.md item 10, Payno "Upcoming Payments"): a short,
// sideways-scrolling row of frosted kit UpcomingCards for what is next for me, soonest first:
//   shift    while I'm clocked in: when my shift ends ("6:30 PM", "In 2h 10m"). Before clock-in the
//            clock card already says the shift, and once I'm done there is nothing left today
//   leave    my next approved leave or work from home that hasn't ended (at most 2): the kind, how
//            long ("2 days"), the dates ("26 – 27 Oct") and when it starts ("In 6 days", "Now")
//   holiday  the next company holiday: its name, the date ("Fri, 31 Oct") and "In 11 days"
// Payday is left out: the app knows no pay date (payslips only carry their month).
//
// Data: the very queries (same hooks, keys and gates) the Me screens use, so the server never refuses
// them and whatever one screen loaded the other shows at once:
//   - the shift comes from today's attendance (['att-today'], the clock card's own query);
//   - holidays: this year's list, as Me › Attendance loads it (sections.holidays; cached an hour).
//     Next year's only once this year has none left (late December);
//   - my requests: Me › Leave's own list (useLeaveAccess().enabled), else the lighter cached copy
//     Me › Attendance's calendar keeps;
//   - leave type names ('CL' → 'Casual Leave'): the cached leave types / balances; the balances are
//     fetched (Me › Leave's query and gate) only when an approved leave is coming and no name is known.
// Each card shows only with its module, and the section is left out when there is nothing to show.
// useComingUp() builds the cards; <ComingUp items={…}/> draws them.

import { type Href, useRouter } from 'expo-router';
import { Clock, House, type LucideIcon, Palmtree, TreePalm } from 'lucide-react-native';
import { View } from 'react-native';

import type { TodayFull } from '@/api/attendance';
import { useMyLeaveRequests as useLeaveRequestsLite } from '@/api/attendance';
import { useAttendanceToday, useHolidays, useLeaveBalances } from '@/api/hr';
import { useLeaveTypes, useMyLeaveRequests } from '@/api/leave';
import { shortDay } from '@/features/attendance/format';
import { useNow } from '@/features/attendance/use-now';
import { useLeaveAccess } from '@/features/leave/use-leave-access';
import { HALF_LABEL, rangeLabel, requestDays } from '@/features/leave/rules';
import { durationLabel, hmLabel, istParts } from '@/lib/dates';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import type { ModuleKey } from '@/theme/tokens';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { SectionHeader, type UpcomingItem, UpcomingCards } from '@/ui';

const MAX_LEAVE = 2;

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dayMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((dayMs(b) - dayMs(a)) / 86400000);
// '09:30' / '9:30:00' → minutes after midnight; null when it isn't a time.
function minutesOf(hm?: string | null) {
  const m = /^(\d{1,2}):(\d{2})/.exec(typeof hm === 'string' ? hm.trim() : '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/** "Today", "Tomorrow", "In 11 days". */
function whenWords(from: string, today: string) {
  const n = daysBetween(today, from);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${plural(n, 'day')}`;
}

/** One Coming up card, plus the date (or 'today') it sorts by. */
type Upcoming = UpcomingItem & { sortKey: string };

type LeaveLike = {
  id: string;
  kind: 'leave' | 'wfh' | 'comp_off';
  leave_type_id?: string | null;
  leave_code: string | null;
  from_date: string;
  to_date: string;
  half_day: string;
  status: string;
  days?: number;
};

const LEAVE_LOOK: Record<'leave' | 'wfh', { icon: LucideIcon; module: ModuleKey }> = {
  // The same icons and colours as the request rows in Me › Leave.
  leave: { icon: TreePalm, module: 'leave' },
  wfh: { icon: House, module: 'visitors' },
};

export function useComingUp(): UpcomingItem[] {
  const router = useRouter();
  const go = (href: Href) => router.push(href);
  const access = useAccess();
  const leaveAccess = useLeaveAccess();
  const now = useNow();
  const { date: today, hour, minute } = istParts(new Date(now));
  const year = today.slice(0, 4);
  const nextYear = String(Number(year) + 1);

  const holOn = access.sections.holidays;
  const leaveOn = leaveAccess.enabled;

  // Today's attendance: the clock card's own query (same key), so no extra request.
  const todayQ = useAttendanceToday(access.sections.clock);
  // This year's holidays (Me › Attendance's query and gate); next year's only when none are left.
  const holQ = useHolidays(year, holOn);
  const holThis = Array.isArray(holQ.data?.holidays) ? holQ.data.holidays : [];
  const noneLeft = holQ.isSuccess && !holThis.some((h) => !!h && isYmd(h.date) && h.date >= today);
  const holNextQ = useHolidays(nextYear, holOn && noneLeft);
  // My requests: Me › Leave's list (with day counts and type ids); the light copy until it is back.
  const leaveQ = useMyLeaveRequests(leaveOn);
  const leaveLiteQ = useLeaveRequestsLite(false);
  const typesQ = useLeaveTypes(false);

  // ── My next approved leave / work from home (worked out first: it decides whether names are needed) ──
  const full = Array.isArray(leaveQ.data?.requests) ? (leaveQ.data.requests as LeaveLike[]) : null;
  const lite = Array.isArray(leaveLiteQ.data) ? (leaveLiteQ.data as LeaveLike[]) : [];
  const nextLeave = leaveOn
    ? (full ?? lite)
        .filter((r): r is LeaveLike => !!r && typeof r === 'object')
        .filter((r) => r.status === 'approved' && (r.kind === 'leave' || r.kind === 'wfh') && isYmd(r.from_date))
        .filter((r) => (isYmd(r.to_date) ? r.to_date : r.from_date) >= today)
        .sort((a, b) => a.from_date.localeCompare(b.from_date))
        .slice(0, MAX_LEAVE)
    : [];
  // Type names by id and code, from the cached leave types ('CL' → 'Casual Leave').
  const names = new Map<string, string>();
  const addNames = (list: unknown) => {
    for (const x of Array.isArray(list) ? (list as { id?: string; code?: string; name?: unknown }[]) : []) {
      if (!x || typeof x !== 'object' || typeof x.name !== 'string' || !x.name.trim()) continue;
      if (x.id && !names.has(x.id)) names.set(x.id, x.name.trim());
      if (x.code && !names.has(x.code)) names.set(x.code, x.name.trim());
    }
  };
  addNames(typesQ.data?.types);
  const unnamed = nextLeave.some((r) => r.kind === 'leave' && !(r.leave_type_id && names.has(r.leave_type_id)) && !(r.leave_code && names.has(r.leave_code)));
  // …and from the balances (Me › Leave's query and gate), fetched only when a coming leave has no name yet.
  const balancesQ = useLeaveBalances(leaveOn && leaveAccess.hasLeave && unnamed);
  addNames(balancesQ.data?.balances);

  const out: Upcoming[] = [];

  // ── Shift end, while clocked in ──
  const t = todayQ.data as unknown as TodayFull | undefined;
  const rec = t && typeof t === 'object' && t.record && typeof t.record === 'object' ? t.record : null;
  const s = t && typeof t === 'object' && t.settings && typeof t.settings === 'object' ? t.settings : null;
  if (access.sections.clock && rec && !rec.out_at && s) {
    const start = minutesOf(s.shiftStart);
    let end = minutesOf(s.shiftEnd);
    const nowMin = hour * 60 + minute;
    // A night shift ends after midnight.
    if (end != null && start != null && end <= start && nowMin >= start) end += 24 * 60;
    const left = end != null ? end - nowMin : 0;
    if (end != null && left > 0 && left <= 16 * 60) {
      const at = hmLabel(s.shiftEnd);
      out.push({
        key: 'shift',
        sortKey: today,
        icon: Clock,
        module: 'shifts',
        title: 'Shift ends',
        value: at,
        sub: s.shiftName || 'Your shift today',
        meta: `In ${durationLabel(left)}`,
        onPress: access.sections.shifts ? () => go('/attendance/shifts') : undefined,
        accessibilityLabel: `Your shift ends at ${at}, in ${durationLabel(left)}`,
        hint: access.sections.shifts ? 'Opens My shift' : undefined,
      });
    }
  }

  // ── My next approved leave / work from home (the cards) ──
  for (const r of nextLeave) {
    const kind = r.kind === 'wfh' ? 'wfh' : 'leave';
    const look = LEAVE_LOOK[kind];
    const typeName = (r.leave_type_id && names.get(r.leave_type_id)) || (r.leave_code && names.get(r.leave_code)) || '';
    const title = kind === 'wfh' ? 'Work from home' : typeName ? (/leave/i.test(typeName) ? typeName : `${typeName} leave`) : 'Leave';
    const half = !!r.half_day && r.half_day !== 'none';
    const value = half ? (HALF_LABEL[r.half_day as keyof typeof HALF_LABEL] ?? 'Half a day') : Number.isFinite(Number(r.days)) && r.days ? requestDays(Number(r.days)) : null;
    const started = r.from_date <= today;
    const dates = rangeLabel(r.from_date, r.to_date, today);
    out.push({
      key: `leave-${r.id}`,
      sortKey: started ? today : r.from_date,
      icon: look.icon,
      module: look.module,
      title,
      value,
      sub: dates,
      meta: started ? 'Now' : whenWords(r.from_date, today),
      onPress: () => go('/leave/requests'),
      accessibilityLabel: [title, 'approved', dates, value, started ? 'on now' : whenWords(r.from_date, today)].filter(Boolean).join(', '),
      hint: 'Opens your leave requests',
    });
  }

  // ── The next company holiday ──
  if (holOn) {
    const list = [...holThis, ...(Array.isArray(holNextQ.data?.holidays) ? holNextQ.data.holidays : [])];
    const next = list
      .filter((h) => !!h && isYmd(h.date) && h.date >= today && typeof h.name === 'string' && !!h.name.trim())
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) {
      const when = whenWords(next.date, today);
      const date = shortDay(next.date, year);
      out.push({
        key: `holiday-${next.id ?? next.date}`,
        sortKey: next.date,
        icon: Palmtree,
        module: 'holidays',
        title: next.name.trim(),
        value: date,
        sub: next.optional ? 'Optional holiday' : 'Holiday',
        meta: when,
        onPress: () => go('/attendance/holidays'),
        accessibilityLabel: `${next.optional ? 'Optional holiday' : 'Holiday'}: ${next.name.trim()}, ${date}, ${when.toLowerCase()}`,
        hint: 'Opens the holiday list',
      });
    }
  }

  return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map(({ sortKey: _sortKey, ...item }) => item);
}

/** The section: "Coming up" over the cards. Pass useComingUp(); render it only when it has cards. */
export function ComingUp({ items }: { items: UpcomingItem[] }) {
  const list = (Array.isArray(items) ? items : []).filter((it) => !!it && !!it.key);
  if (!list.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Coming up" />
      <UpcomingCards items={list} accessibilityLabel="Coming up" />
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xxs },
}));
