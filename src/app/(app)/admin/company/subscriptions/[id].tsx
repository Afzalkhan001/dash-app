// One subscription: every field the website's table shows, its payments, the login page and account
// email, and — for IT Admin, Super Admin, CEO and COO — Edit, Record a payment and Delete. Deleting
// keeps the payment history (subscriptions.js DELETE /subscriptions/:id), swiped to confirm.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { CreditCard, ExternalLink, Mail, Pencil, Receipt, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Share, View } from 'react-native';

import { useDeleteSubscription, useSubPayments, useSubscriptions } from '@/api/company';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeSubscriptionsHub } from '@/features/company/access';
import { periodLabel, rangeFor, renewalTone, subStatus } from '@/features/company/format';
import { useCompanyAccess } from '@/features/company/gate';
import { PaymentFormSheet, SubscriptionFormSheet } from '@/features/company/subscription-forms';
import { dateLabel, stampLabel } from '@/lib/dates';
import { inr } from '@/lib/format';
import { palette, space } from '@/theme/tokens';
import {
  ActionRow,
  ActivityList,
  ActivityRow,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  toast,
} from '@/ui';

export default function SubscriptionDetailScreen() {
  const router = useRouter();
  const today = useTodayIst();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, tenant, ready } = useCompanyAccess();
  const allowed = canSeeSubscriptionsHub(user, tenant);
  const subs = useSubscriptions(allowed);
  const allTime = rangeFor('all', today);
  const payments = useSubPayments(allTime, allowed);
  const del = useDeleteSubscription();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [gone, setGone] = useState<string | null>(null);

  if (ready && !allowed) return <Redirect href="/" />;

  const list = subs.data?.subscriptions ?? [];
  const s = list.find((x) => x.id === id) ?? null;
  const canManage = !!subs.data?.canManage;
  const departments = [...new Set(list.map((x) => x.department).filter(Boolean))].sort();
  const pays = (payments.data ?? []).filter((p) => p.subscriptionId === id);

  if (gone) {
    return (
      <Screen header={<NavHeader title="Subscription" />}>
        <SuccessSheet visible onClose={() => router.back()} onPrimary={() => router.back()} title="Subscription deleted" subtitle={`${gone} is gone. Its payment history is kept.`} />
      </Screen>
    );
  }

  if (!s) {
    return (
      <Screen header={<NavHeader title="Subscription" />}>
        {subs.isPending ? (
          <SkeletonList rows={6} />
        ) : subs.isError ? (
          <ErrorState message={subs.error?.message ?? ''} onRetry={() => void subs.refetch()} />
        ) : (
          <EmptyState icon={<CreditCard color={palette.textMuted} />} title="This subscription is gone" message="Someone may have deleted it." />
        )}
      </Screen>
    );
  }

  const st = subStatus(s.status);
  const rt = s.status === 'active' ? renewalTone(s.daysToRenewal) : null;
  const oneTime = s.period === 'one_time';
  const url = /^https?:\/\//i.test(s.loginUrl) ? s.loginUrl : '';

  return (
    <Screen
      header={<NavHeader title={s.name} subtitle={[s.department, s.plan].filter(Boolean).join(' · ') || undefined} actions={canManage ? [{ icon: Pencil, label: 'Edit', onPress: () => setEditing(true) }] : []} />}
      onRefresh={() => Promise.all([subs.refetch(), payments.refetch()])}>
      <SummaryHero
        icon={CreditCard}
        module="vendor"
        label={periodLabel(s.period)}
        value={s.amountInr}
        currency="₹"
        info={oneTime ? { label: 'Paid once' } : { label: 'A month', value: inr(s.monthlyInr, { decimals: false }) }}
        sub={rt ? rt.label : s.renewalDate ? `Next renewal ${dateLabel(s.renewalDate, today)}` : undefined}
      />

      <SummaryCard
        rows={[
          { key: 'status', label: 'Status', value: st.label, status: st.tone },
          ...(rt ? [{ key: 'renew', label: 'Renewal', value: rt.label, status: rt.tone }] : []),
          { key: 'next', label: 'Next renewal', value: s.renewalDate ? dateLabel(s.renewalDate, today) : '—' },
          { key: 'usd', label: 'Amount in US$', value: s.amountUsd ? `US$${s.amountUsd}` : '—' },
          ...(oneTime ? [] : [{ key: 'year', label: 'A year', value: inr(s.yearlyInr, { decimals: false }) }]),
          { key: 'code', label: 'Project code', value: s.kekaCode || 'Missing', valueColor: s.kekaCode ? undefined : palette.dangerInk },
          { key: 'email', label: 'Account email', value: s.accountEmail || '—' },
          { key: 'payee', label: 'Paid by', value: s.payee || '—' },
          { key: 'mode', label: 'How it’s paid', value: s.paymentMode || '—' },
          { key: 'owner', label: 'Who uses it', value: s.owner || '—' },
          { key: 'notes', label: 'Notes', value: s.comments || '—' },
          ...(s.updatedAt ? [{ key: 'by', label: 'Last changed', value: stampLabel(s.updatedAt, today), hint: s.updatedByName || null }] : []),
        ]}
      />

      {url || s.accountEmail ? (
        <ActionRow context="screen">
          {s.accountEmail ? (
            <Button variant="accent" title="Share email" icon={<Mail />} onPress={() => void Share.share({ message: s.accountEmail }).catch(() => {})} />
          ) : null}
          {url ? (
            <Button
              variant="accent"
              title="Open login page"
              icon={<ExternalLink />}
              onPress={() => void Linking.openURL(url).catch(() => toast.show('That page could not be opened.', 'danger'))}
            />
          ) : null}
        </ActionRow>
      ) : null}

      <ActivityList
        title="Payments"
        right={canManage ? <Button variant="text" size="sm" title="Record" icon={<Receipt />} onPress={() => setPaying(true)} /> : undefined}
        loading={payments.isPending}
        empty={<EmptyState title="No payments recorded" />}>
        {pays.map((p) => (
          <ActivityRow key={p.id} module="pay" icon={Receipt} title={dateLabel(p.paidOn, today)} subtitle={p.comments || undefined} value={inr(p.amountInr)} meta={p.amountUsd ? `US$${p.amountUsd}` : undefined} />
        ))}
      </ActivityList>

      {canManage ? (
        <View style={{ paddingTop: space.xs }}>
          <Button variant="danger" title="Delete subscription" icon={<Trash2 />} onPress={() => setConfirm(true)} />
        </View>
      ) : null}

      <SubscriptionFormSheet visible={editing} onClose={() => setEditing(false)} existing={s} departments={departments} />
      <PaymentFormSheet visible={paying} onClose={() => setPaying(false)} subs={list} presetId={s.id} />

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${s.name}?`}
        from={{ title: s.name, subtitle: st.label, icon: CreditCard, module: 'vendor' }}
        to={{ title: 'Deleted', subtitle: 'Payments are kept', icon: Trash2, module: 'security' }}
        confirmLabel="Swipe to delete"
        onConfirm={() =>
          del.mutate(s.id, {
            onSuccess: () => {
              setConfirm(false);
              setGone(s.name);
            },
            onError: (e) => toast.show(`Couldn’t delete: ${e.message}`, 'danger'),
          })
        }
        loading={del.isPending}
        note="This can’t be undone. Payments are kept. No one is notified.">
        <SummaryCard rows={[{ key: 'pays', label: 'Payments kept', value: String(pays.length) }]} />
      </ConfirmSheet>
    </Screen>
  );
}
