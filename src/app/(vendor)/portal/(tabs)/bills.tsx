// Bills — the website's VendorBillsSummary (dash.html ~32079): the money summary over the list of
// bills, filterable by the website's buckets (Waiting / Approved / Paid; Approved includes paid bills,
// as on the website). The hero splits what is still due into "Waiting" and "To be paid" instead, so
// its figures never count money already received. Vendors only read bills here:
// bills and advances are raised and re-uploaded by the Tamada employee who submitted them
// (vendor_bills.js has no vendor-side submit or re-upload route).
// Layout (docs/REFERENCE-COMPONENTS.md §3 list screen): the tab-root bar (centred "Bills"), Payno's light
// dues hero, then the bills as one ActivityList whose header carries a PillSelector ("All bills ⌄")
// that opens a small sheet of the buckets with their counts and totals.

import { useRouter } from 'expo-router';
import { BadgeCheck, CircleCheck, Hourglass, Layers, type LucideIcon, Receipt } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useVendorBills, useVendorMe } from '@/api/vendor';
import { billBuckets, billsWord, DuesHero, sumBills } from '@/features/vendor/home';
import { rupees } from '@/features/vendor/format';
import { BillRow } from '@/features/vendor/rows';
import { palette, radius } from '@/theme/tokens';
import { ActivityList, Button, EmptyState, ErrorState, MenuSheet, PillSelector, Screen, Skeleton, SkeletonList, TabRootHeader, useLayout } from '@/ui';

type FilterKey = 'all' | 'pending' | 'approved' | 'received';
// "pending" / "approved" / "received" are the website's buckets; the vendor reads Waiting / Approved / Paid.
const FILTERS: { key: FilterKey; label: string; pill: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'All bills', pill: 'All bills', icon: Layers },
  { key: 'pending', label: 'Waiting', pill: 'Waiting', icon: Hourglass },
  { key: 'approved', label: 'Approved', pill: 'Approved', icon: BadgeCheck },
  { key: 'received', label: 'Paid', pill: 'Paid', icon: CircleCheck },
];

export default function VendorBills() {
  const router = useRouter();
  const { gap } = useLayout();
  const me = useVendorMe();
  const approved = me.data?.status === 'approved';
  const bills = useVendorBills(approved);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [picking, setPicking] = useState(false);

  const { all, received, pending, authorized } = billBuckets(bills.data);
  const bucket: Record<FilterKey, typeof all> = { all, pending, approved: authorized, received };
  const shown = bucket[filter] ?? all;
  const current = FILTERS.find((x) => x.key === filter) ?? FILTERS[0]!;

  const refresh = () => Promise.all([me.refetch(), ...(approved ? [bills.refetch()] : [])]);

  return (
    <>
      <Screen withTabBar onRefresh={refresh} header={<TabRootHeader overline="Vendor portal" title="Bills" />}>
        {me.isPending || (approved && bills.isPending) ? (
          <View style={{ gap }}>
            <Skeleton height={300} radius={radius.xxl} />
            <SkeletonList rows={4} avatar tone="surface" />
          </View>
        ) : me.isError && !me.data ? (
          <ErrorState message={me.error?.message ?? 'Could not load your account.'} onRetry={() => void me.refetch()} />
        ) : !approved ? (
          <EmptyState icon={<Receipt color={palette.textMuted} />} title="Bills open after approval" message="Once you’re approved, bills raised for you show here." />
        ) : bills.isError ? (
          <ErrorState message={bills.error?.message ?? 'Could not load your bills.'} onRetry={() => void bills.refetch()} />
        ) : !all.length ? (
          <EmptyState icon={<Receipt color={palette.textMuted} />} title="No bills yet" message="Bills raised for you by the Tamada team show here." />
        ) : (
          <View style={{ gap }}>
            <DuesHero bills={all} code={me.data?.vendorCode} />

            <ActivityList
              title={filter === 'all' ? 'Your bills' : current.label}
              right={
                <PillSelector
                  icon={current.icon}
                  label={current.pill}
                  onPress={() => setPicking(true)}
                  accessibilityLabel={`Show: ${current.label}`}
                  accessibilityHint="Opens the bill filters"
                />
              }
              empty={
                <EmptyState
                  icon={<Receipt color={palette.textMuted} />}
                  title={`Nothing in “${current.label}”`}
                  action={<Button title="Show all bills" variant="ghost" size="md" onPress={() => setFilter('all')} />}
                />
              }>
              {shown.map((b) => (
                <BillRow key={b.id} bill={b} onPress={() => router.push(`/portal/bills/${b.id}`)} />
              ))}
            </ActivityList>
          </View>
        )}
      </Screen>

      <MenuSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Show bills"
        items={FILTERS.map((f) => {
          const list = bucket[f.key] ?? [];
          return {
            key: f.key,
            label: f.label,
            selected: f.key === filter,
            icon: f.icon,
            hint: list.length ? `${billsWord(list.length)} · ${rupees(sumBills(list))}` : 'No bills',
            onPress: () => setFilter(f.key),
          };
        })}
      />
    </>
  );
}
