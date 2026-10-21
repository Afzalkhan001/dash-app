// Team board › People (TeamRosterPeopleSection, dash.html:14721): everyone on the department's active
// teams, once each, with their open tasks, the estimate of that open work, hours logged and how many
// are overdue. Read only.

import { UsersRound } from 'lucide-react-native';
import { View } from 'react-native';

import { useTrPeople } from '@/api/teamboard';
import type { Board } from '@/features/teamboard/gate';
import { plainCount } from '@/features/teamboard/model';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Avatar, EmptyState, ErrorState, ListCard, ListRow, Skeleton, StatusPill, Text } from '@/ui';

const h = (n: number) => `${Math.round(n * 100) / 100}h`;

export function PeopleTab({ board }: { board: Board }) {
  const q = useTrPeople(board.dept.id);
  const people = q.data ?? [];
  if (q.isPending && !q.data) return <Skeleton height={260} radius={radius.xl} />;
  if (q.isError && !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />;
  if (!people.length) {
    return <EmptyState icon={<UsersRound color={palette.textMuted} />} title="No team members yet" message="Add people to a team from Projects › Teams." />;
  }
  return (
    <View style={styles.gap}>
      <Text variant="label" muted>
        Workload in {board.dept.name}
      </Text>
      <ListCard>
        {people.map((p) => (
          <ListRow
            key={p.id}
            left={<Avatar name={p.name} size={40} ring={false} />}
            title={p.name}
            subtitle={p.teams.join(', ') || null}
            subtitleLines={2}
            value={`${plainCount(p.activeTasks, 'open task')}`}
            valueMeta={`${h(p.estimatedHours)} planned · ${h(p.loggedHours)} logged`}
            below={p.overdue ? <StatusPill label={`${p.overdue} overdue`} tone="failed" /> : undefined}
            stackRight
            accessibilityLabel={[
              p.name,
              p.teams.length ? `on ${p.teams.join(', ')}` : '',
              plainCount(p.activeTasks, 'open task'),
              `${h(p.estimatedHours)} planned`,
              `${h(p.loggedHours)} logged`,
              p.overdue ? `${p.overdue} overdue` : 'nothing overdue',
            ]
              .filter(Boolean)
              .join(', ')}
          />
        ))}
      </ListCard>
    </View>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: space.sm },
}));
