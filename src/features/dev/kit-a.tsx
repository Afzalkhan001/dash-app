// Kit gallery section A (dev only): chrome & surfaces from docs/REFERENCE-COMPONENTS.md items 1–5 —
// the Backdrop wash, FrostCard (Card tones), frosted ListCard, SummaryHero, NavHeader / TabRootHeader,
// IconPillGroup, HomeHeader, the TabBarWithFab (+ CreateSheet) and the tab icon set with its motion
// (docs/NAVBAR-MOTION.md: tap the icons, step the badge, turn the + into ×). Each sits under a small
// caption with its name so it can be compared with the Payno / Lendora reference. Demo content only.

import { Bell, CalendarDays, Fingerprint, Inbox, Receipt, Search, SlidersHorizontal, Trophy, Wallet } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';

import { CreateSheet, useCreateActions } from '@/features/create/create-sheet';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space, type as typeScale } from '@/theme/tokens';
import {
  Backdrop,
  Button,
  Card,
  Chip,
  ChipRow,
  HomeHeader,
  IconPillGroup,
  ListCard,
  ListRow,
  Metric,
  ModuleBadge,
  NavHeader,
  QuickActions,
  StatusPill,
  SummaryHero,
  TabRootHeader,
  Text,
  toast,
  useLayout,
} from '@/ui';
import { TabBarFrame, TabButton, TabFab } from '@/ui/tab-bar';
import { TAB_GLYPH_NAMES, TabGlyph, type TabGlyphName, useTabOn } from '@/ui/tab-glyphs';

const noop = () => {};
const say = (what: string) => () => toast.show(what, 'info');

/** The small caption over every gallery item: the component's name and what it shows. */
function Item({ name, note, children }: { name: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.item}>
      <View style={styles.caption}>
        <Text variant="labelStrong" color={palette.primaryText} numberOfLines={2}>
          {name}
        </Text>
        {note ? (
          <Text variant="caption" muted numberOfLines={3}>
            {note}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Gallery-only stand-in for the children slot (the real StripedProgress lives in another kit file). */
function DemoProgress({ used, total }: { used: number; total: number }) {
  const pct = Math.max(0, Math.min(1, total > 0 ? used / total : 0));
  return (
    <View style={styles.progressWrap} accessible accessibilityLabel={`${used} of ${total} days present`}>
      <View style={styles.progressHead}>
        <Text variant="caption" muted>
          Present this month
        </Text>
        <Text variant="labelStrong" tabular>
          {used} / {total}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
    </View>
  );
}

type StaffTab = 'home' | 'me' | 'inbox' | 'more';
type VendorTab = 'home' | 'bills' | 'agreements' | 'profile';

const GLYPH_LABEL: Record<TabGlyphName, string> = {
  home: 'Home',
  me: 'Me',
  inbox: 'Inbox',
  more: 'More',
  bills: 'Bills',
  agreements: 'Agreements',
  profile: 'Profile',
};
/** Badge steps that walk through every badge motion: zoom in, pop + wiggle, quiet drop, zoom out, cap. */
const BADGE_STEPS = [0, 3, 5, 2, 120] as const;

/** One tab icon, tappable on its own: 2× zoom on top, the real 24 dp size on its pill below. */
function GlyphCell({ name, selected, onToggle }: { name: TabGlyphName; selected: boolean; onToggle: () => void }) {
  const reduced = useReducedMotion();
  const on = useTabOn(selected);
  const pill = useAnimatedStyle(() => ({ opacity: on.get() }));
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${GLYPH_LABEL[name]} tab icon`}
      style={({ pressed }) => [styles.glyphCell, pressed && styles.glyphPressed]}>
      <View style={styles.glyphZoom} pointerEvents="none">
        <View style={styles.glyphZoomInner}>
          <TabGlyph name={name} on={on} focused={selected} reduced={reduced} />
        </View>
      </View>
      <View style={styles.glyphZone} pointerEvents="none">
        <Animated.View style={[styles.glyphPill, pill]} />
        <TabGlyph name={name} on={on} focused={selected} reduced={reduced} />
      </View>
      <Text variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {GLYPH_LABEL[name]}
      </Text>
    </Pressable>
  );
}

export function KitSectionA() {
  const { gutter } = useLayout();
  const [tab, setTab] = useState<StaffTab>('home');
  const [vendorTab, setVendorTab] = useState<VendorTab>('agreements');
  const [creating, setCreating] = useState(false);
  const [fabDemo, setFabDemo] = useState(false);
  const [inboxCount, setInboxCount] = useState(3);
  const [vendorApproved, setVendorApproved] = useState(true);
  const [glyphsOn, setGlyphsOn] = useState<TabGlyphName[]>(['home']);
  const [pettyHidden, setPettyHidden] = useState(false);
  const createItems = useCreateActions();
  const bleed = { marginHorizontal: -gutter };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="title" accessibilityRole="header">
          A · Chrome & surfaces
        </Text>
        <Text variant="label" muted>
          Payno wash, frost, summary hero, headers and the tab bar with its centre “+”.
        </Text>
      </View>

      <Item name="Backdrop" note="Near-white canvasTop at the top deepening to canvasWash at the very bottom; soft top glow + warm haze.">
        <View style={styles.backdropBox}>
          <Backdrop />
          <Card tone="frost" style={styles.backdropCard}>
            <Text variant="label">Frost card on the wash</Text>
          </Card>
        </View>
      </Item>

      <Item name='FrostCard — Card tone="frost"' note="Translucent white 0.58, bright 1 px rim (hairline on Android), soft wide shadow, radius 24.">
        <Card tone="frost" style={styles.rowCard}>
          <ModuleBadge module="leave" icon={CalendarDays} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Casual leave</Text>
            <Text variant="label" muted>
              6 of 12 days left · resets 1 Jan
            </Text>
          </View>
        </Card>
      </Item>

      <Item name='Card tone="frostStrong"' note="0.80 white — heroes and summaries.">
        <Card tone="frostStrong" style={styles.rowCard}>
          <ModuleBadge module="pay" icon={Wallet} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">October salary credited</Text>
            <Text variant="label" muted>
              ₹68,420 to HDFC •••• 4125 on 30 Oct
            </Text>
          </View>
        </Card>
      </Item>

      <Item name="Card (default tone)" note='The default "surface" tone is now the frost look, so every screen picks it up.'>
        <Card>
          <Text variant="heading">Team meeting moved</Text>
          <Text variant="label" muted>
            Ananya Iyer · Weekly review is now at 4:30 PM in Conference Room B.
          </Text>
        </Card>
      </Item>

      <Item name='ListCard (frost) and ListCard tone="surface" (frost strong)'>
        <ListCard>
          <ListRow
            left={<ModuleBadge module="attendance" icon={Fingerprint} />}
            title="Clocked in at 9:42 AM"
            subtitle="Banjara Hills office"
            right={<StatusPill label="On time" tone="done" />}
          />
          <ListRow left={<ModuleBadge module="leave" icon={CalendarDays} />} title="Sick leave · 2 days" subtitle="23–24 Oct" right={<StatusPill label="Waiting" tone="pending" />} />
        </ListCard>
        <ListCard tone="surface">
          <ListRow left={<ModuleBadge module="expenses" icon={Receipt} />} title="Cab to client site" subtitle="Rahul Verma · 18 Oct" value="₹1,240" valueMeta="Approved" />
          <ListRow left={<ModuleBadge module="bounty" icon={Trophy} />} title="Bounty: Fix the leave report" subtitle="Submitted 2 days ago" value="+250" valueMeta="coins" />
        </ListCard>
      </Item>

      <Item name="SummaryHero — leave balance" note="Icon circle + muted label, brand ↗ button, huge figure, info chip, full-width primary pill.">
        <SummaryHero
          icon={CalendarDays}
          module="leave"
          label="Leave balance"
          value={14.5}
          decimals={1}
          unit="days"
          onArrowPress={say('Opens Me › Leave')}
          info={{ label: 'Casual leave', value: '6 left', onPress: say('Opens leave types') }}
          action={{ title: 'Apply leave', onPress: say('Opens /leave/apply?kind=leave') }}
        />
      </Item>

      <Item name="SummaryHero — petty cash (₹, eye toggle, sub-line, white ↗)" note="Greyed paise, amounts can be hidden; muted sub-line instead of a chip.">
        <SummaryHero
          icon={Wallet}
          module="pettyCash"
          label="Petty cash left"
          value={8450.5}
          currency="₹"
          hideable
          hidden={pettyHidden}
          onHiddenChange={setPettyHidden}
          arrowTone="frost"
          onArrowPress={say('Opens Petty cash')}
          sub="Last bill • 12 Oct, ₹1,250 to Sharma Stationers"
        />
      </Item>

      <Item name="SummaryHero — children slot (progress)" note="Team attendance summary with a progress bar in the children slot.">
        <SummaryHero
          icon={Fingerprint}
          module="attendance"
          label="October attendance"
          value={18}
          unit="days"
          onArrowPress={say('Opens attendance calendar')}
          info={{ label: 'Late marks', value: '2 this month' }}>
          <DemoProgress used={18} total={22} />
        </SummaryHero>
      </Item>

      <Item name="SummaryHero — figure node" note="Any node as the figure (a Numeral from the viz kit fits here).">
        <SummaryHero
          icon={Trophy}
          module="bounty"
          label="Bounty coins"
          figure={<Metric value={1240} unit="coins" variant="display" style={typeScale.numeral} />}
          onArrowPress={say('Opens Bounty wallet')}
          info={{ label: 'Rank', value: 'No. 4 in Hyderabad', onPress: say('Opens leaderboard') }}
        />
      </Item>

      <Item name="NavHeader — two actions (search, bell with dot)" note="Round frosted back, centred light title, ≤ 2 frosted actions. Title starts after the back button on a narrow phone.">
        <NavHeader
          title="Expense claims"
          onBack={noop}
          style={bleed}
          actions={[
            { key: 'search', icon: Search, label: 'Search claims', onPress: say('Search') },
            { key: 'bell', icon: Bell, label: 'Inbox, 2 waiting', dot: true, onPress: say('Inbox') },
          ]}
        />
      </Item>

      <Item name="NavHeader — one action + subtitle">
        <NavHeader
          title="Salary advance"
          subtitle="Updated today at 9:00 AM"
          onBack={noop}
          style={bleed}
          actions={[{ key: 'filter', icon: SlidersHorizontal, label: 'Filter', onPress: say('Filter') }]}
        />
      </Item>

      <Item name="NavHeader — back only">
        <NavHeader title="Holidays 2026" onBack={noop} style={bleed} />
      </Item>

      <Item name="TabRootHeader" note="Tab roots: no back, centred title (overline + DEMO pill above), actions right.">
        <TabRootHeader
          title="Inbox"
          overline="Tamada Media"
          style={bleed}
          actions={[{ key: 'filter', icon: SlidersHorizontal, label: 'Filter requests', onPress: say('Filter') }]}
        />
      </Item>

      <Item name="IconPillGroup" note="One frosted pill, 2 icon buttons, red unread dots (Lendora header).">
        <View style={styles.pillRow}>
          <IconPillGroup
            items={[
              { key: 'bell', icon: Bell, label: 'Notifications, new', dot: true, onPress: say('Notifications') },
              { key: 'inbox', icon: Inbox, label: 'Inbox, 3 waiting', dot: true, onPress: say('Inbox') },
            ]}
          />
          <IconPillGroup items={[{ key: 'bell', icon: Bell, label: 'Notifications', onPress: say('Notifications') }]} />
        </View>
      </Item>

      <Item name="HomeHeader (Payno)" note="Avatar, muted greeting 👋, name in a larger regular weight, DEMO pill, IconPillGroup on the right.">
        <HomeHeader
          greeting="Welcome back"
          name="Priya"
          avatarName="Priya Sharma"
          onAvatarPress={say('Opens My profile')}
          bellDot
          bellLabel="Inbox, 3 waiting"
          onBellPress={say('Opens Inbox')}
          actions={[{ key: 'inbox', icon: Inbox, label: 'Requests, 1 new', dot: true, onPress: say('Opens Inbox') }]}
          demo
        />
      </Item>

      <Item name="TabBarWithFab — staff" note="Sliding soft-brand pill, filled icon with a short beat, brand label; the raised + opens the CreateSheet and turns into ×.">
        <TabBarFrame inline>
          <TabButton glyph="home" label="Home" isFocused={tab === 'home'} onPress={() => setTab('home')} />
          <TabButton glyph="me" label="Me" isFocused={tab === 'me'} onPress={() => setTab('me')} />
          <TabFab open={creating || fabDemo} onPress={() => setCreating(true)} />
          <TabButton glyph="inbox" label="Inbox" badge={inboxCount} isFocused={tab === 'inbox'} onPress={() => setTab('inbox')} />
          <TabButton glyph="more" label="More" isFocused={tab === 'more'} onPress={() => setTab('more')} />
        </TabBarFrame>
        <Text variant="caption" muted>
          Inbox badge: 0 → 3 zooms in, 3 → 5 pops, 5 → 2 stays still, → 0 zooms out, 120 shows 99+.
        </Text>
        <ChipRow wrap>
          {BADGE_STEPS.map((n) => (
            <Chip key={n} label={String(n)} selected={inboxCount === n} onPress={() => setInboxCount(n)} />
          ))}
          <Chip label="+1" onPress={() => setInboxCount((c) => c + 1)} />
          <Chip label={fabDemo ? 'FAB: ×' : 'FAB: +'} selected={fabDemo} onPress={() => setFabDemo((v) => !v)} />
        </ChipRow>
      </Item>

      <Item name="Tab bar — vendor portal (no FAB)" note="Unapproved vendors see Home · Profile only; approving glides the pill to its new slot.">
        <TabBarFrame inline>
          <TabButton glyph="home" label="Home" isFocused={vendorTab === 'home'} onPress={() => setVendorTab('home')} />
          {vendorApproved ? <TabButton glyph="bills" label="Bills" isFocused={vendorTab === 'bills'} onPress={() => setVendorTab('bills')} /> : null}
          {vendorApproved ? (
            <TabButton glyph="agreements" label="Agreements" badge={1} isFocused={vendorTab === 'agreements'} onPress={() => setVendorTab('agreements')} />
          ) : null}
          <TabButton glyph="profile" label="Profile" isFocused={vendorTab === 'profile'} onPress={() => setVendorTab('profile')} />
        </TabBarFrame>
        <ChipRow wrap>
          <Chip
            label={vendorApproved ? 'Approved' : 'Not approved'}
            selected={vendorApproved}
            onPress={() => {
              if (vendorApproved && (vendorTab === 'bills' || vendorTab === 'agreements')) setVendorTab('home');
              setVendorApproved((v) => !v);
            }}
          />
        </ChipRow>
      </Item>

      <Item name="Tab icons (src/ui/tab-glyphs.tsx)" note="Tap an icon to select it: one short beat, then still. Tap again to deselect: a quiet 100 ms fade.">
        <Card tone="frost">
          <View style={styles.glyphGrid}>
            {TAB_GLYPH_NAMES.map((name) => (
              <GlyphCell
                key={name}
                name={name}
                selected={glyphsOn.includes(name)}
                onToggle={() => setGlyphsOn((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]))}
              />
            ))}
          </View>
        </Card>
        <ChipRow wrap>
          <Chip label="Select all" onPress={() => setGlyphsOn([...TAB_GLYPH_NAMES])} />
          <Chip label="Clear" onPress={() => setGlyphsOn([])} />
        </ChipRow>
      </Item>

      <Item name="CreateSheet" note="What this account can start (same gates as Home shortcuts and More). Tapping one closes the sheet and opens the form.">
        <Card tone="frost">
          {createItems.length ? (
            <QuickActions
              surface="card"
              items={createItems.map((a) => ({ key: a.key, label: a.label, icon: a.icon, module: a.module, onPress: say(`Opens ${String(a.href)}`) }))}
            />
          ) : (
            <Text variant="label" muted>
              This account has nothing to start.
            </Text>
          )}
        </Card>
        <Button title="Open the CreateSheet" variant="ghost" onPress={() => setCreating(true)} />
      </Item>

      <CreateSheet visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xl },
  sectionHead: { gap: space.xxs },
  item: { gap: space.xs },
  caption: { gap: 2, paddingLeft: space.xxs },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  backdropBox: { height: 220, borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end', padding: space.md, borderWidth: 1, borderColor: palette.glassLine },
  backdropCard: { alignSelf: 'flex-start' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  progressWrap: { gap: space.xs },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: palette.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: palette.primary },
  glyphGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: space.md, columnGap: space.xs },
  glyphCell: { width: 72, alignItems: 'center', gap: space.xxs, paddingVertical: space.xxs, borderRadius: radius.sm },
  glyphPressed: { backgroundColor: palette.pressedTint },
  glyphZoom: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  glyphZoomInner: { width: 24, height: 24, transform: [{ scale: 2 }] },
  glyphZone: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
  glyphPill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: palette.primarySoft },
}));
