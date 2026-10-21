// Salaries — the website's SalaryPeople list (dash.html :5205): GET /hr/salary/people (hr_payroll.js
// ~L217, everyone's pay: kept in memory only). Super Admin and HR with Salary on.
// A searchable list (name, structure, since; annual CTC on the right, masked by the eye); a tap opens
// the person, where the salary is set or revised and the tax profile changed.

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Search, Users } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type SalaryPerson, useSalaryPeople } from '@/api/payroll';
import { useTodayIst } from '@/features/attendance/use-now';
import { errorText, GateFallback, noun, usePayrollGate, usePayView } from '@/features/payroll/ui';
import { dateLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space } from '@/theme/tokens';
import { ActivityRow, Chip, ChipRow, EmptyState, ErrorState, GroupedRow, NavHeader, PillField, Screen, SkeletonList, Text } from '@/ui';

export default function SalariesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useTodayIst();
  const { pending, allowed } = usePayrollGate('salaries');
  const { money, eye } = usePayView();
  const q = useSalaryPeople(allowed);
  const [query, setQuery] = useState('');
  const [missing, setMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const header = <NavHeader title="Salaries" actions={allowed ? [eye] : undefined} />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const people: SalaryPerson[] = Array.isArray(q.data) ? q.data : [];
  const none = people.filter((p) => !p.salary).length;
  const s = query.trim().toLowerCase();
  const shown = people.filter((p) => (!missing || !p.salary) && (!s || `${p.name} ${p.department}`.toLowerCase().includes(s)));
  const data = q.isPending || (q.error && !people.length) ? [] : shown;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen scroll={false} header={header}>
      <FlashList
        data={data}
        keyExtractor={(p) => p.id}
        renderItem={({ item, index }) => (
          <GroupedRow tone="surface" hairline first={index === 0} last={index === data.length - 1}>
            <ActivityRow
              person={{ name: item.name }}
              title={item.name}
              subtitle={item.salary ? `${item.department || 'No team'} · ${item.salary.structure_name}` : item.department || 'No team'}
              note={item.salary ? `Since ${dateLabel(item.salary.effective_from, today)}${item.revisions.length > 1 ? ` · ${item.revisions.length} revisions` : ''}` : null}
              value={item.salary ? money.compact(item.salary.annual_ctc) : null}
              meta={item.salary ? 'a year' : null}
              status={item.salary ? null : { label: 'No salary', tone: 'pending' }}
              chevron
              onPress={() => router.push(`/admin/payroll/salaries/${item.id}`)}
              accessibilityHint="Opens their salary and tax profile"
            />
          </GroupedRow>
        )}
        ListHeaderComponent={
          <View style={styles.head}>
            <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name or team" accessibilityLabel="Search people" autoCorrect={false} />
            {none ? (
              <ChipRow bleed="none">
                <Chip label="Everyone" selected={!missing} onPress={() => setMissing(false)} />
                <Chip label={`${none} without a salary`} selected={missing} onPress={() => setMissing(true)} />
              </ChipRow>
            ) : null}
            {people.length ? (
              <Text variant="label" muted>
                {`${shown.length === people.length ? people.length : `${shown.length} of ${people.length}`} ${noun(people.length, 'person', 'people')} · annual salary (CTC) on the right`}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          q.isPending ? (
            <SkeletonList rows={6} avatar tone="surface" />
          ) : q.error ? (
            <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState
              icon={<Users color={moduleTone.pay.fg} strokeWidth={1.8} />}
              title={people.length ? 'Nobody matches' : 'Nobody here yet'}
              message={people.length ? 'Try another name, or show everyone.' : 'People appear here once they are added to DASH.'}
            />
          )
        }
        ListFooterComponent={
          people.length ? (
            <Text variant="caption" muted align="center" style={styles.foot}>
              A person’s first salary date counts as their joining date for payroll.
            </Text>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.primaryText} colors={[palette.primaryText]} progressBackgroundColor={palette.surface} />}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  head: { gap: space.sm, paddingBottom: space.sm },
  foot: { paddingTop: space.md },
}));
