// People — the Employee Directory (web: OrgDirectoryView, dash.html ~L9658), read from
// GET /org/directory like the web. Payno list (docs/REFERENCE-COMPONENTS.md §3):
//   NavHeader "People";
//   a search PillField (over the fields this viewer may see; a blood group like "B+" searches only
//   blood groups), then — for the roles that can see departments — a PillSelector "All teams ⌄" that
//   opens a sheet of departments;
//   while nothing is searched or filtered: a light SummaryHero — how many people are in the directory
//   as the big figure (and, for HR / leadership, how many have not signed up yet), with the org chart
//   as its info chip ("See the org chart ›") — then "Your team" as AvatarTiles (my
//   manager, then the people who report to me — or, with no one under me, the people beside me);
//   then everyone (or what matched, with the count) as ActivityRows in one frosted card (FlashList rows
//   drawn as one card by GroupedRow). A tap opens the person's profile.

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Check, Search, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type DirectoryPerson, deptName, useDepartments } from '@/api/people';
import { useSession } from '@/auth/session';
import { bloodCode, departmentOptions, personTitle, searchDirectory, useOrgTree } from '@/features/people/directory';
import type { OrgNode, OrgTree } from '@/features/people/org-tree';
import { PersonRow } from '@/features/people/person-ui';
import { usePeoplePhotos } from '@/features/people/photos';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  AvatarTiles,
  Button,
  EmptyState,
  ErrorState,
  GroupedRow,
  hitSlopFor,
  ListCard,
  ListRow,
  NavHeader,
  PillField,
  PillSelector,
  Screen,
  SectionHeader,
  Sheet,
  SkeletonList,
  SummaryHero,
} from '@/ui';

const shortQuery = (q: string) => (q.length > 18 ? `${q.slice(0, 17).trimEnd()}…` : q);
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const MAX_TEAM = 12;

type TeamTile = { person: OrgNode; sub: string };

/** My manager first, then the people who report to me — or, with no one under me, my peers. */
function myTeam(tree: OrgTree, me: string | null | undefined): TeamTile[] {
  if (!me || !tree.byId.has(me)) return [];
  const kids = (id: string) => {
    const k = tree.kids.get(id);
    return Array.isArray(k) ? k.filter(Boolean) : [];
  };
  // The chart parent of an "assumed" branch is only where the chart hung it, not a manager on file.
  const manager = tree.assumed.has(me) ? undefined : tree.parent.get(me);
  const reports = kids(me);
  const around = reports.length ? reports : manager ? kids(manager.id).filter((p) => p.id !== me) : [];
  return [
    ...(manager ? [{ person: manager, sub: 'Manager' }] : []),
    ...around.map((p) => ({ person: p, sub: personTitle(p) })),
  ].slice(0, MAX_TEAM);
}

/** The department picker: "All teams" and each department, the current one ticked. */
function TeamSheet({
  visible,
  onClose,
  options,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const pick = (id: string) => {
    onChange(id);
    onClose();
  };
  const tick = <Check size={20} color={palette.primaryText} strokeWidth={2} />;
  return (
    <Sheet visible={visible} onClose={onClose} title="Show a team" subtitle="Only people in that department are listed.">
      <ListCard>
        <ListRow title="All teams" right={!value ? tick : undefined} onPress={() => pick('')} accessibilityHint={!value ? 'Selected' : undefined} />
        {options.map((d) => (
          <ListRow
            key={d.id}
            title={d.name}
            numberOfLines={2}
            right={value === d.id ? tick : undefined}
            onPress={() => pick(d.id)}
            accessibilityHint={value === d.id ? 'Selected' : undefined}
          />
        ))}
      </ListCard>
    </Sheet>
  );
}

export default function PeopleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.user?.id);
  const dir = useOrgTree();
  const departments = useDepartments(dir.full);
  const deptList = Array.isArray(departments.data) ? departments.data : undefined;
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const roster = Array.isArray(dir.roster) ? dir.roster : [];
  const list = searchDirectory(roster, q, dept, dir.full, deptList);
  const depts = dir.full ? departmentOptions(roster, deptList) : [];
  const bq = bloodCode(q);
  const filtering = !!q.trim() || !!dept;
  const team = filtering ? [] : myTeam(dir.tree, me);
  const photoOf = usePeoplePhotos(team.map((t) => t.person));

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([dir.refetch(), dir.full ? departments.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  };

  const clearFilters = () => {
    setQ('');
    setDept('');
  };

  const open = (p: DirectoryPerson) => {
    if (p.id === me) router.push('/profile');
    else router.push(`/people/${encodeURIComponent(p.id)}`);
  };
  const openChart = () => router.push('/people/org');

  // Role · team. The team (department) is only on the rows of viewers who may see it.
  const subtitleFor = (p: DirectoryPerson) => [personTitle(p), dir.full ? deptName(p.dept, deptList) : ''].filter(Boolean).join(' · ') || null;

  const deptLabel = dept ? depts.find((d) => d.id === dept)?.name || deptName(dept, deptList) || 'Team' : 'All teams';
  const found = `${people(list.length)} found${bq ? ` with blood group ${bq}` : ''}`;
  const showChart = !filtering && list.length > 0;
  const showCount = !!dir.data && roster.length > 0;
  // Only HR / leadership see who hasn't signed up (the rows say it too), so only they get the count.
  const notSignedUp = dir.full && Array.isArray(dir.pending) ? dir.pending.length : 0;

  const listHead =
    showChart || showCount ? (
      <View style={styles.listHead}>
        {showChart ? (
          <SummaryHero
            icon={Users}
            module="people"
            label="In the directory"
            value={roster.length}
            unit={roster.length === 1 ? 'person' : 'people'}
            // One short line, so the chip stays on one line on a 320 dp phone.
            info={{ label: 'See the org chart', onPress: openChart, accessibilityLabel: 'See the org chart: who reports to whom' }}
            sub={notSignedUp ? `${notSignedUp} not signed up yet` : undefined}
          />
        ) : null}
        {showChart && team.length ? (
          <View style={styles.section}>
            <SectionHeader title="Your team" />
            <AvatarTiles
              accessibilityLabel="Your team"
              items={team.map(({ person: p, sub }) => ({
                key: p.id,
                name: p.name || 'Unnamed',
                uri: photoOf(p),
                sub: sub || null,
                onPress: p.ghost ? undefined : () => open(p),
                hint: p.ghost ? undefined : 'Opens their profile',
              }))}
            />
          </View>
        ) : null}
        {/* The hero already gives the count; the header gives it only for what a search found. */}
        {showCount ? <SectionHeader title={filtering ? found : 'Everyone'} /> : null}
      </View>
    ) : null;

  return (
    <>
      <Screen scroll={false} header={<NavHeader title="People" />}>
        <View style={styles.tools}>
          <PillField
            icon={Search}
            value={q}
            onChangeText={setQ}
            placeholder="Search by name or job title"
            accessibilityLabel="Search people"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            trailing={
              q ? (
                <Pressable onPress={() => setQ('')} hitSlop={hitSlopFor(32)} style={styles.clear} accessibilityRole="button" accessibilityLabel="Clear search">
                  <X size={18} color={palette.textMuted} />
                </Pressable>
              ) : null
            }
          />
          {depts.length > 1 ? (
            <View style={styles.filters}>
              <PillSelector icon={Users} label={deptLabel} onPress={() => setTeamsOpen(true)} accessibilityLabel={`Team: ${deptLabel}`} accessibilityHint="Choose a department" />
              {dept ? <Button title="Show everyone" variant="text" size="sm" onPress={() => setDept('')} /> : null}
            </View>
          ) : null}
        </View>

        {/* isPending also covers restoring the saved cache on a cold start (no "No one here yet" flash). */}
        {dir.isPending ? (
          <SkeletonList rows={7} avatar tone="surface" />
        ) : dir.isError && !dir.data ? (
          <ErrorState message={dir.error?.message ?? 'The directory could not be loaded.'} onRetry={() => void dir.refetch()} />
        ) : (
          <View style={styles.fill}>
            <FlashList
              data={list}
              keyExtractor={(p) => String(p.id)}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: space.xl + insets.bottom }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={palette.primaryText}
                  colors={[palette.primaryText]}
                  progressBackgroundColor={palette.surface}
                />
              }
              ListHeaderComponent={listHead}
              ListEmptyComponent={
                roster.length ? (
                  <EmptyState
                    icon={<Search color={palette.textMuted} strokeWidth={1.8} />}
                    title={q.trim() ? `No one matches “${shortQuery(q.trim())}”` : 'No one in this department'}
                    message={q.trim() ? 'Check the spelling, or try a job title.' : undefined}
                    action={<Button title={q.trim() ? 'Clear search' : 'Show everyone'} variant="accent" size="md" onPress={clearFilters} />}
                  />
                ) : (
                  <EmptyState
                    icon={<Users color={palette.textMuted} strokeWidth={1.8} />}
                    title="No one here yet"
                    message="People show up here once HR adds them."
                  />
                )
              }
              renderItem={({ item, index }) => (
                // The blood group shows only while searching for one, as a pill on the right.
                <GroupedRow tone="surface" hairline first={index === 0} last={index === list.length - 1}>
                  <PersonRow
                    person={item}
                    title={item.name || 'Unnamed'}
                    subtitle={subtitleFor(item)}
                    meta={item.pending && dir.full ? 'Not signed up yet' : null}
                    blood={bq ? bloodCode(item.bloodGroup) || undefined : undefined}
                    onPress={() => open(item)}
                  />
                </GroupedRow>
              )}
            />
          </View>
        )}
      </Screen>
      <TeamSheet visible={teamsOpen} onClose={() => setTeamsOpen(false)} options={depts} value={dept} onChange={setDept} />
    </>
  );
}

const styles = themedStyles(() => ({
  fill: { flex: 1 },
  tools: { gap: space.sm, paddingBottom: space.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  listHead: { gap: space.md, paddingBottom: space.xs },
  section: { gap: space.xxs },
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
}));
