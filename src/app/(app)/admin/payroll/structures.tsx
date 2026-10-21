// Salary structures — the website's SalaryStructures (dash.html :5167), read-only on the phone:
//   GET    /hr/salary/structures          the active structures
//   POST   /hr/salary/structures/preview  "Try a CTC" (read-only on the server)
//   DELETE /hr/salary/structures/:id      retire (existing salaries keep their own copy)
// hr_payroll.js ~L106–160. The component editor (an 8-column grid with linked rules) stays on the
// website (spec §4.3). Retiring has no way back in the app or on the website, so it goes through
// ConfirmSheet + SwipeToConfirm. Nobody is messaged.

import { router } from 'expo-router';
import { Archive, Layers } from 'lucide-react-native';
import { useState } from 'react';

import { type SalaryStructure, useSalaryActions, useSalaryStructures, useStructurePreview } from '@/api/payroll';
import { calcWords, errorText, GateFallback, moneyTyping, rupeesOf, usePayrollGate, usePayView } from '@/features/payroll/ui';
import { inr } from '@/lib/format';
import { ActivityList, ActivityRow, Banner, Button, ConfirmSheet, NavHeader, PillField, Screen, Sheet, SummaryCard, Text, toast } from '@/ui';

export default function StructuresScreen() {
  const { pending, allowed } = usePayrollGate('structures');
  const { eye } = usePayView();
  const q = useSalaryStructures(allowed);
  const [openId, setOpenId] = useState<string | null>(null);
  const header = <NavHeader title="Salary structures" actions={allowed ? [eye] : undefined} />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;
  const list: SalaryStructure[] = Array.isArray(q.data) ? q.data : [];
  const open = list.find((s) => s.id === openId) ?? null;

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {q.error && !q.data ? (
        <Banner tone="danger" title="Couldn’t load structures" message={errorText(q.error)} action={{ label: 'Retry', onPress: () => void q.refetch() }} />
      ) : null}
      <ActivityList title="Active structures" loading={q.isPending} empty={q.error ? 'Couldn’t load the structures.' : 'No structures yet. Tap “Create or edit” to add the first one.'}>
        {list.map((s) => (
          <ActivityRow
            key={s.id}
            module="pay"
            icon={Layers}
            title={s.name}
            subtitle={s.description || null}
            note={`${s.components.length} ${s.components.length === 1 ? 'part' : 'parts'}: ${s.components.map((c) => c.code).join(' · ')}`}
            chevron
            onPress={() => setOpenId(s.id)}
            accessibilityHint="Shows its parts and lets you try a CTC"
          />
        ))}
      </ActivityList>
      <Button variant="text" title="Create or edit" onPress={() => router.push('/admin/hr-advanced/structures')} />
      <Text variant="caption" muted align="center">
        Changing a structure never changes anyone’s current salary.
      </Text>
      {open ? <StructureSheet key={open.id} structure={open} onClose={() => setOpenId(null)} /> : null}
    </Screen>
  );
}

function StructureSheet({ structure, onClose }: { structure: SalaryStructure; onClose: () => void }) {
  const { money } = usePayView();
  const { retireStructure } = useSalaryActions();
  const [ctc, setCtc] = useState('600000');
  const [retiring, setRetiring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = rupeesOf(ctc);
  const preview = useStructurePreview(structure.components, amount, !retiring);

  const retire = async () => {
    setError(null);
    try {
      await retireStructure.mutateAsync(structure.id);
      toast.show(`“${structure.name}” retired. Existing salaries are unchanged.`);
      setRetiring(false);
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <>
      <Sheet
        visible={!retiring}
        onClose={onClose}
        title={structure.name}
        subtitle={structure.description || undefined}
        footer={<Button title="Retire structure" variant="danger" icon={<Archive />} onPress={() => setRetiring(true)} />}>
        <SummaryCard
          title="Parts"
          rows={structure.components.map((c) => ({
            key: c.code,
            label: `${c.name} · ${c.code}`,
            value: calcWords(c, (n) => inr(n, { decimals: false })),
            hint: [c.kind === 'employer' ? 'Paid by the company' : c.taxable ? 'Taxable' : 'Not taxable', c.pf_wage ? 'Counts for PF' : null].filter(Boolean).join(' · '),
          }))}
        />
        <PillField
          label="Try an annual salary (CTC)"
          value={ctc}
          onChangeText={(v) => setCtc(moneyTyping(v))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          trailing={<Text variant="label" muted>₹ a year</Text>}
          error={ctc && !amount ? 'Rupees, up to 2 decimals' : null}
        />
        {preview.data ? (
          <SummaryCard
            title={`${money.inr(preview.data.monthlyCtc)} a month`}
            rows={preview.data.lines.map((l) => ({ key: l.code, label: l.name, value: money.inr(l.amount), hint: l.kind === 'employer' ? 'Paid by the company' : null }))}
            total={{ label: 'Gross pay', value: money.inr(preview.data.gross) }}
          />
        ) : preview.error ? (
          <Banner tone="danger" title="That salary doesn’t fit" message={errorText(preview.error)} />
        ) : null}
      </Sheet>
      <ConfirmSheet
        visible={retiring}
        onClose={() => setRetiring(false)}
        title="Retire this structure?"
        subtitle={structure.name}
        confirmLabel="Swipe to retire"
        onConfirm={() => void retire()}
        loading={retireStructure.isPending}
        note="Can’t be brought back. Nobody is messaged.">
        <SummaryCard
          rows={[
            { label: 'Existing salaries', value: 'Unchanged — each keeps its own copy' },
            { label: 'New salaries', value: 'Can’t use it any more' },
            { label: 'Undo', value: 'Not possible' },
          ]}
        />
        {error ? <Banner tone="danger" title="Couldn’t retire" message={error} /> : null}
      </ConfirmSheet>
    </>
  );
}
