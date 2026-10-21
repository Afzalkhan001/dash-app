// Rows of My Tasks, from the kit:
//   TaskMetricRow   work still open (Paused, To do) as a Lendora MetricRow — a dot + the title, the
//                   project code and date, the hours worked against the hours booked ("1.5/3 h"), a soft
//                   status pill (Overdue / Due today / To do / Paused) and a ••• that opens the task's
//                   actions (taskMenu) — so Start / Pause / Resume / End task are one tap from the list
//                   without a row of buttons
//   TaskActivityRow finished or waiting work (and search results) as a quieter ActivityRow
// Tapping either row opens the task (/tasks/<id>), whose bottom bar holds the same actions.
//
//   ● Shoot at Banjara Hills
//     TM_INT_REEL26 · Today, 10:00 AM
//     1.5/3 h                       [Due today]  •••

import { CalendarClock, ClipboardList, type LucideIcon, Package, Pause, Play, Square, SquareArrowOutUpRight, Ticket } from 'lucide-react-native';

import { bookedHours, canStartOn, dueState, dueText, hoursOf, isRunning, safeDay, statusPill, type TaskRow, workedLabel, workedSeconds } from '@/features/tasks/model';
import type { useTaskFlow } from '@/features/tasks/use-task-flow';
import { moduleTone, palette, type StatusTone } from '@/theme/tokens';
import { ActivityRow, type MenuItem, MetricRow } from '@/ui';

export type TaskFlow = ReturnType<typeof useTaskFlow>;

// Ticket / asset request / booking / plain task.
export function taskIcon(category?: string): LucideIcon {
  switch (category) {
    case 'ticket':
      return Ticket;
    case 'asset':
      return Package;
    case 'booking':
      return CalendarClock;
    default:
      return ClipboardList;
  }
}

/** "TM_INT_REEL26 · Today, 10:00 AM" (empty parts left out). */
export const rowSubtitle = (row: TaskRow, today: string) => [row.project && row.project !== '—' ? row.project : '', dueText(row, today)].filter(Boolean).join(' · ');

/** The row's status pill: late or due-today work says so; otherwise the plain status word. */
export function rowStatus(row: TaskRow, today: string): { label: string; tone: StatusTone } {
  const due = dueState(row, today);
  if (due === 'overdue') return { label: 'Overdue', tone: 'failed' };
  if (due === 'today') return { label: 'Due today', tone: 'pending' };
  return statusPill(row);
}

/** Open work as a MetricRow: hours worked / booked, the status pill and a ••• for its actions. */
export function TaskMetricRow({ row, today, onOpen, onMore }: { row: TaskRow; today: string; onOpen: () => void; onMore?: () => void }) {
  const st = rowStatus(row, today);
  const worked = workedSeconds(row.task);
  const booked = bookedHours(row);
  const subtitle = rowSubtitle(row, today);
  const late = st.tone === 'failed';
  const spoken = [
    row.title,
    subtitle,
    worked ? `${workedLabel(worked)} worked` : 'Not started',
    booked != null ? `of ${booked} hours booked` : '',
    st.label,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <MetricRow
      label={row.title || 'Task'}
      sub={subtitle || null}
      value={hoursOf(worked)}
      total={booked}
      unit="h"
      dotColor={late ? palette.danger : moduleTone.tasks.fg}
      status={st}
      onPress={onOpen}
      onMore={onMore}
      moreAccessibilityLabel={`Actions for ${row.title || 'this task'}`}
      accessibilityLabel={spoken}
      hint="Opens the task"
    />
  );
}

/**
 * Waiting, done or found work as an ActivityRow: the time worked on the right. Search results
 * (`showStatus`) add the status pill; in the grouped list the section title already says it.
 */
export function TaskActivityRow({ row, today, showStatus, onOpen }: { row: TaskRow; today: string; showStatus?: boolean; onOpen: () => void }) {
  const st = rowStatus(row, today);
  const worked = workedSeconds(row.task);
  const subtitle = rowSubtitle(row, today);
  const running = isRunning(row.task);
  return (
    <ActivityRow
      module="tasks"
      icon={taskIcon(row.category)}
      title={row.title || 'Task'}
      subtitle={subtitle || null}
      value={running ? 'Running' : worked ? workedLabel(worked) : null}
      status={showStatus ? st : null}
      chevron={!showStatus}
      onPress={onOpen}
      accessibilityLabel={[row.title, subtitle, worked ? `${workedLabel(worked)} worked` : '', st.label].filter(Boolean).join(', ')}
    />
  );
}

// MenuSheet runs an item ~280 ms after it starts closing; a sheet opened from it waits a little more,
// so iOS (one Modal at a time) never gets a new sheet while the menu is still fading out.
const AFTER_MENU_MS = 140;
const afterMenu = (fn: () => void) => () => {
  setTimeout(fn, AFTER_MENU_MS);
};

/**
 * The ••• menu of an open task: the same next steps (and the same rules) as the task's bottom bar —
 * Start (not before its day, not while another task runs), Pause or Resume, End task — then Open task.
 */
export function taskMenu(row: TaskRow, flow: TaskFlow, anyRunning: boolean, today: string, open: () => void): MenuItem[] {
  const busy = !!flow.busyId;
  const openItem: MenuItem = { key: 'open', label: 'Open task', icon: SquareArrowOutUpRight, onPress: open };
  const startItem = (date: unknown, onPress: () => void): MenuItem => {
    const notYet = !canStartOn(typeof date === 'string' ? date : '', today);
    return {
      key: 'start',
      label: 'Start',
      icon: Play,
      // Start may open the code sheet: let the menu finish fading first.
      onPress: afterMenu(onPress),
      disabled: busy || notYet || anyRunning,
      hint: notYet ? `You can start on ${safeDay(String(date), today)}` : anyRunning ? 'Pause your running task first' : undefined,
    };
  };

  if (row.kind === 'bk' && row.booking) {
    const bk = row.booking;
    return [startItem(bk.date, () => flow.startBooking(bk)), openItem];
  }
  const t = row.task;
  if (!t) return [openItem];
  if (t.status === 'pending') return [startItem(t.bookingDate, () => flow.act(t.id, 'start')), openItem];
  if (t.status === 'in_progress') {
    const running = isRunning(t);
    return [
      running
        ? { key: 'pause', label: 'Pause', icon: Pause, disabled: busy, onPress: () => flow.act(t.id, 'pause') }
        : { key: 'resume', label: 'Resume', icon: Play, disabled: busy, onPress: () => flow.act(t.id, 'resume') },
      { key: 'end', label: 'End task', icon: Square, disabled: busy, onPress: afterMenu(() => flow.openComplete(t)) },
      openItem,
    ];
  }
  return [openItem];
}
