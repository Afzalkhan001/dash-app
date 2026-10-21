// One Team Roster task as a Lendora MetricRow: a priority dot + the title; who has it · project ·
// "Part of" · type · due; hours logged against the estimate ("1.5/4 h", or the running clock); a soft
// status pill (Overdue wins); and a ••• with the row's actions. Tapping opens the task.

import type { TrTask } from '@/api/teamboard';
import { dueLine, hms, hoursLabel, isRunningTr, liveSeconds, PRIORITY_LABEL, taskIsOverdue, taskPill } from '@/features/teamboard/model';
import { palette } from '@/theme/tokens';
import { MetricRow } from '@/ui';

/** The priority's dot (PROJECT_PRIORITY_COLORS 13524, in theme tokens; read at render). */
export function priorityDot(p: TrTask['priority']) {
  return p === 'urgent' ? palette.danger : p === 'high' ? palette.warning : p === 'medium' ? palette.info : palette.textFaint;
}

export function taskSub(t: TrTask, today: string, opts: { assignee?: boolean; project?: boolean; parent?: boolean } = {}) {
  const { assignee = true, project = true, parent = true } = opts;
  return [
    assignee ? t.assignee_name || 'Unassigned' : '',
    project ? t.project_name : '',
    parent && t.parent_title ? `Part of ${t.parent_title}` : '',
    t.type,
    dueLine(t.due_date, taskIsOverdue(t, today), today),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function TrTaskRow({
  task,
  today,
  now,
  sub,
  onOpen,
  onMore,
}: {
  task: TrTask;
  today: string;
  now: number;
  /** The muted line; defaults to taskSub(). */
  sub?: string;
  onOpen?: () => void;
  onMore?: () => void;
}) {
  const running = isRunningTr(task);
  const secs = liveSeconds(task, now);
  // An unassigned sub work reads amber (WorkDetailModal 14611) until someone has it.
  const pill = !task.assignee_id && task.status !== 'done' ? { label: 'Unassigned', tone: 'pending' as const } : taskPill(task, today);
  const line = sub ?? taskSub(task, today);
  const est = task.estimated_hours;
  const hours = Math.round((secs / 3600) * 10) / 10;
  const spoken = [
    task.title,
    `${PRIORITY_LABEL[task.priority]} priority`,
    line,
    running ? `running, ${hms(secs)}` : secs ? `${hoursLabel(secs)} logged` : 'No time logged',
    est != null ? `estimate ${est} hours` : '',
    pill.label,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <MetricRow
      label={task.title || 'Untitled task'}
      sub={line || null}
      value={running ? hms(secs) : hours}
      total={running ? null : est}
      unit={running ? undefined : 'h'}
      dotColor={priorityDot(task.priority)}
      status={running ? { label: 'Running', tone: 'info' } : pill}
      onPress={onOpen}
      onMore={onMore}
      moreAccessibilityLabel={`Actions for ${task.title || 'this task'}`}
      accessibilityLabel={spoken}
      hint={onOpen ? 'Opens the task' : undefined}
    />
  );
}
