// Me tab — everything about my own work in one place (Keka's "Me"): Attendance | Leave | Pay.
// Only the segments this person has are shown, with the same gates as before (attendance: HR sections
// attendance/clock, or just shifts/regularization, whose links live only there — the old Attendance
// tab showed those links to everyone who had them; leave: useLeaveAccess; pay: usePayAccess). With no
// segment at all (system roles, say) the tab says so plainly, offers "View my profile" (the one
// thing of mine every account has) and, for anyone who approves requests, a quieter "Open Inbox"
// under it, as the old Leave tab did. The open segment follows ?tab= (links
// such as /me?tab=pay, and the old /attendance, /leave, /pay routes), defaulting to the first one.
// Header: the Payno tab-root bar (TabRootHeader) — "Me" centred with my name as the small overline
// (today's date is already on the clock card just below) and, while Pay is open, the privacy eye on
// the right. The Segmented control sits under it and stays put while the segment scrolls.

import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleUserRound } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { useHrMe } from '@/api/me';
import { useSession } from '@/auth/session';
import { ClockSkeleton } from '@/features/attendance/clock-card';
import { useLeaveAccess } from '@/features/leave/use-leave-access';
import { AttendanceView } from '@/features/me/attendance-view';
import { LeaveView } from '@/features/me/leave-view';
import { PayView } from '@/features/me/pay-view';
import { isMeTab, ME_TAB_LABEL, type MeTab, meSegmentsFor, refreshesQuery } from '@/features/me/tabs';
import { PrivacyToggle } from '@/features/pay/privacy';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { useAccess } from '@/lib/use-access';
import { moduleTone, space } from '@/theme/tokens';
import { Button, EmptyState, ErrorState, Screen, Segmented, SkeletonList, TabRootHeader, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';

export default function MeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string }>();
  const access = useAccess();
  const leave = useLeaveAccess();
  const pay = usePayAccess();
  const hrQ = useHrMe();
  const name = useSession((s) => s.user?.name);
  // The platform owner (no company) and the shared TV login have no HR to ask: say it like a system role.
  const noHr = useSession((s) => s.user?.role === 'master_admin' || s.user?.role === 'announcement_viewer');
  const { gutter, gap } = useLayout();

  const available: MeTab[] = meSegmentsFor(access.sections, leave.enabled, pay.pay);

  // The open segment is local state, so a tap switches at once. A new ?tab= (a link such as
  // /me?tab=pay) moves it; the param dropping (the tab bar) leaves it where the person left it.
  const asked = isMeTab(params.tab) ? params.tab : null;
  const [picked, setPicked] = useState<MeTab | null>(asked);
  const [lastAsked, setLastAsked] = useState<MeTab | null>(asked);
  if (asked !== lastAsked) {
    setLastAsked(asked);
    if (asked) setPicked(asked);
  }
  const tab: MeTab | null = picked && available.includes(picked) ? picked : (available[0] ?? null);

  const choose = (k: MeTab) => {
    setPicked(k);
    router.setParams({ tab: k });
  };

  const refresh = () => Promise.all([access.refetch(), qc.invalidateQueries({ predicate: (q) => refreshesQuery(tab, q.queryKey) })]);

  const header = (
    <View>
      <TabRootHeader overline={String(name || '').trim() || 'My work'} title="Me" right={tab === 'pay' ? <PrivacyToggle /> : undefined} />
      {tab && available.length > 1 ? (
        <View style={[styles.segments, { paddingHorizontal: gutter }]}>
          <Segmented options={available.map((k) => ({ key: k, label: ME_TAB_LABEL[k] }))} value={tab} onChange={choose} />
        </View>
      ) : null}
    </View>
  );

  // One keyed child: switching segments swaps it (and fades the new one in).
  let body: ReactNode;
  // isPending, not just isLoading: while the saved cache is still being restored on a cold start
  // /hr/me is pending but not fetching, and the "nothing here for you" state must not flash.
  if (access.loading || hrQ.isPending) {
    // Attendance opens first unless a link asked for Leave or Pay: then its dark clock skeleton keeps
    // the top slot from flashing light → dark. Leave and Pay get plain rows.
    const toAttendance = picked !== 'leave' && picked !== 'pay';
    body = (
      <View key="loading" style={{ gap }}>
        {toAttendance ? <ClockSkeleton /> : null}
        {/* White rows, like the segments' own lists (docs/LAYOUT-REFS.md). */}
        <SkeletonList rows={toAttendance ? 3 : 5} tone="surface" />
      </View>
    );
  } else if (hrQ.isError && !hrQ.data) {
    const why = hrQ.error instanceof Error && hrQ.error.message ? hrQ.error.message : 'Check your connection and try again.';
    body = <ErrorState key="error" message={why} onRetry={() => void hrQ.refetch()} />;
  } else if (!tab) {
    // Someone who approves requests (a leave admin who only manages, say) has their work in Inbox.
    const approves = leave.reviews || (Array.isArray(access.approvals) && access.approvals.length > 0);
    body = (
      <EmptyState
        key="empty"
        icon={<CircleUserRound color={moduleTone.profile.fg} strokeWidth={1.8} />}
        title={access.isSystemRole || noHr ? 'Nothing to track for you' : 'Nothing here for you yet'}
        message={
          access.isSystemRole || noHr
            ? 'DASH doesn’t track your attendance, leave or pay.'
            : 'Attendance, leave and pay aren’t on for you. Ask HR if you need them.'
        }
        action={
          <View style={styles.actions}>
            <Button title="View my profile" size="md" onPress={() => router.push('/profile')} />
            {approves ? <Button title="Open Inbox" variant="text" size="md" onPress={() => router.push('/inbox')} /> : null}
          </View>
        }
      />
    );
  } else if (tab === 'attendance') {
    body = <AttendanceView key="attendance" />;
  } else if (tab === 'leave') {
    body = <LeaveView key="leave" />;
  } else {
    body = <PayView key="pay" />;
  }

  return (
    <Screen withTabBar onRefresh={refresh} header={header}>
      {body}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  segments: { paddingBottom: space.sm },
  actions: { alignItems: 'center', gap: space.xs },
}));
