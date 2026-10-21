// The More tab's pieces (docs/REFERENCE-COMPONENTS.md §3 More, Payno profile + "Bill Pay"):
//   ProfileCard       my profile on top, on the light warm wash (features/people WashCard): my photo or
//                     initials in a soft ring, my name, my job title and a quiet "View profile ›" link.
//                     The whole card is the one button (→ My profile).
//   MenuGrid          the secondary modules as the kit CategoryGrid: frosted circles on the canvas with
//                     a thin icon in the module's own colour and a label under each. Up to 4 per row,
//                     3 when that fills the rows better (9 → 3 × 3, 6 → 3 × 2). The only badge is the
//                     count of policies to read. A tile's short "what it is for" caption is its hint.
//   MenuGridSkeleton  round placeholders in the grid's shape while /hr/me loads.
// Fit: CategoryGrid measures its width and keeps a row only while every label fits whole (11 px on a
// 320 dp phone; fewer per row with large text). Labels are words that fit a tile ("News", not
// "Announcements").

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import type { MenuItem } from '@/features/more/menu';
import { ViewLink, WashCard } from '@/features/people/person-ui';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Avatar, type CategoryItem, CategoryGrid, PressableScale, Skeleton, Text, useLayout } from '@/ui';

const DISC = 56;
const PHOTO = 60;
const RING = 4;

// The tiles the first-sign-in tour points at (docs/TOUR.md §6.1), by menu key.
const TOUR_IDS: Record<string, string> = {
  reimbursements: 'more.expenseClaims',
  'petty-cash': 'more.pettyCash',
  tasks: 'more.myTasks',
  support: 'more.support',
  announcements: 'more.news',
  bounty: 'more.bounty',
};
const tourIdOf = (it: MenuItem) => it.tourId ?? (it.key === 'people' ? (it.href === '/team' ? 'more.myTeam' : 'more.people') : TOUR_IDS[it.key]);

const countOf = (it: MenuItem) => (typeof it.count === 'number' && Number.isFinite(it.count) && it.count > 0 ? Math.round(it.count) : 0);

/** 4 per row unless 3 fills the rows more evenly (3, 5, 6 and 9 tiles; 4, 7 and 8 stay at 4). */
const columnsFor = (n: number): 3 | 4 => (n === 3 || n === 5 || n === 6 || n === 9 ? 3 : 4);

/** The module grid: frosted round tiles with labels, in the order given. Nothing when empty. */
export function MenuGrid({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return null;
  const tiles: CategoryItem[] = list.map((it) => {
    const count = countOf(it);
    return {
      key: it.key,
      label: it.label,
      icon: it.icon,
      module: it.module,
      onPress: () => router.push(it.href),
      badge: count || undefined,
      hint: it.caption,
      accessibilityLabel: count ? `${it.label}, ${count} to read` : it.label,
      tourId: tourIdOf(it),
    };
  });
  return <CategoryGrid items={tiles} columns={columnsFor(tiles.length)} size={DISC} />;
}

/** Placeholder while /hr/me loads: two rows of three round tiles (the shape of the usual 3-across grid). */
export function MenuGridSkeleton() {
  return (
    <View style={styles.skeletonGrid} accessibilityLabel="Loading menu" accessibilityRole="progressbar">
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={styles.skeletonTile}>
          <Skeleton width={DISC} height={DISC} radius={DISC / 2} />
          <Skeleton width="62%" height={10} radius={5} />
        </View>
      ))}
    </View>
  );
}

/**
 * My profile, on top of More (Payno profile): photo in a soft ring, my name, my job title and a
 * "View profile ›" link on the warm wash; the whole card opens My profile.
 */
export function ProfileCard({ name, photo, title, onPress }: { name: string; photo?: string | null; title?: string; onPress: () => void }) {
  const { compact } = useLayout();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={[name, title].filter(Boolean).join(', ')}
      accessibilityHint="Opens your profile">
      <WashCard style={styles.profile}>
        <View style={styles.ring}>
          <Avatar name={name} uri={photo} size={compact ? PHOTO - 8 : PHOTO} ring={false} />
        </View>
        <View style={styles.profileText}>
          <Text variant="title" color={palette.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.name}>
            {name}
          </Text>
          {title ? (
            <Text variant="label" muted numberOfLines={1} style={styles.shrink}>
              {title}
            </Text>
          ) : null}
          <ViewLink />
        </View>
      </WashCard>
    </PressableScale>
  );
}

const styles = themedStyles(() => ({
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, columnGap: space.xs },
  skeletonTile: { flexBasis: '30%', flexGrow: 1, alignItems: 'center', gap: space.xs },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ring: { padding: RING, borderRadius: PHOTO / 2 + RING, backgroundColor: palette.frostStrong, borderWidth: 1, borderColor: palette.glassLine, flexShrink: 0 },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4, flexShrink: 1 },
  shrink: { flexShrink: 1 },
}));
