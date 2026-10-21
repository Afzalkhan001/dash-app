// The manager's Home cards (web: ManagerHome, dash.html:22837), under "Needs you":
//
//   Team today  the manager's reports (Reporting or Additional Manager = me) as AvatarTiles with a dot:
//               free (green), busy (amber: an approved booking or open work today), on leave (grey) —
//               the web's isDopBusyToday / isOnLeaveDate (:22880). Tapping someone shows their day and
//               the free hours (getFreeSlots, whole hours 07:00–22:00).
//   Tomorrow    their tasks dated tomorrow that are still open, and approved professional bookings for
//               them tomorrow (nextDayTasks / nextDayBookings :22866), with Share: the schedule as plain
//               text (the web's PDF / JPEG / print and its browser-only channel edits stay on the web).
//
// Each card always renders something (a skeleton, or a short empty line), never null.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { useLeaveDays } from '@/api/people';
import { useProjects } from '@/api/reimbursements';
import type { Booking } from '@/api/tasks';
import { type TeamTask, useTeamTasks, useWorkBookings, type WorkUser } from '@/api/work';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { managerReports } from '@/features/work/access';
import { codeOf, minutesOfHm } from '@/features/work/model';
import { taskHref } from '@/features/work/task-actions';
import { useWorkTeam } from '@/features/work/use-team';
import { dateLabel, hmLabel, istParts } from '@/lib/dates';
import { addDaysYmd } from '@/lib/ist';
import { plural } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  ActivityList,
  ActivityRow,
  type AvatarTileItem,
  AvatarTiles,
  SectionHeader,
  SeeAllLink,
  Sheet,
  Skeleton,
  SummaryCard,
  type SummaryItem,
  Text,
  TourTarget,
} from '@/ui';

const DONE_STATUSES = ['completed', 'submitted', 'reviewed'];
const str = (v: unknown) => (v == null ? '' : String(v));
const isApprovedProOn = (b: Booking, day: string) => b.type === 'professionals' && b.status === 'approved' && (b.dates?.[0] === day || b.date === day);
const timeSpan = (a?: unknown, b?: unknown) => (a && b ? `${hmLabel(str(a))} – ${hmLabel(str(b))}` : a ? hmLabel(str(a)) : '');

/** getFreeSlots (:22912): whole-hour free windows of a 07:00–22:00 day around one booking, at least 2 h. */
function freeSlots(bk: Pick<Booking, 'startTime' | 'endTime'> | undefined, nowMin: number | null) {
  if (!bk?.startTime || !bk?.endTime) return '';
  const ds = 7 * 60;
  const de = 22 * 60;
  const bs = Math.floor(minutesOfHm(bk.startTime) / 60) * 60;
  const be = Math.ceil(minutesOfHm(bk.endTime) / 60) * 60;
  if (!Number.isFinite(bs) || !Number.isFinite(be)) return '';
  const nowHour = nowMin != null ? Math.floor(nowMin / 60) * 60 : null;
  const raw: [number, number][] = [];
  if (bs > ds) raw.push([ds, Math.min(bs, de)]);
  if (de > be) raw.push([Math.max(be, ds), de]);
  const slots = raw.map(([s, e]) => [nowHour !== null ? Math.max(s, nowHour) : s, e] as const).filter(([s, e]) => e > s && e - s >= 120);
  const hm = (m: number) => hmLabel(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`);
  return slots.length ? slots.map(([s, e]) => `${hm(s)} – ${hm(e)}`).join(', ') : 'No free time';
}

type Day = { person: WorkUser; state: 'free' | 'busy' | 'leave'; booking?: Booking; tasks: TeamTask[] };

/** The manager's people and their day (isDopBusyToday / isDopBusyTomorrow, :22888). */
function useTeamDays() {
  const today = useTodayIst();
  const tomorrow = addDaysYmd(today, 1);
  const scope = useWorkTeam();
  const me = scope.me;
  const tasksQ = useTeamTasks('active');
  const bookingsQ = useWorkBookings();
  const leaveQ = useLeaveDays();
  const projectsQ = useProjects();
  const reports = me ? managerReports({ id: me.id, role: me.role, name: me.name }, scope.users) : [];
  const tasks = Array.isArray(tasksQ.data) ? tasksQ.data : [];
  const bookings = Array.isArray(bookingsQ.data) ? bookingsQ.data : [];
  const leave = Array.isArray(leaveQ.data) ? leaveQ.data : [];
  const onLeave = (p: WorkUser, day: string) =>
    leave.some((l) => l.date === day && !l.half && (l.employeeId ? l.employeeId === p.id : l.employee === p.name)) || p.leaveDates.includes(day);

  const dayOf = (p: WorkUser, day: string, isToday: boolean): Day => {
    const booking = bookings.find((b) => isApprovedProOn(b, day) && b.resource === p.name);
    const dayTasks = tasks.filter((t) => t.assignee === p.name && (t.bookingDate === day || t.startDate === day));
    if (onLeave(p, day)) return { person: p, state: 'leave', booking, tasks: dayTasks };
    const openToday = dayTasks.some((t) => !DONE_STATUSES.includes(str(t.status)));
    const allDone = dayTasks.length > 0 && dayTasks.every((t) => DONE_STATUSES.includes(str(t.status)));
    // Today: a booking or open work makes them busy unless all of the day's work is done. Tomorrow: only a booking does.
    const busy = isToday ? (booking || openToday) && !allDone : !!booking && !allDone;
    return { person: p, state: busy ? 'busy' : 'free', booking, tasks: dayTasks };
  };

  return {
    today,
    tomorrow,
    reports,
    tasks,
    bookings,
    projects: projectsQ.data,
    loading: scope.loading || (tasksQ.isPending && !tasksQ.data) || (bookingsQ.isPending && !bookingsQ.data),
    todayOf: (p: WorkUser) => dayOf(p, today, true),
    tomorrowOf: (p: WorkUser) => dayOf(p, tomorrow, false),
  };
}

const STATE_WORD: Record<Day['state'], string> = { free: 'Free', busy: 'Busy', leave: 'On leave' };
const STATE_DOT = { free: 'done', busy: 'pending', leave: 'neutral' } as const;

export function TeamTodayCard() {
  const router = useRouter();
  const d = useTeamDays();
  const now = useNow();
  const [open, setOpen] = useState<Day | null>(null);
  const [sheet, setSheet] = useState(false);
  if (d.loading) {
    return (
      <View style={styles.gap}>
        <Skeleton height={20} width="40%" radius={radius.sm} />
        <Skeleton height={100} radius={radius.lg} />
      </View>
    );
  }
  const days = d.reports.map(d.todayOf);
  const free = days.filter((x) => x.state === 'free').length;
  const busy = days.filter((x) => x.state === 'busy').length;
  const tiles: AvatarTileItem[] = days.map((x) => ({
    key: x.person.id,
    name: x.person.name,
    sub: STATE_WORD[x.state],
    dot: STATE_DOT[x.state],
    onPress: () => {
      setOpen(x);
      setSheet(true);
    },
    accessibilityLabel: `${x.person.name}, ${STATE_WORD[x.state].toLowerCase()} today`,
    hint: 'Shows their day',
  }));
  const nowMin = (() => {
    const p = istParts(new Date(now));
    return p.hour * 60 + p.minute;
  })();
  const facts: SummaryItem[] = open
    ? [
        { key: 'state', label: 'Today', value: STATE_WORD[open.state], status: STATE_DOT[open.state] },
        ...(open.booking ? [{ key: 'bk', label: 'Booked', value: timeSpan(open.booking.startTime, open.booking.endTime), hint: str(open.booking.requestedBy) ? `For ${str(open.booking.requestedBy)}` : null }] : []),
        ...(open.booking && open.state !== 'leave' ? [{ key: 'free', label: 'Free', value: freeSlots(open.booking, nowMin) }] : []),
        ...open.tasks.map((t) => ({ key: t.id, label: str(t.title) || 'Task', value: DONE_STATUSES.includes(str(t.status)) ? 'Done' : timeSpan(t.startTime, t.endTime) || 'Today' })),
      ]
    : [];

  return (
    <TourTarget id="home.work.team" radius={radius.xl}>
      <View style={styles.gap}>
        <SectionHeader
          title="Team today"
          overline={d.reports.length ? `${free} free · ${busy} busy` : undefined}
          right={<SeeAllLink label="See all" onPress={() => router.push('/admin/work')} accessibilityLabel="Open your team’s work" />}
        />
        {tiles.length ? (
          <AvatarTiles items={tiles} accessibilityLabel="Your team today" />
        ) : (
          <Text variant="label" muted>
            No one reports to you yet.
          </Text>
        )}
      </View>
      <Sheet visible={sheet && !!open} onClose={() => setSheet(false)} title={open?.person.name ?? ''} subtitle={open?.person.jobTitle || undefined}>
        {open ? <SummaryCard rows={facts} /> : null}
        {open && !open.tasks.length && !open.booking ? (
          <Text variant="label" muted>
            Nothing planned for today.
          </Text>
        ) : null}
      </Sheet>
    </TourTarget>
  );
}

export function TomorrowCard() {
  const router = useRouter();
  const d = useTeamDays();
  if (d.loading) return <ActivityList title="Tomorrow" loading loadingRows={2} />;
  const names = new Set(d.reports.map((p) => p.name));
  const tasks = d.tasks.filter((t) => names.has(str(t.assignee)) && t.startDate === d.tomorrow && !DONE_STATUSES.includes(str(t.status)));
  const bookings = d.bookings.filter((b) => isApprovedProOn(b, d.tomorrow) && names.has(str(b.resource)));
  const code = (t: TeamTask) => codeOf(t, d.bookings, d.projects);
  const items = [
    ...tasks.map((t) => ({ key: t.id, who: str(t.assignee), code: code(t), time: timeSpan(t.startTime, t.endTime), kind: 'Task' as const, sort: str(t.startTime), task: t })),
    ...bookings.map((b) => ({ key: b.id, who: str(b.resource), code: str(b.kekaCode || b.project), time: timeSpan(b.startTime, b.endTime), kind: 'Booked' as const, sort: str(b.startTime), task: undefined })),
  ].sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  const label = dateLabel(d.tomorrow, d.today);
  const share = () => {
    const lines = items.map((i) => [i.code || 'No code', i.who, i.time || 'Any time', i.kind].join(' — '));
    void Share.share({ message: [`Team schedule · ${label}`, '', ...lines].join('\n') }).catch(() => {});
  };
  return (
    <ActivityList
      title="Tomorrow"
      overline={items.length ? `${label} · ${plural(items.length, 'item')}` : label}
      right={items.length ? <SeeAllLink label="Share" onPress={share} accessibilityLabel="Share tomorrow’s schedule as text" /> : undefined}
      empty={
        <Text variant="label" muted style={styles.empty}>
          Nothing planned for your team tomorrow.
        </Text>
      }>
      {items.map((i) => (
        <ActivityRow
          key={i.key}
          person={{ name: i.who }}
          title={i.who}
          subtitle={[i.code, i.time].filter(Boolean).join(' · ') || null}
          status={i.kind === 'Booked' ? { label: 'Booked', tone: 'done' } : { label: 'Task', tone: 'neutral' }}
          onPress={i.task ? () => router.push(taskHref(i.task!.id)) : undefined}
          chevron={false}
        />
      ))}
    </ActivityList>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: space.sm },
  empty: { padding: space.md },
}));
