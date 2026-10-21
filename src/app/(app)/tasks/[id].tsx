// One task (web: MyTasks' detail modal, renderRowDetail), in the Payno detail style: a light
// SummaryHero first — the reference, the time worked as the giant figure (ticking while it runs), the
// task and where it stands — then at most one notice, the facts as a SummaryCard (project code, date,
// time, place, who asked), the people to reach as AccountRows with Call / Email / Open pills, the
// details, and the completion note. The id is a task id, or bk_<bookingId> for an approved booking
// that has no task yet.
//
// The bottom bar holds the one next step: Start (pending), or Pause / Resume next to End task (in
// progress). When Start isn't possible yet (before the booking's day, or another task is running)
// the bar says why. Start and End may ask for the requester's 6-digit code; End is a swipe in a
// confirm sheet (use-task-flow).

import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { Link2, type LucideIcon, Mail, Pause, Phone, Play, SearchX, Square } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Linking, View } from 'react-native';

import { useProjects } from '@/api/reimbursements';
import { useDirectoryUsers } from '@/api/support';
import { type Booking, type Task, useClients, useMyProBookings, useMyTasks } from '@/api/tasks';
import { useTodayIst } from '@/features/attendance/use-now';
import { LiveTimer, useNow } from '@/features/tasks/live-timer';
import {
  bookedHours,
  canStartOn,
  dueText,
  elapsedOf,
  hoursOf,
  hoursText,
  isRunning,
  refLine,
  safeDay,
  type TaskRow,
  useRows,
  workedLabel,
  workedSeconds,
} from '@/features/tasks/model';
import { rowStatus, type TaskFlow, taskIcon } from '@/features/tasks/task-card';
import { useTaskFlow } from '@/features/tasks/use-task-flow';
import { hmLabel, phoneLabel, stampLabel } from '@/features/visitors/format';
import { palette, radius, space, type as typeScale } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  ActionRow,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  Skeleton,
  StatusPill,
  StripedProgress,
  type SummaryItem,
  SummaryCard,
  SummaryHero,
  Text,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

const str = (v: unknown) => (v == null ? '' : String(v));
// "Mon, 19 Oct, 3:00 PM" (the app's one way to write a moment) from a date and a 24-hour time,
// either of which may be missing.
const dayAndTime = (ymd: unknown, hm: unknown, today: string) =>
  [str(ymd) ? safeDay(str(ymd), today) : '', str(hm) ? hmLabel(str(hm)) : ''].filter(Boolean).join(', ');

// No dialler / mail app (or a malformed address) must not surface as an unhandled rejection.
const tel = (phone: string) => () => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {});
const mail = (email: string) => () => void Linking.openURL(`mailto:${email}`).catch(() => {});

/** Someone (or something) to reach from the task: an AccountRow with a Call / Email / Open pill. */
type Contact = { key: string; icon: LucideIcon; title: string; sub: string; action: string; onPress: () => void };

/** Phone and email of one person. Empty values are left out; the number is shown grouped ("+91 98480 22113"). */
function contactsOf(who: string, phone?: unknown, email?: unknown): Contact[] {
  const p = str(phone).trim();
  const e = str(email).trim();
  const whose = who || 'Contact';
  return [
    ...(p ? [{ key: `phone-${whose}`, icon: Phone, title: phoneLabel(p) || p, sub: `${whose} · Phone`, action: 'Call', onPress: tel(p) }] : []),
    ...(e ? [{ key: `email-${whose}`, icon: Mail, title: e, sub: `${whose} · Email`, action: 'Email', onPress: mail(e) }] : []),
  ];
}

/** A frosted card with a small muted heading over some text. */
function TextCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card tone="frostStrong" style={styles.textCard}>
      <Text variant="labelStrong" muted numberOfLines={1}>
        {title}
      </Text>
      {children}
    </Card>
  );
}

/** The sticky bar: the next step for this task, or why it can't be taken yet. */
function actionBar(row: TaskRow, flow: TaskFlow, anyRunning: boolean, today: string): ReactNode {
  const busy = flow.busyId === row.id;
  const disabled = !!flow.busyId;
  const blocked = (why: string) => (
    <ActionBar note={why}>
      <Button title="Start" icon={<Play />} disabled />
    </ActionBar>
  );

  if (row.kind === 'bk' && row.booking) {
    const bk = row.booking;
    if (!canStartOn(bk.date, today)) return blocked(`You can start on ${safeDay(str(bk.date), today)}`);
    if (anyRunning) return blocked('Pause your running task first');
    return (
      <ActionBar>
        <Button title="Start" loading={busy} disabled={disabled} icon={<Play />} onPress={() => flow.startBooking(bk)} />
      </ActionBar>
    );
  }

  const t = row.task;
  if (!t) return undefined;
  if (t.status === 'pending') {
    if (!canStartOn(t.bookingDate, today)) return blocked(`You can start on ${safeDay(str(t.bookingDate), today)}`);
    if (anyRunning) return blocked('Pause your running task first');
    return (
      <ActionBar>
        <Button title="Start" loading={busy} disabled={disabled} icon={<Play />} onPress={() => flow.act(t.id, 'start')} />
      </ActionBar>
    );
  }
  if (t.status === 'in_progress') {
    const running = isRunning(t);
    return (
      <ActionBar>
        <ActionRow context="bar">
          {running ? (
            <Button title="Pause" variant="accent" loading={busy} disabled={disabled} icon={<Pause />} onPress={() => flow.act(t.id, 'pause')} />
          ) : (
            <Button title="Resume" variant="accent" loading={busy} disabled={disabled} icon={<Play />} onPress={() => flow.act(t.id, 'resume')} />
          )}
          <Button title="End task" variant="primary" disabled={disabled} icon={<Square />} onPress={() => flow.openComplete(t)} />
        </ActionRow>
      </ActionBar>
    );
  }
  return undefined;
}

/**
 * At most one notice: waiting for sign-off (with any earlier sent-back note), approved, or sent back.
 * A plain function, not a component, so a task with nothing to say adds no empty Screen slot.
 */
function statusBanner(task: Task): ReactNode {
  const note = str(task.rejectionNote);
  if (task.status === 'submitted') {
    const who =
      task.source === 'booking' ? 'Waiting for the requester to approve' : task.source === 'ticket' ? 'Waiting for IT to close the ticket' : 'Waiting for your manager to approve';
    return <Banner tone="warning" title={who} message={note ? `Sent back earlier: ${note}` : null} />;
  }
  if (task.status === 'completed' || task.status === 'reviewed') {
    // An IT-ticket task has no approval step: ending it completes it (use-task-flow), so "Approved"
    // would be untrue there.
    if (task.source === 'ticket' && !task.approvedBy) return <Banner tone="success" title="Done" />;
    return <Banner tone="success" title={`Approved${task.approvedBy ? ` by ${str(task.approvedBy)}` : ''}`} />;
  }
  if (note) return <Banner tone="danger" title="Sent back" message={note} />;
  return null;
}

/** Everything known about the task: plain facts for the SummaryCard, and the people / link to reach. */
function useFacts(row: TaskRow | undefined, bookings: Booking[] | undefined, today: string): { facts: SummaryItem[]; contacts: Contact[] } {
  const t = row && row.kind !== 'bk' ? row.task : undefined;
  const needsClient = t?.source === 'resource_request' && !!t.clientName;
  const clients = useClients(needsClient);
  if (!row) return { facts: [], contacts: [] };
  const bookingList = (Array.isArray(bookings) ? bookings : []).filter(Boolean);
  const clientList = (Array.isArray(clients.data) ? clients.data : []).filter(Boolean);
  const bk = row.booking;

  const place = str(
    bk?.shootingLocation || t?.shootingLocation || (t?.bookingId ? bookingList.find((b) => b?.id === t.bookingId)?.shootingLocation : '') || '',
  );
  const start = str(bk?.startTime || t?.startTime);
  const end = str(bk?.endTime || t?.endTime);

  // Empty facts (no project code, no date) are left out rather than shown as "—" / "No date".
  const project = row.project && row.project !== '—' ? row.project : '';
  // With a booked end time the times get their own row; otherwise the start time rides on the date
  // (or, with no date at all, gets the Time row itself).
  const date = dueText(end ? { due: row.due, time: '' } : row, today);
  const times = end || (!row.due && start) ? [start, end].filter(Boolean).map(hmLabel).join(' – ') : '';
  const facts: SummaryItem[] = [
    ...(project ? [{ key: 'code', label: 'Project code', value: project }] : []),
    ...(date ? [{ key: 'due', label: 'Date', value: date }] : []),
    ...(times ? [{ key: 'time', label: 'Time', value: times }] : []),
    ...(place ? [{ key: 'place', label: 'Place', value: place }] : []),
  ];
  const contacts: Contact[] = [];

  if (t?.source === 'ticket') {
    if (t.requesterName) {
      facts.push({ key: 'raised', label: 'Raised by', value: str(t.requesterName) });
      contacts.push(...contactsOf(str(t.requesterName), t.requesterPhone, t.requesterEmail));
    }
  } else if (t?.source === 'resource_request') {
    if (t.clientName) {
      const client = clientList.find((c) => c?.id === t.clientId) || clientList.find((c) => c?.name === t.clientName);
      facts.push({ key: 'client', label: 'Client', value: str(t.clientName) });
      contacts.push(...contactsOf(str(t.clientName), t.clientPhone || client?.phone, t.clientEmail || client?.email));
      if (t.requesterName) facts.push({ key: 'raised', label: 'Raised by', value: str(t.requesterName) });
    } else {
      facts.push({ key: 'req', label: 'Requested by', value: str(t.requesterName) || '—' });
      contacts.push(...contactsOf(str(t.requesterName), t.requesterPhone, t.requesterEmail));
    }
    const from = dayAndTime(t.startDate, t.startTime, today);
    const to = dayAndTime(t.endDate, t.endTime, today);
    const when = from ? `${from}${to ? ` – ${to}` : ''}` : '';
    if (when) facts.push({ key: 'when', label: 'When', value: when });
    const link = str(t.referenceLink);
    if (link) {
      contacts.push({
        key: 'link',
        icon: Link2,
        title: 'Reference link',
        sub: link.replace(/^https?:\/\//i, ''),
        action: 'Open',
        onPress: () => void WebBrowser.openBrowserAsync(/^https?:\/\//i.test(link) ? link : `https://${link}`).catch(() => {}),
      });
    }
  } else if (row.requesterName) {
    facts.push({ key: 'from', label: row.kind === 'bk' || t?.source === 'booking' ? 'Requested by' : 'From', value: row.requesterName });
  }
  return { facts, contacts };
}

function Hero({ row, today }: { row: TaskRow; today: string }) {
  const st = rowStatus(row, today);
  const t = row.task;
  // The time worked is the figure once work has begun: ticking while it runs, still while paused.
  const started = !!t && (t.status === 'in_progress' || workedSeconds(t) > 0);
  // Booked work also shows how much of its booked time is used (Payno's limit bar); while the timer
  // runs it refreshes twice a minute.
  const booked = started ? bookedHours(row) : null;
  const now = useNow(booked != null && isRunning(t), 30_000);
  const figure = !t || !started ? undefined : t.status === 'in_progress' ? (
    <LiveTimer task={t} size={44} color={isRunning(t) ? palette.ink : palette.textMuted} showPaused={false} />
  ) : (
    <Text
      tabular
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      maxFontSizeMultiplier={1.15}
      style={styles.worked}
      accessibilityLabel={`${workedLabel(workedSeconds(t))} worked`}>
      {workedLabel(workedSeconds(t))}
    </Text>
  );
  return (
    <SummaryHero icon={taskIcon(row.category)} module="tasks" label={refLine(row)} figure={figure}>
      <View style={styles.heroText}>
        <Text variant="heading" color={palette.ink} numberOfLines={4} accessibilityRole="header">
          {row.title || 'Task'}
        </Text>
        <StatusPill label={st.label} tone={st.tone} />
      </View>
      {t && booked != null ? (
        <StripedProgress label="Booked time" used={hoursOf(elapsedOf(t, now))} total={booked} formatValue={hoursText} style={styles.progress} />
      ) : null}
    </SummaryHero>
  );
}

function DetailSkeleton() {
  const { gap } = useLayout();
  return (
    <View style={{ gap }} accessibilityLabel="Loading task" accessibilityRole="progressbar">
      <Skeleton height={196} radius={radius.xxl} />
      <Skeleton height={184} radius={radius.xl} />
    </View>
  );
}

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tasksQ = useMyTasks();
  const bookingsQ = useMyProBookings();
  const projectsQ = useProjects();
  useDirectoryUsers(); // warms the account list the Start/End code check reads
  const flow = useTaskFlow();
  const today = useTodayIst();
  const { gap } = useLayout();
  const { rows, tasks } = useRows(tasksQ.data, bookingsQ.data, projectsQ.data);
  const row = rows.find((r) => r.id === id);
  const anyRunning = tasks.some(isRunning);
  const t = row?.kind !== 'bk' ? row?.task : undefined;
  const { facts, contacts } = useFacts(row, bookingsQ.data, today);
  const details = row ? str(row.desc) : '';
  const completedAt = stampLabel(t?.completedAt, today);
  const doneBy = [t?.completedBy ? `By ${str(t.completedBy)}` : '', completedAt].filter(Boolean).join(' · ');

  return (
    <Screen
      header={<NavHeader title="Task" />}
      footer={row ? actionBar(row, flow, anyRunning, today) : undefined}
      onRefresh={() => Promise.all([tasksQ.refetch(), bookingsQ.refetch()])}>
      {row ? (
        <Hero row={row} today={today} />
      ) : tasksQ.isLoading ? (
        <DetailSkeleton />
      ) : tasksQ.isError ? (
        <ErrorState message={tasksQ.error?.message ?? ''} onRetry={() => tasksQ.refetch()} />
      ) : (
        <EmptyState icon={<SearchX color={palette.textMuted} />} title="Task not found" message="It may have been given to someone else or removed." />
      )}

      {t ? statusBanner(t) : null}

      {row && facts.length ? <SummaryCard rows={facts} /> : null}

      {row && contacts.length ? (
        <View style={{ gap: gap - space.xxs }}>
          {contacts.map((c) => (
            <AccountRow
              key={c.key}
              icon={c.icon}
              module="tasks"
              title={c.title}
              sub={c.sub}
              actionLabel={c.action}
              onPress={c.onPress}
              accessibilityLabel={`${c.action}, ${c.sub}, ${c.title}`}
            />
          ))}
        </View>
      ) : null}

      {details ? (
        <TextCard title={row?.kind === 'bk' ? 'Notes' : 'Details'}>
          <Text variant="body" selectable>
            {details}
          </Text>
        </TextCard>
      ) : null}

      {t && (t.completionRemarks || t.completedBy) ? (
        <TextCard title="Completion note">
          <Text variant="body" muted={!t.completionRemarks} selectable>
            {str(t.completionRemarks) || 'No note added.'}
          </Text>
          {doneBy ? (
            <Text variant="caption" muted>
              {doneBy}
            </Text>
          ) : null}
        </TextCard>
      ) : null}

      {flow.ui}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  heroText: { gap: space.xs, alignItems: 'flex-start' },
  progress: { marginTop: space.sm },
  worked: { ...typeScale.numeral, fontSize: 44, lineHeight: 50, color: palette.ink },
  textCard: { gap: space.xs },
}));
