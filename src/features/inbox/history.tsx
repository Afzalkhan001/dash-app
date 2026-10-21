// Past decisions: requests this person already approved or rejected (or that were cancelled), one
// queue at a time. Reached from the foot of the Inbox. Rows open the same detail screen, read-only
// once decided.
//
// One filter level only — the type chips on the screen above. Every decided status of the picked
// type is in one list, newest decision first, split into days by when it was decided (one titled kit
// ActivityList per day — Today · Yesterday · Mon, 12 Oct over one frosted card — the Inbox's own look). Each
// row is the Inbox's InboxRequestRow: the person, what it was, on the right the figure over one
// StatusPill (the pill moves under the text on a narrow phone), and who decided it with their note
// (or the employee's reason) across the full width under it, up to two lines. The statuses are read
// with the Inbox's own queries (GET <list>?status=<s>, one per status, the keys Past decisions always
// used).

import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { History } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { type HrKindKey, type HrRequest, hrListQuery, hrStatuses, kekaIsReviewed, useKekaQueue } from '@/api/inbox';
import { useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { decidedLine, type DayGroup, groupByDay, hrRow, hrStatusLabel, hrStatusTone, kekaDecidedAt, kekaRow, kekaStatus, timeValue } from '@/features/inbox/format';
import { InboxListSkeleton } from '@/features/inbox/inbox-list';
import { useLeaveNames } from '@/features/inbox/leave-names';
import { InboxRequestRow } from '@/features/inbox/request-row';
import { palette, space } from '@/theme/tokens';
import { ActivityList, Banner, Button, EmptyState, ErrorState } from '@/ui';

import { themedStyles } from '@/theme/themed';
const PAGE = 30;

// What one queue's requests are called, for its empty state.
const NOUN: Record<HrKindKey, string> = {
  regularization: 'attendance fixes',
  leave: 'leave requests',
  wfh: 'work-from-home requests',
  comp_off: 'comp-off requests',
  reimbursements: 'salary claims',
  loans: 'salary advances',
};

const message = (e: unknown) => (e instanceof Error && e.message) || 'Something went wrong. Try again.';

function ShowMore({ left, onPress }: { left: number; onPress: () => void }) {
  if (left <= 0) return null;
  return <Button title={`Show ${Math.min(PAGE, left)} more`} variant="ghost" size="md" onPress={onPress} style={styles.more} />;
}

const nothingYet = (title: string, text: string) => <EmptyState icon={<History color={palette.textMuted} strokeWidth={1.8} />} title={title} message={text} />;

// One titled ActivityList (a frosted card of rows) per day the decisions were made on.
function DayCards<T>({ groups, row }: { groups: DayGroup<T>[]; row: (item: T) => ReactNode }) {
  return (
    <View style={styles.groups}>
      {groups.map((g) => (
        <ActivityList key={g.key} title={g.label}>
          {g.items.map(row)}
        </ActivityList>
      ))}
    </View>
  );
}

// ── HR requests (ApprovalsPanel, every decided status) ───────────────────────
export function HrHistory({ kind }: { kind: HrKindKey }) {
  const router = useRouter();
  const today = useTodayIst();
  const names = useLeaveNames();
  const userId = useSession((s) => s.user?.id);
  const statuses = hrStatuses(kind).filter((s) => s !== 'pending');
  const [limit, setLimit] = useState(PAGE);
  const qs = useQueries({ queries: statuses.map((s) => hrListQuery(kind, s, userId)) });

  // Every decided request once (each sits in the list of its status), newest decision first.
  const seen = new Set<string>();
  const rows: { r: HrRequest; listed: string }[] = [];
  qs.forEach((q, i) => {
    for (const r of Array.isArray(q.data) ? q.data : []) {
      if (!r || typeof r !== 'object' || !r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push({ r, listed: statuses[i] ?? r.status });
    }
  });
  rows.sort((a, b) => timeValue(b.r.decided_at || b.r.created_at) - timeValue(a.r.decided_at || a.r.created_at));

  const failed = qs.filter((q) => q.isError && !q.data);
  const refetchFailed = () => failed.forEach((q) => void q.refetch());

  let body;
  if (qs.length && failed.length === qs.length) body = <ErrorState message={message(failed[0]?.error)} onRetry={refetchFailed} />;
  else if (!rows.length && qs.some((q) => q.isPending)) body = <InboxListSkeleton rows={3} />;
  else if (!rows.length) body = nothingYet(`No past ${NOUN[kind]}`, 'They show up here once decided.');
  else
    body = (
      <DayCards
        groups={groupByDay(rows.slice(0, limit), ({ r }) => r.decided_at || r.created_at, today)}
        row={({ r, listed }) => {
          const m = hrRow(kind, r, today, names);
          // Who decided (with their note), or the employee's reason; the day is the group's label.
          const note = decidedLine(r) || m.meta;
          const status = { label: hrStatusLabel(r.status), tone: hrStatusTone(r.status) };
          return (
            <InboxRequestRow
              key={r.id}
              person={{ name: r.employee_name }}
              title={m.title}
              subtitle={m.subtitle}
              detail={note}
              value={m.value}
              status={status}
              accessibilityLabel={[m.title, m.subtitle, m.value, status.label, note].filter(Boolean).join(', ')}
              onPress={() => router.push(`/inbox/${kind}/${encodeURIComponent(r.id)}?status=${encodeURIComponent(listed)}`)}
            />
          );
        }}
      />
    );

  return (
    <View style={styles.section}>
      {failed.length && failed.length < qs.length ? (
        <Banner tone="warning" title="Some decisions didn’t load" action={{ label: 'Try again', onPress: refetchFailed }} />
      ) : null}
      {body}
      <ShowMore left={rows.length - limit} onPress={() => setLimit((n) => n + PAGE)} />
    </View>
  );
}

// ── Expense claims already reviewed (ReimbursementApprovals "Already reviewed") ──
export function KekaHistory() {
  const router = useRouter();
  const now = useNow();
  const today = useTodayIst();
  const [limit, setLimit] = useState(PAGE);
  const q = useKekaQueue();
  // Newest decision first, like the HR lists (each claim with when its project-owner step was decided).
  const rows = (Array.isArray(q.data) ? q.data : [])
    .filter((r) => !!r && typeof r === 'object' && kekaIsReviewed(r))
    .map((r) => ({ r, decidedAt: kekaDecidedAt(r) }))
    .sort((a, b) => timeValue(b.decidedAt) - timeValue(a.decidedAt));

  let body;
  if (q.isError && !q.data) body = <ErrorState message={message(q.error)} onRetry={() => void q.refetch()} />;
  else if (q.isPending) body = <InboxListSkeleton rows={3} />;
  else if (!rows.length) body = nothingYet('Nothing decided yet', 'Expense claims you approve or reject show up here.');
  else
    body = (
      <DayCards
        groups={groupByDay(rows.slice(0, limit), ({ decidedAt }) => decidedAt, today)}
        row={({ r }) => {
          const m = kekaRow(r, now);
          const st = kekaStatus(r);
          // The project (or the amount change); the day it was decided is the group's label.
          return (
            <InboxRequestRow
              key={r.id}
              person={{ name: r.employee_name }}
              title={m.title}
              subtitle={m.subtitle}
              detail={m.meta}
              value={m.value}
              status={st}
              accessibilityLabel={[m.title, m.subtitle, m.value, st.label, m.meta].filter(Boolean).join(', ')}
              onPress={() => router.push(`/inbox/keka/${encodeURIComponent(r.id)}`)}
            />
          );
        }}
      />
    );

  return (
    <View style={styles.section}>
      {body}
      <ShowMore left={rows.length - limit} onPress={() => setLimit((n) => n + PAGE)} />
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.md },
  // Air between days; title-to-card is ActivityList's own.
  groups: { gap: space.lg },
  more: { alignSelf: 'center' },
}));
