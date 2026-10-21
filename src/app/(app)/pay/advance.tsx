// Ask for a salary advance — the website's advance form (dash.html ~L5085) as Payno's "Send money"
// flow, POST /hr/loans with { principal, emi, start_month, reason } (hr_payroll.js ~L694):
//   1. How much: AmountEntry driven by the NumericKeypad on the deep KeypadWash, "Next" above it,
//   2. Each month: the same, with how many months it takes as a live hint (60 at most),
//   3. When and why: the two amounts as an AccountRow (its "Change" goes back to step 1), the month
//      repayment starts (this month or one of the next 12) and the reason, "Check request" in the
//      sticky bar,
//   → the ConfirmSheet (FromTo, the request, "Swipe to send") → the SuccessSheet → back to
//   Salary advance, whose list already shows the new request.
// Back steps back through the steps (and asks before throwing away what was typed) — the header's
// round back and the phone's own (Android's back button, the iOS edge swipe) alike, as the old sheet
// asked before closing; nothing leaves while the request is being sent. Amounts are shown as typed
// (paise only when there are some). With a request already waiting for HR the form doesn't open — the
// server allows only one at a time.

import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { HandCoins } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';

import { type HrLoan, useMyLoans } from '@/api/pay';
import { useTodayIst } from '@/features/attendance/use-now';
import { PayHeader, PaySkeleton, PayUnavailable } from '@/features/pay/components';
import { monthName, nextMonths, rowsOf } from '@/features/pay/format';
import {
  type AdvanceDraft,
  emiError,
  LoanConfirmSheet,
  LoanSentSheet,
  MAX_PRINCIPAL,
  MAX_REASON,
  principalError,
  reasonError,
  termHint,
  termOf,
  typedInr,
} from '@/features/pay/loan-request-sheet';
import { useRequestLoan } from '@/features/pay/use-pay-actions';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { moduleTone, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  AmountEntry,
  amountValue,
  Button,
  EmptyState,
  haptic,
  KeypadWash,
  NumericKeypad,
  Screen,
  SelectField,
  TextField,
  useAmountKeypad,
  useLayout,
} from '@/ui';

type Step = 'amount' | 'emi' | 'details';
const STEPS: Step[] = ['amount', 'emi', 'details'];

export default function AdvanceRequestScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const l = useLayout();
  const pa = usePayAccess();
  const loansQ = useMyLoans(pa.advances);
  const send = useRequestLoan();
  // This month (IST) as state that follows the clock, so render stays pure.
  const firstMonth = useTodayIst().slice(0, 7);

  const [step, setStep] = useState<Step>('amount');
  const [principalText, setPrincipalText] = useState('');
  const [emiText, setEmiText] = useState('');
  const [start, setStart] = useState(firstMonth);
  const [reason, setReason] = useState('');
  // Errors show only once "Next" (or "Check request") was pressed on that step.
  const [tried, setTried] = useState<Record<Step, boolean>>({ amount: false, emi: false, details: false });
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<HrLoan | null>(null);
  const [done, setDone] = useState(false);

  const principal = amountValue(principalText);
  const emi = amountValue(emiText);
  const principalPad = useAmountKeypad(principalText, setPrincipalText, { max: MAX_PRINCIPAL });
  // What comes off each month can't be more than the amount.
  const emiPad = useAmountKeypad(emiText, setEmiText, { max: principal > 0 ? principal : undefined });
  const errors = { amount: principalError(principal), emi: emiError(principal, emi), details: reasonError(reason) };
  const dirty = !!(principalText || emiText || reason.trim());
  // The month list can go stale if the screen stays open across a month end; never send a past month.
  const startMonth = start < firstMonth ? firstMonth : start;
  const draft: AdvanceDraft | null = !errors.amount && !errors.emi && !errors.details ? { principal, emi, startMonth, reason: reason.trim() } : null;
  const options = nextMonths(firstMonth, 13).map((m, i) => ({ value: m, label: monthName(m), hint: i === 0 ? 'This month' : undefined }));
  const index = STEPS.indexOf(step);

  // Back to Salary advance (or straight to it when this screen was opened from a link).
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/pay/loans'));
  // Every way out of the screen (the header's back, Android's back button, the iOS swipe) is held
  // while there is a step to go back to, something typed, or a request on its way — until it is sent.
  usePreventRemove(!done && (send.isPending || index > 0 || dirty), ({ data }) => {
    if (send.isPending) return;
    if (index > 0) {
      setStep(STEPS[index - 1]!);
      return;
    }
    Alert.alert('Discard this request?', 'What you typed will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const back = () => {
    if (send.isPending) return;
    if (index > 0) {
      setStep(STEPS[index - 1]!);
      return;
    }
    leave();
  };

  const next = () => {
    setTried((t) => ({ ...t, [step]: true }));
    if (errors[step]) {
      haptic.warning();
      return;
    }
    if (step === 'details') {
      // An amount step that went wrong since (the amount lowered under the monthly amount): back to it.
      const bad = STEPS.find((s) => errors[s]);
      if (bad) {
        setTried((t) => ({ ...t, [bad]: true }));
        setStep(bad);
        haptic.warning();
        return;
      }
      send.reset();
      setConfirming(true);
      return;
    }
    setStep(STEPS[index + 1]!);
  };

  const submit = () => {
    if (!draft) return;
    send.mutate(
      { principal: draft.principal, emi: draft.emi, start_month: draft.startMonth, reason: draft.reason },
      {
        onSuccess: (loan) => {
          setConfirming(false);
          setDone(true);
          // Let the confirm sheet slide away before the success sheet comes up (two modals at once misbehave on iOS).
          setTimeout(() => setSent(loan ?? ({} as HrLoan)), 320);
        },
      },
    );
  };

  const header = <PayHeader title="Salary advance" subtitle={done ? undefined : `Step ${index + 1} of ${STEPS.length}`} privacy={false} onBack={back} />;

  if (pa.loading) {
    return (
      <Screen header={<PayHeader title="Salary advance" privacy={false} />}>
        <PaySkeleton rows={0} />
      </Screen>
    );
  }
  if (!pa.advances) {
    return (
      <Screen header={<PayHeader title="Salary advance" privacy={false} />}>
        <PayUnavailable systemRole={pa.isSystemRole} feature="salary advances" />
      </Screen>
    );
  }
  // Only one request at a time (the server says so too). Not while this screen's own request is
  // being sent or has just been sent: the refreshed list then holds it.
  const waiting = rowsOf(loansQ.data).find((x) => x.status === 'pending');
  if (waiting && !send.isPending && !send.isSuccess && !done) {
    return (
      <Screen header={<PayHeader title="Salary advance" privacy={false} />}>
        <EmptyState
          icon={<HandCoins color={moduleTone.pay.fg} strokeWidth={1.8} />}
          title="You already have a request waiting"
          message="HR checks one salary advance request at a time. You can cancel the waiting one in Salary advance."
          action={<Button title="Back to Salary advance" variant="accent" size="md" onPress={leave} />}
        />
      </Screen>
    );
  }

  const sheets = (
    <>
      <LoanConfirmSheet
        visible={confirming}
        draft={draft}
        sending={send.isPending}
        error={send.error ? send.error.message || 'Couldn’t send the request. Try again.' : null}
        onClose={() => {
          if (send.isPending) return;
          setConfirming(false);
        }}
        onConfirm={submit}
      />
      <LoanSentSheet visible={!!sent} loan={sent} draft={draft} onDone={leave} />
    </>
  );

  if (step === 'details') {
    const term = termOf(principal, emi);
    const blocker = !reason.trim() ? 'Add a reason to continue.' : errors.details && !tried.details ? 'Add a few more words for the reason.' : null;
    return (
      <>
        <Screen
          header={header}
          footer={
            <ActionBar note={blocker}>
              <Button title="Check request" disabled={!reason.trim()} onPress={next} />
            </ActionBar>
          }>
          <AccountRow
            icon={HandCoins}
            module="pay"
            title={`${typedInr(principal)} salary advance`}
            sub={[`${typedInr(emi)} off each salary`, term != null ? plural(term, 'month') : null].filter(Boolean).join(' · ')}
            onChange={() => setStep('amount')}
            actionAccessibilityLabel="Change the amounts"
          />
          <SelectField label="Start paying back in" value={start} options={options} onChange={setStart} />
          <TextField
            label="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="What is it for?"
            multiline
            maxLength={MAX_REASON}
            counter
            error={tried.details ? errors.details : null}
          />
        </Screen>
        {sheets}
      </>
    );
  }

  const isAmount = step === 'amount';
  const pad = isAmount ? principalPad : emiPad;
  // Once "Next" shows why the monthly amount won't do, the helper doesn't say it a second time.
  const emiShownError = tried.emi ? errors.emi : null;
  // Short phones (and large text) get a shorter fade above the keypad, so the amount keeps its room.
  const fade = l.height < 700 || l.fontScale > 1.15 ? space.xl : space.xxxl + space.lg;

  return (
    <>
      <Screen header={header} scroll={false} animate={false} contentStyle={styles.noGutter}>
        <ScrollView style={styles.flex} contentContainerStyle={[styles.top, { paddingHorizontal: l.gutter, gap: l.gap }]} showsVerticalScrollIndicator={false}>
          {isAmount ? (
            <AmountEntry
              key="amount"
              label="Amount you need"
              value={principalText}
              helper="You pay it back from your salary each month."
              error={tried.amount ? errors.amount : null}
            />
          ) : (
            <AmountEntry
              key="emi"
              label="Comes off each salary"
              value={emiText}
              helper={emiShownError ? undefined : (termHint(principal, emi) ?? 'How much HR takes back each month.')}
              meta={`Of ${typedInr(principal)}`}
              error={emiShownError}
            />
          )}
        </ScrollView>
        <KeypadWash fade={fade} style={styles.wash}>
          <Button variant="accent" title="Next" disabled={!(isAmount ? principal > 0 : emi > 0)} onPress={next} />
          <NumericKeypad onKey={pad.onKey} decimal={pad.decimal} />
        </KeypadWash>
      </Screen>
      {sheets}
    </>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  noGutter: { paddingHorizontal: 0 },
  top: { paddingTop: space.xxs, paddingBottom: space.md },
  wash: { gap: space.md },
}));
