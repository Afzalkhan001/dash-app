// Your invitations: a light SummaryHero (how many guests are coming, who is next, and "Invite a guest"
// as its one action), then guests I have invited — upcoming first, then earlier ones. A row opens the
// code with Share pass / Cancel invite (features/visitors/invites.tsx).

import { useRouter } from 'expo-router';
import { Ticket, UserPlus } from 'lucide-react-native';

import { useMyInvites } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { dateLabel } from '@/features/visitors/format';
import { asInvites, guestName, InviteList, splitInvites } from '@/features/visitors/invites';
import { palette, radius } from '@/theme/tokens';
import { EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';
import { useSession } from '@/auth/session';
import { VISITOR_HIDDEN_ROLES } from '@/api/inbox';
import { RouteGate } from '@/features/shared/route-gate';

// Same rule as the Visitors hub: not the platform owner, the office TV or the Visitor Manager (who has the desk).
export default function InvitationsScreen() {
  const role = useSession((s) => s.user?.role);
  return (
    <RouteGate allow={!role || !VISITOR_HIDDEN_ROLES.includes(role)} to={role === 'visitor_manager' ? '/admin/desk' : '/'}>
      <InvitationsBody />
    </RouteGate>
  );
}

function InvitationsBody() {
  const router = useRouter();
  const today = useTodayIst();
  const invites = useMyInvites();
  const list = asInvites(invites.data);
  const { upcoming } = splitInvites(list, today);
  const next = upcoming[0];
  const loading = !list.length && invites.isLoading;
  const failed = !list.length && !loading && invites.isError;
  const invite = { title: 'Invite a guest', icon: <UserPlus />, onPress: () => router.push('/visitors/invite') };

  return (
    <Screen header={<NavHeader title="Your invitations" />} onRefresh={() => invites.refetch()}>
      <SummaryHero
        icon={Ticket}
        module="visitors"
        label="Guests coming"
        value={loading || failed ? undefined : upcoming.length}
        unit={upcoming.length === 1 ? 'guest' : 'guests'}
        figure={loading ? <Skeleton width={120} height={48} radius={radius.sm} /> : failed ? null : undefined}
        sub={next ? `Next: ${guestName(next)} · ${dateLabel(next.visitDate, today)}` : list.length ? 'Nobody is due. Invite someone when you need to.' : undefined}
        action={invite}
      />
      {list.length ? (
        <InviteList invites={list} />
      ) : loading ? (
        <SkeletonList rows={4} avatar />
      ) : invites.isError ? (
        <ErrorState message={invites.error?.message ?? ''} onRetry={() => void invites.refetch()} />
      ) : (
        <EmptyState icon={<Ticket color={palette.textMuted} />} title="No invitations yet" message="Guests you invite show up here with their code." />
      )}
    </Screen>
  );
}
