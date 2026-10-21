// Pick people to chat with (website MeetsPeoplePicker, dash.html:7140): searches name, email and
// department, shows at most 200, a tick for each person picked in group mode. The list comes from
// /meets/directory (everyone but me), not /users, so it is the same list the website offers.

import { Check, Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { MeetsPerson } from '@/api/chat';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Avatar, EmptyState, ErrorState, ListCard, ListRow, PillField, SkeletonList, Text } from '@/ui';

const MAX_SHOWN = 200;

export function filterPeople(people: MeetsPerson[], q: string) {
  const n = q.trim().toLowerCase();
  const list = n ? people.filter((p) => [p.name, p.email, p.dept].some((v) => String(v || '').toLowerCase().includes(n))) : people;
  return list.slice(0, MAX_SHOWN);
}

export function personLine(p: MeetsPerson) {
  return [p.jobTitle, p.dept].filter(Boolean).join(' · ') || p.email || '';
}

export function PeopleList({
  people,
  loading,
  error,
  onRetry,
  selected,
  onPick,
  multi,
  busyId,
  emptyText = 'Nobody to add.',
}: {
  people: MeetsPerson[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  selected: string[];
  onPick: (p: MeetsPerson) => void;
  multi: boolean;
  /** The person whose chat is being opened (single mode): shows a spinner on that row. */
  busyId?: string | null;
  emptyText?: string;
}) {
  const [q, setQ] = useState('');
  const shown = filterPeople(people, q);
  return (
    <View style={styles.wrap}>
      <PillField
        icon={Search}
        placeholder="Search name, email or team"
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search people"
      />
      {loading && !people.length ? (
        <SkeletonList rows={6} avatar />
      ) : error && !people.length ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !people.length ? (
        <EmptyState title={emptyText} />
      ) : !shown.length ? (
        <EmptyState title="Nobody matches that" message="Try a first name, an email or a team." />
      ) : (
        <ListCard tone="surface">
          {shown.map((p) => {
            const on = selected.includes(p.id);
            return (
              <ListRow
                key={p.id}
                left={<Avatar name={p.name ?? p.email ?? ''} size={40} ring={false} />}
                title={p.name || p.email || 'Colleague'}
                subtitle={personLine(p)}
                onPress={() => onPick(p)}
                disabled={!!busyId && busyId !== p.id}
                accessibilityLabel={`${p.name || p.email}${personLine(p) ? `, ${personLine(p)}` : ''}${multi ? (on ? ', picked' : '') : ''}`}
                accessibilityHint={multi ? (on ? 'Removes them' : 'Adds them') : 'Opens a chat with them'}
                right={
                  busyId === p.id ? (
                    <ActivityIndicator color={palette.primaryText} />
                  ) : multi ? (
                    <View style={[styles.tick, on && styles.tickOn]}>{on ? <Check size={16} color={palette.onPrimary} strokeWidth={2.4} /> : null}</View>
                  ) : undefined
                }
              />
            );
          })}
        </ListCard>
      )}
      {people.length > MAX_SHOWN && shown.length === MAX_SHOWN ? (
        <Text variant="caption" muted align="center">
          Showing the first {MAX_SHOWN}. Search to find someone else.
        </Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: space.sm },
  tick: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: palette.primary, borderColor: palette.primary },
}));
