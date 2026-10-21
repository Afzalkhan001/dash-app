// "Ask for a salary advance" — the website's advance form in MyClaims (dash.html ~L5085), taken in
// steps on /pay/advance (src/app/(app)/pay/advance.tsx): the amount on the keypad, then what comes off
// each salary on the keypad, then when to start and why — then this file's two sheets:
//   LoanConfirmSheet  the kit ConfirmSheet: FromTo (the amount → what comes off each month), a Payno
//                     SummaryCard of the request, and "Swipe to send" (Payno "Confirm Transfer")
//   LoanSentSheet     the kit SuccessSheet once HR has it (Payno "Bill Paid")
// and the rules the steps check. Body: { principal, emi, start_month, reason }, amounts in rupees —
// exactly what the web sends. The checks mirror the server's (hr_payroll.js POST /hr/loans ~L694) so
// mistakes are caught before sending; the server still decides, and its message is shown as-is (e.g.
// "You already have a pending loan request.").

import { CalendarClock, HandCoins } from 'lucide-react-native';

import type { HrLoan } from '@/api/pay';
import { ErrorText } from '@/features/pay/components';
import { monthName, toPaise } from '@/features/pay/format';
import { inr, plural } from '@/lib/format';
import { ConfirmSheet, SuccessSheet, SummaryCard } from '@/ui';

export const MAX_PRINCIPAL = 10_000_000; // ₹1,00,00,000 (server cap)
export const MAX_MONTHS = 60;
export const MAX_REASON = 500;

/** Whole months to pay `principal` back at `emi` a month (the server's rule: ceil in paise); null when it can't be worked out. */
export function termOf(principal: number, emi: number): number | null {
  if (!(principal > 0) || !(emi > 0) || emi > principal) return null;
  return Math.ceil(toPaise(principal) / toPaise(emi));
}

/** What is wrong with the amount, or null. */
export function principalError(p: number): string | null {
  if (!(p > 0)) return 'Enter an amount above ₹0.';
  if (p > MAX_PRINCIPAL) return 'Can’t be more than ₹1,00,00,000.';
  return null;
}

/** What is wrong with the monthly amount (against the amount), or null. */
export function emiError(p: number, m: number): string | null {
  if (!(m > 0)) return 'Enter a monthly amount above ₹0.';
  if (p > 0 && m > p) return 'Can’t be more than the amount.';
  const term = termOf(p, m);
  if (term != null && term > MAX_MONTHS) return `Too small. It must be paid back within ${MAX_MONTHS} months.`;
  return null;
}

export const reasonError = (reason: string) => (reason.trim().length < 3 ? 'Say what it’s for.' : null);

/** "Paid back in 10 months." under the monthly amount, or why the term is too long. */
export function termHint(p: number, m: number): string | null {
  const term = termOf(p, m);
  if (term == null) return null;
  return term > MAX_MONTHS ? `That takes ${term} months. The limit is ${MAX_MONTHS}.` : `Paid back in ${plural(term, 'month')}.`;
}

export type AdvanceDraft = { principal: number; emi: number; startMonth: string; reason: string };

/**
 * A typed amount for the short lines (the FromTo cards, the step summary): whole rupees when it has no
 * paise, otherwise exact — never rounded, so ₹1,24,500.50 doesn't read as ₹1,24,501 on the way to
 * "Swipe to send".
 */
export const typedInr = (n: number) => inr(n, { decimals: !Number.isInteger(n) });

function rowsFor(d: AdvanceDraft) {
  const term = termOf(d.principal, d.emi);
  return [
    { key: 'amount', label: 'Amount', value: inr(d.principal) },
    { key: 'emi', label: 'Paid back each month', value: inr(d.emi) },
    { key: 'start', label: 'Starts from', value: monthName(d.startMonth) },
    ...(term != null ? [{ key: 'term', label: 'Paid back in', value: plural(term, 'month') }] : []),
  ];
}

/** Review before sending: FromTo, the request as a SummaryCard, and the swipe. Can't close while sending. */
export function LoanConfirmSheet({
  visible,
  draft,
  sending,
  error,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  draft: AdvanceDraft | null;
  sending: boolean;
  /** The server's message after a failed send. */
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const term = draft ? termOf(draft.principal, draft.emi) : null;
  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      title="Check your request"
      subtitle="HR checks it before anything is paid."
      from={draft ? { title: typedInr(draft.principal), subtitle: 'Salary advance', icon: HandCoins, module: 'pay' } : undefined}
      to={
        draft
          ? {
              title: `${typedInr(draft.emi)} a month`,
              subtitle: term != null ? `From ${monthName(draft.startMonth, 'short')} · ${plural(term, 'month')}` : `From ${monthName(draft.startMonth, 'short')}`,
              icon: CalendarClock,
              module: 'pay',
            }
          : undefined
      }
      detailsTitle="Request"
      confirmLabel="Swipe to send"
      onConfirm={onConfirm}
      loading={sending}
      disabled={!draft}
      note="You can cancel it while it waits for HR.">
      {draft ? (
        <SummaryCard rows={[...rowsFor(draft), { key: 'reason', label: 'Reason', value: draft.reason }]} />
      ) : null}
      <ErrorText title="Couldn’t send the request" text={error} />
    </ConfirmSheet>
  );
}

/** After HR has it: the ✓, what was sent and its status. */
export function LoanSentSheet({ visible, loan, draft, onDone }: { visible: boolean; loan: HrLoan | null; draft: AdvanceDraft | null; onDone: () => void }) {
  const shown: AdvanceDraft | null = loan
    ? { principal: Number(loan.principal) || draft?.principal || 0, emi: Number(loan.emi) || draft?.emi || 0, startMonth: loan.start_month || draft?.startMonth || '', reason: loan.reason || draft?.reason || '' }
    : draft;
  return (
    <SuccessSheet visible={visible} onClose={onDone} title="Request sent" subtitle="HR will check it. You can follow it in Salary advance." primaryLabel="Done" onPrimary={onDone}>
      {shown ? <SummaryCard rows={[...rowsFor(shown), { key: 'status', label: 'Status', value: 'Waiting', status: 'pending' }]} /> : null}
    </SuccessSheet>
  );
}
