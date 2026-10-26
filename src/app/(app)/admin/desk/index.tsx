// Visitor desk — today's board (web: VisitorTodayBoard, dash.html:35693; GET /visitors/today).
//   1. SummaryHero: who is inside now, "N today", and "Invite a visitor" (empty day: "Start kiosk").
//   2. Chips with the day's counts (Everyone · Waiting · No answer · Rejected · Let in by desk); a tap shows
//      only those. "Let in by desk" = let in because the host did not answer (stats.letIn, 'desk_override').
//   3. Waiting for a host: each row's "Respond" opens /inbox/desk/<id> (Turn away at once; Let in once the
//      host has had letInAfterMin minutes to answer).
//   4. Inside now: a row opens the visit; its "Check out" pill goes straight to the swipe (no undo).
//   5. Earlier today: everyone else, with their status.
//   "Scan a pass" (features/deskqr): check in an invited guest from the QR on their visitor pass.
// Refreshes every 10 s while in front, like the web. Only the desk roles (features/desk/access.ts);
// anyone else is sent home (the server answers 403 to them anyway).

import { Redirect, useIsFocused, useRouter } from 'expo-router';
import { DoorOpen, History, MonitorSmartphone, QrCode, ScanLine, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { LET_IN_AFTER_MIN, useDeskToday } from '@/api/desk';
import type { Visit } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { canRunDesk, canSeeKiosk } from '@/features/desk/access';
import { plural, splitToday } from '@/features/desk/format';
import { DESK_ROUTES } from '@/features/desk/routes';
import { DeskVisitRow, InsideVisitRow, WaitingVisitRow } from '@/features/desk/visit-row';
import { canScanPass } from '@/features/deskqr/access';
import { DESKQR_ROUTES } from '@/features/deskqr/routes';
import { useDeskVisitSheet } from '@/features/desk/visit-sheet';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { ActivityList, Button, Chip, ChipRow, EmptyState, ErrorState, ListCard, ListRow, ModuleBadge, NavHeader, Screen, SectionHeader, Skeleton, SkeletonList, SummaryHero, Text } from '@/ui';

type Focus = 'waiting' | 'no_response' | 'rejected' | 'let_in' | 'all';

const FOCUS_TITLE: Record<Exclude<Focus, 'all'>, string> = {
  waiting: 'Waiting for a host',
  no_response: 'No answer from the host',
  rejected: 'Rejected today',
  let_in: 'Let in by the desk',
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
  const afterMin = data?.letInAfterMin ?? LET_IN_AFTER_MIN;
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
          : focus === 'let_in'
            ? (data?.visits ?? []).filter((v) => v.decidedVia === 'desk_override')
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
          <Chip label="Let in by desk" count={s.letIn} selected={focus === 'let_in'} onPress={() => toggle('let_in')} />
        </ChipRow>
      ) : null}

      {canScanPass(access) ? (
        <ListCard>
          <ListRow
            size="lg"
            left={<ModuleBadge module="visitors" icon={ScanLine} />}
            title="Scan a pass"
            subtitle="Check in an invited guest from their QR"
            subtitleLines={2}
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
            focus === 'rejected' || focus === 'let_in' ? (
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
                {`The host gets ${afterMin} minutes to answer. After that you can let the visitor in. It’s recorded as let in by you, because the host did not answer.`}
              </Text>
            </View>
          ) : null}
          {inside.length ? (
            <View style={styles.group}>
              <SectionHeader title="Inside now" />
              {inside.map((v) => (
                <InsideVisitRow key={v.id} visit={v} onPress={() => open(v)} onCheckOut={sheet.canCheckOut ? () => sheet.checkOut(v) : undefined} />
              ))}
            </View>
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
