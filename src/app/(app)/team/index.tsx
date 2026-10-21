// My team — the owner's reference is Keka's "My Team" tab, built from the Payno × Lendora kit
// (docs/REFERENCE-COMPONENTS.md). Pushed from More ("My team") and from My profile. Top to bottom:
//   NavHeader "My team";
//   my avatar (→ My profile) beside "Search your colleagues": typing searches the whole directory
//   (same rules and fields as People) and lists the results here; a tap opens the person;
//   with nothing typed —
//     "My department": a frosted card, "Human Resources • 4 people" + "Check what is going on with
//       your teammates" › the department page (HR / leadership), or "Creative • 7 in your team" › the
//       org chart on my manager for everyone else (the server hides other people's departments);
//     "Off this week": teammates on leave Monday–Sunday as AvatarTiles with their days, or "Everyone
//       is working this week!" — "View upcoming leaves" opens the next 30 days after this week;
//     "My teammates": chips All (n) · Manager · Peers (n) · Direct reports (n) (only the groups there
//       are), then the groups as frosted lists: Manager, Peers (n), Direct reports (n);
//     "Company": Whole company (the People directory) and Org chart.
// One FlashList with typed rows (the hierarchy in its header), pull to refresh, skeleton while the
// directory loads, ErrorState when it can't, EmptyState for a search with no match.
// Data and privacy rules: features/team/team.ts.

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Search, Users } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deptName } from '@/api/people';
import { bloodCode, personTitle, searchDirectory } from '@/features/people/directory';
import type { OrgNode } from '@/features/people/org-tree';
import { type TeamDept, type TeamFilter, type TeamRow, teammateRows, useMyTeam } from '@/features/team/team';
import {
  CompanyLinks,
  DepartmentCard,
  OffThisWeek,
  TeamFilterChips,
  teamGroups,
  TeamListRow,
  TeamSearchBar,
  TeamSkeleton,
  UpcomingSheet,
} from '@/features/team/team-ui';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Button, Card, EmptyState, ErrorState, NavHeader, Screen, SectionHeader, Text, useLayout } from '@/ui';

const shortQuery = (q: string) => (q.length > 18 ? `${q.slice(0, 17).trimEnd()}…` : q);

export default function MyTeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const team = useMyTeam();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<TeamFilter>('all');
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const myId = team.me?.id ?? null;
  const avatar = team.rec?.avatar;
  const photo = typeof avatar === 'string' && avatar ? avatar : null;
  const org = team.org;
  const searching = !!q.trim();
  const groups = teamGroups(team.place);
  // A chip whose group has gone (a refresh moved someone) falls back to All.
  const shown: TeamFilter = filter !== 'all' && !groups.includes(filter) ? 'all' : filter;

  const results = searching ? searchDirectory(team.roster, q, '', team.full, team.deptList) : [];
  const rows: TeamRow[] = searching
    ? results.map((p, i) => ({
        kind: 'person',
        key: `r-${p.id}`,
        person: p,
        first: i === 0,
        last: i === results.length - 1,
        note: myId && String(p.id) === myId ? 'You' : null,
      }))
    : team.teamOn
      ? teammateRows(team.place, shown, team.noManager)
      : [];

  const open = (p: OrgNode) => {
    if (p.ghost) return;
    if (myId && String(p.id) === myId) router.push('/profile');
    else router.push(`/people/${encodeURIComponent(p.id)}`);
  };
  const openDept = (d: TeamDept) => router.push(d.href);
  const openDirectory = () => router.push('/people');
  const openChart = () => router.push('/people/org');

  const refresh = async () => {
    setRefreshing(true);
    try {
      await team.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  // Search results: job title, plus the department for the roles that may see it.
  const resultSubtitle = (p: OrgNode) => [personTitle(p), team.full ? deptName(p.dept, team.deptList) : ''].filter(Boolean).join(' · ') || null;
  const bq = bloodCode(q);
  const found = `${plural(results.length, 'person', 'people')} found${bq ? ` with blood group ${bq}` : ''}`;
  const hasTeammates = rows.length > 0;

  const header = searching ? (
    <View style={styles.head}>{results.length ? <SectionHeader title={found} /> : null}</View>
  ) : (
    <View style={styles.head}>
      {team.teamOn ? null : (
        <Card tone="frost">
          <Text variant="label" muted numberOfLines={3}>
            This login is not part of a team. Search for anyone above, or open the whole company below.
          </Text>
        </Card>
      )}
      <DepartmentCard depts={team.depts} onOpen={openDept} />
      {team.leave.show ? <OffThisWeek data={team.leave} onOpenPerson={open} onUpcoming={() => setUpcomingOpen(true)} /> : null}
      {hasTeammates ? (
        <View style={styles.section}>
          <SectionHeader title="My teammates" />
          <TeamFilterChips place={team.place} value={shown} onChange={setFilter} />
        </View>
      ) : null}
    </View>
  );

  const footer = searching ? null : (
    <View style={styles.footer}>
      <CompanyLinks total={Array.isArray(org.roster) ? org.roster.length : 0} onDirectory={openDirectory} onChart={openChart} />
    </View>
  );

  return (
    <>
      <Screen scroll={false} header={<NavHeader title="My team" />}>
        <View style={styles.tools}>
          <TeamSearchBar name={team.rec?.name ?? undefined} photo={photo} value={q} onChangeText={setQ} onAvatar={() => router.push('/profile')} />
        </View>

        {/* isPending also covers restoring the saved cache on a cold start. */}
        {org.isPending ? (
          <TeamSkeleton />
        ) : org.isError && !org.data ? (
          <ErrorState message={org.error?.message ?? 'Your team could not be loaded.'} onRetry={() => void org.refetch()} />
        ) : (
          // The list spans the whole width and pads itself, so the tiles and chips that bleed to the
          // screen edges (AvatarTiles, ChipRow) stay inside the list instead of being clipped by it.
          <View style={[styles.fill, { marginHorizontal: -gutter }]}>
            <FlashList
              data={rows}
              keyExtractor={(r) => r.key}
              getItemType={(r) => r.kind}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.xl + insets.bottom }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={palette.primaryText}
                  colors={[palette.primaryText]}
                  progressBackgroundColor={palette.surface}
                />
              }
              ListHeaderComponent={header}
              ListFooterComponent={footer}
              ListEmptyComponent={
                searching ? (
                  <EmptyState
                    icon={<Search color={palette.textMuted} strokeWidth={1.8} />}
                    title={`No one matches “${shortQuery(q.trim())}”`}
                    message="Check the spelling, or try a job title."
                    action={<Button title="Clear search" variant="accent" size="md" onPress={() => setQ('')} />}
                  />
                ) : team.teamOn && !team.depts.length && !team.leave.show ? (
                  <EmptyState
                    icon={<Users color={palette.textMuted} strokeWidth={1.8} />}
                    title="No teammates yet"
                    message="Your manager and teammates show here once HR sets who you report to."
                  />
                ) : null
              }
              renderItem={({ item }) => (
                <TeamListRow row={item} full={team.full} subtitle={searching && item.kind === 'person' ? resultSubtitle(item.person) : undefined} onOpen={open} />
              )}
            />
          </View>
        )}
      </Screen>
      <UpcomingSheet visible={upcomingOpen} onClose={() => setUpcomingOpen(false)} items={team.leave.upcoming} onOpenPerson={open} />
    </>
  );
}

const styles = themedStyles(() => ({
  fill: { flex: 1 },
  tools: { paddingBottom: space.md },
  head: { gap: space.lg, paddingBottom: space.sm },
  section: { gap: space.xs },
  footer: { paddingTop: space.xl },
}));
