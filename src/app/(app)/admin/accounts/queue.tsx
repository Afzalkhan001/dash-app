// Everything on the Accounts desk in one list — the website's Bill Approvals tabs and filters
// (dash.html:34834-34905) for a phone: /admin/accounts/queue?stage=<stage>&type=<all|petty|claim|bill>.
//   type      All · Petty cash (with the old petty cash bills) · Claims · Vendor bills — only the ones this
//             person has (the server's role lists)
//   stage     All, then each stage with its count (the counts always follow the search and filters)
//   search    name, vendor, project code, reference, amount
//   filters   project code, person, date (Today · Last 7 days · Last 30 days · This month), in a sheet
// Rows open the item. Newest first, 30 at a time.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ListChecks, Search, SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { canSeeAccountsDesk } from '@/features/accounts/access';
import { DATE_PRESETS, type DatePreset, inDateRange, isStage, type ItemType, matches, STAGE_META, type Stage, STAGES } from '@/features/accounts/model';
import { ItemRow } from '@/features/accounts/ui';
import { useAccountsItems } from '@/features/accounts/use-items';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActivityList, Banner, Button, Chip, ChipRow, EmptyState, ErrorState, NavHeader, PillField, PillSelector, Screen, Segmented, SelectField, Sheet, SkeletonList } from '@/ui';

const PAGE = 30;
type TypeKey = 'all' | 'petty' | 'claim' | 'bill';
const TYPE_OF: Record<Exclude<TypeKey, 'all'>, ItemType[]> = { petty: ['petty', 'pcbill'], claim: ['claim'], bill: ['bill'] };

export default function AccountsQueueScreen() {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const now = useNow();
  const params = useLocalSearchParams<{ stage?: string; type?: string }>();
  const desk = useAccountsItems(access);
  const [stage, setStage] = useState<Stage | ''>(isStage(params.stage) ? params.stage : '');
  const [type, setType] = useState<TypeKey>(params.type === 'petty' || params.type === 'claim' || params.type === 'bill' ? params.type : 'all');
  const [q, setQ] = useState('');
  const [code, setCode] = useState('');
  const [person, setPerson] = useState('');
  const [date, setDate] = useState<DatePreset>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);

  if (!canSeeAccountsDesk(access)) return <Redirect href="/" />;

  const g = desk.gates;
  const typeOptions = [
    { key: 'all' as const, label: 'All' },
    ...(g.petty ? [{ key: 'petty' as const, label: 'Petty cash' }] : []),
    ...(g.claims ? [{ key: 'claim' as const, label: 'Claims' }] : []),
    ...(g.bills ? [{ key: 'bill' as const, label: 'Vendor bills' }] : []),
  ];
  const needle = q.trim().toLowerCase();
  const ofType = type === 'all' ? desk.items : desk.items.filter((i) => TYPE_OF[type].includes(i.type));
  // Filter options come from everything, so a choice never vanishes because another filter is on.
  const codes = [...new Set(desk.items.map((i) => i.kekaCode).filter(Boolean))].sort();
  const people = [...new Set(desk.items.map((i) => i.person).filter(Boolean))].sort();
  const passes = ofType.filter((i) => matches(i, needle) && (!code || i.kekaCode === code) && (!person || i.person === person) && inDateRange(i.at, date, today, now));
  const rows = stage ? passes.filter((i) => i.stage === stage) : passes;
  const filterCount = [code, person, date].filter(Boolean).length;
  const filtersOn = !!(needle || filterCount);
  const reset = () => setShown(PAGE);

  const emptyText = filtersOn
    ? 'Nothing matches the search and filters.'
    : stage === 'awaiting'
      ? 'Nothing waiting on Accounts right now.'
      : stage
        ? `Nothing is ${STAGE_META[stage].label.toLowerCase()} yet.`
        : 'Nothing has reached Accounts yet.';

  return (
    <Screen header={<NavHeader title="Accounts items" />} onRefresh={() => desk.refresh()}>
      {typeOptions.length > 2 ? (
        <Segmented
          options={typeOptions}
          value={type}
          onChange={(k) => {
            setType(k);
            reset();
          }}
        />
      ) : null}

      <View style={styles.searchRow}>
        <PillField
          icon={Search}
          placeholder="Search items"
          value={q}
          onChangeText={(t) => {
            setQ(t);
            reset();
          }}
          returnKeyType="search"
          autoCorrect={false}
          containerStyle={styles.search}
          accessibilityLabel="Search the list"
          accessibilityHint="Searches names, vendors, project codes, references and amounts"
        />
        <PillSelector icon={SlidersHorizontal} label={filterCount ? `Filters · ${filterCount}` : 'Filters'} onPress={() => setFiltersOpen(true)} accessibilityHint="Opens the filters" />
      </View>

      <ChipRow>
        <Chip
          label="All"
          count={passes.length}
          selected={!stage}
          onPress={() => {
            setStage('');
            reset();
          }}
        />
        {STAGES.map((s) => (
          <Chip
            key={s}
            label={STAGE_META[s].label}
            count={passes.filter((i) => i.stage === s).length}
            selected={stage === s}
            onPress={() => {
              setStage(s);
              reset();
            }}
          />
        ))}
      </ChipRow>

      {desk.error ? <ErrorState message={desk.error} onRetry={() => void desk.refresh()} /> : null}
      {desk.partial ? <Banner tone="warning" title="Some lists didn’t load" message={desk.partial} /> : null}

      {desk.loading && !desk.items.length ? (
        <SkeletonList rows={5} avatar />
      ) : rows.length ? (
        <ActivityList title={`${rows.length} ${rows.length === 1 ? 'item' : 'items'}`}>
          {rows.slice(0, shown).map((it) => (
            <ItemRow key={it.key} item={it} today={today} hideStage={!!stage} onPress={() => router.push({ pathname: '/admin/accounts/item/[type]/[id]', params: { type: it.type, id: it.id } })} />
          ))}
        </ActivityList>
      ) : !desk.error ? (
        <EmptyState
          icon={<ListChecks color={palette.textMuted} strokeWidth={1.8} />}
          title={filtersOn ? 'No matches' : 'Nothing here'}
          message={emptyText}
          action={
            filtersOn ? (
              <Button
                title="Clear search and filters"
                variant="accent"
                size="md"
                onPress={() => {
                  setQ('');
                  setCode('');
                  setPerson('');
                  setDate('');
                }}
              />
            ) : undefined
          }
        />
      ) : null}
      {rows.length > shown ? <Button title={`Show ${Math.min(PAGE, rows.length - shown)} more`} variant="ghost" size="md" onPress={() => setShown((n) => n + PAGE)} /> : null}

      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <Button
            title="Clear filters"
            variant="ghost"
            disabled={!filterCount}
            onPress={() => {
              setCode('');
              setPerson('');
              setDate('');
              reset();
            }}
          />
        }>
        <View style={styles.sheet}>
          <SelectField label="Project code" value={code} placeholder="Any project code" options={[{ value: '', label: 'Any project code' }, ...codes.map((c) => ({ value: c, label: c }))]} onChange={(v) => { setCode(v); reset(); }} />
          <SelectField label="Person" value={person} placeholder="Anyone" options={[{ value: '', label: 'Anyone' }, ...people.map((p) => ({ value: p, label: p }))]} onChange={(v) => { setPerson(v); reset(); }} />
          <SelectField<DatePreset> label="Raised" value={date} options={DATE_PRESETS} onChange={(v) => { setDate(v); reset(); }} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  search: { flexGrow: 1, flexBasis: 200, minWidth: 0 },
  sheet: { gap: space.md },
}));
