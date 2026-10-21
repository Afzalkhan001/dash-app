// Subscriptions: upload past data — SubscriptionImport (dash.html:11409–11480), the hub's "Upload past
// data" tab, for people the server lets manage subscriptions (canManage). Every tab of the workbook is
// read: a sheet with a "Renewal Date" column becomes standing subscriptions, one with "Transaction
// Date" becomes payment history. Passwords in the sheet are never read. Nothing is written until the
// preview has been seen; then one POST /subscriptions/import.
// Re-importing a subscription (same name + account email) updates it; payments are always added, so
// importing the same ledger twice doubles that spend (said before the swipe).

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { CreditCard, FileSpreadsheet } from 'lucide-react-native';
import { useState } from 'react';

import { importSubscriptions, type SubResult, useSubscriptionsCanManage } from '@/features/excel/api';
import { useExcelAccess } from '@/features/excel/gate';
import { parseSubscriptionWorkbook, type SubImport } from '@/features/excel/parse';
import { TEMPLATES } from '@/features/excel/templates';
import { PickCard, type PreviewItem, PreviewList, ResultCard, TemplateCard, useSheetPicker } from '@/features/excel/ui';
import { inr, plural } from '@/lib/format';
import { Banner, Button, ConfirmSheet, EmptyState, NavHeader, Screen, Segmented, SkeletonList, SummaryCard, toast } from '@/ui';

export default function SubscriptionsImport() {
  const router = useRouter();
  const qc = useQueryClient();
  const { gates, ready } = useExcelAccess();
  const manage = useSubscriptionsCanManage(ready && gates.imports.subscriptions);
  const [parsed, setParsed] = useState<SubImport | null>(null);
  const [view, setView] = useState<'subs' | 'pays'>('subs');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubResult | null>(null);

  const picker = useSheetPicker((p) => {
    const r = parseSubscriptionWorkbook(p.book);
    if (!r.subscriptions.length && !r.payments.length) throw new Error('No subscriptions or payments were found. A sheet needs a Name (or Software) column, or a Transaction Date column.');
    setParsed(r);
    setResult(null);
  }, 'subscriptions');

  if (ready && !gates.imports.subscriptions) return <Redirect href="/" />;

  const subItems: PreviewItem[] = (parsed?.subscriptions ?? []).map((s, i) => ({
    key: `s${i}`,
    line: i + 1,
    title: s.name,
    subtitle: [s.department || 'No department', `${inr(s.amountInr)} ${s.period}`].join(' · '),
    issues: [
      ...(s.renewalDate ? [] : [{ level: 'warning' as const, text: 'No renewal date.' }]),
      ...(s.kekaCode ? [] : [{ level: 'info' as const, text: 'No Keka code (shows as MISSING).' }]),
    ],
    fields: [
      { label: 'Department', value: s.department },
      { label: 'Plan', value: s.plan },
      { label: 'Period', value: s.period },
      { label: 'Amount (INR)', value: inr(s.amountInr) },
      { label: 'Amount (USD)', value: s.amountUsd ? `$${s.amountUsd}` : '' },
      { label: 'Renews on', value: s.renewalDate },
      { label: 'Account email', value: s.accountEmail },
      { label: 'Login link', value: s.loginUrl },
      { label: 'Payee', value: s.payee },
      { label: 'Payment mode', value: s.paymentMode },
      { label: 'Keka code', value: s.kekaCode },
      { label: 'Status', value: s.status },
      { label: 'Owner', value: s.owner },
      { label: 'Comments', value: s.comments },
    ],
  }));
  const payItems: PreviewItem[] = (parsed?.payments ?? []).map((p, i) => ({
    key: `p${i}`,
    line: i + 1,
    title: p.name,
    subtitle: `${p.paidOn} · ${inr(p.amountInr)}`,
    issues: p.amountInr || p.amountUsd ? [] : [{ level: 'warning', text: 'No amount.' }],
    fields: [
      { label: 'Paid on', value: p.paidOn },
      { label: 'Department', value: p.department },
      { label: 'Plan', value: p.plan },
      { label: 'Amount (INR)', value: inr(p.amountInr) },
      { label: 'Amount (USD)', value: p.amountUsd ? `$${p.amountUsd}` : '' },
      { label: 'Keka code', value: p.kekaCode },
      { label: 'Comments', value: p.comments },
    ],
  }));
  const total = (parsed?.subscriptions.length ?? 0) + (parsed?.payments.length ?? 0);
  const spend = (parsed?.payments ?? []).reduce((s, p) => s + (p.amountInr || 0), 0);

  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await importSubscriptions(parsed);
      setResult(r);
      setParsed(null);
      picker.reset();
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['company'] });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The import failed. Nothing was saved.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const denied = manage.data === false;

  return (
    <Screen
      header={<NavHeader title="Subscriptions from a sheet" />}
      footer={parsed && !denied ? <Button title={`Import ${plural(total, 'row')}`} icon={<CreditCard />} disabled={!total || busy} onPress={() => setConfirm(true)} /> : undefined}>
      {!ready || manage.isPending ? (
        <SkeletonList rows={4} />
      ) : denied ? (
        <EmptyState title="Read-only access" message="You can see subscriptions, but only the people who manage them can import past data." icon={<CreditCard />} />
      ) : (
        <>
          <Banner tone="info" message="Drop in the subscriptions workbook. A tab with a Renewal Date column becomes subscriptions; a tab with a Transaction Date column becomes payment history. Passwords are never read." />
          {result ? (
            <ResultCard
              title="Imported"
              lines={[
                `${plural(result.subscriptionsCreated, 'new subscription')}, ${result.subscriptionsUpdated} updated.`,
                `${plural(result.paymentsCreated, 'payment')} added.`,
                ...result.skipped,
              ]}
              failures={[]}
              doneLabel="Open Subscriptions"
              onDone={() => router.push('/admin/company/subscriptions')}
            />
          ) : null}
          <TemplateCard template={TEMPLATES.subscriptions} note="An example with both tabs. Your own workbook works as it is; rows like “Mar- 2026” are read as month headings." />
          <PickCard fileName={picker.fileName} busy={picker.busy} onPick={picker.pick} onSample={picker.sample} />
          {parsed ? (
            <>
              {parsed.dateCorrections ? (
                <Banner
                  tone="warning"
                  title={`${plural(parsed.dateCorrections, 'date')} read by the month heading`}
                  message="These were typed month-first and disagreed with the month heading above them, so the heading was used (a row under “Mar- 2026” dated 1/3 is 1 March)."
                />
              ) : null}
              {parsed.notes.map((n) => (
                <Banner key={n} tone="info" message={n} />
              ))}
              <Segmented
                options={[
                  { key: 'subs', label: 'Subscriptions', badge: parsed.subscriptions.length },
                  { key: 'pays', label: 'Payments', badge: parsed.payments.length },
                ]}
                value={view}
                onChange={(k) => setView(k as 'subs' | 'pays')}
              />
              <PreviewList items={view === 'subs' ? subItems : payItems} noun={view === 'subs' ? ['subscription', 'subscriptions'] : ['payment', 'payments']} />
            </>
          ) : null}
        </>
      )}
      <ConfirmSheet
        visible={confirm}
        onClose={() => (busy ? undefined : setConfirm(false))}
        title="Import subscriptions"
        from={{ title: picker.fileName || 'Your workbook', subtitle: plural(total, 'row'), icon: FileSpreadsheet, module: 'expenses' }}
        to={{ title: 'Subscriptions', subtitle: 'Company spend', icon: CreditCard, module: 'expenses' }}
        detailsTitle="What happens"
        confirmLabel="Swipe to import"
        loading={busy}
        onConfirm={run}
        note="No one is messaged. Importing the same payments twice counts that spend twice.">
        <SummaryCard
          rows={[
            { label: 'Subscriptions', value: parsed?.subscriptions.length ?? 0, hint: 'An existing one (same name and email) is updated' },
            { label: 'Payments', value: parsed?.payments.length ?? 0, hint: 'Always added' },
          ]}
          total={{ label: 'Payments total', value: inr(spend) }}
        />
      </ConfirmSheet>
    </Screen>
  );
}
