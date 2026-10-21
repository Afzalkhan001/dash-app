// The small forms around a claim, as bottom sheets:
//   RespondSheet  — "Did you get the money?" (web: PaymentRespondModal), the very same sheet petty cash
//                   uses (PaymentAnswerSheet): Received / Not received, preselected when a bar button
//                   opened it, with an optional note.
//   ReuploadSheet — fix a rejected claim and send it again (web: ReimbursementReuploadModal)
// Approving or rejecting someone else's claim is not here: that happens only in the Inbox.
// Field problems show under the field; a server error shows as a danger Banner as the last block.
// The confirm button names the outcome ("Confirm received", "Send again").

import { Send } from 'lucide-react-native';
import { useState } from 'react';

import { MAX_DATA_URL_CHARS, type Reimbursement, useReuploadReimbursement, useRespondPayment } from '@/api/reimbursements';
import { useTodayIst } from '@/features/attendance/use-now';
import { type PaymentAnswer, PaymentAnswerSheet, showPaymentAnswerToast } from '@/features/petty-cash/components';
import { isoDay, purposeLabel } from '@/features/reimbursements/format';
import { ReceiptPicker } from '@/features/reimbursements/receipt-picker';
import type { PickedFile } from '@/lib/files';
import { inr } from '@/lib/format';
import { Banner, Button, haptic, Sheet, TextField, toast } from '@/ui';

const detailOf = (r: Reimbursement) => [purposeLabel(r.purpose), r.keka_code, r.payment?.reference ? `Reference ${r.payment.reference}` : ''].filter(Boolean).join(' · ');
const summaryOf = (r: Reimbursement) => [inr(r.amount), detailOf(r)].filter(Boolean).join(' · ');

const amountOf = (r: Reimbursement | null) => {
  const n = Number(r?.amount);
  return Number.isFinite(n) ? n : 0;
};

const TOO_BIG = 'That file is too big. Try a smaller one.';

function SubmitError({ msg, title = 'Couldn’t save' }: { msg: string; title?: string }) {
  if (!msg) return null;
  return <Banner tone="danger" title={title} message={msg} />;
}

// ── Did you get the money? ──────────────────────────────────────────────────────────────────────
/** `initial`: the answer the bar button chose (Received / Not received), or null to ask. */
export function RespondSheet({ claim, initial, onClose }: { claim: Reimbursement | null; initial: PaymentAnswer | null; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const respond = useRespondPayment();
  const today = useTodayIst();
  // The claim stays on the sheet while it fades out after closing (the caller clears `claim`).
  const [last, setLast] = useState(claim);
  if (claim && claim !== last) setLast(claim);
  const shown = claim ?? last;

  // A fresh error line each time the sheet opens (adjusted during render, not in an effect).
  const openKey = claim ? `${claim.id}:${initial}` : null;
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (openKey !== shownFor) {
    setShownFor(openKey);
    if (openKey) setMsg('');
  }

  const send = (answer: PaymentAnswer, note: string) => {
    if (!claim) return;
    setMsg('');
    respond.mutate(
      { id: claim.id, response: answer, note },
      {
        onSuccess: () => {
          haptic.success();
          showPaymentAnswerToast(answer);
          onClose();
        },
        onError: (e) => {
          haptic.error();
          setMsg(e.message);
        },
      },
    );
  };

  return (
    <PaymentAnswerSheet
      visible={!!claim}
      initial={initial}
      amount={amountOf(shown)}
      subtitle={shown ? [purposeLabel(shown.purpose), shown.keka_code].filter(Boolean).join(' · ') : undefined}
      // The same line petty cash shows: the payment's reference, or when the payment was sent.
      meta={
        shown?.payment?.reference
          ? `Reference ${shown.payment.reference}`
          : shown?.payment?.startedAt
            ? `Payment sent on ${isoDay(shown.payment.startedAt, today)}`
            : null
      }
      busy={respond.isPending}
      error={msg}
      onClose={onClose}
      onSend={send}
    />
  );
}

// ── Fix a rejected claim and send it again ──────────────────────────────────────────────────────
export function ReuploadSheet({ claim, onClose }: { claim: Reimbursement | null; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; file?: string }>({});
  const [msg, setMsg] = useState('');
  const reupload = useReuploadReimbursement();

  const openKey = claim?.id ?? null;
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (openKey !== shownFor) {
    setShownFor(openKey);
    if (claim) {
      setAmount(String(claim.amount ?? ''));
      setFile(null);
      setErrors({});
      setMsg('');
    }
  }

  if (!claim) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const n = Number(amount);
  const changed = n > 0 && Math.round(n * 100) !== Math.round(Number(claim.amount) * 100);
  const approvedByOwner = claim.rejected_stage === 'accounts';
  const dirty = !!file || String(claim.amount ?? '') !== amount;

  const submit = () => {
    // Same checks, same order as the web; each problem shows under its own field.
    const next: { amount?: string; file?: string } = {};
    if (!(n > 0)) next.amount = 'Enter the amount.';
    if (!file) next.file = 'Add the new bill.';
    else if (String(file.dataUrl || '').length > MAX_DATA_URL_CHARS) next.file = TOO_BIG;
    setErrors(next);
    setMsg('');
    if (next.amount || next.file || !file) {
      haptic.warning();
      return;
    }
    reupload.mutate(
      { id: claim.id, amount: n, fileData: file.dataUrl, fileName: file.name },
      {
        onSuccess: () => {
          haptic.success();
          onClose();
          toast.show('Claim sent again');
        },
        onError: (e) => {
          haptic.error();
          setMsg(e.message);
        },
      },
    );
  };

  // Who sees it next, in one line under the amount (no second banner).
  const next = !approvedByOwner
    ? 'The project owner will check it again.'
    : changed
      ? 'New amount, so the project owner must approve it again.'
      : 'Same amount, so it goes straight to Accounts.';

  return (
    <Sheet
      visible
      onClose={onClose}
      dirty={dirty && !reupload.isPending}
      title="Fix and resend"
      subtitle={summaryOf(claim)}
      footer={<Button title="Send again" icon={<Send />} loading={reupload.isPending} onPress={submit} />}>
      <Banner
        tone="danger"
        title={`Rejected by ${claim.rejected_stage === 'accounts' ? 'Accounts' : 'the project owner'}`}
        message={claim.rejection_reason || 'No reason was given.'}
      />
      <ReceiptPicker
        label="New bill photo"
        value={file}
        error={errors.file}
        onChange={(f) => {
          setFile(f);
          if (errors.file) setErrors((e) => ({ ...e, file: undefined }));
        }}
      />
      <TextField
        label="Amount (₹)"
        value={amount}
        onChangeText={(t) => {
          setAmount(t);
          if (errors.amount) setErrors((e) => ({ ...e, amount: undefined }));
        }}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={errors.amount}
        hint={next}
      />
      <SubmitError msg={msg} title="Couldn’t send it" />
    </Sheet>
  );
}
