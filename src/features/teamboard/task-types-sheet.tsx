// Task types (TaskTypesModal, dash.html:14182): the department's own task categories. Add and remove
// chips locally, then one Save → PUT /team-roster/task-types {departmentId, types} (the server keeps
// 40 at most, de-duplicated). Nothing is saved until Save, so a slip never half-commits.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { saveTaskTypes, tbKeys, type TrDept } from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Banner, Button, Chip, haptic, Sheet, Text, TextField, toast } from '@/ui';

export function TaskTypesSheet({ visible, onClose, dept }: { visible: boolean; onClose: () => void; dept: TrDept }) {
  // Keyed on open + department so the draft restarts from the saved list each time.
  return visible ? <TypesBody key={dept.id} onClose={onClose} dept={dept} /> : null;
}

function TypesBody({ onClose, dept }: { onClose: () => void; dept: TrDept }) {
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const [types, setTypes] = useState<string[]>(dept.taskTypes);
  const [input, setInput] = useState('');
  const dirty = types.join('\n') !== dept.taskTypes.join('\n');

  const save = useMutation({
    mutationFn: () => saveTaskTypes(dept.id, types),
    onSuccess: () => {
      haptic.success();
      toast.show('Task types saved', 'success');
      void qc.invalidateQueries({ queryKey: tbKeys.all(uid) });
      onClose();
    },
    onError: () => haptic.error(),
  });

  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (!types.some((t) => t.toLowerCase() === v.toLowerCase())) setTypes((l) => [...l, v]);
    setInput('');
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Task types"
      subtitle={dept.name}
      dirty={dirty && !save.isPending}
      footer={<Button title="Save" loading={save.isPending} disabled={!dirty || save.isPending} onPress={() => save.mutate()} />}>
      <Text variant="label" muted>
        Your own task categories, like Edit, Grade or Review. They show as a Type on tasks and as a filter.
      </Text>
      <View style={styles.addRow}>
        <View style={styles.flex}>
          <TextField
            value={input}
            onChangeText={setInput}
            placeholder="e.g. Colour grade"
            accessibilityLabel="New task type"
            returnKeyType="done"
            onSubmitEditing={add}
            maxLength={60}
          />
        </View>
        <Button title="Add" variant="ghost" size="md" icon={<Plus />} disabled={!input.trim()} onPress={add} />
      </View>
      {types.length ? (
        <View style={styles.chips}>
          {types.map((t) => (
            <Chip key={t} label={t} icon={<X />} onPress={() => setTypes((l) => l.filter((x) => x !== t))} />
          ))}
        </View>
      ) : (
        <Text variant="label" muted>
          No task types yet. Add one above.
        </Text>
      )}
      {types.length > 40 ? <Banner tone="warning" title="Only 40 are kept" message="The first 40 types are saved." /> : null}
      {save.error ? <Banner tone="danger" title="Couldn’t save" message={save.error.message} /> : null}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
}));
