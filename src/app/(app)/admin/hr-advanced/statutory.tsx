// Statutory and TDS editor — the website's StatutorySettings (dash.html:5239) on a phone:
//   GET /hr/statutory, PUT /hr/statutory (hr_payroll.js ~L62–73, the 'tax' module; Super Admin and HR)
// The same fields and the same body as the website (features/hradvanced/statutory-model), checked
// with the server's own rules before sending. A typo here changes everyone's tax, so:
//   - every change is listed on a ConfirmSheet before the swipe;
//   - the swipe stays locked until CHANGE TAX is typed;
//   - the settings are read again just before saving, and if someone else changed them since this
//     screen opened, nothing is sent until the latest values are loaded;
//   - what a switched-on section still lacks is shown live, because payroll refuses to run then.
// Nobody is messaged (hr_payroll.js sends nothing).

import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useHrMe } from '@/api/me';
import { type Statutory, type TaxRegime, useStatutory } from '@/api/payroll';
import { payrollSetupGates } from '@/features/hradvanced/access';
import { fetchStatutory, useStatutorySave } from '@/features/hradvanced/api';
import {
  addTdsSlab,
  bodyOfStatutory,
  decimalTyping,
  type DraftRegime,
  type DraftStatutory,
  draftOfStatutory,
  fieldErrors,
  hiddenErrorSections,
  type FieldErrors,
  missingOf,
  newPtSlab,
  type Rounding,
  STATUTORY_PHRASE,
  statutoryChanges,
} from '@/features/hradvanced/statutory-model';
import { errorText, FieldGroup, GateFallback, TypeToConfirm, typedMatches } from '@/features/hradvanced/ui';
import { ToggleRow } from '@/features/hrtime/ui';
import { useAccess } from '@/lib/use-access';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActionBar, Banner, Button, Card, ConfirmSheet, NavHeader, PillField, Screen, Segmented, SkeletonList, SummaryCard, Text, toast } from '@/ui';

export default function StatutoryEditorScreen() {
  const access = useAccess();
  const hrQ = useHrMe();
  const allowed = payrollSetupGates(access.hr, access.user).statutory;
  const q = useStatutory(allowed);
  const header = <NavHeader title="Statutory and TDS" />;
  if (!allowed) return <GateFallback pending={hrQ.isPending} header={header} />;
  if (q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={5} tone="surface" />
      </Screen>
    );
  }
  if (q.error || !q.data) {
    return (
      <Screen header={header}>
        <Banner tone="danger" title="Couldn’t load" message={errorText(q.error)} action={{ label: 'Retry', onPress: () => void q.refetch() }} />
      </Screen>
    );
  }
  return <Editor key={JSON.stringify(q.data.statutory)} header={header} base={q.data.statutory} onReload={() => q.refetch()} />;
}

function Editor({ header, base, onReload }: { header: React.ReactNode; base: Statutory; onReload: () => Promise<unknown> }) {
  const save = useStatutorySave();
  const [d, setD] = useState<DraftStatutory>(() => draftOfStatutory(base));
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tried, setTried] = useState(false);

  const errs = fieldErrors(d);
  const hasErrors = Object.keys(errs).length > 0;
  const hiddenErrs = hiddenErrorSections(d, errs);
  const body = bodyOfStatutory(d);
  const missing = hasErrors ? [] : missingOf(body);
  const changes = hasErrors ? [] : statutoryChanges(base, body);
  const show = (k: string) => (tried ? (errs[k] ?? null) : null);

  const set = <S extends 'pf' | 'esi'>(sec: S, patch: Partial<DraftStatutory[S]>) => setD((x) => ({ ...x, [sec]: { ...x[sec], ...patch } }));
  const setRegime = (k: 'new' | 'old', patch: Partial<DraftRegime>) => setD((x) => ({ ...x, tds: { ...x.tds, regimes: { ...x.tds.regimes, [k]: { ...x.tds.regimes[k], present: true, ...patch } } } }));

  const review = async () => {
    setTried(true);
    if (hasErrors) {
      toast.show('Fix the fields marked in red first.', 'danger');
      return;
    }
    if (!changes.length && JSON.stringify(body) === JSON.stringify(bodyOfStatutory(draftOfStatutory(base)))) {
      toast.show('Nothing has changed.', 'info');
      return;
    }
    setError(null);
    setTyped('');
    setChecking(true);
    try {
      const fresh = await fetchStatutory();
      // Compared through the same form round trip, so number formatting never counts as a change.
      setStale(JSON.stringify(bodyOfStatutory(draftOfStatutory(fresh.statutory))) !== JSON.stringify(bodyOfStatutory(draftOfStatutory(base))));
      setConfirming(true);
    } catch (e) {
      // Without the fresh read nobody can tell whether someone else saved meanwhile: offer nothing.
      toast.show(`Couldn’t check for other changes: ${errorText(e)}`, 'danger');
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    setError(null);
    try {
      const r = await save.mutateAsync(body);
      setConfirming(false);
      const left = r.missing ?? missing;
      toast.show(left.length ? `Saved. Still missing: ${left.join(', ')}` : 'Saved. Payroll uses these from the next run.', left.length ? 'info' : 'success');
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Screen
      header={header}
      onRefresh={onReload}
      footer={
        <ActionBar note={tried && hasErrors ? 'Fix the fields marked in red.' : null}>
          <Button title="Review changes" icon={<Save />} onPress={() => void review()} loading={checking} />
        </ActionBar>
      }>
      <Banner
        tone="warning"
        title="Confirm every value with your CA"
        message="No rates or slabs are built in. A section that is switched on but incomplete stops payroll from running — nothing is guessed."
      />
      {tried && hiddenErrs.length ? (
        <Banner
          tone="danger"
          title="A switched-off section has a value that can’t be saved"
          message={`${hiddenErrs.join(', ')}: switch it on (or pick “From slabs” for income tax) and fix the field marked in red, then switch it off again.`}
        />
      ) : null}
      {missing.length ? <Banner tone="danger" title="Payroll can’t run until these are filled in" message={missing.join(', ')} /> : null}

      <Card>
        <View style={styles.stack}>
          <ToggleRow label="Provident Fund" sub="PF deducted from pay and paid by the company" value={d.pf.enabled} onChange={(v) => set('pf', { enabled: v })} />
          {d.pf.enabled ? (
            <>
              <PctField label="Employee share" value={d.pf.employeeRatePct} onChange={(v) => set('pf', { employeeRatePct: v })} error={show('pf.employeeRatePct')} />
              <PctField label="Company share" value={d.pf.employerRatePct} onChange={(v) => set('pf', { employerRatePct: v })} error={show('pf.employerRatePct')} />
              <ToggleRow label="Cap the PF wage" sub="Work PF out on no more than the ceiling below" value={d.pf.capAtCeiling} onChange={(v) => set('pf', { capAtCeiling: v })} />
              <MoneyField label="Wage ceiling" unit="₹ a month" value={d.pf.wageCeiling} onChange={(v) => set('pf', { wageCeiling: v })} error={show('pf.wageCeiling')} />
              <RoundingPicker value={d.pf.rounding} onChange={(v) => set('pf', { rounding: v })} />
            </>
          ) : null}
        </View>
      </Card>

      <Card>
        <View style={styles.stack}>
          <ToggleRow label="ESI" sub="Employees’ State Insurance" value={d.esi.enabled} onChange={(v) => set('esi', { enabled: v })} />
          {d.esi.enabled ? (
            <>
              <PctField label="Employee share" value={d.esi.employeeRatePct} onChange={(v) => set('esi', { employeeRatePct: v })} error={show('esi.employeeRatePct')} />
              <PctField label="Company share" value={d.esi.employerRatePct} onChange={(v) => set('esi', { employerRatePct: v })} error={show('esi.employerRatePct')} />
              <MoneyField label="Applies when monthly gross is up to" unit="₹" value={d.esi.grossLimit} onChange={(v) => set('esi', { grossLimit: v })} error={show('esi.grossLimit')} />
              <RoundingPicker value={d.esi.rounding} onChange={(v) => set('esi', { rounding: v })} />
            </>
          ) : null}
        </View>
      </Card>

      <Card>
        <View style={styles.stack}>
          <ToggleRow label="Professional tax" sub="A set amount by state and monthly gross" value={d.pt.enabled} onChange={(v) => setD((x) => ({ ...x, pt: { ...x.pt, enabled: v } }))} />
          {d.pt.enabled ? (
            <>
              {d.pt.slabs.map((s, i) => (
                <View key={s.key} style={styles.slab}>
                  <View style={styles.slabHead}>
                    <Text variant="labelStrong" style={styles.flex}>
                      Slab {i + 1}
                    </Text>
                    <Button
                      title="Remove"
                      size="sm"
                      variant="danger"
                      icon={<Trash2 />}
                      accessibilityLabel={`Remove professional tax slab ${i + 1}`}
                      onPress={() => setD((x) => ({ ...x, pt: { ...x.pt, slabs: x.pt.slabs.filter((z) => z.key !== s.key) } }))}
                    />
                  </View>
                  <PillField
                    label="State"
                    value={s.state}
                    onChangeText={(v) => setD((x) => ({ ...x, pt: { ...x.pt, slabs: x.pt.slabs.map((z) => (z.key === s.key ? { ...z, state: v.slice(0, 30) } : z)) } }))}
                    autoCapitalize="characters"
                    placeholder="TELANGANA"
                    error={show(`pt.${i}.state`)}
                  />
                  <View style={styles.pair}>
                    <View style={styles.flex}>
                      <MoneyField label="Gross from" unit="₹" value={s.minGross} onChange={(v) => setD((x) => ({ ...x, pt: { ...x.pt, slabs: x.pt.slabs.map((z) => (z.key === s.key ? { ...z, minGross: v } : z)) } }))} error={show(`pt.${i}.minGross`)} />
                    </View>
                    <View style={styles.flex}>
                      <MoneyField label="Gross to" unit="₹" placeholder="No limit" value={s.maxGross} onChange={(v) => setD((x) => ({ ...x, pt: { ...x.pt, slabs: x.pt.slabs.map((z) => (z.key === s.key ? { ...z, maxGross: v } : z)) } }))} error={show(`pt.${i}.maxGross`)} />
                    </View>
                  </View>
                  <MoneyField label="Professional tax" unit="₹ a month" value={s.amount} onChange={(v) => setD((x) => ({ ...x, pt: { ...x.pt, slabs: x.pt.slabs.map((z) => (z.key === s.key ? { ...z, amount: v } : z)) } }))} error={show(`pt.${i}.amount`)} />
                </View>
              ))}
              <Button title="Add a slab" variant="ghost" icon={<Plus />} onPress={() => setD((x) => ({ ...x, pt: { ...x.pt, slabs: [...x.pt.slabs, newPtSlab()] } }))} />
            </>
          ) : null}
        </View>
      </Card>

      <Card>
        <View style={styles.stack}>
          <FieldGroup title="Income tax (TDS)">
            <Segmented
              options={[
                { key: 'off', label: 'Off' },
                { key: 'manual', label: 'Set amount' },
                { key: 'slab', label: 'From slabs' },
              ]}
              value={d.tds.mode}
              onChange={(m) => setD((x) => ({ ...x, tds: { ...x.tds, mode: m } }))}
            />
          </FieldGroup>
          {d.tds.mode === 'manual' ? (
            <Text variant="caption" muted>
              Each person’s monthly TDS is set on their tax profile (Payroll › Salaries).
            </Text>
          ) : null}
          {d.tds.mode === 'slab' ? (
            <FieldGroup title="Default regime" hint="Used for anyone whose tax profile says “Company default”.">
              <Segmented<'none' | TaxRegime>
                options={[
                  { key: 'new', label: 'New' },
                  { key: 'old', label: 'Old' },
                  { key: 'none', label: 'Not set' },
                ]}
                value={d.tds.defaultRegime ?? 'none'}
                onChange={(k) => setD((x) => ({ ...x, tds: { ...x.tds, defaultRegime: k === 'none' ? null : k } }))}
              />
            </FieldGroup>
          ) : null}
        </View>
      </Card>
      {d.tds.mode === 'slab' ? (['new', 'old'] as const).map((k) => <RegimeCard key={k} which={k} r={d.tds.regimes[k]} errs={tried ? errs : {}} onChange={(p) => setRegime(k, p)} />) : null}
      {d.tds.mode === 'slab' ? (
        <Text variant="caption" muted align="center">
          Not calculated: surcharge and marginal relief. Check high earners by hand.
        </Text>
      ) : null}

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Change statutory settings?"
        subtitle="Everyone’s pay from the next payroll run"
        confirmLabel="Swipe to save"
        onConfirm={() => void submit()}
        loading={save.isPending}
        disabled={stale || !typedMatches(typed, STATUTORY_PHRASE)}
        note="Locked payroll runs never change. Nobody is messaged.">
        {stale ? (
          <Banner
            tone="danger"
            title="Someone else changed these settings"
            message="They were saved by someone else after you opened this screen. Load the latest values and make your change again."
            action={{
              label: 'Load the latest',
              onPress: () => {
                setConfirming(false);
                void onReload();
              },
            }}
          />
        ) : null}
        <SummaryCard
          title={changes.length ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}` : 'Changes'}
          rows={(changes.length ? changes : ['Only values in switched-off sections changed']).slice(0, 24).map((t, i) => ({ key: String(i), label: t }))}
        />
        {missing.length ? <Banner tone="warning" title="Payroll will refuse to run until these are filled in" message={missing.join(', ')} /> : null}
        <TypeToConfirm phrase={STATUTORY_PHRASE} value={typed} onChange={setTyped} />
        {error ? <Banner tone="danger" title="Couldn’t save" message={error} icon={RefreshCw} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

function RegimeCard({ which, r, errs, onChange }: { which: 'new' | 'old'; r: DraftRegime; errs: FieldErrors; onChange: (p: Partial<DraftRegime>) => void }) {
  const p = `tds.${which}`;
  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="heading">{which === 'new' ? 'New regime' : 'Old regime'} (a year)</Text>
        {!r.present ? (
          <Text variant="caption" muted>
            Not filled in yet. Payroll can’t calculate tax from slabs until it is.
          </Text>
        ) : null}
        <MoneyField label="Standard deduction" unit="₹" value={r.standardDeduction} onChange={(v) => onChange({ standardDeduction: v })} error={errs[`${p}.standardDeduction`]} />
        <MoneyField label="Rebate if taxable income is up to" unit="₹" value={r.rebateLimit} onChange={(v) => onChange({ rebateLimit: v })} error={errs[`${p}.rebateLimit`]} />
        <MoneyField label="Rebate up to" unit="₹" value={r.rebateMax} onChange={(v) => onChange({ rebateMax: v })} error={errs[`${p}.rebateMax`]} />
        <PctField label="Cess" value={r.cessPct} onChange={(v) => onChange({ cessPct: v })} error={errs[`${p}.cessPct`]} />
        <FieldGroup title="Slabs (taxable income a year)" hint={errs[p] ?? null}>
          {r.slabs.map((s, i, a) => {
            const last = i === a.length - 1;
            return (
              <View key={s.key} style={styles.pairEnd}>
                <View style={styles.flex}>
                  {last ? (
                    <PillField label={`Slab ${i + 1}`} value="Above that" editable={false} />
                  ) : (
                    <MoneyField label={`Slab ${i + 1} up to`} unit="₹" value={s.upto} onChange={(v) => onChange({ slabs: r.slabs.map((z) => (z.key === s.key ? { ...z, upto: v } : z)) })} error={errs[`${p}.slab.${i}.upto`]} />
                  )}
                </View>
                <View style={styles.rate}>
                  <PctField label="Rate" value={s.ratePct} onChange={(v) => onChange({ slabs: r.slabs.map((z) => (z.key === s.key ? { ...z, ratePct: v } : z)) })} error={errs[`${p}.slab.${i}.ratePct`]} />
                </View>
                {a.length > 1 ? (
                  <Button title="Remove" size="sm" variant="danger" icon={<Trash2 />} accessibilityLabel={`Remove slab ${i + 1}`} onPress={() => onChange({ slabs: r.slabs.filter((z) => z.key !== s.key) })} />
                ) : null}
              </View>
            );
          })}
          <Button title="Add a slab" variant="ghost" icon={<Plus />} onPress={() => onChange(addTdsSlab(r))} disabled={r.slabs.length >= 15} />
        </FieldGroup>
      </View>
    </Card>
  );
}

function MoneyField({ label, unit, value, onChange, error, placeholder }: { label: string; unit: string; value: string; onChange: (v: string) => void; error?: string | null; placeholder?: string }) {
  return (
    <PillField
      label={label}
      value={value}
      onChangeText={(v) => onChange(decimalTyping(v))}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder={placeholder ?? 'Confirm with your CA'}
      trailing={<Text variant="label" muted>{unit}</Text>}
      error={error ?? null}
    />
  );
}

function PctField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <PillField
      label={label}
      value={value}
      onChangeText={(v) => onChange(decimalTyping(v, 3))}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder="—"
      trailing={<Text variant="label" muted>%</Text>}
      error={error ?? null}
    />
  );
}

function RoundingPicker({ value, onChange }: { value: Rounding; onChange: (v: Rounding) => void }) {
  return (
    <FieldGroup title="Rounding">
      <Segmented<'nearest' | 'up' | 'none'>
        options={[
          { key: 'nearest', label: 'Nearest ₹' },
          { key: 'up', label: 'Up' },
          { key: 'none', label: 'Not set' },
        ]}
        value={value ?? 'none'}
        onChange={(k) => onChange(k === 'none' ? null : k)}
      />
    </FieldGroup>
  );
}

const styles = themedStyles(() => ({
  stack: { gap: space.md },
  slab: { gap: space.sm, paddingTop: space.sm },
  slabHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pairEnd: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-end' },
  flex: { flex: 1, minWidth: 140 },
  rate: { width: 110, flexGrow: 1 },
}));
