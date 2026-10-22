// One of my Support requests, in the Payno detail style: a light SummaryHero first (the reference,
// what I asked for, its status and when I raised it), then the one note that matters — why it was
// rejected or how it was resolved — then who has it as an AccountRow (its "Contact" pill opens their
// details, as on the web), what I asked for as a SummaryCard, my own words, and the history.
// "Cancel request" sits in the sticky bar while it can still be withdrawn.

import { useLocalSearchParams } from 'expo-router';
import { Mail, Phone, SearchX, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { type Ticket, useCancelTicket, useDepartments, useDirectoryUsers, useMyTickets } from '@/api/support';
import { useTodayIst } from '@/features/attendance/use-now';
import { categoryOf, dayTime, isCancellable, isOpenStatus, priorityLabel, raisedOn, refNo, subjectLabel, ticketStatus, typeLabel } from '@/features/support/format';
import { phoneLabel } from '@/features/visitors/format';
import { palette, radius, space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
  AccountRow,
  ActionBar,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  EventTimeline,
  haptic,
  IconAction,
  NavHeader,
  Screen,
  SectionHeader,
  Sheet,
  Skeleton,
  StatusPill,
  type SummaryItem,
  SummaryCard,
  SummaryHero,
  Text,
  type TimelineEvent,
  toast,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
import { useSession } from '@/auth/session';
import { webNav } from '@/lib/access';
import { RouteGate } from '@/features/shared/route-gate';

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function AssigneeSheet({ name, open, onClose }: { name: string | null; open: boolean; onClose: () => void }) {
  // Only while the sheet is open (as before): the name stays set during the close fade so the
  // content doesn't blank, and a disabled query keeps its cached data.
  const users = useDirectoryUsers(open && !!name);
  const departments = useDepartments(open && !!name);
  const { gap } = useLayout();
  const people = Array.isArray(users.data) ? users.data : [];
  const u = name ? people.find((x) => x && x.name === name) : undefined;
  const depts = Array.isArray(departments.data) ? departments.data : [];
  const dept = text(u?.deptName) || depts.find((d) => d && d.id === u?.dept)?.name || '';
  const phone = text(u?.mobile) || text(u?.phone);
  const dial = phone.replace(/[^\d+]/g, '');
  const email = text(u?.email);

  return (
    <Sheet visible={open} onClose={onClose} title={name || 'Assigned to'} subtitle="Assigned to your request">
      {users.isLoading ? (
        <View style={{ gap }}>
          <Skeleton height={76} radius={radius.md} />
          <Skeleton height={150} radius={radius.xl} />
        </View>
      ) : users.isError && !users.data ? (
        <ErrorState message={users.error?.message ?? ''} onRetry={() => void users.refetch()} />
      ) : u ? (
        <>
          {dial || email ? (
            <View style={styles.contact}>
              {dial ? <IconAction icon={Phone} label="Call" onPress={() => void Linking.openURL(`tel:${dial}`).catch(() => {})} /> : null}
              {email ? <IconAction icon={Mail} label="Email" onPress={() => void Linking.openURL(`mailto:${email}`).catch(() => {})} /> : null}
            </View>
          ) : null}
          <SummaryCard
            hideEmpty
            rows={[
              { label: 'Email', value: email },
              { label: 'Phone', value: phoneLabel(phone) },
              { label: 'Department', value: dept },
            ]}
          />
        </>
      ) : (
        <EmptyState icon={<UserRound color={palette.textMuted} />} title="No contact details" message="They aren’t in the company directory." />
      )}
    </Sheet>
  );
}

// The light hero: the reference beside the kind's icon, then what I asked for, its status and when I
// raised it. The kind is the screen title, so the hero doesn't repeat it.
function Hero({ t, today }: { t: Ticket; today: string }) {
  const c = categoryOf(t);
  const st = ticketStatus(t.status);
  const ref = refNo(t.id, t.category);
  return (
    <SummaryHero icon={c.icon} module="support" label={ref}>
      <View style={styles.heroText}>
        <Text variant="heading" color={palette.ink} numberOfLines={4} accessibilityRole="header">
          {subjectLabel(t)}
        </Text>
        <View style={styles.heroMeta}>
          <StatusPill label={st.label} tone={st.tone} />
          <Text variant="caption" muted style={styles.shrink}>
            Raised {raisedOn(t, today)}
          </Text>
        </View>
      </View>
    </SummaryHero>
  );
}

function DetailSkeleton() {
  const { gap } = useLayout();
  return (
    <View style={{ gap }}>
      <Skeleton height={168} radius={radius.xxl} />
      <Skeleton height={72} radius={radius.lg} />
      <Skeleton height={160} radius={radius.xl} />
    </View>
  );
}

// Help & support is for the roles whose web menu has it (not the platform owner or the office TV).
export default function SupportRequestDetail() {
  const user = useSession((s) => s.user);
  return (
    <RouteGate allow={webNav(user, 'support', null)}>
      <SupportRequestDetailBody />
    </RouteGate>
  );
}

function SupportRequestDetailBody() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tickets = useMyTickets();
  const cancel = useCancelTicket();
  const [assignee, setAssignee] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const { gap } = useLayout();
  const today = useTodayIst();

  const list = Array.isArray(tickets.data) ? tickets.data : [];
  const t = list.find((x) => !!x && x.id === id);

  const ask = () => {
    if (!t) return;
    Alert.alert('Cancel this request?', 'This can’t be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () =>
          cancel.mutate(t.id, {
            onSuccess: () => {
              haptic.success();
              toast.show('Request cancelled', 'info');
            },
            onError: (e) => {
              haptic.error();
              Alert.alert('Could not cancel', e.message);
            },
          }),
      },
    ]);
  };

  const isItem = t?.category === 'asset' || t?.category === 'admin_request';
  const assignedTo = text(t?.assignedTo);
  const details: SummaryItem[] = t
    ? [
        // For equipment and admin items the subject already names the item ("2x Laptop").
        ...(isItem ? [] : [{ label: 'Type', value: typeLabel(t) }]),
        { label: t.category === 'ticket' ? 'Priority' : 'Urgency', value: priorityLabel(t) },
        ...(isItem ? [{ label: 'Quantity', value: text(t.quantity) || '1' }] : []),
        { label: 'Project code', value: text(t.kekaCode) },
      ]
    : [];
  const body = t ? text(isItem ? t.reason : t.desc) : '';
  const resolution = t ? text(t.resolutionNote) || text(t.resolution) : '';
  const rejection = t?.status === 'rejected' ? text(t.rejectionReason) : '';
  const handler = t?.category === 'ticket' ? 'IT Admin' : 'Admin';
  const events: TimelineEvent[] = t
    ? [
        { key: 'raised', label: 'Raised', at: raisedOn(t, today), tone: 'neutral' },
        ...(t.acceptedAt ? [{ key: 'accepted', label: 'Accepted', at: dayTime(t.acceptedAt, today) || null, tone: 'info' as const }] : []),
        ...(t.resolvedAt ? [{ key: 'resolved', label: 'Resolved', at: dayTime(t.resolvedAt, today) || null, by: text(t.resolvedBy) || null, tone: 'good' as const }] : []),
        ...(t.status === 'rejected' && t.rejectedAt
          ? [{ key: 'rejected', label: 'Rejected', at: dayTime(t.rejectedAt, today) || null, by: text(t.rejectedBy) || null, tone: 'bad' as const }]
          : []),
        ...(t.status === 'cancelled' && t.cancelledAt
          ? [{ key: 'cancelled', label: 'Cancelled', at: dayTime(t.cancelledAt, today) || null, by: text(t.cancelledBy) || null, tone: 'neutral' as const }]
          : []),
      ]
    : [];

  return (
    <Screen
      header={<NavHeader title={t ? categoryOf(t).label : 'Request'} />}
      onRefresh={() => tickets.refetch()}
      footer={
        t && isCancellable(t) ? (
          <ActionBar>
            <Button variant="danger" title="Cancel request" icon={<X />} loading={cancel.isPending} onPress={ask} />
          </ActionBar>
        ) : undefined
      }>
      {/* One Screen slot for every state: the request replaces the skeleton in place, so the
          entrance doesn't play a second time when the data lands (§12). */}
      {t ? (
        <View style={{ gap }}>
          <Hero t={t} today={today} />
          {/* At most one notice: why it was rejected, otherwise how it was resolved. */}
          {rejection ? (
            <Banner tone="danger" title="Why it was rejected" message={rejection} />
          ) : resolution ? (
            <Banner tone="success" title="How it was resolved" message={resolution} />
          ) : null}
          {assignedTo ? (
            <AccountRow
              icon={UserRound}
              module="support"
              title={assignedTo}
              sub="Assigned to your request"
              actionLabel="Contact"
              onPress={() => {
                setAssignee(assignedTo);
                setContactOpen(true);
              }}
              accessibilityLabel={`Assigned to ${assignedTo}`}
              hint="Shows their phone and email"
            />
          ) : isOpenStatus(t.status) ? (
            // Nobody has it yet: say who will pick it up (only while it is still open).
            <AccountRow icon={UserRound} module="support" title="Not assigned yet" sub={`${handler} picks it up`} />
          ) : null}
          <SummaryCard rows={details} hideEmpty />
          {body ? (
            <Card tone="frostStrong" style={styles.body}>
              <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
                {isItem ? 'Why you need it' : 'Details'}
              </Text>
              <Text variant="body" selectable>
                {body}
              </Text>
            </Card>
          ) : null}
          {/* "Raised" alone is already in the hero; the timeline shows once something has happened. */}
          {events.length > 1 ? (
            <View style={styles.progress}>
              <SectionHeader title="Progress" />
              <Card tone="frostStrong">
                <EventTimeline events={events} />
              </Card>
            </View>
          ) : null}
          <AssigneeSheet name={assignee} open={contactOpen} onClose={() => setContactOpen(false)} />
        </View>
      ) : tickets.isLoading || (tickets.isFetching && !tickets.isError) ? (
        // Also while a refetch is under way: a request just sent ("View request") may not be in the
        // cached list yet, and must not flash "Request not found" before it arrives.
        <DetailSkeleton />
      ) : tickets.isError ? (
        <ErrorState message={tickets.error?.message ?? ''} onRetry={() => void tickets.refetch()} />
      ) : (
        <EmptyState icon={<SearchX color={palette.textMuted} />} title="Request not found" message="It may have been removed. Pull down to refresh." />
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  shrink: { flexShrink: 1 },
  heroText: { gap: space.xs },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, rowGap: space.xs },
  body: { gap: 6 },
  progress: { gap: space.xs },
  contact: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
}));
