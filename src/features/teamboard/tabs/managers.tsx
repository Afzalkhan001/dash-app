// Team board › Managers (TeamRosterManagersSection, dash.html:13627) — the department admin only (a
// granted manager never sees this tab, 13583). Two figures, the granted managers, "Add managers"
// (several people from the department at once → POST /team-roster/managers) and Remove access
// (ConfirmSheet + swipe → DELETE; their teams, projects and tasks stay). No one is messaged.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldMinus, UserRoundPlus, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { addManagers, removeManager, tbKeys, type TrManager, useTrManagers } from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import type { Board } from '@/features/teamboard/gate';
import { MultiPersonSheet } from '@/features/teamboard/pickers';
import { useDeptMembers } from '@/features/teamboard/use-board';
import { dateLabel } from '@/lib/dates';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  Avatar,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  haptic,
  IconButton,
  ListCard,
  ListRow,
  Skeleton,
  StatGrid,
  StatTile,
  SummaryCard,
  toast,
} from '@/ui';

export function ManagersTab({ board }: { board: Board }) {
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const me = useSession((s) => s.user);
  const today = useTodayIst();
  const dept = board.dept;
  const q = useTrManagers(dept.id);
  const members = useDeptMembers(dept);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<TrManager | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const managers = q.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: tbKeys.all(uid) });
  const add = useMutation({
    mutationFn: (ids: string[]) => addManagers(dept.id, ids),
    onSuccess: (_r, ids) => {
      haptic.success();
      setAddOpen(false);
      toast.show(ids.length === 1 ? 'Manager added' : `${ids.length} managers added`, 'success');
      void refresh();
    },
    onError: () => haptic.error(),
  });
  const remove = useMutation({
    mutationFn: (m: TrManager) => removeManager(m.id),
    onSuccess: () => {
      haptic.success();
      setRemoveOpen(false);
      toast.show('Access removed', 'success');
      void refresh();
    },
    onError: () => haptic.error(),
  });

  if (q.isPending && !q.data) return <Skeleton height={220} radius={radius.xl} />;
  if (q.isError && !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />;

  return (
    <View style={styles.gap}>
      <StatGrid columns={2}>
        <StatTile variant="light" label="People in department" value={members.loading ? '—' : members.members.length} module="tasks" />
        <StatTile variant="light" label="Board managers" value={managers.length} module="tasks" />
      </StatGrid>

      <Button
        title="Add managers"
        variant="accent"
        size="md"
        icon={<UserRoundPlus />}
        onPress={() => {
          add.reset();
          setAddOpen(true);
        }}
        style={styles.self}
      />

      {managers.length ? (
        <ListCard title="Current managers">
          {managers.map((m) => (
            <ListRow
              key={m.id}
              left={<Avatar name={m.employee_name || '?'} size={40} ring={false} />}
              title={m.employee_name || m.employee_id}
              subtitle={
                [m.granted_by_name ? `Added by ${m.granted_by_name}` : '', m.created_at ? `since ${dateLabel(m.created_at, today)}` : '']
                  .filter(Boolean)
                  .join(' · ') || null
              }
              subtitleLines={2}
              right={
                <IconButton
                  accessibilityLabel={`Remove ${m.employee_name || 'this person'} as a manager`}
                  onPress={() => {
                    remove.reset();
                    setRemoving(m);
                    setRemoveOpen(true);
                  }}>
                  <ShieldMinus size={18} color={palette.dangerInk} />
                </IconButton>
              }
            />
          ))}
        </ListCard>
      ) : (
        <EmptyState
          icon={<UsersRound color={palette.textMuted} />}
          title="No board managers yet"
          message="Add one to let them create teams, projects and tasks in this department."
        />
      )}

      <MultiPersonSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add managers"
        subtitle={dept.name}
        people={members.members}
        exclude={new Set(managers.map((m) => m.employee_id))}
        busy={add.isPending}
        error={add.error?.message}
        onConfirm={(picked) => add.mutate(picked.map((p) => p.id))}
      />

      {removing ? (
        <ConfirmSheet
          visible={removeOpen}
          onClose={() => setRemoveOpen(false)}
          title="Remove manager access?"
          from={{
            title: 'You',
            subtitle: 'Department admin',
            avatar: { name: me?.name || 'You' },
          }}
          to={{
            title: removing.employee_name || 'This person',
            subtitle: 'Loses access',
            avatar: { name: removing.employee_name || '?' },
          }}
          detailsTitle="Details"
          confirmLabel="Swipe to remove access"
          onConfirm={() => remove.mutate(removing)}
          loading={remove.isPending}
          note="Their teams, projects and tasks stay. You can add them again later. No one is messaged.">
          <SummaryCard
            rows={[
              { key: 'dept', label: 'Department', value: dept.name },
              {
                key: 'by',
                label: 'Added by',
                value: removing.granted_by_name || '—',
              },
            ]}
          />
          {remove.error ? <Banner tone="danger" title="Couldn’t remove access" message={remove.error.message} /> : null}
        </ConfirmSheet>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: space.md },
  self: { alignSelf: 'flex-start' },
}));
