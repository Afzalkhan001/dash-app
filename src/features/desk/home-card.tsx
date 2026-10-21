// The Visitor Manager's Home hero (placement 'hero', in place of the light "Today" card): how many
// visitors are in the building now, a "Waiting" chip that opens the board, and "Invite a visitor" —
// then the desk's four shortcuts. The waiting visitors themselves are listed by Home's "Needs you"
// (the Inbox kind `desk`), so the hero doesn't list them again. Same read as the board
// (GET /visitors/today, shared cache), refreshed with the Inbox's one-minute poll.

import { useRouter } from 'expo-router';
import { DoorOpen, History, LayoutDashboard, QrCode, Ticket, UserPlus } from 'lucide-react-native';
import { View } from 'react-native';

import { useDeskToday } from '@/api/desk';
import { DESK_ROUTES } from '@/features/desk/routes';
import { radius } from '@/theme/tokens';
import { CategoryGrid, Skeleton, SummaryHero, TourTarget, useLayout } from '@/ui';

export function DeskHeroCard() {
  const router = useRouter();
  const { gap } = useLayout();
  const board = useDeskToday();
  const s = board.data?.stats;
  const waiting = s ? s.waiting + s.noResponse : 0;
  const openBoard = () => router.push(DESK_ROUTES.board);

  return (
    <View style={{ gap }}>
      <TourTarget id="home.desk" radius={radius.xl}>
        <SummaryHero
          icon={DoorOpen}
          module="visitors"
          label="In the building"
          value={s ? s.inside : undefined}
          unit={s?.inside === 1 ? 'visitor' : 'visitors'}
          figure={s ? undefined : board.isError ? null : <Skeleton width={120} height={48} radius={radius.sm} />}
          onArrowPress={openBoard}
          arrowLabel="Open the visitor desk"
          info={
            s
              ? {
                  label: 'Waiting for a host',
                  value: String(waiting),
                  onPress: openBoard,
                  accessibilityLabel: `${waiting} waiting for a host. Opens the visitor desk`,
                }
              : undefined
          }
          sub={s ? `${s.total} ${s.total === 1 ? 'visitor' : 'visitors'} today` : board.isError ? 'Couldn’t load today’s visitors. Pull to refresh.' : undefined}
          action={{ title: 'Invite a visitor', icon: <UserPlus />, onPress: () => router.push(DESK_ROUTES.invite) }}
        />
      </TourTarget>
      <CategoryGrid
        items={[
          { key: 'board', label: 'Visitor desk', icon: LayoutDashboard, module: 'visitors', onPress: openBoard, badge: waiting, hint: 'Opens today’s visitors' },
          { key: 'log', label: 'Visitor log', icon: History, module: 'visitors', onPress: () => router.push(DESK_ROUTES.log), hint: 'Opens past visits' },
          { key: 'invites', label: 'Invites', icon: Ticket, module: 'visitors', onPress: () => router.push(DESK_ROUTES.invites), hint: 'Opens your invitations' },
          { key: 'qr', label: 'Check-in link', icon: QrCode, module: 'visitors', onPress: () => router.push(DESK_ROUTES.qr), hint: 'Opens the check-in link' },
        ]}
      />
    </View>
  );
}
