// Building blocks for a person (docs/REFERENCE-COMPONENTS.md, Payno profile + Lendora wash):
//   WashCard            the light warm wash card (gradient.sunsetLight, ink text) behind every profile
//                       hero: More's profile card, My profile and a colleague's profile
//   PersonAvatar        their avatar (photo fetched lazily, initials in their own tint without one)
//   BloodPill           the blood-group pill shown while searching for one
//   PersonRow           one directory row, drawn as a kit ActivityRow (avatar, medium name, muted role)
//   PersonHeader        the top of a colleague's profile: big avatar, name, role, round Call / Email
//
// Fit (docs/DESIGN.md §11 People): the colleague header centres everything, so nothing in it
// competes for width; the avatar is 88 dp so the header stays short at 1.3x text on a 320 dp phone.
// Colours only from tokens, read at render time or in the themedStyles factory (light / dark).

import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Droplet, type LucideIcon } from 'lucide-react-native';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { type DirectoryPerson, usePersonPhoto } from '@/api/people';
import { themedStyles } from '@/theme/themed';
import { font, gradient, palette, radius, space, statusTone } from '@/theme/tokens';
import { ActivityRow, Avatar, FROST_SHADOW, IconAction, Skeleton, Text, useLayout } from '@/ui';

const IOS = Platform.OS === 'ios';

// ── Wash card ────────────────────────────────────────────────────────────────

/**
 * The profile heroes' surface: Lendora's light warm wash (peach → ivory → rose in light mode, ember →
 * umber → wine in dark) with the frosted rim and the soft wide shadow. Ink text on it in both themes.
 */
export function WashCard({ children, style, padded = true, ...rest }: ViewProps & { padded?: boolean }) {
  const { cardPad } = useLayout();
  return (
    <View {...rest} style={[styles.wash, padded && { padding: cardPad }, style]}>
      <LinearGradient
        colors={gradient.sunsetLight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.washFill]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────

export function PersonAvatar({ person, size = 40, ring }: { person: (DirectoryPerson & { ghost?: boolean }) | null | undefined; size?: number; ring?: boolean }) {
  const photo = usePersonPhoto(person);
  return <Avatar name={person?.name} uri={photo} size={size} ring={ring} />;
}

// ── Directory row ────────────────────────────────────────────────────────────

/** Blood group as a small soft pill with a drop: the code (word) carries the meaning. */
export function BloodPill({ code }: { code: string }) {
  return (
    <View style={styles.blood} accessibilityLabel={`Blood group ${code}`}>
      <Droplet size={12} color={palette.dangerInk} strokeWidth={2.2} />
      <Text variant="caption" color={palette.dangerInk} numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.bloodText}>
        {code}
      </Text>
    </View>
  );
}

/**
 * A person in the directory, as a kit ActivityRow (72 dp): avatar 40, the name (medium, up to 2
 * lines) over their role · team and a meta line, the blood-group pill on the right while searching
 * for one, and a chevron. Pressing opens their profile.
 */
export function PersonRow({
  person,
  title,
  subtitle,
  meta,
  blood,
  onPress,
}: {
  person: (DirectoryPerson & { ghost?: boolean }) | null | undefined;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  /** Blood-group code ('B+'); shown as a pill on the right. */
  blood?: string;
  onPress?: () => void;
}) {
  return (
    <ActivityRow
      left={<PersonAvatar person={person} size={40} ring={false} />}
      title={title}
      subtitle={subtitle}
      note={meta}
      right={blood ? <BloodPill code={blood} /> : undefined}
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={[title, blood ? `blood group ${blood}` : '', subtitle, meta].filter(Boolean).join(', ')}
    />
  );
}

// ── Colleague header ─────────────────────────────────────────────────────────

export type ContactAction = { key: string; icon: LucideIcon; label: string; onPress: () => void; primary?: boolean };

const BIG_AVATAR = 88;
const RING = 4;
const MAX_ACTIONS = 2; // at most 2 visible actions per area; the rest go in the screen's "•••" menu

/**
 * The top of a colleague's profile (Payno profile on the warm wash): a big avatar in a soft ring,
 * their name and role, an optional status line, and up to 2 round contact buttons. An action with
 * nothing to do is left out by the caller.
 */
export function PersonHeader({
  person,
  name,
  subtitle,
  note,
  actions,
}: {
  person: (DirectoryPerson & { ghost?: boolean }) | null | undefined;
  name: string;
  subtitle?: string | null;
  note?: string | null;
  actions?: ContactAction[];
}) {
  const shownName = String(name || '').trim() || 'Unnamed';
  const list = (Array.isArray(actions) ? actions : []).filter(Boolean).slice(0, MAX_ACTIONS);
  return (
    <WashCard style={styles.header}>
      <View style={styles.ring}>
        <PersonAvatar person={person} size={BIG_AVATAR} ring={false} />
      </View>
      <View style={styles.headerText}>
        <Text variant="title" color={palette.ink} align="center" numberOfLines={2} accessibilityRole="header">
          {shownName}
        </Text>
        {subtitle ? (
          <Text variant="body" muted align="center" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {note ? (
          <View style={styles.headerNote}>
            <View style={styles.noteDot} />
            <Text variant="label" muted numberOfLines={2} style={styles.shrink}>
              {note}
            </Text>
          </View>
        ) : null}
      </View>
      {list.length ? (
        <View style={styles.headerActions}>
          {list.map((a) => (
            <IconAction key={a.key} icon={a.icon} label={a.label} tone={a.primary ? 'primary' : 'surface'} size={52} onPress={a.onPress} />
          ))}
        </View>
      ) : null}
    </WashCard>
  );
}

/** Loading placeholder with the colleague header's shape. */
export function PersonHeaderSkeleton() {
  return (
    <WashCard style={styles.header} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Skeleton height={BIG_AVATAR + 2 * RING} width={BIG_AVATAR + 2 * RING} radius={(BIG_AVATAR + 2 * RING) / 2} />
      <View style={[styles.headerText, styles.centre]}>
        <Skeleton height={26} width="60%" radius={8} />
        <Skeleton height={14} width="40%" radius={6} />
      </View>
      <View style={styles.headerActions}>
        {Array.from({ length: MAX_ACTIONS }, (_, i) => (
          <Skeleton key={i} height={52} width={52} radius={26} />
        ))}
      </View>
    </WashCard>
  );
}

/** "View profile ›" drawn as a quiet brand link (inside a card that is itself the button). */
export function ViewLink({ label = 'View profile' }: { label?: string }) {
  return (
    <View style={styles.viewLink} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text variant="labelStrong" color={palette.primaryText} numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.shrink}>
        {label}
      </Text>
      <ChevronRight size={16} color={palette.primaryText} strokeWidth={2.2} style={styles.fixed} />
    </View>
  );
}

const styles = themedStyles(() => ({
  wash: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
    backgroundColor: palette.canvasTop,
    ...FROST_SHADOW,
  },
  washFill: { borderRadius: radius.xxl },
  header: { alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  // A soft frosted halo around the photo (white veil in light mode, a light veil on the dark wash).
  ring: { padding: RING, borderRadius: BIG_AVATAR / 2 + RING, backgroundColor: palette.frostStrong, borderWidth: 1, borderColor: palette.glassLine },
  headerText: { alignSelf: 'stretch', alignItems: 'center', gap: space.xxs },
  centre: { alignItems: 'center' },
  headerNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, maxWidth: '100%' },
  headerActions: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'center', alignItems: 'flex-start', gap: space.xl },
  noteDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.warning, flexShrink: 0 },
  blood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    minHeight: 24,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: statusTone.failed.border,
    backgroundColor: palette.dangerSoft,
  },
  bloodText: { fontFamily: font.semibold },
  viewLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 2, minHeight: 24 },
  shrink: { flexShrink: 1 },
  fixed: { flexShrink: 0 },
}));
