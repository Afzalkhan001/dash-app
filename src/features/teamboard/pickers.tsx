// Two small sheets and one form control the Team board reuses:
//   FormChoice      a Segmented inside a form card, or wrapped chips when the track would cut a label
//                   ("Medi…" at 320 dp) or would scroll options out of the card (Status).
//   ChoiceSheet     one choice from a list (department, project, type, priority, status filters) — a
//                   ListCard of rows with a tick on the current one; any length (a MenuSheet caps at 7).
//   MultiPersonSheet  several people from the department (Add managers, a new team's members): search,
//                   picked people as removable chips, "Add N" at the bottom (the website's multi-select
//                   type-ahead, 13691).

import { Check, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { PickPerson } from '@/features/shared/person-picker';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Avatar, Banner, Button, Chip, ChipRow, EmptyState, ListCard, ListRow, type Segment, Segmented, Sheet, Text, TextField, useLayout } from '@/ui';

/**
 * One choice in a form card (priority, status). The kit's Segmented only turns into chips for more than
 * four options or a long label, and then as a sideways-scrolling row that a card clips; a form shows
 * every option, so on a compact phone (or with a long label) the options wrap as chips instead.
 */
export function FormChoice<K extends string>({ options, value, onChange }: { options: Segment<K>[]; value: K; onChange: (k: K) => void }) {
  const l = useLayout();
  const fits = !l.compact && options.length <= 4 && options.every((o) => o.label.length <= 10);
  if (fits) return <Segmented options={options} value={value} onChange={onChange} />;
  return (
    <ChipRow bleed="none" wrap>
      {options.map((o) => (
        <Chip key={o.key} label={o.label} selected={o.key === value} onPress={() => o.key !== value && onChange(o.key)} />
      ))}
    </ChipRow>
  );
}

export type Choice<V extends string> = {
  value: V;
  label: string;
  sub?: string;
};

export function ChoiceSheet<V extends string>({
  visible,
  onClose,
  title,
  subtitle,
  value,
  choices,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  value: V | null;
  choices: Choice<V>[];
  onPick: (v: V) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <ListCard>
        {choices.map((c) => {
          const on = c.value === value;
          return (
            <ListRow
              key={c.value || 'all'}
              title={c.label}
              subtitle={c.sub}
              right={on ? <Check size={18} color={palette.primaryText} /> : undefined}
              onPress={() => {
                onPick(c.value);
                onClose();
              }}
              accessibilityLabel={`${c.label}${c.sub ? `, ${c.sub}` : ''}${on ? ', chosen' : ''}`}
            />
          );
        })}
      </ListCard>
    </Sheet>
  );
}

export function MultiPersonSheet({
  visible,
  onClose,
  title,
  subtitle,
  people,
  exclude,
  confirmVerb = 'Add',
  busy,
  error,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  people: PickPerson[];
  /** Already chosen elsewhere (current managers, current members): not offered. */
  exclude: Set<string>;
  confirmVerb?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (ids: PickPerson[]) => void;
}) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PickPerson[]>([]);
  const needle = q.trim().toLowerCase();
  const pool = people.filter((p) => !exclude.has(p.id) && !picked.some((s) => s.id === p.id));
  const shown = needle ? pool.filter((p) => p.name.toLowerCase().includes(needle)) : pool;
  const close = () => {
    setQ('');
    setPicked([]);
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={title}
      subtitle={subtitle}
      dirty={picked.length > 0 && !busy}
      footer={
        <Button
          title={picked.length ? `${confirmVerb} ${picked.length === 1 ? picked[0]!.name : `${picked.length} people`}` : 'Pick someone first'}
          disabled={!picked.length || busy}
          loading={busy}
          onPress={() => onConfirm(picked)}
        />
      }>
      <TextField
        value={q}
        onChangeText={setQ}
        placeholder="Search by name"
        accessibilityLabel="Search people in this department"
        autoCorrect={false}
        left={<Search size={18} color={palette.textMuted} />}
      />
      {picked.length ? (
        <View style={styles.chips}>
          <Text variant="label" muted>
            Picked ({picked.length})
          </Text>
          <View style={styles.chipWrap}>
            {picked.map((p) => (
              <Chip key={p.id} label={p.name} selected icon={<X />} onPress={() => setPicked((l) => l.filter((x) => x.id !== p.id))} />
            ))}
          </View>
        </View>
      ) : null}
      {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
      {shown.length ? (
        <ListCard>
          {shown.slice(0, 60).map((p) => (
            <ListRow
              key={p.id}
              left={<Avatar name={p.name} size={36} ring={false} />}
              title={p.name}
              subtitle={p.jobTitle || undefined}
              onPress={() => {
                setPicked((l) => [...l, p]);
                setQ('');
              }}
              accessibilityHint="Adds them to the picked list"
            />
          ))}
        </ListCard>
      ) : (
        <EmptyState
          title={needle ? 'No one matches' : 'No one left to add'}
          message={needle ? `Nobody in this department matches “${q.trim()}”.` : 'Everyone in this department is already here.'}
        />
      )}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  chips: { gap: space.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
}));
