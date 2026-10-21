// Claims paid with salary — GET /hr/claims/mine, POST /hr/claims/:id/cancel (hr_payroll.js ~L638–655).
//
// Deliberately no "new claim" form here. The website stopped taking expense claims in My Pay (dash.html
// ~L5068: two places to submit the same claim is how claims get submitted twice) and sends them to
// Expense claims (/reimbursements/new), where the money actually moves. The HR claim routes and
// history stay on the server, so people who filed claims here earlier can still follow them —
// approved ones are paid with salary — and cancel one that is still waiting.
//
// NavHeader (with the eye), one short notice that points to Expense claims, then my claims as one
// Payno transactions list (type, date, amount, status). A claim opens a sheet with its details as a
// SummaryCard; a waiting one can be cancelled there. Titled "Salary claims" (the Me › Pay link and the
// Inbox use the same words); the notice keeps it from being mistaken for Expense claims.

import { useRouter } from 'expo-router';
import { Briefcase, Fuel, HeartPulse, type LucideIcon, Phone, Plane, Plus, Receipt, Utensils, Wifi } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { type HrClaim, useMyClaims } from '@/api/pay';
import { useTodayIst } from '@/features/attendance/use-now';
import { ErrorText, PayHeader, PaySkeleton, PayUnavailable, TextBlock } from '@/features/pay/components';
import { istDate, reqStatus, rowsOf, ymdLabel } from '@/features/pay/format';
import { usePayMoney } from '@/features/pay/privacy';
import { useCancelClaim } from '@/features/pay/use-pay-actions';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { titleCase } from '@/lib/format';
import { moduleTone } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, EmptyState, ErrorState, Screen, Sheet, SummaryCard, toast } from '@/ui';

// hr_payroll.js CLAIM_CATEGORIES
const CATEGORY_ICON: Record<string, LucideIcon> = {
  travel: Plane,
  food: Utensils,
  internet: Wifi,
  phone: Phone,
  medical: HeartPulse,
  fuel: Fuel,
  office: Briefcase,
  other: Receipt,
};

type Money = ReturnType<typeof usePayMoney>;

const categoryOf = (c: HrClaim) => (typeof c.category === 'string' && titleCase(c.category)) || 'Other';

function claimRow(c: HrClaim, money: Money, today: string, onPress: () => void) {
  const Icon = (typeof c.category === 'string' && CATEGORY_ICON[c.category]) || Receipt;
  const st = reqStatus(c.status);
  // Whole rupees in the list; the sheet shows the exact amount.
  const amount = money.inr(c.amount, { decimals: false });
  const date = ymdLabel(c.claim_date, today);
  return (
    <ActivityRow
      key={c.id}
      module="pay"
      icon={Icon}
      title={categoryOf(c)}
      subtitle={date}
      value={amount}
      status={{ label: st.label, tone: st.tone }}
      onPress={onPress}
      accessibilityLabel={`${categoryOf(c)} claim, ${date}, ${money.hidden ? 'amount hidden' : amount}, ${st.label}`}
    />
  );
}

export default function ClaimsScreen() {
  const router = useRouter();
  const pa = usePayAccess();
  const money = usePayMoney();
  const today = useTodayIst();
  const q = useMyClaims(pa.advances);
  const cancel = useCancelClaim();
  // The opened claim stays in state while the sheet fades out, so its content doesn't collapse.
  const [open, setOpen] = useState<HrClaim | null>(null);
  const [detail, setDetail] = useState(false);

  const header = <PayHeader title="Salary claims" privacy={pa.advances} />;

  if (pa.loading) {
    return (
      <Screen header={header}>
        <PaySkeleton hero={false} rows={4} />
      </Screen>
    );
  }
  if (!pa.advances) {
    return (
      <Screen header={header}>
        <PayUnavailable systemRole={pa.isSystemRole} feature="salary claims" />
      </Screen>
    );
  }

  const claims = rowsOf(q.data);
  const newClaim = () => router.push('/reimbursements/new');

  const openDetails = (c: HrClaim) => {
    cancel.reset();
    setOpen(c);
    setDetail(true);
  };

  const closeDetails = () => {
    if (cancel.isPending) return;
    cancel.reset();
    setDetail(false);
  };

  const confirmCancel = (c: HrClaim) => {
    Alert.alert('Cancel this claim?', `Your ${categoryOf(c).toLowerCase()} claim for ${money.inr(c.amount)} will be withdrawn.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel claim',
        style: 'destructive',
        onPress: () =>
          cancel.mutate(c.id, {
            onSuccess: () => {
              setDetail(false);
              toast.show('Claim cancelled');
            },
          }),
      },
    ]);
  };

  const st = open ? reqStatus(open.status) : null;
  const decided = open?.decided_by_name
    ? { key: 'decided', label: open.status === 'rejected' ? 'Rejected by' : 'Approved by', value: open.decided_by_name, hint: open.decided_at ? istDate(open.decided_at, today) : null }
    : null;

  return (
    <>
      <Screen header={header} onRefresh={() => q.refetch()}>
        {q.isLoading ? (
          <PaySkeleton hero={false} rows={4} />
        ) : q.isError ? (
          <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
        ) : claims.length ? (
          <Banner tone="info" message="New claims now go in Expense claims, in More." action={{ label: 'New expense claim', onPress: newClaim }} />
        ) : (
          <EmptyState
            icon={<Receipt color={moduleTone.pay.fg} strokeWidth={1.8} />}
            title="No claims here"
            message="New claims now go in Expense claims, in More."
            action={<Button title="New expense claim" variant="accent" size="md" icon={<Plus />} onPress={newClaim} />}
          />
        )}

        {!q.isLoading && !q.isError && claims.length ? (
          <ActivityList title="My claims">{claims.map((c) => claimRow(c, money, today, () => openDetails(c)))}</ActivityList>
        ) : null}
      </Screen>

      <Sheet
        visible={detail && !!open}
        onClose={closeDetails}
        title={open ? `${categoryOf(open)} claim` : undefined}
        subtitle={open ? `Sent ${istDate(open.created_at, today)}` : undefined}
        footer={
          open?.status === 'pending' ? (
            <Button title="Cancel claim" variant="danger" loading={cancel.isPending} onPress={() => confirmCancel(open)} />
          ) : (
            <Button title="Done" variant="accent" onPress={closeDetails} />
          )
        }>
        {open && st ? (
          <>
            <SummaryCard
              hideEmpty
              rows={[
                { key: 'status', label: 'Status', value: st.label, status: st.tone },
                { key: 'amount', label: 'Amount', value: money.inr(open.amount) },
                { key: 'spent', label: 'Spent on', value: ymdLabel(open.claim_date, today) },
                { key: 'receipt', label: 'Bill number', value: open.receipt_ref || null },
                ...(decided ? [decided] : []),
                { key: 'paid', label: 'Paid with salary', value: open.paid_at ? istDate(open.paid_at, today) : null },
              ]}
            />
            {open.description ? <TextBlock label="What it was for" text={String(open.description)} /> : null}
            {open.decision_note ? <TextBlock label="Note from HR" text={String(open.decision_note)} /> : null}
            <ErrorText title="Couldn’t cancel the claim" text={cancel.error?.message} />
          </>
        ) : null}
      </Sheet>
    </>
  );
}
