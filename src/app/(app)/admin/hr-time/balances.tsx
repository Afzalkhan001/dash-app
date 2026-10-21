// Leave balances — the website's Leave setup "Company balances" card (dash.html LeaveSetup ~L4920):
// GET /hr/leave/balances?year= (hr_leave.js ~L230, heavy: kept in memory only), POST
// /hr/leave/adjustments (~L246) and POST /hr/leave/carry-forward (~L267). Super Admin and HR.
//
// The website's people × types grid stays on the website; the phone lists people (name, team and a
// compact "CL 6 · SL 4 · EL 11.5"), and a tap opens that person's balances one type per row. Neither
// an adjustment nor a carry forward can be undone (an adjustment is fixed with an opposite one), so
// both go through ConfirmSheet + SwipeToConfirm. Your own balance can't be changed (the server's rule).
// Nobody is messaged.

import { FlashList } from '@shopify/flash-list';
import { CalendarRange, History, MoreHorizontal, Search, Users } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type BalancePerson, type CompanyBalance, useCompanyBalances, useLeaveSetupActions } from '@/api/hrtime';
import { type LeaveType, useLeaveSettings } from '@/api/leave';
import { useTodayIst } from '@/features/attendance/use-now';
import { leaveYearOf } from '@/features/leave/rules';
import { errorText, fmtDays, GateFallback, Stepper, useHrTimeGate, noun } from '@/features/hrtime/ui';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space } from '@/theme/tokens';
import {
  ActionRow,
  Avatar,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  GroupedRow,
  ListRow,
  MenuSheet,
  MetricRow,
  NavHeader,
  PillField,
  Screen,
  Segmented,
  SelectTiles,
  Sheet,
  SkeletonList,
  SummaryCard,
  Text,
  TextField,
  toast,
} from '@/ui';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtDays(Math.abs(n))}`;

export default function BalancesScreen() {
  const insets = useSafeAreaInsets();
  const today = useTodayIst();
  const thisYear = Number(today.slice(0, 4));
  const { access, pending, allowed } = useHrTimeGate('leave');
  // Leave years are labelled by the calendar year they start in (hr_leave.js leaveYearOf), so with an
  // April start, February 2027 is still leave year 2026. Until one is picked, the server's own default.
  const rules = useLeaveSettings(allowed);
  const startMonth = rules.data?.settings?.leaveYearStartMonth ?? 1;
  const [picked, setPicked] = useState<number | null>(null);
  const q = useCompanyBalances(picked, allowed);
  const current = rules.data?.settings ? leaveYearOf(today, startMonth) : (picked == null ? q.data?.year : undefined) ?? thisYear;
  const year = picked ?? q.data?.year ?? current;
  const yearLabel = (y: number) => (startMonth === 1 ? String(y) : `${y}–${String(y + 1).slice(2)}`);
  const { carryForward } = useLeaveSetupActions();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [carry, setCarry] = useState(false);
  const [carryError, setCarryError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const header = (
    <NavHeader title="Leave balances" actions={allowed ? [{ icon: MoreHorizontal, label: 'More actions', onPress: () => setMenu(true) }] : undefined} />
  );
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const types: LeaveType[] = Array.isArray(q.data?.types) ? q.data.types : [];
  const people = (Array.isArray(q.data?.people) ? q.data.people : []).filter((p) => p && p.id);
  const s = query.trim().toLowerCase();
  const shown = people.filter((p) => !s || `${p.name} ${p.department}`.toLowerCase().includes(s));
  const typeOf = (id: string) => types.find((t) => t.id === id);
  const compact = (p: BalancePerson) =>
    (Array.isArray(p.balances) ? p.balances : [])
      .filter((b) => typeOf(b.leave_type_id)?.paid !== false)
      .map((b) => `${typeOf(b.leave_type_id)?.code ?? '?'} ${fmtDays(b.available)}`)
      .join(' · ');
  const open = people.find((p) => p.id === openId) ?? null;
  const fromYear = year - 1;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([q.refetch(), rules.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };
  const doCarry = async () => {
    setCarryError(null);
    try {
      const r = await carryForward.mutateAsync(fromYear);
      setCarry(false);
      toast.show(r.credits ? `${r.credits} carry-forward ${noun(r.credits, 'credit')} added.` : 'Nothing new to carry forward.');
    } catch (e) {
      setCarryError(errorText(e));
    }
  };

  const data = q.isPending || (q.error && !people.length) ? [] : shown;
  const listHeader = (
    <View style={styles.head}>
      <Segmented
        options={[current - 1, current, current + 1].map((y) => ({ key: String(y), label: yearLabel(y) }))}
        value={String(year)}
        onChange={(k) => setPicked(Number(k))}
      />
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name or team" accessibilityLabel="Search people" autoCorrect={false} />
      {people.length ? (
        <Text variant="label" muted>
          {`Days left in ${yearLabel(year)}${shown.length !== people.length ? ` · ${shown.length} of ${people.length} people` : ` · ${people.length} people`}`}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} header={header}>
      <FlashList
        data={data}
        keyExtractor={(p) => p.id}
        renderItem={({ item, index }) => (
          <GroupedRow tone="surface" hairline first={index === 0} last={index === data.length - 1}>
            <ListRow
              size="lg"
              left={<Avatar name={item.name} />}
              title={item.name}
              subtitle={[item.department || 'No team', compact(item)].filter(Boolean).join('\n')}
              subtitleLines={3}
              chevron
              onPress={() => setOpenId(item.id)}
              accessibilityHint="Opens their balance"
            />
          </GroupedRow>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          q.isPending ? (
            <SkeletonList rows={6} avatar tone="surface" />
          ) : q.error ? (
            <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState icon={<Users color={moduleTone.leave.fg} strokeWidth={1.8} />} title="Nobody matches" message="Try another name." />
          )
        }
        ListFooterComponent={
          people.length ? (
            <Text variant="caption" muted align="center" style={styles.foot}>
              The full grid of people and leave types is on the DASH website.
            </Text>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.primaryText} colors={[palette.primaryText]} progressBackgroundColor={palette.surface} />}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      />

      {open ? <PersonSheet key={open.id + year} person={open} types={types} year={year} self={open.id === access.user?.id} onClose={() => setOpenId(null)} /> : null}

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Leave balances"
        items={[
          {
            key: 'carry',
            label: `Carry forward from ${yearLabel(fromYear)}`,
            hint: `Move unused days into ${yearLabel(year)}, capped per leave type`,
            icon: History,
            onPress: () => {
              setMenu(false);
              setCarryError(null);
              setCarry(true);
            },
          },
        ]}
      />
      <ConfirmSheet
        visible={carry}
        onClose={() => setCarry(false)}
        title="Carry forward unused leave?"
        from={{ title: yearLabel(fromYear), subtitle: 'Unused days', icon: CalendarRange, module: 'leave' }}
        to={{ title: yearLabel(year), subtitle: 'Added to balances', icon: CalendarRange, module: 'leave' }}
        detailsTitle="What happens"
        confirmLabel="Swipe to move days"
        onConfirm={() => void doCarry()}
        loading={carryForward.isPending}
        note="Nobody is messaged.">
        <SummaryCard
          rows={[
            { label: 'Who', value: 'Everyone in the company' },
            { label: 'Which leave', value: types.filter((t) => !t.is_comp_off && t.carry_forward_max > 0).map((t) => `${t.code} up to ${fmtDays(t.carry_forward_max)}`).join(', ') || 'No type carries forward' },
            { label: 'Twice', value: 'Safe — people already carried are skipped' },
            { label: 'Undo', value: 'Not possible' },
          ]}
        />
        {carryError ? <Banner tone="danger" title="Couldn’t carry forward" message={carryError} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

function PersonSheet({ person, types, year, self, onClose }: { person: BalancePerson; types: LeaveType[]; year: number; self: boolean; onClose: () => void }) {
  const { adjust } = useLeaveSetupActions();
  const [mode, setMode] = useState<'view' | 'adjust' | 'confirm'>('view');
  const adjustable = types.filter((t) => !t.is_comp_off);
  const [typeId, setTypeId] = useState(adjustable[0]?.id ?? '');
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bal = (id: string): CompanyBalance | undefined => (Array.isArray(person.balances) ? person.balances : []).find((b) => b.leave_type_id === id);
  const t = types.find((x) => x.id === typeId);
  const before = bal(typeId)?.available ?? 0;
  const after = Math.round((before + days) * 100) / 100;

  const save = async () => {
    setError(null);
    try {
      await adjust.mutateAsync({ employee_id: person.id, leave_type_id: typeId, year, days, reason: reason.trim() });
      toast.show(`${person.name}: ${t?.code ?? ''} ${signed(days)} ${noun(Math.abs(days), 'day')}.`);
      onClose();
    } catch (e) {
      setMode('adjust');
      setError(errorText(e));
    }
  };

  return (
    <>
      <Sheet
        visible={mode !== 'confirm'}
        onClose={adjust.isPending ? () => {} : onClose}
        dirty={mode === 'adjust' && (reason.trim() !== '' || days !== 1)}
        title={person.name}
        subtitle={`${person.department || 'No team'} · ${year}`}
        footer={
          mode === 'view' ? (
            self ? (
              <Text variant="caption" muted align="center">
                You can’t change your own balance. Ask another HR admin.
              </Text>
            ) : (
              <Button title="Add or take away days" onPress={() => setMode('adjust')} disabled={!adjustable.length} />
            )
          ) : (
            <>
              {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
              <ActionRow context="sheet">
                <Button title="Back" variant="accent" onPress={() => setMode('view')} />
                <Button
                  title="Review"
                  disabled={!typeId || days === 0 || reason.trim().length < 3}
                  onPress={() => {
                    setError(null);
                    setMode('confirm');
                  }}
                />
              </ActionRow>
            </>
          )
        }>
        {mode === 'view' ? (
          <View style={styles.list}>
            {types.map((ty) => {
              const b = bal(ty.id);
              if (!b) return null;
              const parts = ty.is_comp_off
                ? [`earned ${fmtDays(b.adjusted)}`, `used ${fmtDays(b.used)}`]
                : [`given ${fmtDays(b.entitlement)}`, b.adjusted ? `changed ${signed(b.adjusted)}` : null, `used ${fmtDays(b.used)}`];
              if (b.pending) parts.push(`waiting ${fmtDays(b.pending)}`);
              return (
                <MetricRow
                  key={ty.id}
                  module="leave"
                  label={`${ty.name} · ${ty.code}`}
                  value={fmtDays(b.available)}
                  unit={noun(Math.abs(b.available), 'day')}
                  sub={parts.filter(Boolean).join(' · ')}
                  status={ty.paid ? null : { label: 'Unpaid', tone: 'neutral' }}
                />
              );
            })}
          </View>
        ) : (
          <>
            <SelectTiles
              columns={adjustable.length === 3 ? 3 : 2}
              value={typeId}
              onChange={setTypeId}
              accessibilityLabel="Leave type"
              options={adjustable.map((ty) => ({ value: ty.id, label: ty.code, sub: `${fmtDays(bal(ty.id)?.available ?? 0)} left` }))}
            />
            <Stepper label="Days to add (− to take away)" value={days} onChange={setDays} min={-365} max={365} unit={noun(Math.abs(days), 'day')} hint={`${t?.name ?? ''}: ${fmtDays(before)} → ${fmtDays(after)} in ${year}`} />
            <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={300} placeholder="e.g. Opening balance from the old system" multiline counter />
          </>
        )}
      </Sheet>
      <ConfirmSheet
        visible={mode === 'confirm'}
        onClose={() => setMode('adjust')}
        title={days > 0 ? 'Add leave days?' : 'Take away leave days?'}
        subtitle={person.name}
        from={{ title: `${t?.code ?? ''} ${fmtDays(before)}`, subtitle: 'Now' }}
        to={{ title: `${t?.code ?? ''} ${fmtDays(after)}`, subtitle: `${signed(days)} ${noun(Math.abs(days), 'day')} for ${year}` }}
        confirmLabel={days > 0 ? 'Swipe to add' : 'Swipe to take away'}
        onConfirm={() => void save()}
        loading={adjust.isPending}
        note="Can’t be undone: fix it with an opposite change. Nobody is messaged.">
        <SummaryCard rows={[{ label: 'Leave type', value: t?.name ?? '' }, { label: 'Reason', value: reason.trim() }]} />
      </ConfirmSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  head: { gap: space.sm, paddingBottom: space.sm },
  list: { gap: space.sm },
  foot: { paddingTop: space.md },
}));
