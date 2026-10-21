// The desk's Invites (web: the Invites tab, VisitorInvites, dash.html:35577). The server lists only the
// caller's own invites (visitors.js:795), so this is "guests I invited" — there is no company-wide list.
// Same pieces as the employee's Your invitations: a light SummaryHero (guests coming, who is next,
// "Invite a visitor"), then upcoming and earlier invitations; a row opens the code with Share pass /
// Cancel invite (features/visitors/invites). New invites use the shared form, /visitors/invite.
// "Passes with a QR" (features/deskqr/pass-sheet): each active upcoming invite's pass with a real QR of its
// code, to print or share — reception scans it at the door (Scan a pass).

import { Redirect, useRouter } from 'expo-router';
import { QrCode, ScanLine, Ticket, UserPlus } from 'lucide-react-native';
import { useState } from 'react';

import { useDeskQr } from '@/api/desk';

import { type Invite, useMyInvites } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { canRunDesk, canSeeDeskInvites } from '@/features/desk/access';
import { DESK_ROUTES } from '@/features/desk/routes';
import { canScanPass } from '@/features/deskqr/access';
import { PassSheet } from '@/features/deskqr/pass-sheet';
import { DESKQR_ROUTES } from '@/features/deskqr/routes';
import { dateLabel, timeWindow } from '@/features/visitors/format';
import { asInvites, guestName, InviteList, splitInvites } from '@/features/visitors/invites';
import { useAccess } from '@/lib/use-access';
import { palette, radius } from '@/theme/tokens';
import { EmptyState, ErrorState, ListCard, ListRow, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';

export default function DeskInvitesScreen() {
  const access = useAccess();
  const router = useRouter();
  const today = useTodayIst();
  const allowed = canRunDesk(access) && canSeeDeskInvites(access);
  const invites = useMyInvites(allowed);
  const qr = useDeskQr(allowed);
  const me = useSession((s) => s.user?.name) ?? '';
  const [pass, setPass] = useState<Invite | null>(null);

  if (!allowed) return <Redirect href="/" />;

  const list = asInvites(invites.data);
  const { upcoming } = splitInvites(list, today);
  const next = upcoming[0];
  // isPending, not isLoading: while the saved cache is being restored the query waits without fetching.
  const loading = !list.length && invites.isPending && !invites.isError;
  const failed = !list.length && !loading && invites.isError;
  const dueToday = upcoming.filter((i) => i.visitDate === today).length;

  return (
    <Screen
      header={
        <NavHeader
          title="Invites"
          actions={canScanPass(access) ? [{ icon: ScanLine, label: 'Scan a pass', onPress: () => router.push(DESKQR_ROUTES.scan) }] : undefined}
        />
      }
      onRefresh={() => invites.refetch()}>
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
      {upcoming.length ? (
        <ListCard title="Passes with a QR">
          {upcoming.map((i) => (
            <ListRow
              key={i.id}
              left={<QrCode size={22} color={palette.primaryText} strokeWidth={1.8} />}
              title={guestName(i)}
              subtitle={[dateLabel(i.visitDate, today), timeWindow(i.timeFrom, i.timeTo)].filter(Boolean).join(' · ')}
              chevron
              onPress={() => setPass(i)}
              accessibilityHint="Shows the visitor pass with its QR code"
            />
          ))}
        </ListCard>
      ) : null}
      {list.length ? (
        <InviteList invites={list} />
      ) : loading ? (
        <SkeletonList rows={4} avatar />
      ) : invites.isError ? (
        <ErrorState message={invites.error?.message ?? ''} onRetry={() => void invites.refetch()} />
      ) : (
        <EmptyState icon={<Ticket color={palette.textMuted} />} title="No invitations yet" message="Guests you invite show up here with their check-in code." />
      )}
      <PassSheet invite={pass} company={qr.data?.companyName ?? ''} host={me} today={today} onClose={() => setPass(null)} />
    </Screen>
  );
}
