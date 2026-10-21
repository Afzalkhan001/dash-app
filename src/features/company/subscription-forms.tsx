// Subscriptions: the add / edit form (SubscriptionForm, dash.html:11229) and "Record a payment"
// (PaymentForm, :11475) as sheets. Reversible saves, so a plain button; the server's own words show
// on a refusal. DASH stores no account passwords — only the login page and account email.

import { useState } from 'react';
import { View } from 'react-native';

import { type PaymentInput, type SubInput, type Subscription, useRecordPayment, useSaveSubscription } from '@/api/company';
import { useTodayIst } from '@/features/attendance/use-now';
import { SUB_PERIODS, SUB_STATUSES } from '@/features/company/format';
import { space } from '@/theme/tokens';
import { Banner, Button, Chip, ChipRow, DateField, SelectField, Sheet, Text, TextField, toast } from '@/ui';

const asText = (n: number | null | undefined) => (n ? String(n) : '');
const asNum = (s: string) => {
  const n = parseFloat(String(s ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function blank(e?: Subscription | null): Record<keyof SubInput, string> {
  return {
    name: e?.name ?? '',
    department: e?.department ?? '',
    plan: e?.plan ?? '',
    period: e?.period ?? 'monthly',
    status: e?.status ?? 'active',
    accountEmail: e?.accountEmail ?? '',
    loginUrl: e?.loginUrl ?? '',
    amountInr: asText(e?.amountInr),
    amountUsd: asText(e?.amountUsd),
    renewalDate: e?.renewalDate ?? '',
    payee: e?.payee ?? '',
    paymentMode: e?.paymentMode ?? '',
    kekaCode: e?.kekaCode ?? '',
    owner: e?.owner ?? '',
    comments: e?.comments ?? '',
  };
}

/** Department suggestions under a free-text field (the website's datalist). */
function DeptSuggestions({ value, options, onPick }: { value: string; options: string[]; onPick: (v: string) => void }) {
  const needle = value.trim().toLowerCase();
  const list = options.filter((d) => d.toLowerCase() !== needle && (!needle || d.toLowerCase().includes(needle))).slice(0, 8);
  if (!list.length) return null;
  return (
    <ChipRow bleed="none">
      {list.map((d) => (
        <Chip key={d} label={d} onPress={() => onPick(d)} />
      ))}
    </ChipRow>
  );
}

export function SubscriptionFormSheet({
  visible,
  onClose,
  existing,
  departments,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  existing: Subscription | null;
  departments: string[];
  onSaved?: (s: Subscription | undefined) => void;
}) {
  const save = useSaveSubscription();
  const [f, setF] = useState(() => blank(existing));
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reset the fields each time the sheet opens for a (different) subscription.
  const key = visible ? (existing?.id ?? 'new') : null;
  if (key !== shownFor) {
    setShownFor(key);
    if (key) {
      setF(blank(existing));
      setError(null);
    }
  }
  const set = (k: keyof SubInput) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = () => {
    if (!f.name.trim()) return setError('Give the subscription a name.');
    setError(null);
    const body: SubInput = { ...f, amountInr: asNum(f.amountInr), amountUsd: asNum(f.amountUsd) };
    save.mutate(
      { id: existing?.id, body },
      {
        onSuccess: (r) => {
          toast.show(existing ? 'Changes saved' : `${f.name.trim()} added`, 'success');
          onSaved?.(r?.subscription);
          onClose();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={existing ? 'Edit subscription' : 'Add subscription'}
      dirty={JSON.stringify(f) !== JSON.stringify(blank(existing))}
      footer={<Button title={existing ? 'Save changes' : 'Add subscription'} loading={save.isPending} onPress={submit} />}>
      <TextField label="Name" value={f.name} onChangeText={set('name')} placeholder="e.g. Canva Pro" />
      <View style={{ gap: space.xs }}>
        <TextField label="Department or team" value={f.department} onChangeText={set('department')} placeholder="e.g. AI Initiatives" />
        <DeptSuggestions value={f.department} options={departments} onPick={set('department')} />
      </View>
      <TextField label="Plan" value={f.plan} onChangeText={set('plan')} placeholder="Pro, Teams, Standard…" />
      <SelectField label="Billing" value={f.period} options={SUB_PERIODS} onChange={set('period')} />
      <SelectField label="Status" value={f.status} options={SUB_STATUSES.map((s) => ({ value: s.value, label: s.label }))} onChange={set('status')} />
      <TextField label="Amount in ₹" value={f.amountInr} onChangeText={set('amountInr')} keyboardType="decimal-pad" placeholder="6500" />
      <TextField label="Amount in US$ (optional)" value={f.amountUsd} onChangeText={set('amountUsd')} keyboardType="decimal-pad" placeholder="118" />
      <DateField label="Next renewal" value={f.renewalDate || null} onChange={set('renewalDate')} placeholder="No renewal date" />
      <TextField label="Project code" value={f.kekaCode} onChangeText={set('kekaCode')} autoCapitalize="characters" autoCorrect={false} />
      <TextField label="Account email" value={f.accountEmail} onChangeText={set('accountEmail')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <TextField label="Login page" value={f.loginUrl} onChangeText={set('loginUrl')} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://…" />
      <TextField label="Paid by" value={f.payee} onChangeText={set('payee')} placeholder="Tamada" />
      <TextField label="How it’s paid" value={f.paymentMode} onChangeText={set('paymentMode')} placeholder="Card 9000, UPI, bank transfer" />
      <TextField label="Who uses it" value={f.owner} onChangeText={set('owner')} />
      <TextField label="Notes" value={f.comments} onChangeText={set('comments')} multiline />
      <Text variant="caption" muted>
        DASH doesn’t store account passwords. Keep those in your password manager.
      </Text>
      {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
    </Sheet>
  );
}

export function PaymentFormSheet({ visible, onClose, subs, presetId }: { visible: boolean; onClose: () => void; subs: Subscription[]; presetId?: string | null }) {
  const today = useTodayIst();
  const record = useRecordPayment();
  const empty = { subscriptionId: '', name: '', department: '', plan: '', period: '', paidOn: today, amountInr: '', amountUsd: '', kekaCode: '', comments: '' };
  const [f, setF] = useState(empty);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fill = (id: string) => {
    const s = subs.find((x) => x.id === id);
    setF((x) => ({
      ...x,
      subscriptionId: id,
      ...(s ? { name: s.name, department: s.department, plan: s.plan, period: s.period, kekaCode: s.kekaCode, amountInr: asText(s.amountInr), amountUsd: asText(s.amountUsd) } : null),
    }));
  };
  const key = visible ? (presetId ?? 'any') : null;
  if (key !== shownFor) {
    setShownFor(key);
    if (key) {
      setError(null);
      const s = presetId ? subs.find((x) => x.id === presetId) : null;
      setF(
        s
          ? { ...empty, subscriptionId: s.id, name: s.name, department: s.department, plan: s.plan, period: s.period, kekaCode: s.kekaCode, amountInr: asText(s.amountInr), amountUsd: asText(s.amountUsd) }
          : empty,
      );
    }
  }
  const set = (k: keyof typeof empty) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = () => {
    if (!f.name.trim()) return setError('Which software was this for?');
    if (!f.paidOn) return setError('A payment needs a date.');
    setError(null);
    const body: PaymentInput = { ...f, amountInr: asNum(f.amountInr), amountUsd: asNum(f.amountUsd) };
    record.mutate(body, {
      onSuccess: () => {
        toast.show('Payment recorded', 'success');
        onClose();
      },
      onError: (e) => setError(e.message),
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Record a payment" dirty={!!(f.name || f.amountInr || f.comments) && !presetId} footer={<Button title="Record payment" loading={record.isPending} onPress={submit} />}>
      <SelectField
        label="For a subscription we track (optional)"
        value={f.subscriptionId}
        options={[{ value: '', label: 'Not linked / one-off' }, ...subs.map((s) => ({ value: s.id, label: s.department ? `${s.name} · ${s.department}` : s.name }))]}
        onChange={fill}
      />
      <TextField label="Software" value={f.name} onChangeText={set('name')} />
      <TextField label="Department or team" value={f.department} onChangeText={set('department')} />
      <DateField label="Paid on" value={f.paidOn} onChange={set('paidOn')} maximumDate={today} />
      <TextField label="Amount in ₹" value={f.amountInr} onChangeText={set('amountInr')} keyboardType="decimal-pad" />
      <TextField label="Amount in US$ (optional)" value={f.amountUsd} onChangeText={set('amountUsd')} keyboardType="decimal-pad" />
      <TextField label="Project code" value={f.kekaCode} onChangeText={set('kekaCode')} autoCapitalize="characters" autoCorrect={false} />
      <TextField label="Notes" value={f.comments} onChangeText={set('comments')} placeholder="Plan renewed, 100 credits…" />
      {error ? <Banner tone="danger" title="Couldn’t record it" message={error} /> : null}
    </Sheet>
  );
}
