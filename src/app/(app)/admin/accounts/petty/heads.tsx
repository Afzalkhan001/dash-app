// Petty cash expense types — the website's PettyCashDepartmentsCard (dash.html:17750), for the petty cash
// admin roles (accounts, super admin, CEO, COO): add one, switch one on or off (people only pick the ones
// that are on), and delete one. Delete is a hard delete the server refuses while the type is in use, so it
// asks first; switching off is the usual way.

import { useMutation } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { Plus, Shapes, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { addExpenseHead, deleteExpenseHead, setExpenseHeadActive, useAllExpenseHeads } from '@/api/accounts';
import { unwrap } from '@/api/client';
import type { ExpenseHead } from '@/api/petty-cash';
import { canSeePettyAdmin } from '@/features/accounts/access';
import { ToggleRow } from '@/features/accounts/ui';
import { useInvalidateAccounts } from '@/features/accounts/use-items';
import { headIcon } from '@/features/petty-cash/type-tiles';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Button, ConfirmSheet, ErrorState, IconButton, ListCard, ModuleBadge, NavHeader, Screen, SectionLabel, SkeletonList, SummaryCard, SummaryHero, TextField, toast } from '@/ui';

const msg = (e: unknown, f: string) => (e instanceof Error && e.message) || f;

export default function ExpenseTypesScreen() {
  const access = useAccess();
  const allowed = canSeePettyAdmin(access);
  const q = useAllExpenseHeads(allowed);
  const invalidate = useInvalidateAccounts();
  const [name, setName] = useState('');
  const [doomed, setDoomed] = useState<ExpenseHead | null>(null);

  const refresh = () => Promise.all([q.refetch(), invalidate()]);
  const add = useMutation({
    mutationFn: (n: string) => unwrap(addExpenseHead(n)),
    onSuccess: () => {
      setName('');
      toast.show('Expense type added');
    },
    onError: (e) => toast.show(msg(e, 'Couldn’t add it.'), 'danger'),
    onSettled: () => void refresh(),
  });
  const toggle = useMutation({
    mutationFn: (h: { id: string; active: boolean }) => unwrap(setExpenseHeadActive(h.id, h.active)),
    onError: (e) => toast.show(msg(e, 'Couldn’t change it.'), 'danger'),
    onSettled: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(deleteExpenseHead(id)),
    onSuccess: () => {
      setDoomed(null);
      toast.show('Expense type deleted');
    },
    onError: (e) => {
      setDoomed(null);
      toast.show(msg(e, 'Couldn’t delete it.'), 'danger');
    },
    onSettled: () => void refresh(),
  });

  if (!allowed) return <Redirect href="/" />;
  const heads = [...(q.data ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const on = heads.filter((h) => h.active !== false).length;

  return (
    <Screen header={<NavHeader title="Expense types" />} onRefresh={() => refresh()}>
      <SummaryHero icon={Shapes} module="pettyCash" label="Expense types people can pick" value={q.data ? on : undefined} unit={on === 1 ? 'type' : 'types'} info={q.data ? { label: 'Switched off', value: String(heads.length - on) } : undefined} />

      <View style={styles.add}>
        <TextField label="New expense type" value={name} onChangeText={setName} placeholder="e.g. Courier" maxLength={80} returnKeyType="done" onSubmitEditing={() => name.trim() && add.mutate(name.trim())} />
        <Button title="Add" icon={<Plus />} variant="accent" loading={add.isPending} disabled={!name.trim()} onPress={() => add.mutate(name.trim())} />
      </View>

      {q.isPending ? (
        <SkeletonList rows={5} avatar />
      ) : q.isError && !q.data ? (
        <ErrorState message={q.error?.message || 'Couldn’t load the expense types.'} onRetry={() => void q.refetch()} />
      ) : (
        <View style={styles.block}>
          <SectionLabel title={plural(heads.length, 'expense type')} />
          <ListCard>
            {heads.map((h) => (
              <View key={h.id} style={styles.row}>
                <View style={styles.flex}>
                  <ToggleRow
                    label={h.name}
                    sub={h.active === false ? 'Off — nobody can pick it' : 'On'}
                    value={h.active !== false}
                    disabled={toggle.isPending}
                    left={<ModuleBadge module="pettyCash" icon={headIcon(h.name)} />}
                    onChange={(v) => toggle.mutate({ id: h.id, active: v })}
                  />
                </View>
                <IconButton accessibilityLabel={`Delete ${h.name}`} onPress={() => setDoomed(h)}>
                  <Trash2 size={18} color={palette.dangerInk} />
                </IconButton>
              </View>
            ))}
          </ListCard>
        </View>
      )}

      <ConfirmSheet
        visible={!!doomed}
        onClose={() => setDoomed(null)}
        title="Delete this expense type?"
        confirmLabel="Swipe to delete"
        onConfirm={() => doomed && remove.mutate(doomed.id)}
        loading={remove.isPending}
        note="It is gone for good. If people have used it, it can’t be deleted — switch it off instead.">
        {doomed ? <SummaryCard rows={[{ key: 'n', label: 'Expense type', value: doomed.name }]} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  add: { gap: space.sm },
  block: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, paddingRight: space.xs },
  flex: { flex: 1, minWidth: 0 },
}));
