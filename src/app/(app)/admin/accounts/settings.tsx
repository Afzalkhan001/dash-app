// Payment timeline — the website's VendorBillPaymentSettingsModal (dash.html:35137): what the person who
// sent a vendor bill is told when Accounts approves it. The working days and the message ({days} marks
// where the number goes), with a live preview. Saving changes every later approval email for the
// company, so it is confirmed with a swipe. GET / PUT /vendor-bills/settings (ACCOUNTS_ROLES).

import { useMutation } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { CalendarClock, Save } from 'lucide-react-native';
import { useState } from 'react';

import { type BillSettings, saveBillSettings, useBillSettings } from '@/api/accounts';
import { unwrap } from '@/api/client';
import { canEditPaymentTimeline } from '@/features/accounts/access';
import { useInvalidateAccounts } from '@/features/accounts/use-items';
import { useAccess } from '@/lib/use-access';
import { ActionBar, Button, ConfirmSheet, ErrorState, NavHeader, Screen, SkeletonList, SummaryCard, SummaryHero, TextField, toast } from '@/ui';

function Form({ settings }: { settings: BillSettings }) {
  const invalidate = useInvalidateAccounts();
  const [days, setDays] = useState(String(settings.payment_timeline_days ?? ''));
  const [message, setMessage] = useState(settings.payment_message ?? '');
  const [confirm, setConfirm] = useState(false);
  const n = Number(days);
  const daysOk = Number.isInteger(n) && n > 0 && n <= 365;
  const valid = daysOk && !!message.trim();
  const changed = n !== settings.payment_timeline_days || message !== settings.payment_message;
  const preview = message.replace('{days}', days || '—');

  const save = useMutation({
    mutationFn: () => unwrap(saveBillSettings(n, message)),
    onSuccess: () => {
      setConfirm(false);
      toast.show('Payment timeline saved');
    },
    onError: (e) => toast.show((e instanceof Error && e.message) || 'Couldn’t save it.', 'danger'),
    onSettled: () => void invalidate(),
  });

  return (
    <Screen
      header={<NavHeader title="Payment timeline" />}
      footer={
        <ActionBar note={!changed ? 'Nothing changed yet.' : !valid ? 'Enter the days and a message.' : null}>
          <Button title="Save" icon={<Save />} disabled={!valid || !changed} onPress={() => setConfirm(true)} />
        </ActionBar>
      }>
      <SummaryHero icon={CalendarClock} module="vendor" label="Vendor bills are paid within" value={daysOk ? n : undefined} unit={n === 1 ? 'working day' : 'working days'} sub="Told to the person who sent the bill when Accounts approves it." />
      <TextField label="Working days" value={days} onChangeText={(t) => setDays(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" error={days && !daysOk ? 'Enter 1 or more' : null} />
      <TextField label="Message" value={message} onChangeText={setMessage} multiline maxLength={500} counter hint="Write {days} where the number of days should go." />
      <SummaryCard title="What they will read" rows={[{ key: 'p', label: 'Message', value: preview || '—' }]} />

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Save the payment timeline?"
        confirmLabel="Swipe to save"
        onConfirm={() => save.mutate()}
        loading={save.isPending}
        note="Every vendor bill approved from now on is emailed with this message.">
        <SummaryCard rows={[{ key: 'd', label: 'Working days', value: days }, { key: 'm', label: 'Message', value: preview }]} />
      </ConfirmSheet>
    </Screen>
  );
}

export default function PaymentTimelineScreen() {
  const access = useAccess();
  const allowed = canEditPaymentTimeline(access);
  const q = useBillSettings(allowed);
  if (!allowed) return <Redirect href="/" />;
  if (!q.data)
    return (
      <Screen header={<NavHeader title="Payment timeline" />}>
        {q.isPending ? <SkeletonList rows={3} /> : <ErrorState message={q.error?.message || 'Couldn’t load the payment timeline.'} onRetry={() => void q.refetch()} />}
      </Screen>
    );
  return <Form key={`${q.data.payment_timeline_days}|${q.data.payment_message}`} settings={q.data} />;
}
