// One person's salary and tax profile — the website's SalaryPeople "Set salary / Revise" and "Tax"
// forms (dash.html :5205–5238), plus the revision removal the website never offers:
//   GET    /hr/salary/people                      (the person is read from the list)
//   POST   /hr/salary/assign                      {employee_id, structure_id, annual_ctc, effective_from}
//   DELETE /hr/salary/assign/:id                  hard delete; 409 once a locked month used it
//   PUT    /hr/salary/people/:employeeId/profile  {regime, declarations, pt_state, pf_enabled, tds_monthly}
//   POST   /hr/salary/structures/preview          the live preview of the new salary
// hr_payroll.js ~L173–255. Nobody sets their own pay (dash.html :5235, server notSelf): your own row
// shows no actions. A new salary revision can't be edited afterwards (only removed until it is used in a
// locked month), so it goes through ConfirmSheet + SwipeToConfirm; so does removing one. The tax
// profile can be changed again at any time, so it saves with a plain button. Nobody is messaged.

import { useLocalSearchParams } from 'expo-router';
import { ArrowRight, BadgeIndianRupee, Percent, Trash2, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  type ProfileInput,
  type SalaryPerson,
  type SalaryRevision,
  type TaxRegime,
  useSalaryActions,
  useSalaryPeople,
  useSalaryStructures,
  useStructurePreview,
} from '@/api/payroll';
import { useTodayIst } from '@/features/attendance/use-now';
import { ToggleRow } from '@/features/hrtime/ui';
import { isSelf } from '@/features/payroll/access';
import { errorText, GateFallback, moneyTyping, rupeesOf, usePayrollGate, usePayView } from '@/features/payroll/ui';
import { dateLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  ConfirmSheet,
  DateField,
  ErrorState,
  NavHeader,
  PillField,
  Screen,
  Segmented,
  SelectField,
  Sheet,
  SkeletonList,
  SummaryCard,
  Text,
  toast,
} from '@/ui';

export default function SalaryPersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useTodayIst();
  const { pending, allowed, access } = usePayrollGate('salaries');
  const { money, eye } = usePayView();
  const q = useSalaryPeople(allowed);
  const { removeRevision } = useSalaryActions();
  const [sheet, setSheet] = useState<'revise' | 'tax' | null>(null);
  const [removing, setRemoving] = useState<SalaryRevision | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const person: SalaryPerson | null = (Array.isArray(q.data) ? q.data : []).find((p) => p.id === id) ?? null;
  const header = <NavHeader title={person?.name ?? 'Salary'} actions={allowed ? [eye] : undefined} />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;
  if (q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={5} tone="surface" />
      </Screen>
    );
  }
  if (q.error || !person) {
    return (
      <Screen header={header}>
        <ErrorState message={errorText(q.error, 'This person is not in your company.')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const self = isSelf(person.id, access.user);
  const sal = person.salary;
  const p = person.profile;
  const earnings = sal?.lines.filter((l) => l.kind === 'earning') ?? [];
  const employer = sal?.lines.filter((l) => l.kind === 'employer') ?? [];
  const revisions = [...person.revisions].sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  const remove = async () => {
    if (!removing) return;
    setRemoveError(null);
    try {
      await removeRevision.mutateAsync(removing.id);
      toast.show('Salary revision removed.');
      setRemoving(null);
    } catch (e) {
      setRemoveError(errorText(e));
    }
  };

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {notice ? <Banner tone="warning" title="Saved — check locked months" message={notice} action={{ label: 'OK', onPress: () => setNotice(null) }} /> : null}
      {sal ? (
        <SummaryCard
          title="Current salary"
          rows={[
            { label: 'Team', value: person.department || 'No team' },
            { label: 'Structure', value: sal.structure_name },
            { label: 'Since', value: dateLabel(sal.effective_from, today) },
            { label: 'Monthly CTC', value: money.inr(sal.monthly_ctc) },
            { label: 'Monthly gross', value: money.inr(sal.monthly_gross) },
          ]}
          total={{ label: 'Annual CTC', value: money.inr(sal.annual_ctc) }}
        />
      ) : (
        <Banner tone="info" title="No salary yet" message={`${person.name} isn’t in any payroll until a salary is set. The first salary date counts as the joining date.`} />
      )}
      {earnings.length ? <SummaryCard title="Each month" rows={earnings.map((l) => ({ key: l.code, label: l.name, value: money.inr(l.amount), hint: l.taxable ? null : 'Not taxable' }))} total={{ label: 'Gross', value: money.inr(sal?.monthly_gross) }} /> : null}
      {employer.length ? <SummaryCard title="Paid by the company" rows={employer.map((l) => ({ key: l.code, label: l.name, value: money.inr(l.amount) }))} /> : null}

      <SummaryCard
        title="Tax profile"
        rows={[
          { label: 'Tax regime', value: p.regime ? (p.regime === 'new' ? 'New' : 'Old') : 'Company default' },
          { label: 'Old-regime deductions', value: p.declarations ? `${money.inr(p.declarations, { decimals: false })} a year` : 'None' },
          { label: 'Professional tax state', value: p.pt_state || 'Not set' },
          { label: 'PF', value: p.pf_enabled ? 'Deducted' : 'Not deducted' },
          { label: 'Manual TDS', value: p.tds_monthly ? `${money.inr(p.tds_monthly)} a month` : 'None' },
        ]}
      />

      {revisions.length ? (
        <ActivityList title="Salary history">
          {revisions.map((r) => (
            <ActivityRow
              key={r.id}
              module="pay"
              icon={BadgeIndianRupee}
              title={`From ${dateLabel(r.effective_from, today)}`}
              subtitle={r.structure_name}
              value={money.compact(r.annual_ctc)}
              meta="a year"
              right={
                self ? undefined : (
                  <Button
                    title="Remove"
                    size="sm"
                    variant="danger"
                    icon={<Trash2 size={16} color={palette.dangerInk} />}
                    accessibilityLabel={`Remove the salary from ${dateLabel(r.effective_from, today)}`}
                    onPress={() => {
                      setRemoveError(null);
                      setRemoving(r);
                    }}
                  />
                )
              }
            />
          ))}
        </ActivityList>
      ) : null}

      {self ? (
        <Text variant="caption" muted align="center">
          You can’t change your own pay records. Ask another HR admin.
        </Text>
      ) : (
        <View style={styles.actions}>
          <Button title={sal ? 'Revise salary' : 'Set salary'} icon={<Wallet size={18} color={palette.onPrimary} />} onPress={() => setSheet('revise')} />
          <Button title="Tax profile" variant="accent" icon={<Percent size={18} color={palette.text} />} onPress={() => setSheet('tax')} />
        </View>
      )}

      {!self ? (
        <ReviseFlow
          key={sal?.id ?? 'none'}
          visible={sheet === 'revise'}
          person={person}
          today={today}
          onClose={() => setSheet(null)}
          onSaved={(warning) => {
            setSheet(null);
            if (warning) setNotice(warning);
          }}
        />
      ) : null}
      {!self ? <TaxSheet key={JSON.stringify(p)} visible={sheet === 'tax'} person={person} onClose={() => setSheet(null)} /> : null}

      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove this salary revision?"
        subtitle={person.name}
        confirmLabel="Swipe to remove"
        onConfirm={() => void remove()}
        loading={removeRevision.isPending}
        note="Can’t be undone. Nobody is messaged.">
        <SummaryCard
          rows={[
            { label: 'From', value: removing ? dateLabel(removing.effective_from, today) : '' },
            { label: 'Structure', value: removing?.structure_name ?? '' },
            { label: 'Annual CTC', value: money.inr(removing?.annual_ctc) },
            {
              label: 'Afterwards',
              value:
                person.revisions.length <= 1
                  ? `${person.name} has no salary and drops out of payroll`
                  : removing && removing.id === sal?.id
                    ? 'The revision before it applies again'
                    : 'The current salary stays as it is',
            },
          ]}
        />
        {removeError ? <Banner tone="danger" title="Couldn’t remove" message={removeError} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

function ReviseFlow({ visible, person, today, onClose, onSaved }: { visible: boolean; person: SalaryPerson; today: string; onClose: () => void; onSaved: (warning: string | null) => void }) {
  const { money } = usePayView();
  const structures = useSalaryStructures(visible);
  const { assign } = useSalaryActions();
  const list = Array.isArray(structures.data) ? structures.data : [];
  const [structureId, setStructureId] = useState<string | null>(person.salary?.structure_id ?? null);
  const [ctc, setCtc] = useState(person.salary ? String(person.salary.annual_ctc) : '');
  const [effective, setEffective] = useState(today);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = list.find((s) => s.id === structureId) ?? null;
  const amount = rupeesOf(ctc);
  const preview = useStructurePreview(st?.components, amount, visible && !!st && !!amount);
  const ready = !!st && !!amount && amount > 0 && !!effective && !preview.error;

  const save = async () => {
    if (!st || !amount) return;
    setError(null);
    try {
      const r = await assign.mutateAsync({ employee_id: person.id, structure_id: st.id, annual_ctc: amount, effective_from: effective });
      setConfirm(false);
      toast.show(`${person.name}: salary saved.`);
      onSaved(r.warning ?? null);
    } catch (e) {
      setConfirm(false);
      setError(errorText(e));
    }
  };

  return (
    <>
      <Sheet
        visible={visible && !confirm}
        onClose={onClose}
        dirty={ctc !== (person.salary ? String(person.salary.annual_ctc) : '') || structureId !== (person.salary?.structure_id ?? null)}
        title={person.salary ? 'Revise salary' : 'Set salary'}
        subtitle={person.name}
        footer={
          <>
            {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
            <Button title="Review" onPress={() => setConfirm(true)} disabled={!ready || preview.isFetching} />
          </>
        }>
        <SelectField
          label="Salary structure"
          value={structureId}
          onChange={(v) => setStructureId(v)}
          options={list.map((s) => ({ value: s.id, label: s.name, hint: s.description || undefined }))}
          placeholder={structures.isPending ? 'Loading…' : 'Choose a structure'}
          error={structures.error ? errorText(structures.error) : null}
        />
        <PillField
          label="Annual CTC"
          value={ctc}
          onChangeText={(v) => setCtc(moneyTyping(v))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="e.g. 600000"
          trailing={<Text variant="label" muted>₹ a year</Text>}
          error={ctc && !amount ? 'Rupees, up to 2 decimals' : null}
          hint={amount ? `${money.inr(amount / 12)} a month` : null}
        />
        <DateField label="Takes effect from" value={effective} onChange={setEffective} hint="A person’s first salary date counts as their joining date for payroll." />
        {preview.data ? (
          <SummaryCard
            title="Each month"
            rows={preview.data.lines.filter((l) => l.kind === 'earning').map((l) => ({ key: l.code, label: l.name, value: money.inr(l.amount) }))}
            total={{ label: 'Gross', value: money.inr(preview.data.gross) }}
          />
        ) : preview.error ? (
          <Banner tone="danger" title="This CTC doesn’t fit the structure" message={errorText(preview.error)} />
        ) : st && amount ? (
          <Text variant="caption" muted>
            Working out the monthly pay…
          </Text>
        ) : null}
      </Sheet>
      <ConfirmSheet
        visible={visible && confirm}
        onClose={() => setConfirm(false)}
        title={person.salary ? 'Save the new salary?' : 'Set this salary?'}
        subtitle={person.name}
        from={{ title: person.salary ? money.compact(person.salary.annual_ctc) : 'No salary', subtitle: person.salary?.structure_name ?? 'Not in payroll', icon: Wallet, module: 'pay' }}
        to={{ title: amount ? money.compact(amount) : '—', subtitle: `From ${dateLabel(effective, today)}`, icon: ArrowRight, module: 'pay' }}
        confirmLabel="Swipe to save salary"
        onConfirm={() => void save()}
        loading={assign.isPending}
        note="It can’t be edited afterwards — only removed before a locked month uses it. Nobody is messaged.">
        <SummaryCard
          rows={[
            { label: 'Structure', value: st?.name ?? '' },
            { label: 'Annual CTC', value: money.inr(amount) },
            { label: 'Monthly gross', value: money.inr(preview.data?.gross) },
            { label: 'Takes effect', value: dateLabel(effective, today) },
          ]}
        />
      </ConfirmSheet>
    </>
  );
}

function TaxSheet({ visible, person, onClose }: { visible: boolean; person: SalaryPerson; onClose: () => void }) {
  const { saveProfile } = useSalaryActions();
  const p = person.profile;
  const [regime, setRegime] = useState<'default' | TaxRegime>(p.regime ?? 'default');
  const [decl, setDecl] = useState(p.declarations ? String(p.declarations) : '');
  const [pt, setPt] = useState(p.pt_state);
  const [pf, setPf] = useState(p.pf_enabled);
  const [tds, setTds] = useState(p.tds_monthly ? String(p.tds_monthly) : '');
  const [error, setError] = useState<string | null>(null);
  const declN = decl.trim() ? rupeesOf(decl) : 0;
  const tdsN = tds.trim() ? rupeesOf(tds) : 0;
  const ptOk = pt.trim() === '' || /^[A-Za-z][A-Za-z .-]{1,29}$/.test(pt.trim());
  const valid = declN !== null && tdsN !== null && ptOk;

  const save = async () => {
    if (!valid) return;
    setError(null);
    const input: ProfileInput = { regime: regime === 'default' ? null : regime, declarations: declN ?? 0, pt_state: pt.trim(), pf_enabled: pf, tds_monthly: tdsN ?? 0 };
    try {
      await saveProfile.mutateAsync({ employeeId: person.id, input });
      toast.show(`${person.name}: tax profile saved. It applies from the next calculation.`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={saveProfile.isPending ? () => {} : onClose}
      title="Tax profile"
      subtitle={person.name}
      footer={
        <>
          {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
          <Button title="Save" onPress={() => void save()} loading={saveProfile.isPending} disabled={!valid} />
        </>
      }>
      <Text variant="labelStrong" muted>
        Income-tax regime
      </Text>
      <Segmented
        options={[
          { key: 'default', label: 'Company' },
          { key: 'new', label: 'New' },
          { key: 'old', label: 'Old' },
        ]}
        value={regime}
        onChange={setRegime}
      />
      <PillField
        label="Old-regime deductions a year"
        value={decl}
        onChangeText={(v) => setDecl(moneyTyping(v))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0"
        trailing={<Text variant="label" muted>₹</Text>}
        hint="80C, 80D and the like. Used only under the old regime."
        error={declN === null ? 'Rupees, up to 2 decimals' : null}
      />
      <PillField
        label="Professional tax state"
        value={pt}
        onChangeText={(v) => setPt(v.slice(0, 30))}
        placeholder="e.g. TELANGANA"
        autoCapitalize="characters"
        hint="Empty means no professional tax is deducted (the line gets a warning)."
        error={ptOk ? null : 'A state name or code, letters only'}
      />
      <PillField
        label="Manual TDS a month"
        value={tds}
        onChangeText={(v) => setTds(moneyTyping(v))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0"
        trailing={<Text variant="label" muted>₹</Text>}
        hint="Used only when the company’s TDS is set to a manual amount."
        error={tdsN === null ? 'Rupees, up to 2 decimals' : null}
      />
      <ToggleRow label="PF applies" sub="Deduct Provident Fund from this person’s pay" value={pf} onChange={setPf} />
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  actions: { gap: space.sm },
}));
