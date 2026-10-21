// The Inbox summary (docs/REFERENCE-COMPONENTS.md §3 "Inbox", Lendora's two-up SparkCards): two
// half-width frosted cards at the top of the Inbox for people who approve things.
//
//   ┌ Waiting ─────────────┐ ┌ Done today ──────────┐
//   │ Last 7 days          │ │ Last 7 days          │
//   │  ~~~~~~~~~~~~~~~•    │ │  ~~~~~~~~~~~~~~~•    │
//   │ Today          2     │ │ Approved       3     │
//   │ Waiting       14     │ │ Total          4     │
//   │ 3+ days        3     │ │ Rejected       1     │
//   └──────────────────────┘ └──────────────────────┘
//
// Waiting: what is waiting now — how many came in each of the last 7 days (the line), how many came
// in today, the total, and how many have waited 3 days or more.
// Done today: what was approved or rejected today, from data already loaded — the decided lists
// Past decisions keeps in the cache, the project claims list the Inbox already reads, and decisions made
// in the app since it opened (features/inbox/decided). Nothing extra is fetched: those lists are
// subscribed to with `enabled: false`, so they never fire a request (or join a pull-to-refresh) from
// here. Tapping it opens Past decisions. It shows only for people with a Past decisions list (HR
// requests or project claims to review).
//
// Side by side the footers are label · figure rows (three labels don't fit a half card on one line);
// stacked full width (< 300 dp or text larger than 115 %) they are Lendora's three columns. The two
// titles stay one line each down to 300 dp ("Done today", not "Decided today", which wrapped at 320 dp
// and pushed that card's line and figures below the other card's), so the two cards line up.

import { useQueries, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { type Decision, type HrRequest, hrListQuery, hrStatuses, type KekaReimbursement, kekaQuery } from '@/api/inbox';
import { useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { useSessionDecisions } from '@/features/inbox/decided';
import { type InboxItem, istDay, lastDays, timeValue } from '@/features/inbox/format';
import type { InboxQueue } from '@/features/inbox/use-inbox';
import { palette, radius } from '@/theme/tokens';
import { shouldStack, Skeleton, SparkCard, TwoUp, useLayout } from '@/ui';

const DAYS = 7;
const DAY_MS = 86_400_000;
/** "3+ days": waiting at least this long. */
const OLD_MS = 3 * DAY_MS;
/** The two cards stack below this width (TwoUp's `stackBelow`), or with text larger than 115 %. */
const STACK_BELOW = 'tiny';
/**
 * A side-by-side SparkCard's height less its padding (rows footer): 262 with the regular 20 dp card
 * padding, 254 with the compact 16, so the cards replace their placeholder in place.
 */
const SKELETON_INNER_H = 222;

const rowsOf = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []).filter((r): r is T => !!r && typeof r === 'object');
const str = (v: unknown) => (typeof v === 'string' ? v : '');

// An HR request's decision, from its status: approved (and since paid / paid back) or rejected.
// Cancelled is the employee's own doing, not a decision.
function hrDecision(status: unknown): Decision | null {
  if (status === 'approved' || status === 'paid' || status === 'closed') return 'approve';
  if (status === 'rejected') return 'reject';
  return null;
}

// The project owner's step of a claim: approved or rejected, and when. A skipped step is no decision.
function kekaDecision(r: KekaReimbursement): { decision: Decision; at: string } | null {
  const history = (Array.isArray(r.history) ? r.history : []).filter((h) => !!h && typeof h === 'object');
  const last = [...history].reverse().find((h) => h.event === 'keka_approved' || h.event === 'keka_rejected' || h.event === 'keka_skipped');
  if (last) return last.event === 'keka_skipped' ? null : { decision: last.event === 'keka_approved' ? 'approve' : 'reject', at: str(last.at) };
  if (str(r.keka_approved_at)) return { decision: 'approve', at: str(r.keka_approved_at) };
  return null;
}

/** Whether this person gets the summary: they approve something (not only visitors at reception, or a plug-in notice queue). */
export const hasInboxSummary = (queues: InboxQueue[]) =>
  (Array.isArray(queues) ? queues : []).some((q) => q.type !== 'visitors' && !(q.type === 'plugin' && !q.decides));

export function InboxSummary({ items, queues }: { items: InboxItem[]; queues: InboxQueue[] }) {
  const router = useRouter();
  const l = useLayout();
  const now = useNow();
  const today = useTodayIst();
  const userId = useSession((s) => s.user?.id);
  const list = Array.isArray(queues) ? queues : [];
  const waiting = Array.isArray(items) ? items : [];

  // Past decisions exists for HR requests, project claims and plug-ins with a History, so "Done today" does too.
  const hrKinds = list.flatMap((q) => (q.type === 'hr' ? [q.key] : []));
  const kekaOn = list.some((q) => q.type === 'keka');
  const pluginReviews = list.flatMap((q) => (q.type === 'plugin' && q.hasHistory ? [q] : []));
  const reviews = hrKinds.length > 0 || kekaOn || pluginReviews.length > 0;

  // Cache only (enabled: false): Past decisions' lists, and the project claims the Inbox already reads.
  const specs = hrKinds.flatMap((kind) => hrStatuses(kind).filter((s) => s !== 'pending').map((status) => ({ kind, status })));
  const decidedLists = useQueries({ queries: specs.map((s) => hrListQuery(s.kind, s.status, userId, { enabled: false })) });
  const claims = useQuery(kekaQuery(userId, { enabled: false }));
  const session = useSessionDecisions(userId);

  const days = lastDays(today, DAYS);

  // ── Waiting ──
  const cameIn = days.map((d) => waiting.filter((i) => istDay(i.at) === d).length);
  const newToday = cameIn[cameIn.length - 1] ?? 0;
  const old = waiting.filter((i) => {
    const t = timeValue(i.at);
    return t > 0 && now - t >= OLD_MS;
  }).length;

  // ── Decided ── one entry per request (keyed like the Inbox's items), the cached copy first.
  const decided = new Map<string, { day: string; decision: Decision }>();
  specs.forEach((s, i) => {
    for (const r of rowsOf<HrRequest>(decidedLists[i]?.data)) {
      const decision = hrDecision(r.status);
      const day = istDay(r.decided_at);
      if (r.id && decision && day) decided.set(`${s.kind}:${r.id}`, { day, decision });
    }
  });
  if (kekaOn) {
    for (const r of rowsOf<KekaReimbursement>(claims.data)) {
      const d = r.id ? kekaDecision(r) : null;
      const day = d ? istDay(d.at) : '';
      if (d && day) decided.set(`keka:${r.id}`, { day, decision: d.decision });
    }
  }
  // A plug-in's decisions from its own cache (InboxPluginResult.decided), keyed like its Inbox items.
  for (const q of pluginReviews) {
    for (const d of q.decided) {
      const day = d && d.id ? istDay(d.at) : '';
      if (day && (d.decision === 'approve' || d.decision === 'reject')) decided.set(`${q.key}:${d.id}`, { day, decision: d.decision });
    }
  }
  // Visitors are let in or turned away, not approved: they stay out of these counts.
  for (const s of session) {
    const day = istDay(s.at);
    if (day && !s.key.startsWith('visitors:') && !decided.has(s.key)) decided.set(s.key, { day, decision: s.decision });
  }
  const all = [...decided.values()];
  const perDay = days.map((d) => all.filter((x) => x.day === d).length);
  const approvedToday = all.filter((x) => x.day === today && x.decision === 'approve').length;
  const rejectedToday = all.filter((x) => x.day === today && x.decision === 'reject').length;
  const decidedToday = approvedToday + rejectedToday;

  // Side by side down to a 300 dp phone (stacked, the two cards would push the list a screen down);
  // stacked only on a tiny phone or with larger text.
  const sideBySide = reviews && !shouldStack(l, { below: STACK_BELOW });
  const footerLayout = sideBySide ? 'rows' : 'columns';

  return (
    <TwoUp stackBelow={STACK_BELOW}>
      <SparkCard
        key="waiting"
        title="Waiting"
        subtitle="Last 7 days"
        values={cameIn}
        highlight={days.length - 1}
        footerLayout={footerLayout}
        footer={[
          { label: 'Today', value: newToday },
          { label: 'Waiting', value: waiting.length },
          { label: '3+ days', value: old },
        ]}
        accessibilityLabel={`${waiting.length} waiting on you. ${newToday} came in today, ${old} waiting 3 days or more.`}
      />
      {reviews ? (
        <SparkCard
          key="decided"
          title="Done today"
          subtitle="Last 7 days"
          color={palette.coral}
          values={perDay}
          highlight={days.length - 1}
          footerLayout={footerLayout}
          footer={[
            { label: 'Approved', value: approvedToday },
            { label: 'Total', value: decidedToday },
            { label: 'Rejected', value: rejectedToday },
          ]}
          onPress={() => router.push('/inbox/history')}
          accessibilityLabel={`Done today: ${decidedToday}, ${approvedToday} approved, ${rejectedToday} rejected. Opens Past decisions`}
        />
      ) : null}
    </TwoUp>
  );
}

/** Placeholder in the summary's place while the Inbox finds out what is waiting (same height, so nothing jumps). */
export function InboxSummarySkeleton() {
  const { cardPad } = useLayout();
  const height = SKELETON_INNER_H + 2 * cardPad;
  return (
    <TwoUp stackBelow={STACK_BELOW}>
      <View key="a">
        <Skeleton height={height} radius={radius.xl} />
      </View>
      <View key="b">
        <Skeleton height={height} radius={radius.xl} />
      </View>
    </TwoUp>
  );
}
