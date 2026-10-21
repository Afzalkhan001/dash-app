// Kit gallery section E (dev only): the tour engine (src/ui/tour, docs/TOUR.md) running a 3-step tour
// over sample targets — a tap-through Clock in pill, a round bell (circle spotlight) and a chip that
// starts off to the right of a sideways row (the tour scrolls it into view first). "With the welcome
// card" adds the first-sign-in intro; "With a missing step" adds a step whose target never appears, so
// it is dropped after 600 ms and the count shrinks. Demo content only.

import { Bell, Fingerprint } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  Button,
  Card,
  Chip,
  IconButton,
  Text,
  toast,
  TourScrollProvider,
  type TourResult,
  type TourScrollRef,
  type TourStep,
  TourTarget,
  useLayout,
  useTour,
  useTourScrollHandle,
} from '@/ui';

const CHIPS = ['All', 'Leave', 'Attendance fix', 'Work from home', 'Expense claims', 'Petty cash'];

const STEPS: TourStep[] = [
  {
    key: 'kit.clock',
    target: 'kit.tour.clock',
    title: 'Clock in here',
    body: 'Tap Clock in when you start work. Tapping it now really clocks you in and ends the tour.',
  },
  {
    key: 'kit.bell',
    target: 'kit.tour.bell',
    title: 'Your Inbox',
    body: 'The bell shows requests waiting for you. A tap on it here just moves the tour on.',
  },
  {
    key: 'kit.filter',
    target: 'kit.tour.filter',
    title: 'Filter by type',
    body: 'This chip started off to the right. The tour scrolled the row to bring it into view.',
  },
];

const MISSING: TourStep = {
  key: 'kit.missing',
  target: 'kit.tour.nowhere',
  title: 'Not on this screen',
  body: 'You never see this step: its target never appears, so it is dropped.',
};

function describe(r: TourResult) {
  const where = r.position ? ` at step ${r.position} of ${r.total}` : '';
  switch (r.reason) {
    case 'done':
      return `Finished${where}.`;
    case 'skipped':
      return `Skipped${where}.`;
    case 'activated':
      return `Tapped the spotlit control${where}.`;
    case 'empty':
      return 'Nothing to show.';
    default:
      return `Stopped${where}.`;
  }
}

function Item({ name, note, children }: { name: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.item}>
      <View style={styles.caption}>
        <Text variant="labelStrong" color={palette.primaryText} numberOfLines={2}>
          {name}
        </Text>
        {note ? (
          <Text variant="caption" muted numberOfLines={4}>
            {note}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function KitSectionE() {
  const { start, isActive } = useTour();
  const { cardPad } = useLayout();
  const [clockedIn, setClockedIn] = useState(false);
  const [chip, setChip] = useState(CHIPS[0]!);
  const [last, setLast] = useState<string | null>(null);
  const rowRef = useRef<TourScrollRef>(null);
  const rowScroll = useTourScrollHandle(rowRef, { horizontal: true, insetStart: cardPad, insetEnd: cardPad });

  const toggleClock = () => {
    const next = !clockedIn;
    setClockedIn(next);
    toast.show(next ? 'Clocked in (demo)' : 'Clocked out (demo)');
  };

  const run = (variant: 'plain' | 'intro' | 'missing') => {
    const steps = variant === 'missing' ? [STEPS[0]!, MISSING, STEPS[1]!, STEPS[2]!] : STEPS;
    start('kit.demo', steps, {
      intro:
        variant === 'intro'
          ? { title: 'Welcome, Afzal', body: 'Here is where your day starts: clocking in, your Inbox and filters. It takes about a minute.' }
          : undefined,
      skipToast: 'You can see the tour again here.',
      onEnd: (r) => {
        setLast(describe(r));
        if (r.reason === 'done' || r.reason === 'empty') toast.show(describe(r), 'info');
      },
    });
  };

  return (
    <View style={styles.section}>
      <View style={styles.caption}>
        <Text variant="title" color={palette.ink}>
          E · Tour
        </Text>
        <Text variant="label" muted>
          The first-sign-in guide: spotlight, arrow and coach card. Skip, Android back and Esc end it.
        </Text>
      </View>

      <Item name="Sample targets" note="TourTarget wraps each control. The chip row has a TourScrollProvider, so the tour can scroll it.">
        <Card tone="frostStrong" style={styles.sample}>
          <View style={styles.topRow}>
            <View style={styles.flex}>
              <Text variant="label" muted numberOfLines={1}>
                Today · General shift
              </Text>
              <Text variant="heading" numberOfLines={1}>
                {clockedIn ? 'You’re in since 9:12' : 'Not clocked in yet'}
              </Text>
            </View>
            <TourTarget id="kit.tour.bell" shape="circle">
              <IconButton accessibilityLabel="Inbox" dot onPress={() => toast.show('Inbox (demo)', 'info')}>
                <Bell size={20} color={palette.text} strokeWidth={1.8} />
              </IconButton>
            </TourTarget>
          </View>
          <TourTarget id="kit.tour.clock" radius={999} activate={toggleClock} style={styles.clockWrap}>
            <Button title={clockedIn ? 'Clock out' : 'Clock in'} size="md" icon={<Fingerprint />} onPress={toggleClock} />
          </TourTarget>
          <TourScrollProvider handle={rowScroll}>
            <ScrollView
              ref={rowRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -cardPad, flexGrow: 0 }}
              contentContainerStyle={[styles.chips, { paddingHorizontal: cardPad }]}>
              {CHIPS.map((c) =>
                c === 'Petty cash' ? (
                  <TourTarget key={c} id="kit.tour.filter" radius={999}>
                    <Chip label={c} selected={chip === c} onPress={() => setChip(c)} />
                  </TourTarget>
                ) : (
                  <Chip key={c} label={c} selected={chip === c} onPress={() => setChip(c)} />
                ),
              )}
            </ScrollView>
          </TourScrollProvider>
        </Card>
      </Item>

      <Item name="useTour().start" note="Three steps over the sample above. Try the tap-through: tap the spotlit Clock in pill on step 1.">
        <View style={styles.buttons}>
          <Button title="Start the tour" onPress={() => run('plain')} disabled={isActive} />
          <Button title="With the welcome card" variant="ghost" onPress={() => run('intro')} disabled={isActive} />
          <Button title="With a missing step" variant="text" size="md" onPress={() => run('missing')} disabled={isActive} />
          {last ? (
            <Text variant="caption" muted align="center">
              {`Last run: ${last}`}
            </Text>
          ) : null}
        </View>
      </Item>
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xl },
  item: { gap: space.sm },
  caption: { gap: 2 },
  sample: { gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  clockWrap: { alignSelf: 'flex-start' },
  chips: { gap: space.xs, alignItems: 'center' },
  buttons: { gap: space.sm },
}));
