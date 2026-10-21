// The pieces of My team (features/team/team.ts has the data), in the Payno × Lendora kit
// (docs/REFERENCE-COMPONENTS.md) and the owner's Keka reference, top to bottom:
//   TeamSearchBar     my avatar (→ My profile) beside a PillField "Search your colleagues"
//   DepartmentCard    "My department": a frosted card per department — "Human Resources • 4 people"
//                     over "Check what is going on with your teammates", chevron
//   OffThisWeek       AvatarTiles of teammates off this week ("Thu–Fri", "Today", "Fri (half)"), or
//                     "Everyone is working this week!" with "View upcoming leaves"
//   UpcomingSheet     the leave coming up in the 30 days after this week, one row per stretch
//   TeamFilterChips   All (n) · Manager (1) · Peers (n) · Direct reports (n), only the groups there are
//   TeamListRow       a FlashList row: a group label, a person (one frosted card per group) or a note
//   CompanyLinks      Whole company (the directory) and Org chart
// Colours only from tokens, read at render or in the themedStyles factory; type only through Text
// variants. Fits 320 dp and large text: tiles and chips scroll sideways, rows wrap to two lines.

import { Building2, CalendarCheck, ChevronRight, Network, Search, Users, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { dayMonth } from '@/features/attendance/format';
import { personTitle } from '@/features/people/directory';
import type { OrgNode, OrgPlace } from '@/features/people/org-tree';
import { PersonAvatar, PersonRow } from '@/features/people/person-ui';
import { usePeoplePhotos } from '@/features/people/photos';
import { type MyTeam, type TeamDept, type TeamFilter, type TeamGroup, type TeamRow, UPCOMING_DAYS, type UpcomingLeave } from '@/features/team/team';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityRow,
  Avatar,
  AvatarTiles,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  GroupedRow,
  hitSlopFor,
  ListCard,
  ListRow,
  ModuleBadge,
  PillField,
  PressableScale,
  SectionHeader,
  SectionLabel,
  Sheet,
  shouldStack,
  Skeleton,
  SkeletonList,
  Text,
  useLayout,
} from '@/ui';

const ME_AVATAR = 44;

// ── Search ───────────────────────────────────────────────────────────────────

/** My avatar (→ My profile) beside the search pill. The placeholder shortens below 360 dp so it never clips. */
export function TeamSearchBar({
  name,
  photo,
  value,
  onChangeText,
  onAvatar,
}: {
  name?: string;
  photo?: string | null;
  value: string;
  onChangeText: (v: string) => void;
  onAvatar: () => void;
}) {
  const l = useLayout();
  const narrow = shouldStack(l, { below: 'narrow' });
  return (
    <View style={styles.searchRow}>
      <PressableScale
        onPress={onAvatar}
        scaleTo={0.94}
        hitSlop={hitSlopFor(ME_AVATAR + 4)}
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        accessibilityHint="Opens My profile"
        style={styles.meAvatar}>
        <Avatar name={name} uri={photo} size={ME_AVATAR} ring />
      </PressableScale>
      <PillField
        containerStyle={styles.searchField}
        icon={Search}
        value={value}
        onChangeText={onChangeText}
        placeholder={narrow ? 'Search colleagues' : 'Search your colleagues'}
        accessibilityLabel="Search your colleagues"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        trailing={
          value ? (
            <Pressable onPress={() => onChangeText('')} hitSlop={hitSlopFor(32)} style={styles.clear} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={18} color={palette.textMuted} />
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

// ── My department ────────────────────────────────────────────────────────────

/**
 * "My department" (Keka "My departments and units"): one frosted card, a row per department with a
 * people badge, "Name • N people" (HR and leadership) or "Name • N in your team" (everyone else — the
 * server keeps who is in which department from them), a one-line hint and a chevron.
 */
export function DepartmentCard({ depts, onOpen }: { depts: TeamDept[]; onOpen: (d: TeamDept) => void }) {
  const list = (Array.isArray(depts) ? depts : []).filter(Boolean);
  if (!list.length) return null;
  return (
    <Card tone="frost" padded={false} style={styles.deptCard}>
      <Text variant="label" muted numberOfLines={1} style={styles.deptOverline}>
        {list.length > 1 ? 'My departments' : 'My department'}
      </Text>
      {list.map((d, i) => {
        // No-break spaces keep the bullet, the figure and its word together when the name wraps
        // ("Human Resources" / "• 4 people"), never a bullet left dangling at the end of a line.
        const count = d.scope === 'department' ? plural(d.count, 'person', 'people').replace(' ', ' ') : `${d.count} in your team`;
        const hint = d.scope === 'department' ? 'Check what is going on with your teammates' : 'See who reports to whom';
        return (
          <View key={d.key}>
            {i > 0 ? <View style={styles.deptSep} /> : null}
            <Pressable
              onPress={() => onOpen(d)}
              accessibilityRole="button"
              accessibilityLabel={`${d.name}, ${count.replace(/ /g, ' ')}`}
              accessibilityHint={hint}
              style={({ pressed }) => [styles.deptRow, pressed && { backgroundColor: palette.pressedTint }]}>
              <ModuleBadge module="people" icon={Building2} size={44} />
              <View style={styles.flexText}>
                <Text variant="bodyStrong" color={palette.ink} numberOfLines={2}>
                  {d.name}
                  <Text variant="body" muted>
                    {` • ${count}`}
                  </Text>
                </Text>
                <Text variant="label" muted numberOfLines={2}>
                  {hint}
                </Text>
              </View>
              <ChevronRight size={18} color={palette.textFaint} style={styles.fixed} />
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

// ── Off this week ────────────────────────────────────────────────────────────

/** "19–25 Oct" (or "27 Oct – 2 Nov" across a month). */
function weekRange(monday: string, sunday: string) {
  const a = dayMonth(monday);
  const b = dayMonth(sunday);
  return monday.slice(0, 7) === sunday.slice(0, 7) ? `${a.split(' ')[0]}–${b}` : `${a} – ${b}`;
}

/** A row of tile-shaped placeholders while the leave calendar loads. */
function TilesSkeleton() {
  return (
    <View style={styles.tilesSkeleton} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} width={96} height={100} radius={radius.lg} />
      ))}
    </View>
  );
}

export function OffThisWeek({
  data,
  onOpenPerson,
  onUpcoming,
}: {
  data: MyTeam['leave'];
  onOpenPerson: (p: OrgNode) => void;
  onUpcoming: () => void;
}) {
  const week = Array.isArray(data?.week) ? data.week : [];
  const photoOf = usePeoplePhotos(week.map((o) => o.person));
  const range = weekRange(data.monday, data.sunday);
  const someone = !data.loading && week.length > 0;
  return (
    <View style={styles.section}>
      <SectionHeader
        title="Off this week"
        overline={range}
        actionLabel="Upcoming leaves"
        onAction={someone ? onUpcoming : undefined}
        actionAccessibilityLabel="View upcoming leaves"
      />
      {data.loading ? (
        <TilesSkeleton />
      ) : someone ? (
        <AvatarTiles
          accessibilityLabel="Off this week"
          items={week.map((o) => ({
            key: String(o.person.id),
            name: o.person.name || 'Unnamed',
            uri: photoOf(o.person),
            sub: o.label,
            onPress: () => onOpenPerson(o.person),
            accessibilityLabel: o.spoken,
            hint: 'Opens their profile',
          }))}
        />
      ) : (
        <Card tone="frost" padded={false}>
          <EmptyState
            style={styles.weekEmpty}
            icon={<CalendarCheck color={palette.successInk} strokeWidth={1.8} />}
            title="Everyone is working this week!"
            // A text button aligns itself to the start; centred under the centred title here.
            action={<Button title="View upcoming leaves" variant="text" size="sm" onPress={onUpcoming} style={styles.centred} />}
          />
        </Card>
      )}
    </View>
  );
}

/** The leave coming up after this week: one row per stretch (person, dates, how many days). */
export function UpcomingSheet({
  visible,
  onClose,
  items,
  onOpenPerson,
}: {
  visible: boolean;
  onClose: () => void;
  items: UpcomingLeave[];
  onOpenPerson: (p: OrgNode) => void;
}) {
  const list = Array.isArray(items) ? items : [];
  return (
    <Sheet visible={visible} onClose={onClose} title="Upcoming leaves" subtitle={`Your team, in the ${UPCOMING_DAYS} days after this week`}>
      {list.length ? (
        <ListCard tone="surface">
          {list.map((it) => (
            <ActivityRow
              key={it.key}
              left={<PersonAvatar person={it.person} size={40} ring={false} />}
              title={it.person.name || 'Unnamed'}
              subtitle={it.label}
              value={it.amount}
              chevron
              onPress={() => {
                onClose();
                onOpenPerson(it.person);
              }}
              accessibilityLabel={it.spoken}
              accessibilityHint="Opens their profile"
            />
          ))}
        </ListCard>
      ) : (
        <EmptyState
          icon={<CalendarCheck strokeWidth={1.8} />}
          title="No leave coming up"
          message={`No one in your team is off in the ${UPCOMING_DAYS} days after this week.`}
        />
      )}
    </Sheet>
  );
}

// ── My teammates ─────────────────────────────────────────────────────────────

const CHIP_LABEL: Record<TeamGroup, string> = { manager: 'Manager', peers: 'Peers', reports: 'Direct reports' };

export const groupSize = (place: OrgPlace, g: TeamGroup) => (g === 'manager' ? (place.manager ? 1 : 0) : g === 'peers' ? place.peers.length : place.reports.length);

/** The groups this person has, in their fixed order (a chip only for a group with people in it). */
export const teamGroups = (place: OrgPlace) => (['manager', 'peers', 'reports'] as TeamGroup[]).filter((g) => groupSize(place, g) > 0);

/** All (n) first, then one chip per group; hidden when there is only one group to choose from. */
export function TeamFilterChips({ place, value, onChange }: { place: OrgPlace; value: TeamFilter; onChange: (f: TeamFilter) => void }) {
  const groups = teamGroups(place);
  if (groups.length < 2) return null;
  const all = groups.reduce((n, g) => n + groupSize(place, g), 0);
  return (
    <ChipRow>
      <Chip label="All" count={all} selected={value === 'all'} onPress={() => onChange('all')} />
      {groups.map((g) => (
        <Chip key={g} label={CHIP_LABEL[g]} count={groupSize(place, g)} selected={value === g} onPress={() => onChange(g)} />
      ))}
    </ChipRow>
  );
}

/**
 * One FlashList row: a group label ("Peers (4)"), a person in that group's frosted card (avatar, name,
 * job title, chevron — a manager who is not in the directory has no chevron and says so), or a muted
 * note in a card of its own.
 */
export function TeamListRow({
  row,
  full,
  subtitle,
  onOpen,
}: {
  row: TeamRow;
  /** HR / leadership: label roster rows of people who have not signed up yet. */
  full: boolean;
  /** Overrides the person's subtitle (search results add the department for HR / leadership). */
  subtitle?: string | null;
  onOpen: (p: OrgNode) => void;
}) {
  if (row.kind === 'label') return <SectionLabel title={row.title} style={row.first ? styles.labelFirst : styles.label} />;
  if (row.kind === 'note') {
    return (
      <GroupedRow tone="surface" first last style={row.first ? null : styles.noteGap}>
        <View style={styles.note}>
          <Text variant="label" muted numberOfLines={3}>
            {row.text}
          </Text>
        </View>
      </GroupedRow>
    );
  }
  const p = row.person;
  const meta = row.note ?? (p.pending && full ? 'Not signed up yet' : null);
  return (
    <GroupedRow tone="surface" hairline first={row.first} last={row.last}>
      <PersonRow
        person={p}
        title={p.name || 'Unnamed'}
        subtitle={subtitle !== undefined ? subtitle : personTitle(p) || null}
        meta={meta}
        onPress={p.ghost ? undefined : () => onOpen(p)}
      />
    </GroupedRow>
  );
}

// ── Company links ────────────────────────────────────────────────────────────

/** The way out to everyone: the full directory and the org chart. */
export function CompanyLinks({ total, onDirectory, onChart }: { total: number; onDirectory: () => void; onChart: () => void }) {
  return (
    <View style={styles.section}>
      <SectionHeader title="Company" />
      <ListCard tone="surface">
        <ListRow
          size="lg"
          left={<ModuleBadge module="people" icon={Users} />}
          title="Whole company"
          subtitle={total > 0 ? `${plural(total, 'person', 'people')} · search and filter` : 'Search and filter everyone'}
          subtitleLines={2}
          chevron
          onPress={onDirectory}
          accessibilityHint="Opens the company directory"
        />
        <ListRow
          size="lg"
          left={<ModuleBadge module="people" icon={Network} />}
          title="Org chart"
          subtitle="Who reports to whom"
          subtitleLines={2}
          chevron
          onPress={onChart}
        />
      </ListCard>
    </View>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

/** The screen's shape while the directory loads: department card, the week's tiles, then a list. */
export function TeamSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton height={104} radius={radius.xl} />
      <View style={styles.section}>
        <Skeleton height={20} width="40%" radius={6} />
        <TilesSkeleton />
      </View>
      <View style={styles.section}>
        <Skeleton height={20} width="45%" radius={6} />
        <SkeletonList rows={4} avatar tone="surface" />
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meAvatar: { flexShrink: 0, borderRadius: (ME_AVATAR + 4) / 2 },
  searchField: { flex: 1, minWidth: 0 },
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  deptCard: { paddingVertical: space.xs },
  deptOverline: { paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xxs },
  deptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md },
  deptSep: { height: 1, backgroundColor: palette.separator, marginLeft: space.md + 44 + space.sm, marginRight: space.md },
  flexText: { flex: 1, minWidth: 0, gap: 2 },
  fixed: { flexShrink: 0 },
  section: { gap: space.xxs },
  tilesSkeleton: { flexDirection: 'row', gap: space.sm, overflow: 'hidden' },
  weekEmpty: { paddingVertical: space.lg },
  centred: { alignSelf: 'center' },
  labelFirst: { marginBottom: space.xs },
  label: { marginTop: space.lg, marginBottom: space.xs },
  note: { paddingHorizontal: space.md, paddingVertical: space.md },
  noteGap: { marginTop: space.lg },
  skeleton: { gap: space.lg },
}));
