// The multi-select people list behind Clock-in rules and Who works which shift (the website's
// searchable tables with checkboxes, dash.html AttendancePeople ~L4466 / ShiftsPanel ~L4700).
// Search, a filter row, "Select all shown", then one FlashList card of people: tap a row to tick it.
// While anyone is ticked a sticky bar says how many and offers the action. For big changes the
// website is quicker, and the empty selection says so.

import { FlashList } from '@shopify/flash-list';
import { Search, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { Tick } from '@/features/hrtime/ui';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space, type StatusTone } from '@/theme/tokens';
import {
  ActionBar,
  ActionRow,
  Avatar,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  GroupedRow,
  ListRow,
  PillField,
  Screen,
  SkeletonList,
  StatusPill,
  Text,
} from '@/ui';

export type SelectablePerson = { id: string; name: string; department: string };

export function PeopleSelectScreen<P extends SelectablePerson>({
  header,
  intro,
  people,
  loading,
  error,
  onRetry,
  onRefresh,
  filters,
  filterOf,
  subOf,
  statusOf,
  actionLabel,
  onAction,
  busy,
  sheet,
}: {
  header: ReactNode;
  /** One short line above the list. */
  intro?: string;
  people: P[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRefresh: () => Promise<unknown>;
  filters: { key: string; label: string }[];
  filterOf: (p: P) => string;
  subOf: (p: P) => string;
  statusOf: (p: P) => { label: string; tone: StatusTone } | null;
  actionLabel: string;
  onAction: (ids: string[], clear: () => void) => void;
  busy?: boolean;
  /** The action's sheet (rendered inside the screen). */
  sheet?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = people.filter(
    (p) => (filter === 'all' || filterOf(p) === filter) && (!q || `${p.name} ${p.department}`.toLowerCase().includes(q)),
  );
  const counts = new Map<string, number>();
  for (const p of people) counts.set(filterOf(p), (counts.get(filterOf(p)) ?? 0) + 1);
  const toggle = (id: string) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allShown = shown.length > 0 && shown.every((p) => picked.includes(p.id));
  const clear = () => setPicked([]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const listHeader = (
    <View style={styles.head}>
      {intro ? (
        <Text variant="body" muted>
          {intro}
        </Text>
      ) : null}
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name or team" accessibilityLabel="Search people" autoCorrect={false} />
      <ChipRow>
        {[{ key: 'all', label: 'Everyone' }, ...filters].map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            selected={filter === f.key}
            // No "0" badges while the list is still loading.
            count={loading && !people.length ? undefined : f.key === 'all' ? people.length : (counts.get(f.key) ?? 0)}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ChipRow>
      {shown.length ? (
        <View style={styles.selectRow}>
          <Text variant="label" muted style={styles.flex}>
            {shown.length === people.length ? `${people.length} people` : `${shown.length} of ${people.length} people`}
          </Text>
          <Button
            title={allShown ? 'Untick shown' : 'Tick all shown'}
            variant="text"
            size="sm"
            onPress={() =>
              setPicked((s) => (allShown ? s.filter((id) => !shown.some((p) => p.id === id)) : [...new Set([...s, ...shown.map((p) => p.id)])]))
            }
          />
        </View>
      ) : null}
    </View>
  );

  const data = loading || (error && !people.length) ? [] : shown;

  return (
    <Screen
      scroll={false}
      header={header}
      footer={
        <ActionBar note={picked.length ? `${picked.length} selected` : 'Tick people to change them together. For big changes the website is quicker.'}>
          <ActionRow context="bar">
            <Button title="Clear" variant="accent" onPress={clear} disabled={!picked.length || busy} />
            <Button title={actionLabel} onPress={() => onAction(picked, clear)} disabled={!picked.length} loading={busy} />
          </ActionRow>
        </ActionBar>
      }>
      <FlashList
        data={data}
        keyExtractor={(p) => p.id}
        extraData={picked}
        renderItem={({ item, index }) => {
          const on = picked.includes(item.id);
          const st = statusOf(item);
          return (
            <GroupedRow tone="surface" hairline first={index === 0} last={index === data.length - 1}>
              <ListRow
                size="lg"
                left={<Avatar name={item.name} />}
                title={item.name}
                subtitle={subOf(item)}
                subtitleLines={2}
                below={st ? <StatusPill label={st.label} tone={st.tone} /> : undefined}
                right={<Tick on={on} />}
                onPress={() => toggle(item.id)}
                accessibilityLabel={[item.name, subOf(item), st?.label, on ? 'ticked' : 'not ticked'].filter(Boolean).join(', ')}
                accessibilityHint={on ? 'Untick' : 'Tick'}
              />
            </GroupedRow>
          );
        }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loading ? (
            <SkeletonList rows={6} avatar tone="surface" />
          ) : error ? (
            <ErrorState message={error} onRetry={onRetry} />
          ) : (
            <EmptyState icon={<Users color={moduleTone.people.fg} strokeWidth={1.8} />} title="Nobody matches" message="Try another name or filter." />
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.primaryText} colors={[palette.primaryText]} progressBackgroundColor={palette.surface} />
        }
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      />
      {sheet}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  head: { gap: space.sm, paddingBottom: space.sm },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
}));
