// Read one policy — the website's PolicyView (dash.html ~L4966): title, category, version and
// publish date, the full text, the optional https link to the full document (opened in the
// browser), and the acknowledgement when the policy needs it and I haven't given it yet.
// POST /hr/policies/:id/acknowledge sends the version on screen (hr_policies.js ~L150).
//
// Payno reader (docs/REFERENCE-COMPONENTS.md #13, #12, #29, #30): NavHeader "Policy"; the title with
// one muted line (category · version · published) and its status pill; the text in a frosted card;
// "Full document" as an AccountRow with an "Open" pill. While the policy is waiting for me the sticky
// bar holds a SwipeToConfirm ("Swipe to mark as read"; a plain "I have read this" button for screen
// readers and Reduce Motion). A failed acknowledgement (including the 409 "newer version" case, which
// also reloads the text) shows in that bar, right above the swipe. Once it lands, a SuccessSheet
// says so with a short summary.

import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { FileText, ScrollText } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { useHrMe } from '@/api/me';
import { usePolicy } from '@/api/policies';
import { useTodayIst } from '@/features/attendance/use-now';
import { istDate } from '@/features/policies/format';
import { PolicyBody } from '@/features/policies/policy-body';
import { useAcknowledgePolicy } from '@/features/policies/use-policy-actions';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  Banner,
  Card,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  Skeleton,
  StatusPill,
  SuccessSheet,
  SummaryCard,
  SwipeToConfirm,
  Text,
  useLayout,
} from '@/ui';

type Done = { title: string; version: number | null; category: string };

function DetailSkeleton() {
  const { gap } = useLayout();
  return (
    <View style={{ gap }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <View style={{ gap: space.xs }}>
        <Skeleton height={30} width="85%" />
        <Skeleton height={14} width="45%" radius={6} />
      </View>
      <Skeleton height={360} radius={radius.xl} />
    </View>
  );
}

/** "docs.google.com" for the document row; the whole address is opened. */
function hostOf(href: string) {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(href);
  return m ? m[1]!.replace(/^www\./i, '') : 'Opens in the browser';
}

export default function PolicyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useAccess();
  const enabled = access.sections.policies;
  const q = usePolicy(id, enabled);
  const ack = useAcknowledgePolicy();
  const today = useTodayIst();
  // isPending also covers restoring the saved cache on a cold start (access.loading and isLoading miss
  // it), so a deep link doesn't flash "Policies aren’t on for you" or an error before the data is back.
  const hrPending = useHrMe().isPending;
  const [linkError, setLinkError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const p = q.data;

  const header = <NavHeader title="Policy" />;

  // The success sheet is a Modal: it stays outside <Screen>, and outlives the footer (which goes away
  // as soon as the reloaded policy says it has been read).
  const successSheet = (
    <SuccessSheet
      visible={!!done}
      onClose={() => setDone(null)}
      title="Marked as read"
      subtitle="Thanks — HR can see you have read it.">
      {done ? (
        <SummaryCard
          hideEmpty
          rows={[
            { key: 'policy', label: 'Policy', value: done.title },
            { key: 'category', label: 'Category', value: done.category },
            { key: 'version', label: 'Version', value: done.version != null ? String(done.version) : '' },
            { key: 'when', label: 'Confirmed', value: istDate(today, today) },
            { key: 'status', label: 'Status', value: 'Done', status: 'done' },
          ]}
        />
      ) : null}
    </SuccessSheet>
  );

  if (access.loading || hrPending || (enabled && !!id && q.isPending)) {
    return (
      <Screen header={header}>
        <DetailSkeleton />
      </Screen>
    );
  }
  if (!enabled) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={<ScrollText color={palette.textMuted} strokeWidth={1.8} />}
          title="Policies aren’t on for you"
          message="Ask HR to switch them on."
        />
      </Screen>
    );
  }
  if (!p) {
    const notFound = q.error instanceof ApiRequestError && q.error.status === 404;
    return (
      <>
        <Screen header={header} onRefresh={() => q.refetch()}>
          {notFound ? (
            <EmptyState
              icon={<ScrollText color={palette.textMuted} strokeWidth={1.8} />}
              title="Policy not found"
              message="It may have been removed, or it isn’t meant for you."
            />
          ) : (
            <ErrorState message={q.error?.message ?? 'Couldn’t load this policy.'} onRetry={() => void q.refetch()} />
          )}
        </Screen>
        {successSheet}
      </>
    );
  }

  const canAck = p.requires_ack && p.status === 'published';
  const pending = canAck && !p.acked_at;
  const title = (typeof p.title === 'string' && p.title.trim()) || 'Untitled policy';
  // Same check as the website before showing the link.
  const link = typeof p.link_url === 'string' && /^https:\/\//.test(p.link_url) ? p.link_url : null;
  const meta = [
    typeof p.category === 'string' ? p.category : null,
    p.version != null ? `Version ${p.version}` : null,
    p.published_at ? `Published ${istDate(p.published_at, today)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // One status, worded as in the list: Draft / Archived (only HR admins can open those), To read, or
  // Done with the date I confirmed it.
  const status =
    p.status !== 'published'
      ? { label: p.status === 'draft' ? 'Draft' : 'Archived', tone: 'neutral' as const, note: null }
      : !p.requires_ack
        ? null
        : p.acked_at
          ? { label: 'Done', tone: 'done' as const, note: `Confirmed ${istDate(p.acked_at, today)}` }
          : { label: 'To read', tone: 'pending' as const, note: null };

  const openLink = async () => {
    if (!link) return;
    setLinkError(null);
    try {
      await WebBrowser.openBrowserAsync(link, { controlsColor: palette.primaryText, toolbarColor: palette.surface });
    } catch {
      setLinkError('Couldn’t open the document.');
    }
  };

  const acknowledge = () =>
    ack.mutate(
      { id: p.id, version: p.version },
      {
        onSuccess: () =>
          setDone({ title, version: p.version ?? null, category: typeof p.category === 'string' ? p.category.trim() : '' }),
      },
    );
  const ackError = ack.error ? ack.error.message || 'Couldn’t save that. Try again.' : null;

  return (
    <>
      <Screen
        header={header}
        onRefresh={() => q.refetch()}
        footer={
          pending ? (
            <ActionBar note={ackError ? null : p.version != null ? `Confirms you have read version ${p.version}.` : 'Confirms you have read it.'}>
              {ackError ? (
                <Text variant="caption" color={palette.dangerInk} align="center" numberOfLines={2} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {ackError}
                </Text>
              ) : null}
              <SwipeToConfirm label="Swipe to mark as read" buttonLabel="I have read this" onConfirm={acknowledge} loading={ack.isPending} />
            </ActionBar>
          ) : undefined
        }>
        <View key="title" style={styles.titleBlock}>
          <Text variant="title" selectable accessibilityRole="header">
            {title}
          </Text>
          {meta ? (
            <Text variant="label" muted numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
          {status ? (
            <View style={styles.statusRow}>
              <StatusPill label={status.label} tone={status.tone} />
              {status.note ? (
                <Text variant="caption" muted numberOfLines={1} style={styles.shrink}>
                  {status.note}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <Card key="body" tone="frostStrong">
          <PolicyBody body={p.body} />
        </Card>

        {link ? (
          <AccountRow
            key="link"
            icon={FileText}
            module="policies"
            title="Full document"
            sub={hostOf(link)}
            actionLabel="Open"
            onPress={() => void openLink()}
            hint="Opens in the browser"
          />
        ) : null}

        {linkError ? <Banner key="linkError" tone="danger" message={linkError} /> : null}
      </Screen>
      {successSheet}
    </>
  );
}

const styles = themedStyles(() => ({
  titleBlock: { gap: space.xs, paddingTop: space.xxs },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, rowGap: space.xs, marginTop: space.xxs },
  shrink: { flexShrink: 1 },
}));
