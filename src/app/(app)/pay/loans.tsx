// Salary advance — the website's MyClaims card (dash.html ~L5073): ask for an advance, see my
// requests with what is left to repay, and cancel one still waiting.
// GET /hr/loans/mine, POST /hr/loans, POST /hr/loans/:id/cancel (hr_payroll.js ~L694–735).
//
// NavHeader (with the eye), then — only while an advance is being paid back — the light SummaryHero
// with what is left to repay, what comes off each salary and a striped "Paid back" bar; then my
// requests as a Payno transactions list; "Ask for a salary advance" is the one primary in the sticky
// bar (it opens the keypad flow on /pay/advance, and is off with a one-line reason while a request
// is waiting). A request opens a sheet with its details as a SummaryCard; a waiting one can be
// cancelled there.

import { useRouter } from 'expo-router';
import { HandCoins, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { type HrLoan, useMyLoans } from '@/api/pay';
import { useTodayIst } from '@/features/attendance/use-now';
import { ErrorText, heroAmount, PayHeader, PaySkeleton, PayUnavailable, TextBlock } from '@/features/pay/components';
import { amountOf, istDate, monthName, reqStatus, rowsOf } from '@/features/pay/format';
import { usePayMoney } from '@/features/pay/privacy';
import { useCancelLoan } from '@/features/pay/use-pay-actions';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { moduleTone } from '@/theme/tokens';
import { ActionBar, ActivityList, ActivityRow, Button, EmptyState, ErrorState, Screen, Sheet, StripedProgress, SummaryCard, SummaryHero, toast } from '@/ui';

type Money = ReturnType<typeof usePayMoney>;

const isRecovering = (l: HrLoan) => l.status === 'approved' || l.status === 'closed';

function loanRow(l: HrLoan, money: Money, today: string, onPress: () => void) {
  const st = reqStatus(l.status);
  const amount = money.inr(l.principal, { decimals: false });
  const subtitle =
    l.status === 'approved' && amountOf(l.outstanding) > 0
      ? `${money.inr(l.outstanding, { decimals: false })} left to repay`
      : `Asked on ${istDate(l.created_at, today)}`;
  return (
    <ActivityRow
      key={l.id}
      module="pay"
      icon={HandCoins}
      title="Salary advance"
      subtitle={subtitle}
      value={amount}
      status={{ label: st.label, tone: st.tone }}
      onPress={onPress}
      accessibilityLabel={`Salary advance of ${money.hidden ? 'hidden amount' : amount}, ${money.hidden && l.status === 'approved' ? 'amount left hidden' : subtitle}, ${st.label}`}
    />
  );
}

export default function LoansScreen() {
  const router = useRouter();
  const pa = usePayAccess();
  const money = usePayMoney();
  const today = useTodayIst();
  const q = useMyLoans(pa.advances);
  const cancel = useCancelLoan();
  // The opened request stays in state while the sheet fades out, so its content doesn't collapse.
  const [open, setOpen] = useState<HrLoan | null>(null);
  const [detail, setDetail] = useState(false);

  const header = <PayHeader title="Salary advance" privacy={pa.advances} />;

  if (pa.loading) {
    return (
      <Screen header={header}>
        <PaySkeleton rows={3} />
      </Screen>
    );
  }
  if (!pa.advances) {
    return (
      <Screen header={header}>
        <PayUnavailable systemRole={pa.isSystemRole} feature="salary advances" />
      </Screen>
    );
  }

  const loans = rowsOf(q.data);
  const pending = loans.find((l) => l.status === 'pending');
  const active = loans.filter((l) => l.status === 'approved' && amountOf(l.outstanding) > 0);
  const outstanding = active.reduce((t, l) => t + amountOf(l.outstanding), 0);
  const perMonth = active.reduce((t, l) => t + Math.min(amountOf(l.emi), amountOf(l.outstanding)), 0);
  const taken = active.reduce((t, l) => t + amountOf(l.principal), 0);
  const repaid = active.reduce((t, l) => t + amountOf(l.recovered), 0);
  const loaded = q.isSuccess;

  const openDetails = (l: HrLoan) => {
    cancel.reset();
    setOpen(l);
    setDetail(true);
  };

  const closeDetails = () => {
    if (cancel.isPending) return;
    cancel.reset();
    setDetail(false);
  };

  const confirmCancel = (l: HrLoan) => {
    Alert.alert('Cancel this request?', `Your request for ${money.inr(l.principal)} will be withdrawn.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () =>
          cancel.mutate(l.id, {
            onSuccess: () => {
              setDetail(false);
              toast.show('Request cancelled');
            },
          }),
      },
    ]);
  };

  const footer = loaded ? (
    <ActionBar note={pending ? 'Waiting for HR. Tap your request to cancel it.' : null}>
      <Button title="Ask for a salary advance" icon={<Plus />} disabled={!!pending} onPress={() => router.push('/pay/advance')} />
    </ActionBar>
  ) : undefined;

  const st = open ? reqStatus(open.status) : null;

  return (
    <>
      <Screen header={header} onRefresh={() => q.refetch()} footer={footer}>
        {q.isLoading ? (
          <PaySkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
        ) : active.length ? (
          <SummaryHero
            icon={HandCoins}
            module="pay"
            label="Left to repay"
            {...heroAmount(outstanding, money.hidden)}
            info={{
              label: 'Off each salary',
              value: money.inr(perMonth, { decimals: false }),
              accessibilityLabel: money.hidden ? 'Off each salary, amount hidden' : `${money.inr(perMonth, { decimals: false })} off each salary`,
            }}>
            {taken > 0 ? (
              <StripedProgress
                label="Paid back"
                color={moduleTone.pay.fg}
                used={repaid}
                total={taken}
                formatValue={(v) => money.inr(v, { decimals: false })}
                valueText={money.hidden ? 'Amounts hidden' : undefined}
                accessibilityLabel={money.hidden ? `Paid back ${Math.round((repaid / taken) * 100)}%` : undefined}
              />
            ) : null}
          </SummaryHero>
        ) : !loans.length ? (
          <EmptyState
            icon={<HandCoins color={moduleTone.pay.fg} strokeWidth={1.8} />}
            title="No salary advances"
            message="Ask HR for one. You pay it back from your salary each month."
          />
        ) : null}

        {loaded && loans.length ? <ActivityList title="My requests">{loans.map((l) => loanRow(l, money, today, () => openDetails(l)))}</ActivityList> : null}
      </Screen>

      <Sheet
        visible={detail && !!open}
        onClose={closeDetails}
        title={open ? 'Salary advance' : undefined}
        subtitle={open ? `Asked on ${istDate(open.created_at, today)}` : undefined}
        footer={
          open?.status === 'pending' ? (
            <Button title="Cancel request" variant="danger" loading={cancel.isPending} onPress={() => confirmCancel(open)} />
          ) : (
            <Button title="Done" variant="accent" onPress={closeDetails} />
          )
        }>
        {open && st ? (
          <>
            <SummaryCard
              rows={[
                { key: 'status', label: 'Status', value: st.label, status: st.tone },
                { key: 'amount', label: 'Amount', value: money.inr(open.principal) },
                { key: 'emi', label: 'Paid back each month', value: money.inr(open.emi) },
                { key: 'start', label: 'Starts from', value: monthName(open.start_month) },
                ...(isRecovering(open) ? [{ key: 'recovered', label: 'Paid back so far', value: money.inr(open.recovered) }] : []),
                ...(open.decided_by_name ? [{ key: 'decided', label: open.status === 'rejected' ? 'Rejected by' : 'Approved by', value: open.decided_by_name }] : []),
              ]}
              total={isRecovering(open) ? { label: 'Left to repay', value: money.inr(open.outstanding) } : null}
            />
            {open.reason ? <TextBlock label="Reason" text={String(open.reason)} /> : null}
            {open.decision_note ? <TextBlock label="Note from HR" text={String(open.decision_note)} /> : null}
            <ErrorText title="Couldn’t cancel the request" text={cancel.error?.message} />
          </>
        ) : null}
      </Sheet>
    </>
  );
}
