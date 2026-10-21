// One payroll run — the website's PayrollRunView (dash.html :5104):
//   GET    /hr/payroll/runs/:id               the run and every line
//   POST   /hr/payroll/runs/:id/recompute     drafts only; keeps manual loss-of-pay and adjustments
//   DELETE /hr/payroll/runs/:id               drafts only; hard delete (the month can be run again)
//   POST   /hr/payroll/runs/:id/lock          {confirm:'LOCK YYYY-MM'} — final, ever
//   POST   /hr/payroll/runs/:id/finalise      finishes a lock whose side effects stopped part-way
//   GET    /hr/payroll/runs/:id/register.csv  everyone's pay as CSV (share sheet)
// hr_payroll.js ~L389–520. Super Admin and HR with Payroll on.
//
// The website's wide table becomes a list of people (net on the right, warnings as a pill); a tap
// opens the line. Locking is the one irreversible money action in DASH: it recomputes, publishes the
// payslips to employees, marks the included claims paid and records advance EMIs, and nothing can
// change it afterwards (not even in the database). So it shows the totals and consequences, asks for
// the typed "LOCK YYYY-MM" the server demands, and then a swipe. Nobody is messaged.

import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Banknote, Calculator, FileSpreadsheet, Landmark, Lock, MoreHorizontal, RefreshCw, Search, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type PayrollItem, type PayrollRun, registerCsvPath, usePayrollRun, usePayrollRunActions } from '@/api/payroll';
import { useTodayIst } from '@/features/attendance/use-now';
import { isDraft } from '@/features/payroll/access';
import { daysLine, errorText, GateFallback, heroDecimals, monthName, noun, usePayrollGate, usePayView } from '@/features/payroll/ui';
import { dateLabel } from '@/lib/dates';
import { downloadAuthed, shareFile } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space } from '@/theme/tokens';
import {
  ActivityRow,
  Banner,
  Button,
  Chip,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  GroupedRow,
  MenuSheet,
  NavHeader,
  PillField,
  Screen,
  Sheet,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  Text,
  toast,
  useLayout,
} from '@/ui';

export default function PayrollRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useTodayIst();
  const { compact, gap } = useLayout();
  const { pending, allowed, access } = usePayrollGate('runs');
  const { money, eye } = usePayView();
  const q = usePayrollRun(id, allowed);
  const actions = usePayrollRunActions();
  const [query, setQuery] = useState('');
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'lock' | 'discard' | 'export' | 'locked' | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [halfLocked, setHalfLocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const run: PayrollRun | null = q.data?.run ?? null;
  const draft = isDraft(run);
  const header = (
    <NavHeader
      title={run ? monthName(run.month, compact) : 'Payroll run'}
      actions={allowed ? [eye, ...(run ? [{ key: 'more', icon: MoreHorizontal, label: 'More actions', onPress: () => setMenu(true) }] : [])] : undefined}
    />
  );
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  if (q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={6} avatar tone="surface" />
      </Screen>
    );
  }
  if (q.error || !run) {
    return (
      <Screen header={header}>
        <ErrorState message={errorText(q.error, 'Payroll run not found.')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const items: PayrollItem[] = q.data?.items ?? [];
  const s = query.trim().toLowerCase();
  const shown = items.filter((i) => (!onlyWarnings || i.warnings.length) && (!s || `${i.employee_name} ${i.department}`.toLowerCase().includes(s)));
  const t = run.totals;
  const warnLines = items.filter((i) => i.warnings.length).length;
  const negative = items.filter((i) => i.net < 0);
  const busy = actions.recompute.isPending || actions.saveLine.isPending || actions.discard.isPending || actions.lock.isPending;
  const word = `LOCK ${run.month}`;
  const claims = items.reduce((n, i) => n + i.reimbursements.length, 0);
  const emis = items.reduce((n, i) => n + i.deductions.filter((d) => d.code === 'LOAN').length, 0);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };
  const recompute = async () => {
    try {
      await actions.recompute.mutateAsync(run.id);
      toast.show('Recalculated from today’s data.');
    } catch (e) {
      toast.show(errorText(e), 'danger');
    }
  };
  const lock = async () => {
    setError(null);
    try {
      await actions.lock.mutateAsync({ id: run.id, confirm: typed.trim() });
      setTyped('');
      setSheet('locked');
    } catch (e) {
      setError(errorText(e));
      // The lock may have taken while its side effects stopped part-way: re-read and offer to finish.
      const again = await q.refetch();
      if (again.data?.run.status === 'locked') {
        setSheet(null);
        setHalfLocked(true);
      }
    }
  };
  const finish = async () => {
    try {
      await actions.finalise.mutateAsync(run.id);
      setHalfLocked(false);
      toast.show('Locking finished.');
    } catch (e) {
      toast.show(errorText(e), 'danger');
    }
  };
  const discard = async () => {
    setError(null);
    try {
      await actions.discard.mutateAsync(run.id);
      setSheet(null);
      toast.show(`The ${monthName(run.month)} draft was discarded.`);
      router.back();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const exportCsv = async () => {
    if (exporting) return;
    setError(null);
    setExporting(true);
    try {
      const uri = await downloadAuthed(registerCsvPath(run.id), `salary-register-${run.month}.csv`);
      setSheet(null);
      await shareFile(uri, 'text/csv', `Salary register ${monthName(run.month)}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setExporting(false);
    }
  };

  const listHeader = (
    <View style={[styles.head, { gap }]}>
      <SummaryHero
        icon={Banknote}
        module="pay"
        label={t ? `Net pay · ${t.employees} ${noun(t.employees, 'person', 'people')}` : 'Net pay'}
        value={t?.net ?? 0}
        currency="₹"
        decimals={heroDecimals(t?.net, compact)}
        hideable
        hidden={money.hidden}
        onHiddenChange={(h) => (h !== money.hidden ? eye.onPress() : undefined)}
        sub={warnLines ? `${warnLines} ${noun(warnLines, 'line')} with warnings${draft ? '. Check them before locking.' : ''}` : undefined}
        action={
          draft
            ? {
                title: 'Lock payroll',
                icon: <Lock />,
                disabled: busy || !items.length,
                onPress: () => {
                  setError(null);
                  setTyped('');
                  setSheet('lock');
                },
              }
            : undefined
        }
      />
      <SummaryCard
        rows={[
          { label: 'Gross pay', value: money.inr(t?.gross) },
          { label: 'Claims paid back', value: t?.reimbursements ? money.inr(t.reimbursements) : 'None' },
          { label: 'Deductions', value: money.inr(t?.deductions) },
        ]}
      />
      {run.status === 'locked' ? (
        <Banner
          tone="success"
          icon={Landmark}
          title={`Locked${run.locked_at ? ` ${dateLabel(run.locked_at, today)}` : ''}${run.locked_by_name ? ` by ${run.locked_by_name}` : ''}`}
          message="Final. Employees can see these payslips. Corrections go into a later month as adjustments."
        />
      ) : (
        <Banner tone="info" title="Draft" message="Nobody can see this yet. Check the lines, then lock it to publish the payslips." />
      )}
      {halfLocked ? (
        <Banner
          tone="warning"
          title="The lock didn’t finish"
          message="The month is locked, but marking claims paid and recording advances may have stopped part-way."
          action={{ label: 'Finish locking', onPress: () => void finish(), loading: actions.finalise.isPending }}
        />
      ) : null}
      {negative.length && draft ? (
        <Banner tone="danger" title="Negative net pay" message={`${negative.map((i) => i.employee_name).join(', ')}. Fix ${negative.length === 1 ? 'that line' : 'those lines'} before locking.`} />
      ) : null}
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name or team" accessibilityLabel="Search lines" autoCorrect={false} />
      {warnLines ? (
        <ChipRow bleed="none">
          <Chip label="Everyone" selected={!onlyWarnings} onPress={() => setOnlyWarnings(false)} />
          <Chip label={`${warnLines} with warnings`} icon={<AlertTriangle />} selected={onlyWarnings} onPress={() => setOnlyWarnings(true)} />
        </ChipRow>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} header={header}>
      <FlashList
        data={shown}
        keyExtractor={(i) => i.id}
        renderItem={({ item, index }) => (
          <GroupedRow tone="surface" hairline first={index === 0} last={index === shown.length - 1}>
            <ActivityRow
              person={{ name: item.employee_name }}
              title={item.employee_name}
              subtitle={compact ? daysLine(item) : `${item.department || 'No team'} · ${daysLine(item)}`}
              subtitleLines={3}
              value={money.inr(item.net, { decimals: false })}
              valueColor={item.net < 0 ? palette.dangerInk : undefined}
              status={item.warnings.length ? { label: `${item.warnings.length} ${noun(item.warnings.length, 'warning')}`, tone: 'pending' } : null}
              chevron
              onPress={() => router.push(`/admin/payroll/runs/${run.id}/${item.id}`)}
              accessibilityHint="Opens this person’s pay for the month"
            />
          </GroupedRow>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            icon={<Calculator color={moduleTone.pay.fg} strokeWidth={1.8} />}
            title={items.length ? 'Nobody matches' : 'Nobody to pay'}
            message={items.length ? 'Try another name, or show everyone.' : 'Nobody had a salary by the end of this month. Set salaries, then recalculate.'}
          />
        }
        ListFooterComponent={
          items.length ? (
            <View style={styles.foot}>
              <Button variant="text" title="Open the full register table" onPress={() => router.push('/admin/grids/payroll')} />
              <Text variant="caption" muted align="center">
                Or export it as CSV from the ••• menu.
              </Text>
            </View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.primaryText} colors={[palette.primaryText]} progressBackgroundColor={palette.surface} />}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      />

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={monthName(run.month)}
        items={[
          ...(draft
            ? [{ key: 'recompute', label: 'Recalculate', hint: 'Use today’s salaries, leave and claims. Your line edits stay.', icon: RefreshCw, onPress: () => void recompute(), disabled: busy }]
            : []),
          {
            key: 'export',
            label: 'Export register (CSV)',
            hint: 'Everyone’s pay for the month, to share or save',
            icon: FileSpreadsheet,
            onPress: () => {
              setError(null);
              setSheet('export');
            },
          },
          ...(draft
            ? [
                {
                  key: 'discard',
                  label: 'Discard draft',
                  hint: 'Delete this calculation. You can run the month again.',
                  icon: Trash2,
                  tone: 'danger' as const,
                  disabled: busy,
                  onPress: () => {
                    setError(null);
                    setSheet('discard');
                  },
                },
              ]
            : []),
        ]}
      />

      <ConfirmSheet
        visible={sheet === 'lock'}
        onClose={() => setSheet(null)}
        title={`Lock ${monthName(run.month)}?`}
        subtitle="This is final"
        from={{ title: 'Draft', subtitle: 'Only HR sees it', icon: Calculator, module: 'pay' }}
        to={{ title: 'Locked', subtitle: 'Payslips go live', icon: Landmark, module: 'pay' }}
        detailsTitle="What happens"
        confirmLabel="Swipe to lock payroll"
        onConfirm={() => void lock()}
        loading={actions.lock.isPending}
        disabled={typed.trim() !== word || busy}
        note="Nobody is messaged. People see their payslip in DASH.">
        <SummaryCard
          rows={[
            { label: 'People', value: t ? String(t.employees) : '—' },
            { label: 'Gross pay', value: money.inr(t?.gross) },
            { label: 'Deductions', value: money.inr(t?.deductions) },
          ]}
          total={{ label: 'Net pay', value: money.inr(t?.net) }}
        />
        <SummaryCard
          rows={[
            { label: 'First', value: 'Recalculated from today’s data' },
            { label: 'Payslips', value: `Visible to ${t?.employees ?? items.length} ${noun(t?.employees ?? items.length, 'person', 'people')}` },
            { label: 'Claims', value: claims ? `${claims} marked paid` : 'None included' },
            { label: 'Advances', value: emis ? `${emis} EMI ${noun(emis, 'recovery', 'recoveries')} recorded` : 'None' },
            { label: 'Undo', value: 'Never — fix mistakes in a later month' },
          ]}
        />
        <PillField
          label={`Type ${word} to confirm`}
          value={typed}
          onChangeText={(v) => setTyped(v.toUpperCase())}
          placeholder={word}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={`Type ${word} to confirm`}
          error={typed && typed.trim() !== word && typed.trim().length >= word.length ? `Type exactly ${word}` : null}
        />
        {error ? <Banner tone="danger" title="Couldn’t lock" message={error} /> : null}
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'discard'}
        onClose={() => setSheet(null)}
        title="Discard this draft?"
        subtitle={monthName(run.month)}
        confirmLabel="Swipe to discard"
        onConfirm={() => void discard()}
        loading={actions.discard.isPending}
        note="Nobody is messaged.">
        <SummaryCard
          rows={[
            { label: 'Deleted', value: `${items.length} ${noun(items.length, 'line')} and your edits to them` },
            { label: 'Afterwards', value: `${monthName(run.month)} can be run again` },
          ]}
        />
        {error ? <Banner tone="danger" title="Couldn’t discard" message={error} /> : null}
      </ConfirmSheet>

      <Sheet
        visible={sheet === 'export'}
        onClose={() => setSheet(null)}
        title="Export the salary register?"
        subtitle={monthName(run.month)}
        footer={
          <>
            {error ? <Banner tone="danger" title="Couldn’t export" message={error} /> : null}
            <Button title="Export CSV" icon={<FileSpreadsheet />} loading={exporting} onPress={() => void exportCsv()} />
          </>
        }>
        <Text variant="body">
          The file holds everyone’s pay for the month. Once you share it, it is outside DASH — send it only to people who should see salaries.
        </Text>
        <Text variant="caption" muted>
          The export is recorded in the audit log.
        </Text>
      </Sheet>

      <SuccessSheet
        visible={sheet === 'locked'}
        onClose={() => setSheet(null)}
        title="Payroll locked"
        subtitle={`${monthName(run.month)} is final. Payslips are now in DASH for ${t?.employees ?? items.length} ${noun(t?.employees ?? items.length, 'person', 'people')}.`}
        onPrimary={() => setSheet(null)}>
        <SummaryCard rows={[{ label: 'Locked by', value: access.user?.name ?? 'You' }]} total={{ label: 'Net pay', value: money.inr(t?.net) }} />
      </SuccessSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  head: { paddingBottom: space.sm },
  foot: { paddingTop: space.md },
}));
