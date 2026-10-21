// My help requests: everything I raised in Help & support, newest first, in one frosted ActivityList.
// A Lendora PillSelector ("All ⌄") beside the list title picks the filter — All · Open · Closed ·
// Rejected (the web's History filters), each with its count — from a menu sheet. A row opens the request.

import { useRouter } from 'expo-router';
import { CircleCheck, CircleDot, CircleX, LifeBuoy, ListFilter, Rows3 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useMyTickets } from '@/api/support';
import { isClosedStatus, isOpenStatus } from '@/features/support/format';
import { asTickets, SupportRequestRow } from '@/features/support/request-row';
import { palette } from '@/theme/tokens';
import { ActivityList, Button, EmptyState, ErrorState, MenuSheet, NavHeader, PillSelector, Screen, SectionHeader, SkeletonList } from '@/ui';

type Filter = 'all' | 'open' | 'closed' | 'rejected';

const FILTERS: { key: Filter; label: string; title: string; icon: typeof CircleDot }[] = [
  { key: 'all', label: 'All', title: 'All requests', icon: Rows3 },
  { key: 'open', label: 'Open', title: 'Open requests', icon: CircleDot },
  { key: 'closed', label: 'Closed', title: 'Closed requests', icon: CircleCheck },
  { key: 'rejected', label: 'Rejected', title: 'Rejected requests', icon: CircleX },
];

const EMPTY: Record<Exclude<Filter, 'all'>, string> = {
  open: 'No open requests',
  closed: 'Nothing closed yet',
  rejected: 'No rejected requests',
};

const inFilter = (filter: Filter, status?: string) =>
  filter === 'all' ? true : filter === 'open' ? isOpenStatus(status) : filter === 'closed' ? isClosedStatus(status) : status === 'rejected';

export default function SupportRequestsScreen() {
  const router = useRouter();
  const tickets = useMyTickets();
  const [filter, setFilter] = useState<Filter>('all');
  const [picking, setPicking] = useState(false);

  const list = asTickets(tickets.data);
  const shown = list.filter((t) => inFilter(filter, t.status));
  const current = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;
  const countOf = (f: Filter) => list.filter((t) => inFilter(f, t.status)).length;

  return (
    <Screen header={<NavHeader title="My help requests" />} onRefresh={() => tickets.refetch()}>
      {list.length ? (
        <SectionHeader
          title={current.title}
          overline={shown.length === 1 ? '1 request' : `${shown.length} requests`}
          right={
            <PillSelector
              icon={ListFilter}
              label={current.label}
              onPress={() => setPicking(true)}
              accessibilityLabel={`Filter: ${current.label}`}
              accessibilityHint="Opens the filters"
            />
          }
        />
      ) : null}

      <View>
        {shown.length ? (
          <ActivityList>
            {shown.map((t, i) => (
              <SupportRequestRow key={t.id ?? i} t={t} onPress={() => router.push(`/support/${encodeURIComponent(t.id)}`)} />
            ))}
          </ActivityList>
        ) : tickets.isLoading ? (
          <SkeletonList rows={5} avatar />
        ) : tickets.isError && !tickets.data ? (
          <ErrorState message={tickets.error?.message ?? ''} onRetry={() => void tickets.refetch()} />
        ) : filter !== 'all' ? (
          <EmptyState title={EMPTY[filter]} action={<Button title="Show all" variant="accent" size="md" onPress={() => setFilter('all')} />} />
        ) : (
          <EmptyState icon={<LifeBuoy color={palette.textMuted} />} title="No requests yet" />
        )}
      </View>

      <MenuSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Show"
        items={FILTERS.map((f) => ({
          key: f.key,
          label: `${f.label} (${countOf(f.key)})`,
          icon: f.icon,
          hint: f.key === filter ? 'Showing now' : undefined,
          onPress: () => setFilter(f.key),
        }))}
      />
    </Screen>
  );
}
