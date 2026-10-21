// A department's people, grouped by who they report to — opened from My team's "My department" card
// (?id=<department id or legacy name>). Only for the roles the server gives everyone's department to
// (CEO / COO / Super Admin / HR, orgSeesAll); anyone else reaching it gets a plain note and the org
// chart, never a list the server meant to keep from them.
//
// Payno list (docs/REFERENCE-COMPONENTS.md): NavHeader with the department's name, a light
// SummaryHero (how many people, "See the org chart" chip), then one group per manager, highest in the
// chart first: "Reports to Lakshmi Prasad" over a frosted card of people (avatar, name, job title,
// chevron); the head of the company ("Leads the company") before everyone, people with no manager on
// file last. I am in my own department's list even though the console roles are not in the
// directory ("You"). A tap opens the person.

import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DirectoryPerson } from '@/api/people';
import { chainTo, type OrgNode } from '@/features/people/org-tree';
import { inDept, resolveDept, type TeamRow, useMyTeam } from '@/features/team/team';
import { TeamListRow } from '@/features/team/team-ui';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Button, EmptyState, ErrorState, NavHeader, Screen, SkeletonList, SummaryHero } from '@/ui';

const NO_MANAGER = '__none';
const HEADS = '__heads';

export default function DepartmentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const team = useMyTeam();
  const [refreshing, setRefreshing] = useState(false);
  const org = team.org;
  const tree = org.tree;
  const dept = resolveDept(id, team.deptList);
  const myId = team.me?.id ?? null;

  const openChart = () => router.push('/people/org');
  const open = (p: OrgNode) => {
    if (p.ghost) return;
    if (myId && String(p.id) === myId) router.push('/profile');
    else router.push(`/people/${encodeURIComponent(p.id)}`);
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      await team.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const header = <NavHeader title={dept?.name || 'Department'} />;

  if (!team.full) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={<Lock color={palette.textMuted} strokeWidth={1.8} />}
          title="Only HR and leadership see departments"
          message="The org chart shows who reports to whom."
          action={<Button title="See the org chart" variant="accent" size="md" onPress={openChart} />}
        />
      </Screen>
    );
  }

  // Everyone in the department; me too when my login is not on the directory (HR, Super Admin…).
  const members: OrgNode[] = dept ? team.roster.filter((u: DirectoryPerson) => inDept(u.dept, dept, team.deptList)) : [];
  const mineHere = !!dept && !!myId && (inDept(team.rec?.departmentId, dept, team.deptList) || inDept(team.rec?.dept, dept, team.deptList));
  if (mineHere && myId && !members.some((u) => String(u.id) === myId)) {
    members.push({
      id: myId,
      name: String(team.rec?.name || 'You'),
      role: team.rec?.role,
      jobTitle: typeof team.rec?.jobTitle === 'string' ? team.rec.jobTitle : undefined,
      reportingTo: team.me?.reportingTo,
      reportingManager: team.me?.reportingManager,
    });
  }

  // Who each one reports to, by the chart's rules (my own place comes from my record).
  const managerOf = (u: OrgNode): OrgNode | null => {
    const uid = String(u.id);
    if (myId && uid === myId && !team.place.onChart) return team.place.manager;
    if (tree.assumed?.has(uid)) return null;
    return tree.parent?.get(uid) ?? null;
  };
  // The head of the company (CEO / COO with no one above) leads the list; anyone else without a
  // manager on file comes last.
  const leads = (u: OrgNode) => ['ceo', 'coo'].includes(String(u.role || '').toLowerCase());
  const groups = new Map<string, { key: string; manager: OrgNode | null; people: OrgNode[] }>();
  for (const u of members) {
    const m = managerOf(u);
    const k = m ? String(m.id) : leads(u) ? HEADS : NO_MANAGER;
    const g = groups.get(k) ?? { key: k, manager: m, people: [] };
    g.people.push(u);
    groups.set(k, g);
  }
  const depth = (g: { key: string; manager: OrgNode | null }) =>
    g.key === HEADS ? 0 : !g.manager ? Number.MAX_SAFE_INTEGER : g.manager.ghost ? 1 : Math.max(1, chainTo(tree, g.manager.id).length);
  const ordered = [...groups.values()].sort(
    (a, b) => depth(a) - depth(b) || String(a.manager?.name || '').localeCompare(String(b.manager?.name || '')),
  );
  const rows: TeamRow[] = [];
  for (const g of ordered) {
    const people = g.people.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const who = g.manager ? (myId && String(g.manager.id) === myId ? 'you' : g.manager.name || 'their manager') : '';
    const title = g.key === HEADS ? `Leads the company (${people.length})` : g.manager ? `Reports to ${who} (${people.length})` : `No manager on file (${people.length})`;
    rows.push({ kind: 'label', key: `g-${g.key}`, title, first: rows.length === 0 });
    people.forEach((p, i) =>
      rows.push({ kind: 'person', key: `p-${p.id}`, person: p, first: i === 0, last: i === people.length - 1, note: myId && String(p.id) === myId ? 'You' : null }),
    );
  }

  return (
    <Screen scroll={false} header={header}>
      {org.isPending || (!team.deptList && !dept) ? (
        <SkeletonList rows={6} avatar tone="surface" />
      ) : org.isError && !org.data ? (
        <ErrorState message={org.error?.message ?? 'The directory could not be loaded.'} onRetry={() => void org.refetch()} />
      ) : !dept ? (
        <EmptyState
          icon={<Building2 color={palette.textMuted} strokeWidth={1.8} />}
          title="Department not found"
          message="It may have been renamed or removed on the DASH website."
          action={<Button title="Back to My team" variant="accent" size="md" onPress={() => router.replace('/team')} />}
        />
      ) : (
        <View style={styles.fill}>
          <FlashList
            data={rows}
            keyExtractor={(r) => r.key}
            getItemType={(r) => r.kind}
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
            ListHeaderComponent={
              <View style={styles.head}>
                <SummaryHero
                  icon={Building2}
                  module="people"
                  label="In this department"
                  value={members.length}
                  unit={members.length === 1 ? 'person' : 'people'}
                  info={{ label: 'See the org chart', onPress: openChart, accessibilityLabel: 'See the org chart: who reports to whom' }}
                />
              </View>
            }
            ListEmptyComponent={
              <EmptyState icon={<Building2 color={palette.textMuted} strokeWidth={1.8} />} title="No one here yet" message="People show up here once HR adds them to this department." />
            }
            renderItem={({ item }) => <TeamListRow row={item} full={team.full} onOpen={open} />}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  fill: { flex: 1 },
  head: { paddingBottom: space.lg },
}));
