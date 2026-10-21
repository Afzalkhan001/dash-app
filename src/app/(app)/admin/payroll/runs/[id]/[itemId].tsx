// One person's line in a payroll run — the website's row "Details", "Edit" and "PDF"
// (dash.html PayrollRunView :5122–5141):
//   PUT /hr/payroll/runs/:id/items/:itemId  {lop_override, adjustments[≤20]} — drafts only, never your
//                                            own line (notSelf); the server recalculates the WHOLE run
//   GET /hr/payslips/:itemId/pdf            HR gets drafts too, stamped "DRAFT — not final"
// hr_payroll.js ~L408 / ~L554. The line is read from the run (one request for every line).
//
// Editing a draft line is not final (it can be changed again, or the draft discarded), so it saves
// with a plain button. Nobody is messaged.

import { useLocalSearchParams } from 'expo-router';
import { FileDown, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Adjustment, adminPayslipPath, type PayLine, type PayrollItem, usePayrollRun, usePayrollRunActions } from '@/api/payroll';
import { Stepper, ToggleRow } from '@/features/hrtime/ui';
import { isDraft, isSelf } from '@/features/payroll/access';
import { daysLine, errorText, fmtDays, GateFallback, moneyTyping, monthName, noun, rupeesOf, sumLines, usePayrollGate, usePayView } from '@/features/payroll/ui';
import { downloadAuthed, shareFile } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActionRow,
  Banner,
  Button,
  ErrorState,
  IconButton,
  NavHeader,
  PillField,
  Screen,
  Segmented,
  Sheet,
  SkeletonList,
  SummaryCard,
  type SummaryItem,
  Text,
  toast,
} from '@/ui';

export default function PayrollLineScreen() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId: string }>();
  const { pending, allowed, access } = usePayrollGate('runs');
  const { money, eye } = usePayView();
  const q = usePayrollRun(id, allowed);
  const [editing, setEditing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const item = (q.data?.items ?? []).find((i) => i.id === itemId) ?? null;
  const header = <NavHeader title={item?.employee_name ?? 'Pay line'} actions={allowed ? [eye] : undefined} />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;
  if (q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={6} tone="surface" />
      </Screen>
    );
  }
  if (q.error || !q.data || !item) {
    return (
      <Screen header={header}>
        <ErrorState message={errorText(q.error, 'This line is no longer in the run. It may have been recalculated or discarded.')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  const run = q.data.run;
  const draft = isDraft(run);
  const self = isSelf(item.employee_id, access.user);
  const rows = (lines: PayLine[]): SummaryItem[] =>
    lines.map((l, i) => ({
      key: `${l.code}-${i}`,
      label: l.name,
      value: money.inr(l.amount),
      hint: l.code === 'ADJ' ? 'Adjustment' : l.full != null && l.full !== l.amount ? `Full month ${money.inr(l.full)}` : null,
    }));

  const pdf = async () => {
    setPdfBusy(true);
    try {
      const uri = await downloadAuthed(adminPayslipPath(item.id), `payslip-${run.month}-${item.employee_name.replace(/\W+/g, '_')}.pdf`);
      await shareFile(uri, 'application/pdf', `Payslip ${monthName(run.month)}`);
    } catch (e) {
      toast.show(errorText(e), 'danger');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      <SummaryCard
        title={`${monthName(run.month)}${draft ? ' · draft' : ''}`}
        rows={[
          { label: 'Team', value: item.department || 'No team' },
          { label: 'Structure', value: item.structure_name || '—' },
          { label: 'Days', value: daysLine(item) },
          { label: 'Gross pay', value: money.inr(item.gross) },
          { label: 'Reimbursements', value: item.reimbursement_total ? money.inr(item.reimbursement_total) : 'None' },
          { label: 'Deductions', value: money.inr(item.total_deductions) },
        ]}
        total={{ label: 'Net pay', value: money.inr(item.net) }}
      />
      {item.warnings.map((w, i) => (
        <Banner key={i} tone={/negative/i.test(w) ? 'danger' : 'warning'} title={/negative/i.test(w) ? 'Net pay is negative' : 'Check this line'} message={w} />
      ))}

      <SummaryCard title="Earnings" rows={rows(item.earnings)} total={{ label: 'Gross pay', value: money.inr(item.gross) }} />
      {item.reimbursements.length ? <SummaryCard title="Reimbursements" rows={rows(item.reimbursements)} total={{ label: 'Paid with salary', value: money.inr(item.reimbursement_total) }} /> : null}
      <SummaryCard
        title="Deductions"
        rows={item.deductions.length ? rows(item.deductions) : [{ label: 'None', value: '—' }]}
        total={{ label: 'Total deductions', value: money.inr(item.total_deductions) }}
      />
      {item.employer.length ? (
        <SummaryCard title="Paid by the company" rows={rows(item.employer)} total={{ label: 'Employer contributions', value: money.inr(sumLines(item.employer)) }} />
      ) : null}

      <View style={styles.actions}>
        {draft && !self ? <Button title="Edit line" variant="accent" icon={<Pencil size={18} color={palette.text} />} onPress={() => setEditing(true)} /> : null}
        <Button title={draft ? 'Payslip PDF (draft)' : 'Payslip PDF'} variant="ghost" icon={<FileDown size={18} color={palette.text} />} loading={pdfBusy} onPress={() => void pdf()} />
      </View>
      {draft && self ? (
        <Text variant="caption" muted align="center">
          You can’t change your own pay line. Ask another HR admin.
        </Text>
      ) : !draft ? (
        <Text variant="caption" muted align="center">
          This month is locked. Corrections go into a later month as an adjustment.
        </Text>
      ) : (
        <Text variant="caption" muted align="center">
          Saving a change recalculates the whole month. Nobody is messaged.
        </Text>
      )}

      {draft && !self ? <EditLineSheet key={`${item.id}:${item.lop_override}:${item.adjustments.length}`} visible={editing} runId={run.id} item={item} onClose={() => setEditing(false)} /> : null}
    </Screen>
  );
}

type Draft = { id?: string; label: string; type: 'earning' | 'deduction'; amount: string; taxable: boolean };

function EditLineSheet({ visible, runId, item, onClose }: { visible: boolean; runId: string; item: PayrollItem; onClose: () => void }) {
  const { saveLine } = usePayrollRunActions();
  const calculated = item.lop_override == null;
  const [useCalc, setUseCalc] = useState(calculated);
  const [lop, setLop] = useState(item.lop_override ?? item.lop_days);
  const [adj, setAdj] = useState<Draft[]>(() =>
    item.adjustments.map((a) => ({ id: a.id, label: a.label, type: a.type, amount: String(a.amount), taxable: a.taxable !== false })),
  );
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Draft>) => setAdj((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const bad = adj.findIndex((a) => a.label.trim().length < 3 || !rupeesOf(a.amount));
  const dirty = useCalc !== calculated || (!useCalc && lop !== item.lop_override) || JSON.stringify(adj) !== JSON.stringify(item.adjustments.map((a) => ({ id: a.id, label: a.label, type: a.type, amount: String(a.amount), taxable: a.taxable !== false })));

  const save = async () => {
    setError(null);
    const adjustments: Adjustment[] = adj.map((a) => ({
      ...(a.id ? { id: a.id } : {}),
      label: a.label.trim(),
      type: a.type,
      amount: rupeesOf(a.amount) ?? 0,
      ...(a.type === 'earning' ? { taxable: a.taxable } : {}),
    }));
    try {
      await saveLine.mutateAsync({ runId, itemId: item.id, input: { lop_override: useCalc ? null : lop, adjustments } });
      toast.show(`${item.employee_name}: line updated. The month was recalculated.`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={saveLine.isPending ? () => {} : onClose}
      dirty={dirty}
      title="Edit line"
      subtitle={`${item.employee_name} · ${item.days_in_month} days in the month`}
      footer={
        <>
          {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
          <ActionRow context="sheet">
            <Button title="Cancel" variant="accent" onPress={onClose} disabled={saveLine.isPending} />
            <Button title="Save line" onPress={() => void save()} loading={saveLine.isPending} disabled={!dirty || bad >= 0} />
          </ActionRow>
        </>
      }>
      <ToggleRow
        label="Use the calculated loss of pay"
        sub={calculated ? `Now ${fmtDays(item.lop_days)} unpaid ${noun(item.lop_days, 'day')}, from leave and attendance` : 'From leave and attendance (now set by HR)'}
        value={useCalc}
        onChange={setUseCalc}
      />
      {!useCalc ? (
        <Stepper label="Unpaid days" value={lop} onChange={setLop} min={0} max={item.days_in_month} unit={noun(lop, 'day')} hint="Set by HR — replaces the calculated number" />
      ) : null}

      <Text variant="labelStrong" muted>
        Adjustments
      </Text>
      <Text variant="caption" muted>
        Arrears, bonus, recoveries. At most 20.
      </Text>
      {adj.map((a, i) => (
        <View key={i} style={styles.adj}>
          <View style={styles.adjHead}>
            <Text variant="labelStrong" style={styles.flex}>
              {`Adjustment ${i + 1}`}
            </Text>
            <IconButton accessibilityLabel={`Remove adjustment ${i + 1}`} tone="surface" size={40} onPress={() => setAdj((list) => list.filter((_, j) => j !== i))}>
              <Trash2 size={18} color={palette.dangerInk} />
            </IconButton>
          </View>
          <Segmented
            options={[
              { key: 'earning', label: 'Add to pay' },
              { key: 'deduction', label: 'Take away' },
            ]}
            value={a.type}
            onChange={(k) => set(i, { type: k })}
          />
          <PillField label="Label" value={a.label} onChangeText={(v) => set(i, { label: v.slice(0, 60) })} placeholder="e.g. Arrears for August" error={a.label && a.label.trim().length < 3 ? 'At least 3 letters' : null} />
          <PillField
            label="Amount"
            value={a.amount}
            onChangeText={(v) => set(i, { amount: moneyTyping(v) })}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0.00"
            trailing={<Text variant="label" muted>₹</Text>}
            error={a.amount && !rupeesOf(a.amount) ? 'Rupees, up to 2 decimals' : null}
          />
          {a.type === 'earning' ? <ToggleRow label="Taxable" sub="Counts towards income tax" value={a.taxable} onChange={(v) => set(i, { taxable: v })} /> : null}
        </View>
      ))}
      <Button
        title="Add adjustment"
        variant="ghost"
        icon={<Plus size={18} color={palette.text} />}
        disabled={adj.length >= 20}
        onPress={() => setAdj((list) => [...list, { label: '', type: 'earning', amount: '', taxable: true }])}
      />
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  actions: { gap: space.sm },
  adj: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: palette.surfaceSunken },
  adjHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
}));
