// The department's teams (web: TeamRosterTeamsSection 13719, opened from Projects › "Manage Teams" —
// a screen of its own on the phone). Two figures, "New team", and a row per team: lead, people,
// Active / Archived. Tap a team to manage its people.

import { useRouter } from 'expo-router';
import { Plus, UsersRound } from 'lucide-react-native';
import { View } from 'react-native';

import { useTrTeams } from '@/api/teamboard';
import { type Board, BoardGate } from '@/features/teamboard/gate';
import { teamFormHref, teamHref } from '@/features/teamboard/links';
import { plainCount } from '@/features/teamboard/model';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Button, EmptyState, ErrorState, ListCard, ListRow, NavHeader, Screen, Skeleton, StatGrid, StatTile, StatusPill } from '@/ui';

export default function TeamsRoute() {
  return <BoardGate title="Teams">{(b) => <Teams board={b} />}</BoardGate>;
}

function Teams({ board }: { board: Board }) {
  const router = useRouter();
  const dept = board.dept;
  const q = useTrTeams(dept.id);
  const teams = q.data ?? [];
  const members = teams.reduce((s, t) => s + t.member_count, 0);

  return (
    <Screen
      header={
        <NavHeader
          title="Teams"
          subtitle={dept.name}
          actions={[
            {
              icon: Plus,
              label: 'New team',
              onPress: () => router.push(teamFormHref(dept.id)),
            },
          ]}
        />
      }
      onRefresh={() => q.refetch()}>
      {q.isPending && !q.data ? (
        <Skeleton height={240} radius={radius.xl} />
      ) : q.isError && !q.data ? (
        <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
      ) : (
        <View style={styles.gap}>
          <StatGrid columns={2}>
            <StatTile variant="light" label="Teams" value={teams.length} module="tasks" />
            <StatTile variant="light" label="People across teams" value={members} module="tasks" />
          </StatGrid>
          {teams.length ? (
            <ListCard>
              {teams.map((t) => (
                <ListRow
                  key={t.id}
                  left={<UsersRound size={20} color={palette.textMuted} />}
                  title={t.name}
                  subtitle={t.description || null}
                  meta={t.lead_name ? `Lead ${t.lead_name}` : 'No lead'}
                  value={plainCount(t.member_count, 'person', 'people')}
                  below={<StatusPill label={t.status === 'active' ? 'Active' : 'Archived'} tone={t.status === 'active' ? 'done' : 'neutral'} />}
                  chevron
                  onPress={() => router.push(teamHref(dept.id, t.id))}
                  accessibilityHint="Opens the team"
                />
              ))}
            </ListCard>
          ) : (
            <EmptyState
              icon={<UsersRound color={palette.textMuted} />}
              title="No teams yet"
              message="Create one to start putting people on projects."
              action={<Button title="New team" variant="accent" size="md" onPress={() => router.push(teamFormHref(dept.id))} />}
            />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: space.md },
}));
