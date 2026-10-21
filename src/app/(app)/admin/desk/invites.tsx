// The desk's Invites (web: the Invites tab, VisitorInvites, dash.html:35577). The server lists only the
// caller's own invites (visitors.js:795), so this is "guests I invited" — there is no company-wide list.
// Same pieces as the employee's Your invitations: a light SummaryHero (guests coming, who is next,
// "Invite a visitor"), then upcoming and earlier invitations; a row opens the code with Share pass /
// Cancel invite (features/visitors/invites). New invites use the shared form, /visitors/invite.

import { Redirect, useRouter } from 'expo-router';
import { Ticket, UserPlus } from 'lucide-react-native';

import { useMyInvites } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { canRunDesk, canSeeDeskInvites } from '@/features/desk/access';
import { DESK_ROUTES } from '@/features/desk/routes';
import { dateLabel } from '@/features/visitors/format';
import { asInvites, guestName, InviteList, splitInvites } from '@/features/visitors/invites';
import { useAccess } from '@/lib/use-access';
import { palette, radius } from '@/theme/tokens';
import { EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';

export default function DeskInvitesScreen() {
  const access = useAccess();
  const router = useRouter();
  const today = useTodayIst();
  const allowed = canRunDesk(access) && canSeeDeskInvites(access);
  const invites = useMyInvites(allowed);

  if (!allowed) return <Redirect href="/" />;

  const list = asInvites(invites.data);
  const { upcoming } = splitInvites(list, today);
  const next = upcoming[0];
  // isPending, not isLoading: while the saved cache is being restored the query waits without fetching.
  const loading = !list.length && invites.isPending && !invites.isError;
  const failed = !list.length && !loading && invites.isError;
  const dueToday = upcoming.filter((i) => i.visitDate === today).length;

  return (
    <Screen header={<NavHeader title="Invites" />} onRefresh={() => invites.refetch()}>
      <SummaryHero
        icon={Ticket}
        module="visitors"
        label="Guests coming"
        value={loading || failed ? undefined : upcoming.length}
        unit={upcoming.length === 1 ? 'guest' : 'guests'}
        figure={loading ? <Skeleton width={120} height={48} radius={radius.sm} /> : failed ? null : undefined}
        info={dueToday ? { label: 'Due today', value: String(dueToday) } : undefined}
        sub={next ? `Next: ${guestName(next)} · ${dateLabel(next.visitDate, today)}` : list.length ? 'Nobody is due. Invite someone when you need to.' : undefined}
        action={{ title: 'Invite a visitor', icon: <UserPlus />, onPress: () => router.push(DESK_ROUTES.invite) }}
      />
      {list.length ? (
        <InviteList invites={list} />
      ) : loading ? (
        <SkeletonList rows={4} avatar />
      ) : invites.isError ? (
        <ErrorState message={invites.error?.message ?? ''} onRetry={() => void invites.refetch()} />
      ) : (
        <EmptyState icon={<Ticket color={palette.textMuted} />} title="No invitations yet" message="Guests you invite show up here with their check-in code." />
      )}
    </Screen>
  );
}
