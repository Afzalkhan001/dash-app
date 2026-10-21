// One team task as a Lendora MetricRow (docs/port/manager-work.md §4.2): a dot + the title, who has
// it · the project code · the date, the hours worked against the hours booked ("1.5/3 h"), a soft
// status pill and a ••• for Open / Edit / Mark done / Delete. Tapping the row opens the task.

import type { TeamTask } from '@/api/work';
import { dueText, hoursOf, workedLabel } from '@/features/tasks/model';
import { bookedHoursOf, teamStatus, workDate, workedOf } from '@/features/work/model';
import { moduleTone, palette } from '@/theme/tokens';
import { MetricRow } from '@/ui';

export function teamTaskSub(t: TeamTask, code: string, today: string) {
  const when = dueText({ due: workDate(t), time: String(t.startTime || '') }, today);
  return [String(t.assignee || ''), code, when].filter(Boolean).join(' · ');
}

export function TeamTaskRow({
  task,
  code,
  today,
  now,
  onOpen,
  onMore,
}: {
  task: TeamTask;
  code: string;
  today: string;
  now: number;
  onOpen: () => void;
  onMore?: () => void;
}) {
  const st = teamStatus(task, today);
  const secs = workedOf(task, now);
  const booked = bookedHoursOf(task);
  const sub = teamTaskSub(task, code, today);
  const spoken = [task.title, sub, secs ? `${workedLabel(secs)} worked` : 'Not started', booked != null ? `of ${booked} hours booked` : '', st.label]
    .filter(Boolean)
    .join(', ');
  return (
    <MetricRow
      label={String(task.title || 'Task')}
      sub={sub || null}
      value={hoursOf(secs)}
      total={booked}
      unit="h"
      dotColor={st.tone === 'failed' ? palette.danger : moduleTone.tasks.fg}
      status={st}
      onPress={onOpen}
      onMore={onMore}
      moreAccessibilityLabel={`Actions for ${task.title || 'this task'}`}
      accessibilityLabel={spoken}
      hint="Opens the task"
    />
  );
}
