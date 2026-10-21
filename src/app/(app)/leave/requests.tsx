// All my leave / WFH / comp-off requests (the server returns the latest 300), filterable by status, in a
// FlashList. A row opens the same request sheet as Me › Leave, with Cancel when the server allows it.
//
// Optional params: /leave/requests?filter=all|pending|approved|closed (the list opens on that filter)
// and &open=<request id> (that request's sheet opens once the list has it — the apply flow's "View
// request").
//
// Layout = the list template (docs/DESIGN.md §10.4) in the Payno kit: NavHeader (round back button,
// centred title), then one row with a PillSelector for the filter (All requests / Waiting / Approved /
// Closed = rejected or cancelled; it opens a small sheet that also shows how many each holds) and the count on
// the right, then the rows as one frosted card in the Payno transactions style (GroupedRow
// tone="surface" with inset hairlines, the same card as the Leave requests list in Me › Leave), a
// list-shaped skeleton while loading, and an EmptyState with "Apply leave" (or "Work from home" /
// "Claim comp-off" for someone without leave) when there is nothing at all.

import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarCheck, CalendarX, Check, CircleSlash, Hourglass, ListFilter, type LucideIcon, Rows3 } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLeaveBalances } from '@/api/hr';
import { type LeaveBalanceRow, type LeaveBalances, type LeaveRequest, useMyLeaveRequests } from '@/api/leave';
import { LeaveRequestRow, RequestRowsSkeleton } from '@/features/leave/request-row';
import { LeaveRequestSheet } from '@/features/leave/request-sheet';
import { APPLY_TITLE, emptyCopy, isRequestFilter, matchesFilter, type RequestFilter } from '@/features/leave/rules';
import { useLeaveAccess } from '@/features/leave/use-leave-access';
import { plural } from '@/lib/format';
import { moduleTone, palette, space } from '@/theme/tokens';
import { Button, EmptyState, ErrorState, GroupedRow, IconBadge, ListCard, ListRow, NavHeader, PillSelector, Screen, Sheet, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';

const asArray = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v.filter(Boolean) : []);

// The filter's words: in full in its sheet, short on the pill (so it never squeezes the count at 320 dp).
const FILTERS: { key: RequestFilter; label: string; pill: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'All requests', pill: 'All requests', icon: Rows3 },
  { key: 'pending', label: 'Waiting for approval', pill: 'Waiting', icon: Hourglass },
  { key: 'approved', label: 'Approved', pill: 'Approved', icon: CalendarCheck },
  { key: 'closed', label: 'Rejected or cancelled', pill: 'Closed', icon: CircleSlash },
];

/** Each filter's icon disc in the colour of what it holds (read at render, so it follows the theme). */
function filterTint(f: RequestFilter): { bg: string; fg: string } {
  switch (f) {
    case 'pending':
      return { bg: palette.warningSoft, fg: palette.warningInk };
    case 'approved':
      return { bg: palette.successSoft, fg: palette.successInk };
    case 'closed':
      return { bg: palette.surfaceSunken, fg: palette.textMuted };
    default:
      return { bg: palette.primarySoft, fg: palette.primaryText };
  }
}

export default function LeaveRequestsScreen() {
  const params = useLocalSearchParams<{ filter?: string; open?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const access = useLeaveAccess();
  const reqQ = useMyLeaveRequests(access.enabled);
  const balQ = useLeaveBalances(access.enabled && access.hasLeave);
  const [filter, setFilter] = useState<RequestFilter>(isRequestFilter(params.filter) ? params.filter : 'all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // ?open= opens that request's sheet as soon as the list holds it.
  const [openId, setOpenId] = useState<string | null>(typeof params.open === 'string' && params.open ? params.open : null);
  const [sheetOpen, setSheetOpen] = useState(!!openId);

  const header = <NavHeader title="Leave requests" />;

  if (access.loading) {
    return (
      <Screen header={header}>
        <RequestRowsSkeleton rows={6} />
      </Screen>
    );
  }
  if (access.error) {
    return (
      <Screen header={header}>
        <ErrorState message={access.error.message} onRetry={() => void access.refetch()} />
      </Screen>
    );
  }
  if (!access.enabled) {
    return (
      <Screen header={header}>
        <EmptyState icon={<CalendarX color={moduleTone.leave.fg} />} title="Leave isn’t on for you" message="Ask HR to switch it on." />
      </Screen>
    );
  }

  // Type names for the rows (a request carries only the type's code).
  const balances = asArray<LeaveBalanceRow>((balQ.data as LeaveBalances | undefined)?.balances);
  const typeOf = (id: string | null) => balances.find((b) => b.id === id) ?? null;
  const typeName = (id: string | null) => typeOf(id)?.name ?? null;
  const requests = asArray<LeaveRequest>(reqQ.data?.requests);
  const shown = requests.filter((r) => matchesFilter(r, filter));
  const countOf = (f: RequestFilter) => requests.filter((r) => matchesFilter(r, f)).length;
  const openReq = requests.find((r) => r.id === openId) ?? null;
  const hasAny = requests.length > 0;
  const empty = emptyCopy(filter, hasAny);
  const current = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;
  const loaded = !reqQ.isLoading && !(reqQ.isError && !reqQ.data);
  // The same start as Me › Leave: the first kind this person can request, named for what it starts.
  const firstKind = access.kinds[0] ?? 'leave';

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([reqQ.refetch(), access.hasLeave ? balQ.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen scroll={false} header={header}>
      <View style={styles.top}>
        <PillSelector
          icon={ListFilter}
          label={current.pill}
          onPress={() => setFilterOpen(true)}
          accessibilityLabel={`Showing: ${current.label}`}
          accessibilityHint="Opens the filter"
          style={styles.pill}
        />
        {loaded && hasAny ? (
          <Text variant="label" muted tabular numberOfLines={1} style={styles.count}>
            {plural(shown.length, 'request')}
          </Text>
        ) : null}
      </View>

      {reqQ.isLoading ? (
        <RequestRowsSkeleton rows={6} />
      ) : reqQ.isError && !reqQ.data ? (
        <ErrorState message={reqQ.error.message} onRetry={() => void reqQ.refetch()} />
      ) : (
        <FlashList
          data={shown}
          extraData={balances}
          keyExtractor={(r) => r.id}
          renderItem={({ item, index }) => (
            <GroupedRow tone="surface" hairline first={index === 0} last={index === shown.length - 1}>
              <LeaveRequestRow
                request={item}
                typeName={typeName(item.leave_type_id)}
                type={typeOf(item.leave_type_id)}
                onPress={() => {
                  setOpenId(item.id);
                  setSheetOpen(true);
                }}
              />
            </GroupedRow>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<CalendarCheck color={moduleTone.leave.fg} />}
              {...empty}
              action={
                hasAny ? (
                  <Button title="Show all requests" variant="accent" size="md" onPress={() => setFilter('all')} />
                ) : (
                  <Button title={APPLY_TITLE[firstKind]} variant="accent" size="md" onPress={() => router.push(`/leave/apply?kind=${firstKind}`)} />
                )
              }
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={palette.primaryText}
              colors={[palette.primaryText]}
              progressBackgroundColor={palette.surface}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      )}

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Show requests">
        <ListCard tone="surface">
          {FILTERS.map((f) => {
            const on = f.key === filter;
            const n = countOf(f.key);
            const Icon = f.icon;
            const tint = filterTint(f.key);
            return (
              <ListRow
                key={f.key}
                left={
                  <IconBadge bg={tint.bg}>
                    <Icon size={20} color={tint.fg} strokeWidth={1.8} />
                  </IconBadge>
                }
                title={f.label}
                titleWeight="medium"
                subtitle={loaded ? plural(n, 'request') : null}
                right={on ? <Check size={20} color={palette.primaryText} strokeWidth={2.2} /> : null}
                onPress={() => {
                  setFilterOpen(false);
                  if (!on) setFilter(f.key);
                }}
                accessibilityLabel={`${f.label}${loaded ? `, ${plural(n, 'request')}` : ''}${on ? ', selected' : ''}`}
              />
            );
          })}
        </ListCard>
      </Sheet>

      <LeaveRequestSheet
        request={openReq}
        typeName={openReq ? typeName(openReq.leave_type_id) : null}
        visible={sheetOpen && !!openReq}
        onClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.sm, minHeight: 48 },
  pill: { flexShrink: 1 },
  count: { marginLeft: 'auto', flexShrink: 0 },
}));
