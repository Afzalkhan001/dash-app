// Everything that has happened to a claim, oldest first, ending with what it is waiting on
// (web: PaymentTrail fed by reimbursementEvents). A thin wrapper over the kit's EventTimeline: maps
// the claim's event kinds to the shared tones and flattens the detail pairs into one line.

import { isoDayTime, type TimelineEvent } from '@/features/reimbursements/format';
import { EventTimeline, Text, type TimelineTone } from '@/ui';

// c = neutral step, a = approval, s = payment step, p = paid/received, r = rejected/problem, w = waiting
const TONE: Record<TimelineEvent['k'], TimelineTone> = {
  c: 'neutral',
  a: 'info',
  s: 'info',
  p: 'good',
  r: 'bad',
  w: 'wait',
};

/** Pass `today` (useTodayIst()) for the dates. */
export function Timeline({ events, today }: { events: TimelineEvent[]; today?: string }) {
  const list = Array.isArray(events) ? events.filter(Boolean) : [];
  if (!list.length) {
    return (
      <Text variant="label" muted>
        No history yet.
      </Text>
    );
  }
  return (
    <EventTimeline
      events={list.map((e, i) => {
        const pairs = Array.isArray(e.detail) ? e.detail.filter((d) => Array.isArray(d) && d[1]) : [];
        return {
          key: `${i}-${e.label}`,
          label: e.label,
          at: e.at ? isoDayTime(e.at, today) : null,
          by: e.by || null,
          detail: pairs.length ? pairs.map(([k, v]) => `${k}: ${v}`).join(' · ') : null,
          note: e.note || null,
          tone: TONE[e.k] ?? 'neutral',
        };
      })}
    />
  );
}
