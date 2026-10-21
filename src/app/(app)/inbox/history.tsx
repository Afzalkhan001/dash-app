// Past decisions — the requests and project claims this person already decided, one type at a time
// (chips: the screen's only filter; each row's status is a pill), under the Payno NavHeader (round
// back button, centred title). The list is one titled ActivityList per day the decisions were made
// (features/inbox/history). Opened from the Inbox's History button, its "Done today" card and the
// link at its foot; the Inbox itself only lists what is still waiting. Same queues and gating as the
// Inbox (useInboxSummary). A domain plug-in with a History (features/plugin-types) gets its own chip
// after the built-in ones and renders its own list.

import { useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';

import Animated, { FadeIn } from 'react-native-reanimated';

import { inboxKeys } from '@/api/inbox';
import { CHIP_ROW_PAD, FollowChipRow } from '@/features/inbox/follow-chip-row';
import { HrHistory, KekaHistory } from '@/features/inbox/history';
import { InboxListSkeleton } from '@/features/inbox/inbox-list';
import { KindDot } from '@/features/inbox/kind-look';
import { hasPastDecisions, type InboxQueueKey, useInboxSummary } from '@/features/inbox/use-inbox';
import { inboxPlugin } from '@/features/domains';
import { motion, palette, radius, space } from '@/theme/tokens';
import { Chip, EmptyState, NavHeader, Row, Screen, Skeleton } from '@/ui';

import { themedStyles } from '@/theme/themed';
export default function InboxHistoryScreen() {
  const qc = useQueryClient();
  const summary = useInboxSummary();
  const [picked, setPicked] = useState<InboxQueueKey | null>(null);
  const queues = (Array.isArray(summary.queues) ? summary.queues : []).filter(hasPastDecisions);
  const current = queues.find((q) => q.key === picked) ?? queues[0];

  const refresh = () => Promise.all([qc.refetchQueries({ queryKey: inboxKeys.all, type: 'active' }, { cancelRefetch: false }), summary.refetchAccess()]);

  // Two fixed slots (type chips · list), so content replaces its skeleton in place. The chip
  // placeholders sit in the chip row's own 48 dp band, so the list doesn't jump when the chips arrive.
  let chips: ReactNode = null;
  let list: ReactNode = null;
  if (summary.discovering) {
    chips = (
      <Row style={styles.chips}>
        <Skeleton width={84} height={34} radius={radius.pill} />
        <Skeleton width={104} height={34} radius={radius.pill} />
      </Row>
    );
    list = <InboxListSkeleton rows={4} />;
  } else if (!current) {
    list = <EmptyState icon={<History color={palette.textMuted} strokeWidth={1.8} />} title="No past decisions" message="Requests you approve or reject show up here." />;
  } else {
    chips =
      queues.length > 1 ? (
        <FollowChipRow
          selected={current.key}
          items={queues.map((q) => ({
            key: q.key,
            chip: (
              <Chip
                label={q.label}
                icon={q.type === 'plugin' ? <KindDot module={q.module} on={q.key === current.key} /> : <KindDot kind={q.key} on={q.key === current.key} />}
                selected={q.key === current.key}
                onPress={() => setPicked(q.key)}
              />
            ),
          }))}
        />
      ) : null;
    list = (
      // Re-keyed by type: switching cross-fades the new list in (opacity only, 160 ms).
      <Animated.View key={current.key} entering={FadeIn.duration(motion.fast)}>
        {current.type === 'hr' ? <HrHistory kind={current.key} /> : current.type === 'plugin' ? <PluginHistory pluginKey={current.key} /> : <KekaHistory />}
      </Animated.View>
    );
  }

  return (
    <Screen header={<NavHeader title="Past decisions" />} onRefresh={refresh}>
      {chips}
      {/* Unkeyed wrapper: the slot keeps its position key, so only the inner list re-keys. */}
      {list ? <>{list}</> : null}
    </Screen>
  );
}

// A plug-in's own Past decisions list (its History component).
function PluginHistory({ pluginKey }: { pluginKey: string }) {
  const History = inboxPlugin(pluginKey)?.History;
  return History ? <History /> : null;
}

const styles = themedStyles(() => ({
  chips: { gap: space.xs, overflow: 'hidden', paddingVertical: CHIP_ROW_PAD },
}));
