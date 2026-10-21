// Inbox — everything waiting on the signed-in person, in one list: requests they approve (leave,
// work from home, comp-off, attendance fixes, salary claims, salary advances), expense claims against
// project codes they own, petty cash waiting on them, and visitors at reception. Chips (All first,
// each with its count) narrow the list. Rows carry no buttons: tapping one opens it, and the
// decision is made there (swipe to approve).
//
// Open on one type with /inbox?type=<kind> (leave, wfh, comp_off, regularization, reimbursements,
// loans, keka, petty, visitors).
//
// Layout (docs/REFERENCE-COMPONENTS.md §3 "Inbox", Payno × Lendora):
//   header     TabRootHeader — "Inbox" centred (no back button), a round History button on the right
//              (Past decisions) for people who review requests or project claims
//   notice     at most one ("Some requests didn't load")
//   summary    two SparkCards side by side for approvers: Waiting | Done today (features/inbox/summary)
//              — for everyone else the header's overline says how many are waiting instead
//   policies   one "N policies to read" row when a published policy waits for my acknowledgement
//   chips      the kind filter (only with two or more kinds), right on top of the list it filters
//   list       one titled ActivityList per day (visitors at reception first, then Today · Yesterday ·
//              Mon, 12 Oct), pages of 30 with "Show N more"
//   past       a quiet "Past decisions" link at the foot
// Each is a fixed Screen slot, so content replaces its skeleton in place and the entrance never replays.

import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CircleCheck, History, ScrollText } from 'lucide-react-native';
import { type ReactNode, useCallback, useState } from 'react';

import Animated, { FadeIn } from 'react-native-reanimated';

import { inboxKeys } from '@/api/inbox';
import { CHIP_ROW_PAD, FollowChipRow } from '@/features/inbox/follow-chip-row';
import { type InboxKind, KIND_COPY, KIND_ORDER } from '@/features/inbox/format';
import { InboxGroups, InboxListSkeleton } from '@/features/inbox/inbox-list';
import { KindDot } from '@/features/inbox/kind-look';
import { hasInboxSummary, InboxSummary, InboxSummarySkeleton } from '@/features/inbox/summary';
import { useInboxSummary } from '@/features/inbox/use-inbox';
import { usePolicyPendingCount } from '@/features/policies/use-policy-actions';
import { plural } from '@/lib/format';
import { motion, palette, radius, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, Chip, EmptyState, ErrorState, Row, Screen, Skeleton, TabRootHeader, TourTarget } from '@/ui';

import { themedStyles } from '@/theme/themed';

const PAGE = 30;
// The Petty cash overview (its read also runs the server's over-spend catch-up, so it is refreshed
// here on focus and pull, never on the Inbox's one-minute timer).
const PETTY_OVERVIEW = ['petty', 'overview'] as const;
// Policies I still have to read (only ever active when the Policies module is on for me).
const POLICIES = ['policies', 'list'] as const;

type Filter = 'all' | InboxKind;

export default function InboxTab() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const summary = useInboxSummary();
  // 0 when Policies is off for this person (the hook is gated by sections.policies).
  const toRead = usePolicyPendingCount();
  const [picked, setPicked] = useState<Filter | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // A link that opens the Inbox on one type wins over whatever was picked before.
  const linked = typeof params.type === 'string' ? params.type : undefined;
  const [seenLink, setSeenLink] = useState(linked);
  if (linked !== seenLink) {
    setSeenLink(linked);
    setPicked(null);
    setLimit(PAGE);
  }

  // Tabs stay mounted, so coming back to this one refreshes whatever has gone stale.
  useFocusEffect(
    useCallback(() => {
      void qc.refetchQueries({ queryKey: inboxKeys.all, type: 'active', stale: true }, { cancelRefetch: false });
      void qc.refetchQueries({ queryKey: PETTY_OVERVIEW, type: 'active', stale: true }, { cancelRefetch: false });
    }, [qc]),
  );

  const queues = Array.isArray(summary.queues) ? summary.queues : [];
  const items = Array.isArray(summary.items) ? summary.items : [];
  const booting = summary.discovering || (queues.length > 0 && queues.every((q) => q.pending === null && !q.error));
  // Queues that failed with nothing cached to show.
  const broken = queues.filter((q) => q.error && q.pending === null);
  // Past decisions only exist for requests and project claims.
  const reviews = queues.some((q) => q.type === 'hr' || q.type === 'keka');
  // Approvers get the Waiting | Done today cards; the header then doesn't say the count again.
  const withSummary = hasInboxSummary(queues);
  // "Nothing waiting" only once every queue has answered — never while one is loading or failed.
  const settled = !booting && queues.every((q) => q.pending !== null);
  const policiesLine = `${plural(toRead, 'policy', 'policies')} to read`;
  const overline = items.length
    ? `${items.length} waiting on you`
    : toRead > 0
      ? policiesLine
      : settled
        ? 'Nothing waiting'
        : 'Waiting on you';

  // Chips: All, then every type with something waiting, in a fixed order.
  const counts = new Map<InboxKind, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const kinds = KIND_ORDER.filter((k) => (counts.get(k) ?? 0) > 0);
  const wanted = picked ?? linked ?? 'all';
  const filter: Filter = kinds.includes(wanted as InboxKind) ? (wanted as InboxKind) : 'all';
  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);

  // The chip gives the selection haptic itself.
  const pick = (key: Filter) => {
    setPicked(key);
    setLimit(PAGE);
  };
  // Opening an item pins its chip, so coming back after deciding it doesn't jump elsewhere.
  const pin = () => {
    if (filter !== 'all') setPicked(filter);
  };
  const openPast = () => router.push('/inbox/history');
  const refresh = () =>
    Promise.all([
      qc.refetchQueries({ queryKey: inboxKeys.all, type: 'active' }, { cancelRefetch: false }),
      qc.refetchQueries({ queryKey: PETTY_OVERVIEW, type: 'active' }, { cancelRefetch: false }),
      qc.refetchQueries({ queryKey: POLICIES, type: 'active' }, { cancelRefetch: false }),
      summary.refetchAccess(),
    ]);

  // A policy waiting for my acknowledgement: one row that opens Policies. Shown whatever the
  // approvals are doing, since it doesn't depend on them.
  const policies: ReactNode =
    toRead > 0 ? (
      <ActivityList>
        <ActivityRow
          module="policies"
          icon={ScrollText}
          title={policiesLine}
          subtitle="Read and confirm"
          chevron
          onPress={() => router.push('/policies')}
          accessibilityLabel={`${policiesLine}. Opens Policies`}
        />
      </ActivityList>
    ) : null;

  // Six fixed slots (notice · summary · policies · chips · list · past decisions), one Screen child each.
  let notice: ReactNode = null;
  let pulse: ReactNode = null;
  let chips: ReactNode = null;
  let list: ReactNode = null;
  let past: ReactNode = null;

  if (booting) {
    // Approvers' cards (or, while it is still unknown who this is, their placeholder).
    pulse = withSummary || summary.discovering ? <InboxSummarySkeleton /> : null;
    chips = <ChipsSkeleton />;
    list = <InboxListSkeleton rows={4} />;
  } else if (summary.failed) {
    notice = <ErrorState message="Your Inbox couldn’t be loaded. Check your connection and try again." onRetry={() => void refresh()} />;
  } else {
    if (broken.length) {
      notice = (
        <Banner
          tone="warning"
          title="Some requests didn’t load"
          message={`Missing: ${broken.map((q) => q.label).join(', ')}.`}
          action={{ label: 'Try again', onPress: () => void refresh() }}
        />
      );
    }
    if (withSummary) {
      pulse = (
        <TourTarget id="inbox.summary" radius={radius.xl}>
          <InboxSummary items={items} queues={queues} />
        </TourTarget>
      );
    }
    if (kinds.length > 1) {
      // Scrolls the picked chip into view (a link can pick one past the edge).
      chips = (
        <TourTarget id="inbox.chips" radius={radius.pill}>
          <FollowChipRow
            selected={filter}
            items={[
              { key: 'all', chip: <Chip label="All" selected={filter === 'all'} count={items.length} onPress={() => pick('all')} /> },
              ...kinds.map((k) => ({
                key: k,
                chip: (
                  <Chip
                    label={KIND_COPY[k].chip}
                    icon={<KindDot kind={k} on={filter === k} />}
                    selected={filter === k}
                    count={counts.get(k)}
                    onPress={() => pick(k)}
                  />
                ),
              })),
            ]}
          />
        </TourTarget>
      );
    }
    // "You’re all caught up" only once every queue has answered and none failed (the same rule as
    // the header): while one is still loading its rows are on the way, and under the "didn’t load"
    // notice the list may not be empty at all.
    list = shown.length ? (
      // Re-keyed by chip: switching cross-fades the new list in (opacity only, 160 ms).
      // Grouped by day after paging, so "Show more" extends the last day or adds the next ones.
      <Animated.View key={filter} entering={FadeIn.duration(motion.fast)} style={styles.list}>
        <InboxGroups items={shown.slice(0, limit)} onOpen={pin} />
        {shown.length > limit ? (
          <Button title={`Show ${Math.min(PAGE, shown.length - limit)} more`} variant="ghost" size="md" onPress={() => setLimit((n) => n + PAGE)} style={styles.center} />
        ) : null}
      </Animated.View>
    ) : !settled ? (
      broken.length ? null : (
        <InboxListSkeleton rows={2} />
      )
    ) : toRead > 0 ? null : (
      // Not "all caught up" while a policy is still waiting to be read (its row is above).
      <EmptyState icon={<CircleCheck color={palette.successInk} strokeWidth={1.8} />} title="You’re all caught up" message="Anything that needs you will show up here." />
    );
    past = reviews ? <Button title="Past decisions" variant="text" icon={<History />} onPress={openPast} style={styles.center} /> : null;
  }

  return (
    <Screen
      withTabBar
      onRefresh={refresh}
      header={
        <TabRootHeader
          title="Inbox"
          // The summary cards say how many are waiting; without them the overline does. While it is
          // still unknown who this is, the cards' placeholder shows, so no overline either (it would
          // otherwise drop out and shift everything up once an approver's cards arrive).
          overline={(withSummary || summary.discovering) && !summary.failed ? undefined : overline}
          actions={reviews ? [{ key: 'past', icon: History, label: 'Past decisions', onPress: openPast, tourId: 'inbox.history' }] : undefined}
        />
      }>
      {notice}
      {pulse}
      {policies}
      {chips}
      {/* Unkeyed wrapper: the slot keeps its position key, so only the inner list re-keys. */}
      {list ? <>{list}</> : null}
      {past}
    </Screen>
  );
}

// Three pill-shaped placeholders where the chips will be, in the chip row's own 48 dp band (so the
// list doesn't jump when the real chips arrive).
function ChipsSkeleton() {
  return (
    <Row style={styles.chips}>
      <Skeleton width={72} height={34} radius={radius.pill} />
      <Skeleton width={92} height={34} radius={radius.pill} />
      <Skeleton width={84} height={34} radius={radius.pill} />
    </Row>
  );
}

const styles = themedStyles(() => ({
  chips: { gap: space.xs, overflow: 'hidden', paddingVertical: CHIP_ROW_PAD },
  list: { gap: space.md },
  center: { alignSelf: 'center' },
}));
