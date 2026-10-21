// Salary-structure editor — the website's SalaryStructures form (dash.html:5167–5200) as a phone
// screen: one card per part instead of the 8-column grid. `id = new` creates one.
//   POST /hr/salary/structures       {name, description, components[1..20]}   409 on a duplicate name
//   PUT  /hr/salary/structures/:id   the same                                  existing salaries keep their copy
//   POST /hr/salary/structures/preview  the live "Try a CTC" (read-only on the server)
// The server's rules are checked on each row before sending (features/hradvanced/structure-model).
// Saving changes how new salaries are worked out, so it goes through ConfirmSheet + SwipeToConfirm,
// listing every change, and the swipe stays locked until the structure's name is typed. Nobody is
// messaged (hr_payroll.js sends nothing).

import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Save, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useHrMe } from '@/api/me';
import { type SalaryStructure, useSalaryStructures, useStructurePreview } from '@/api/payroll';
import { payrollSetupGates } from '@/features/hradvanced/access';
import { useStructureSave } from '@/features/hradvanced/api';
import {
  blankComp,
  bodyOf,
  CALC_OPTIONS,
  changesOf,
  componentsOf,
  type DraftComp,
  draftOf,
  type DraftStructure,
  KIND_OPTIONS,
  MAX_COMPONENTS,
  newStructureDraft,
  rowError,
  structureError,
} from '@/features/hradvanced/structure-model';
import { errorText, GateFallback, TypeToConfirm, typedMatches } from '@/features/hradvanced/ui';
import { ToggleRow } from '@/features/hrtime/ui';
import { usePayMoney } from '@/features/pay/privacy';
import { calcWords, moneyTyping, rupeesOf } from '@/features/payroll/ui';
import { inr } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  ActionBar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  FieldMessage,
  NavHeader,
  PillField,
  Screen,
  Segmented,
  SelectField,
  SkeletonList,
  SummaryCard,
  Text,
  toast,
} from '@/ui';

const words = (c: { calc: string; value: number }) => calcWords(c, (n) => inr(n, { decimals: !Number.isInteger(n) }));

export default function StructureEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const access = useAccess();
  const hrQ = useHrMe();
  const allowed = payrollSetupGates(access.hr, access.user).structures;
  const q = useSalaryStructures(allowed);
  const header = <NavHeader title={isNew ? 'New structure' : 'Edit structure'} />;
  if (!allowed) return <GateFallback pending={hrQ.isPending} header={header} />;
  if (!isNew && q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={4} tone="surface" />
      </Screen>
    );
  }
  const current = isNew ? null : ((Array.isArray(q.data) ? q.data : []).find((s) => s.id === id) ?? null);
  if (!isNew && !current) {
    return (
      <Screen header={header}>
        <Banner
          tone="danger"
          title={q.error ? 'Couldn’t load this structure' : 'This structure isn’t active any more'}
          message={q.error ? errorText(q.error) : 'It may have been retired by someone else.'}
          action={{ label: 'Back to structures', onPress: () => router.back() }}
        />
      </Screen>
    );
  }
  return <Editor key={current?.id ?? 'new'} header={header} current={current} />;
}

function Editor({ header, current }: { header: React.ReactNode; current: SalaryStructure | null }) {
  const money = usePayMoney();
  const save = useStructureSave();
  const [draft, setDraft] = useState<DraftStructure>(() => (current ? draftOf(current) : newStructureDraft()));
  const [ctc, setCtc] = useState('600000');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const problem = structureError(draft);
  const amount = rupeesOf(ctc);
  const preview = useStructurePreview(problem ? null : componentsOf(draft), amount, !problem);
  const changes = changesOf(current, draft, words);
  const phrase = draft.name.trim();

  const setComp = (key: string, patch: Partial<DraftComp>) => setDraft((d) => ({ ...d, components: d.components.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  const removeComp = (key: string) => setDraft((d) => ({ ...d, components: d.components.filter((c) => c.key !== key) }));
  const addComp = () => setDraft((d) => (d.components.length >= MAX_COMPONENTS ? d : { ...d, components: [...d.components, blankComp()] }));

  const openConfirm = () => {
    setTried(true);
    if (problem) {
      toast.show(problem, 'danger');
      return;
    }
    if (current && !changes.length) {
      toast.show('Nothing has changed.', 'info');
      return;
    }
    setError(null);
    setTyped('');
    setConfirming(true);
  };

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({ id: current?.id ?? null, body: bodyOf(draft) });
      setConfirming(false);
      toast.show(current ? `“${phrase}” saved. Existing salaries are unchanged.` : `“${phrase}” created.`);
      router.back();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Screen
      header={header}
      footer={
        <ActionBar note={tried && problem ? problem : null}>
          <Button title={current ? 'Review and save' : 'Review and create'} icon={<Save />} onPress={openConfirm} />
        </ActionBar>
      }>
      <Banner
        tone="info"
        title="Existing salaries don’t change"
        message="Each salary keeps a copy of the structure it was set with. A change here applies to salaries set or revised from now on."
      />
      <Card>
        <View style={styles.stack}>
          <PillField label="Name" value={draft.name} onChangeText={(v) => setDraft((d) => ({ ...d, name: v.slice(0, 60) }))} placeholder="e.g. Creative — Junior" maxLength={60} error={tried && draft.name.trim().length < 2 ? 'At least 2 characters' : null} />
          <PillField label="Description (optional)" value={draft.description} onChangeText={(v) => setDraft((d) => ({ ...d, description: v.slice(0, 300) }))} placeholder="Who it is for" maxLength={300} />
        </View>
      </Card>

      <Text variant="heading">Parts ({draft.components.length} of {MAX_COMPONENTS})</Text>
      {draft.components.map((c, i) => (
        <CompCard key={c.key} c={c} index={i} all={draft.components} showErrors={tried} onChange={(p) => setComp(c.key, p)} onRemove={draft.components.length > 1 ? () => removeComp(c.key) : undefined} />
      ))}
      <Button title="Add a part" variant="ghost" icon={<Plus />} onPress={addComp} disabled={draft.components.length >= MAX_COMPONENTS} />

      <Card>
        <View style={styles.stack}>
          <PillField
            label="Try a CTC"
            value={ctc}
            onChangeText={(v) => setCtc(moneyTyping(v))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            trailing={<Text variant="label" muted>₹ a year</Text>}
            error={ctc && !amount ? 'Rupees, up to 2 decimals' : null}
          />
          {problem ? (
            <Text variant="caption" muted>
              The preview shows once every part is filled in correctly.
            </Text>
          ) : preview.error ? (
            <Banner tone="danger" title="That CTC doesn’t fit" message={errorText(preview.error)} />
          ) : preview.data ? (
            <SummaryCard
              title={`${money.inr(preview.data.monthlyCtc)} a month`}
              rows={preview.data.lines.map((l) => ({ key: l.code, label: l.name, value: money.inr(l.amount), hint: l.kind === 'employer' ? 'Paid by the company' : null }))}
              total={{ label: 'Gross pay', value: money.inr(preview.data.gross) }}
            />
          ) : preview.isFetching ? (
            <SkeletonList rows={2} tone="surface" />
          ) : null}
        </View>
      </Card>

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={current ? 'Save this structure?' : 'Create this structure?'}
        subtitle={phrase}
        confirmLabel={current ? 'Swipe to save' : 'Swipe to create'}
        onConfirm={() => void submit()}
        loading={save.isPending}
        disabled={!typedMatches(typed, phrase)}
        note="Applies to salaries set or revised from now on. Nobody is messaged.">
        <SummaryCard
          title={current ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}` : `${draft.components.length} parts`}
          rows={changes.slice(0, 20).map((t, i) => ({ key: String(i), label: t }))}
        />
        {changes.length > 20 ? (
          <Text variant="caption" muted>
            …and {changes.length - 20} more.
          </Text>
        ) : null}
        <SummaryCard
          rows={[
            { label: 'Existing salaries', value: 'Unchanged' },
            { label: 'Payroll runs already made', value: 'Unchanged' },
            { label: 'Who is told', value: 'Nobody' },
          ]}
        />
        <TypeToConfirm phrase={phrase} value={typed} onChange={setTyped} what="To unlock the swipe, type the structure’s name:" />
        {error ? <Banner tone="danger" title={current ? 'Couldn’t save' : 'Couldn’t create'} message={error} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

function CompCard({
  c,
  index,
  all,
  showErrors,
  onChange,
  onRemove,
}: {
  c: DraftComp;
  index: number;
  all: DraftComp[];
  showErrors: boolean;
  onChange: (p: Partial<DraftComp>) => void;
  onRemove?: () => void;
}) {
  const err = rowError(c, all);
  const unit = c.calc === 'fixed' ? '₹ a month' : '%';
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.cardHead}>
          <Text variant="bodyStrong" style={styles.cardTitle} numberOfLines={2}>
            {index + 1}. {c.name.trim() || 'New part'}
          </Text>
          {onRemove ? <Button title="Remove" size="sm" variant="danger" icon={<Trash2 />} onPress={onRemove} accessibilityLabel={`Remove ${c.name || 'this part'}`} /> : null}
        </View>
        <View style={styles.pair}>
          <View style={styles.code}>
            <PillField label="Code" value={c.code} onChangeText={(v) => onChange({ code: v.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 12) })} autoCapitalize="characters" autoCorrect={false} placeholder="HRA" />
          </View>
          <View style={styles.flex}>
            <PillField label="Name" value={c.name} onChangeText={(v) => onChange({ name: v.slice(0, 40) })} placeholder="House Rent Allowance" maxLength={40} />
          </View>
        </View>
        <Segmented options={KIND_OPTIONS} value={c.kind} onChange={(k) => onChange({ kind: k, ...(k === 'employer' ? { taxable: false } : {}) })} />
        <SelectField label="Worked out as" value={c.calc} options={CALC_OPTIONS} onChange={(v) => onChange({ calc: v, ...(v === 'balance' ? { value: '0' } : {}) })} />
        {c.calc !== 'balance' ? (
          <PillField
            label={c.calc === 'fixed' ? 'Amount' : 'Percentage'}
            value={c.value}
            onChangeText={(v) => onChange({ value: moneyTyping(v) })}
            keyboardType="decimal-pad"
            inputMode="decimal"
            trailing={<Text variant="label" muted>{unit}</Text>}
          />
        ) : (
          <Text variant="caption" muted>
            Takes whatever is left of the monthly CTC after the other parts.
          </Text>
        )}
        <ToggleRow flush label="Taxable" sub="Counts towards income tax" value={c.taxable} onChange={(v) => onChange({ taxable: v })} />
        <ToggleRow flush label="Counts for PF" sub="Part of the wage Provident Fund is worked out on" value={c.pf_wage} onChange={(v) => onChange({ pf_wage: v })} />
        {showErrors || (c.code && c.name) ? <FieldMessage error={err} /> : null}
      </View>
    </Card>
  );
}

const styles = themedStyles(() => ({
  stack: { gap: space.md },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  code: { width: 120, flexGrow: 1 },
  flex: { flex: 1, minWidth: 160 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // The part's name takes what is left beside Remove (2 lines), so Remove never drops to its own line.
  cardTitle: { flex: 1 },
}));
