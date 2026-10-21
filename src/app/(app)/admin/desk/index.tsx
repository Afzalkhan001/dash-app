// Visitor desk — today's board (web: VisitorTodayBoard, dash.html:35693; GET /visitors/today).
//   1. SummaryHero: who is inside now, "N today", and "Invite a visitor" (empty day: "Start kiosk").
//   2. Chips with the day's counts (Everyone · Waiting · No answer · Rejected); a tap shows only those.
//   3. Waiting for a host: each row's "Respond" opens /inbox/desk/<id> (Let in / Turn away for the host).
//   4. Inside now: a row opens the visit, where Check out is (a swipe in a ConfirmSheet; no undo).
//   5. Earlier today: everyone else, with their status.
//   "Scan a pass" (features/deskqr): check in an invited guest from the QR on their visitor pass.
// Refreshes every 10 s while in front, like the web. Only the desk roles (features/desk/access.ts);
// anyone else is sent home (the server answers 403 to them anyway).

import { Redirect, useIsFocused, useRouter } from 'expo-router';
import { DoorOpen, History, MonitorSmartphone, QrCode, ScanLine, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useDeskToday } from '@/api/desk';
import type { Visit } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { canRunDesk, canSeeKiosk } from '@/features/desk/access';
import { plural, splitToday } from '@/features/desk/format';
import { DESK_ROUTES } from '@/features/desk/routes';
import { DeskVisitRow, WaitingVisitRow } from '@/features/desk/visit-row';
import { canScanPass } from '@/features/deskqr/access';
import { DESKQR_ROUTES } from '@/features/deskqr/routes';
import { useDeskVisitSheet } from '@/features/desk/visit-sheet';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { ActivityList, Button, Chip, ChipRow, EmptyState, ErrorState, ListCard, ListRow, NavHeader, Screen, SectionHeader, Skeleton, SkeletonList, SummaryHero, Text } from '@/ui';

type Focus = 'waiting' | 'no_response' | 'rejected' | 'all';

const FOCUS_TITLE: Record<Exclude<Focus, 'all'>, string> = {
  waiting: 'Waiting for a host',
  no_response: 'No answer from the host',
  rejected: 'Rejected today',
};

export default function VisitorDeskScreen() {
  const access = useAccess();
  const router = useRouter();
  const focused = useIsFocused();
  const today = useTodayIst();
  const allowed = canRunDesk(access);
  const board = useDeskToday({ enabled: allowed, poll: focused });
  const sheet = useDeskVisitSheet();
  const [focus, setFocus] = useState<Focus>('all');

  if (!allowed) return <Redirect href="/" />;

  const data = board.data;
  const s = data?.stats;
  const { waiting, inside, earlier } = splitToday(data?.visits ?? []);
  const toggle = (f: Focus) => setFocus((cur) => (cur === f ? 'all' : f));
  const invite = { title: 'Invite a visitor', icon: <UserPlus />, onPress: () => router.push(DESK_ROUTES.invite) };
  const open = (v: Visit) => sheet.show(v);

  const focusList =
    focus === 'waiting'
      ? waiting.filter((v) => v.status === 'pending')
      : focus === 'no_response'
        ? waiting.filter((v) => v.status === 'no_response')
        : focus === 'rejected'
          ? earlier.filter((v) => v.status === 'rejected')
          : [];

  return (
    <Screen
      header={
        <NavHeader
          title="Visitor desk"
          actions={[
            { icon: History, label: 'Visitor log', onPress: () => router.push(DESK_ROUTES.log) },
            { icon: QrCode, label: 'Check-in QR', onPress: () => router.push(DESK_ROUTES.qr) },
          ]}
        />
      }
      onRefresh={() => board.refetch()}>
      <SummaryHero
        icon={DoorOpen}
        module="visitors"
        label="Inside now"
        value={s ? s.inside : undefined}
        unit={s?.inside === 1 ? 'visitor' : 'visitors'}
        figure={s ? undefined : board.isError ? null : <Skeleton width={120} height={48} radius={radius.sm} />}
        sub={s ? `${plural(s.total, 'visitor', 'visitors')} today · ${s.waiting + s.noResponse} waiting` : undefined}
        action={invite}
      />

      {s ? (
        <ChipRow>
          <Chip label="Everyone" count={s.total} selected={focus === 'all'} onPress={() => setFocus('all')} />
          <Chip label="Waiting" count={s.waiting} selected={focus === 'waiting'} onPress={() => toggle('waiting')} />
          <Chip label="No answer" count={s.noResponse} selected={focus === 'no_response'} onPress={() => toggle('no_response')} />
          <Chip label="Rejected" count={s.rejected} selected={focus === 'rejected'} onPress={() => toggle('rejected')} />
        </ChipRow>
      ) : null}

      {canScanPass(access) ? (
        <ListCard>
          <ListRow
            left={<ScanLine size={22} color={palette.primaryText} strokeWidth={1.8} />}
            title="Scan a pass"
            subtitle="Check in an invited guest from their QR"
            chevron
            onPress={() => router.push(DESKQR_ROUTES.scan)}
          />
        </ListCard>
      ) : null}

      {!data ? (
        board.isError ? (
          <ErrorState message={board.error?.message ?? ''} onRetry={() => void board.refetch()} />
        ) : (
          <SkeletonList rows={4} avatar />
        )
      ) : focus !== 'all' ? (
        <View style={styles.group}>
          <SectionHeader title={FOCUS_TITLE[focus]} actionLabel="Show all" onAction={() => setFocus('all')} />
          {focusList.length ? (
            focus === 'rejected' ? (
              <ActivityList>
                {focusList.map((v) => (
                  <DeskVisitRow key={v.id} visit={v} today={today} onPress={() => open(v)} />
                ))}
              </ActivityList>
            ) : (
              focusList.map((v) => <WaitingVisitRow key={v.id} visit={v} />)
            )
          ) : (
            <Text variant="label" muted>
              Nobody right now.
            </Text>
          )}
        </View>
      ) : !data.visits.length ? (
        <EmptyState
          icon={<DoorOpen color={palette.textMuted} />}
          title="No visitors yet today"
          message="People who check in with the QR code, the kiosk or an invite code show up here."
          action={
            canSeeKiosk(access) ? (
              <Button size="md" variant="accent" title="Start kiosk" icon={<MonitorSmartphone />} onPress={() => router.push(DESK_ROUTES.kiosk)} />
            ) : (
              <Button size="md" variant="accent" title="Share check-in link" icon={<QrCode />} onPress={() => router.push(DESK_ROUTES.qr)} />
            )
          }
        />
      ) : (
        <>
          {waiting.length ? (
            <View style={styles.group}>
              <SectionHeader title="Waiting for a host" />
              {waiting.map((v) => (
                <WaitingVisitRow key={v.id} visit={v} />
              ))}
              <Text variant="caption" muted>
                If the host is busy, you can answer for them. It’s recorded as you.
              </Text>
            </View>
          ) : null}
          {inside.length ? (
            <ActivityList title="Inside now">
              {inside.map((v) => (
                <DeskVisitRow key={v.id} visit={v} today={today} onPress={() => open(v)} />
              ))}
            </ActivityList>
          ) : null}
          {earlier.length ? (
            <ActivityList title="Earlier today">
              {earlier.map((v) => (
                <DeskVisitRow key={v.id} visit={v} today={today} onPress={() => open(v)} />
              ))}
            </ActivityList>
          ) : null}
        </>
      )}
      {sheet.element}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.sm },
}));
