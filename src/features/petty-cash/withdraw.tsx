// Withdrawing a bill I sent by mistake (a wrong amount, a duplicate, the wrong project code) — the
// website's Withdraw on My Bills and on the expense report (dash.html withdrawBill / withdrawMine,
// DELETE /petty_cash_bill_submissions/:id). The bill stays on record, marked withdrawn, and stops
// counting as spent; an extra claim it was part of shrinks, or closes when nothing is left, and the
// toast says so in the website's words. Only while that claim is still waiting to be authorized.

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { unwrap } from '@/api/client';
import { withdrawPettyCashBill } from '@/api/petty-cash';
import { useInvalidateAccounts } from '@/features/accounts/use-items';
import { ConfirmSheet, haptic, SummaryCard, toast } from '@/ui';

import { money } from './logic';

/** The bill as a list row or an expense report line knows it. */
export type WithdrawableBill = { id: string; amount: number; voucherNumber?: string; description?: string; paidTo?: string; head?: string; departmentName?: string };

/** `ask(bill)` opens the confirm sheet; render `sheet` once. `onDone` runs after a withdrawal (e.g. refetch a report). */
export function useWithdrawBill(onDone?: () => void) {
  const invalidate = useInvalidateAccounts();
  // Kept while the sheet fades out, so its rows don't empty under the animation.
  const [bill, setBill] = useState<WithdrawableBill | null>(null);
  const [open, setOpen] = useState(false);
  const withdraw = useMutation({
    mutationFn: (b: WithdrawableBill) => unwrap(withdrawPettyCashBill(b.id)),
    onSuccess: (r, b) => {
      haptic.success();
      setOpen(false);
      const c = r?.claim;
      const claimLine =
        c && (c.before !== c.after || c.closed)
          ? c.closed
            ? ' Nothing was left to claim, so the extra request was closed.'
            : ` The extra claim is now ${money(c.after)} (was ${money(c.before)}).`
          : '';
      toast.show(`${['Bill', b.voucherNumber].filter(Boolean).join(' ')} withdrawn.${claimLine}`);
    },
    onError: (e) => {
      haptic.error();
      toast.show((e instanceof Error && e.message) || 'Couldn’t withdraw the bill.', 'danger');
    },
    onSettled: () => {
      void invalidate();
      onDone?.();
    },
  });

  const ask = (b: WithdrawableBill) => {
    setBill(b);
    setOpen(true);
  };

  const what = bill ? [bill.description, bill.paidTo].filter(Boolean).join(' — ') || bill.head || bill.departmentName || 'Bill' : '';
  const sheet = (
    <ConfirmSheet
      visible={open && !!bill}
      onClose={() => setOpen(false)}
      title="Withdraw this bill?"
      confirmLabel="Swipe to withdraw"
      tone="destructive"
      loading={withdraw.isPending}
      onConfirm={() => bill && withdraw.mutate(bill)}
      note="It stays on record but stops counting as an expense. It can’t be undone.">
      <SummaryCard
        rows={[
          { key: 'b', label: 'Bill', value: what },
          ...(bill?.voucherNumber ? [{ key: 'n', label: 'Bill no.', value: bill.voucherNumber }] : []),
        ]}
        total={{ label: 'Amount', value: money(bill?.amount) }}
      />
    </ConfirmSheet>
  );

  return { ask, sheet, busy: withdraw.isPending };
}
