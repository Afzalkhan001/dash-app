// One thing on the Accounts desk — petty cash, an old petty cash bill, an expense claim or a vendor bill —
// with everything needed to act on it, and the one action its stage allows in the sticky bar:
//   Waiting        Reject (reason sheet) · Approve (confirm sheet)   — dash.html:34913-34949
//   Ready to pay   Start payment                                      — startPaymentFlow, dash.html:17069
//   Not received   Start payment again
// Every action is a ConfirmSheet with a swipe that says who is told (docs/port/accounts.md §2):
//   petty cash approve / reject / payment, old bills: nobody is emailed (they see it in DASH);
//   expense claims: approve and reject email the claimant; vendor bills: approve emails the person who
//   sent it with the payment timeline, reject emails them the reason. Starting a payment emails nobody:
//   the person it is for confirms Received or Not received in DASH — Accounts can never mark it paid.
// Role rules: vendor bills — accounts and super admin (no self-check before approving; the server
// refuses starting payment on your own bill); petty cash and claims — Accounts only, never on your own.
// Used by the Inbox kinds (/inbox/petty-acct|reimb-acct|vbill/<id>) and the desk (/admin/accounts/item/…).

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Banknote, Check, FileSpreadsheet, FileText, Hourglass, Landmark, Play, ReceiptText, RotateCcw, X } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Alert } from 'react-native';

import {
  acceptBill,
  approvePettyBill,
  authorizePetty,
  authorizeReimbursement,
  fetchBillFile,
  rejectBill,
  rejectPetty,
  rejectPettyBill,
  rejectReimbursement,
  startPayment,
  useBillHistory,
  type AccountsBill,
} from '@/api/accounts';
import { ApiRequestError, unwrap } from '@/api/client';
import type { Decision, KekaReimbursement } from '@/api/inbox';
import { fetchBillReceipt, type PettyCashBill, type PettyCashRequest } from '@/api/petty-cash';
import type { Reimbursement } from '@/api/reimbursements';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { type AccountsItem, billAmount, canStartPayment, type ItemType, METHOD_LABEL, PAY_KIND, paymentInfo, STAGE_META, TYPE_META } from '@/features/accounts/model';
import { FileSheet, type FileLoad, ReasonConfirmSheet } from '@/features/accounts/ui';
import { mayAct, useAccountsItems, useInvalidateAccounts } from '@/features/accounts/use-items';
import { noteDecision } from '@/features/inbox/decided';
import { DecidedSheet, DetailSkeleton, MissingItem, NoteCard, outcomeStatus, ReceiptButton, requesterItem, Timeline, useOutcome, WhoCards } from '@/features/inbox/detail';
import { kekaEvents, sentLine, type TimelineEvent } from '@/features/inbox/format';
import { historyEvents, list, money, shortDate } from '@/features/petty-cash/logic';
import { inr } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import {
  AccountRow,
  ActionBar,
  Banner,
  Button,
  ConfirmSheet,
  ErrorState,
  type FromToItem,
  haptic,
  NavHeader,
  Screen,
  SummaryCard,
  SummaryHero,
  type SummaryItem,
  toast,
} from '@/ui';

/** The Inbox kind each item type belongs to (for "Done today"). */
export const INBOX_KEY: Record<ItemType, string> = { petty: 'petty-acct', pcbill: 'petty-acct', claim: 'reimb-acct', bill: 'vbill' };

type Action = 'approve' | 'reject' | 'pay';

function call(it: AccountsItem, action: Action, reason: string) {
  if (action === 'pay') return unwrap(startPayment(PAY_KIND[it.type]!, it.id));
  switch (it.type) {
    case 'petty':
      return unwrap(action === 'approve' ? authorizePetty(it.id) : rejectPetty(it.id, reason));
    case 'pcbill':
      return unwrap(action === 'approve' ? approvePettyBill(it.id) : rejectPettyBill(it.id, reason));
    case 'claim':
      return unwrap(action === 'approve' ? authorizeReimbursement(it.id) : rejectReimbursement(it.id, reason));
    case 'bill':
      return unwrap(action === 'approve' ? acceptBill(it.id) : rejectBill(it.id, reason));
  }
}

// Who is told, per action (the server's own emails; docs/port/accounts.md §2).
function toldLine(it: AccountsItem, action: Action) {
  const who = it.person;
  if (action === 'pay') return `${paymentInfo(it).whoConfirms} is asked in DASH to confirm whether the money arrived. Accounts can’t mark it paid.`;
  if (it.type === 'claim') return action === 'approve' ? `${who} is emailed that it’s approved. You start the payment next.` : `${who} is emailed your reason and can send the claim again.`;
  if (it.type === 'bill') return action === 'approve' ? `${who} is emailed with your payment timeline. You start the payment next.` : `${who} is emailed your reason and can upload a corrected bill.`;
  return action === 'approve' ? 'Nobody is emailed. It moves to Ready to pay; you start the payment next.' : `Nobody is emailed. ${who} sees the reason in DASH.`;
}

const minReason = (t: ItemType) => (t === 'claim' || t === 'bill' ? 1 : 0);

function vendorBillEvents(b: AccountsBill): TimelineEvent[] {
  const v = b.version;
  const out: TimelineEvent[] = [{ key: 'sent', label: 'Sent', at: b.created_at, by: b.submitted_by_name ?? undefined, tone: 'neutral', detail: v ? inr(v.amount) : undefined }];
  if (v?.keka_approved_at) out.push({ key: 'owner', label: 'Approved by the project owner', at: v.keka_approved_at, by: v.keka_approved_by_name ?? b.keka_owner_name ?? undefined, tone: 'good' });
  else if (v && v.keka_approval_required === false) out.push({ key: 'owner', label: 'Project owner step not needed', tone: 'neutral' });
  if (v?.accounts_accepted_at) out.push({ key: 'acct', label: 'Approved by Accounts', at: v.accounts_accepted_at, by: v.accounts_accepted_by_name ?? undefined, tone: 'good' });
  if (v?.accounts_rejected_at) out.push({ key: 'acctr', label: 'Rejected by Accounts', at: v.accounts_rejected_at, note: v.accounts_reject_reason ?? undefined, tone: 'bad' });
  list(b.payment_history).forEach((h, i) => {
    if (!h || h.status === 'ready_for_payment') return;
    const base = { key: `p${i}`, at: h.at, by: h.byName, note: h.note };
    if (h.status === 'payment_processing') out.push({ ...base, label: h.followUp ? 'Payment sent again' : 'Payment sent', tone: 'info', detail: h.reference ? `Reference ${h.reference}` : undefined });
    else if (h.status === 'received') out.push({ ...base, label: 'Money received', tone: 'good' });
    else if (h.status === 'not_received') out.push({ ...base, label: 'Money not received', tone: 'bad' });
  });
  if (b.status === 'pending_accounts_approval') out.push({ key: 'w', label: 'Waiting for Accounts to approve', tone: 'wait' });
  if (b.status === 'accepted') out.push({ key: 'w', label: 'Waiting for Accounts to pay', tone: 'wait' });
  if (b.status === 'payment_processing') out.push({ key: 'w', label: `Waiting for ${b.submitted_by_name || 'the person who sent it'} to confirm the money arrived`, tone: 'wait' });
  if (b.status === 'not_received') out.push({ key: 'w', label: 'Accounts is following up on the payment', tone: 'wait' });
  return out;
}

const PETTY_TONE: Record<string, TimelineEvent['tone']> = { step: 'neutral', authorized: 'good', payment: 'info', ok: 'good', bad: 'bad', waiting: 'wait' };

function eventsOf(it: AccountsItem, userId: string | undefined, bill: AccountsBill | null): TimelineEvent[] {
  if (it.type === 'petty')
    return historyEvents(it.row as PettyCashRequest).map((e, i) => ({
      key: String(i),
      label: e.label,
      at: e.at,
      by: e.by,
      note: e.note,
      detail: e.detail?.map(([k, v]) => `${k}: ${v}`).join(' · ') || undefined,
      tone: PETTY_TONE[e.kind] ?? 'neutral',
    }));
  if (it.type === 'claim') return kekaEvents(it.row as unknown as KekaReimbursement, userId);
  if (it.type === 'bill') return vendorBillEvents(bill ?? (it.row as AccountsBill));
  const b = it.row as PettyCashBill;
  return [
    { key: 'up', label: 'Uploaded', at: b.createdAt, by: b.uploadedByName, tone: 'neutral' },
    ...(b.status === 'rejected' ? [{ key: 'rej', label: 'Rejected by Accounts', at: b.rejectedAt, note: b.rejectionReason, tone: 'bad' as const }] : []),
    ...(b.status === 'pending' ? [{ key: 'w', label: 'Waiting for Accounts to approve', tone: 'wait' as const }] : []),
  ];
}

export function AccountsItemScreen({ type, id }: { type: ItemType | ItemType[]; id: string }) {
  const router = useRouter();
  const access = useAccess();
  const now = useNow();
  const today = useTodayIst();
  const desk = useAccountsItems(access);
  const invalidate = useInvalidateAccounts();
  const outcome = useOutcome();
  const [held, setHeld] = useState<AccountsItem | null>(null);
  const [sheet, setSheet] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<FileLoad | null>(null);

  const types = Array.isArray(type) ? type : [type];
  const live = desk.items.find((i) => i.id === id && types.includes(i.type)) ?? null;
  const it = held ?? live;
  const historyQ = useBillHistory(it?.type === 'bill' ? it.id : '', it?.type === 'bill');
  const title = it ? TYPE_META[it.type].title : TYPE_META[types[0]!].title;

  const run = useMutation({
    mutationFn: ({ item, action, why }: { item: AccountsItem; action: Action; why: string }) => call(item, action, why),
    onSettled: () => void invalidate(),
  });

  if (!it) {
    if (desk.loading) return <DetailSkeleton title={title} />;
    if (desk.error)
      return (
        <Screen header={<NavHeader title={title} />}>
          <ErrorState message={desk.error} onRetry={() => void desk.refresh()} />
        </Screen>
      );
    return <MissingItem title={title} />;
  }

  const g = desk.gates;
  const roleMay = mayAct(g, it.type);
  // Vendor bills have no self-check before approving (vendor_bills.js:475); everything else does.
  const blockedOwn = it.own && !(it.type === 'bill' && it.stage === 'awaiting');
  const canDecide = it.stage === 'awaiting' && roleMay && !blockedOwn && !outcome.done;
  const canPay = canStartPayment(it) && roleMay && !it.own && !outcome.done;
  const t = TYPE_META[it.type];
  const pay = paymentInfo(it);
  const bill = it.type === 'bill' ? (historyQ.data?.bill ?? (it.row as AccountsBill)) : null;

  const close = () => {
    setSheet(null);
    router.back();
  };

  const act = (action: Action) => {
    const why = reason.trim();
    setHeld(it);
    run.mutate(
      { item: it, action, why },
      {
        onSuccess: () => {
          if (action === 'reject') haptic.warning();
          setSheet(null);
          if (action !== 'pay') noteDecision(`${INBOX_KEY[it.type]}:${it.id}`, access.user?.id, action as Decision);
          const rows: SummaryItem[] = [
            { key: 'who', label: it.type === 'bill' ? 'Vendor' : 'For', value: it.title },
            { key: 'amount', label: 'Amount', value: money(it.amount) },
            ...(it.kekaCode ? [{ key: 'code', label: 'Project code', value: it.kekaCode }] : []),
            action === 'pay' ? { key: 'status', label: 'Status', value: STAGE_META.processing.label, status: 'info' as const } : outcomeStatus(action as Decision),
          ];
          outcome.show(
            {
              decision: action === 'reject' ? 'reject' : 'approve',
              title: action === 'pay' ? 'Payment started' : action === 'approve' ? `${t.title} approved` : `${t.title} rejected`,
              subtitle: toldLine(it, action),
              rows,
            },
            true,
          );
        },
        onError: (e) => {
          haptic.error();
          setHeld(null);
          const status = e instanceof ApiRequestError ? e.status : undefined;
          if (status === 409) {
            // The server says why (already reviewed, or an old bill that would go past its petty cash).
            setSheet(null);
            toast.show(`${(e instanceof Error && e.message) || 'Someone else just updated this.'} Refreshed.`, 'info');
            void invalidate();
            return;
          }
          Alert.alert('Couldn’t save that', (e instanceof Error && e.message) || 'Please try again.');
        },
      },
    );
  };

  const open = (action: Action) => {
    setReason('');
    setSheet(action);
  };

  // ── Facts ──
  // The stage is the hero's label (and the notice under it), so Details doesn't repeat it.
  const fields: SummaryItem[] = [];
  const add = (label: string, value?: string | null, extra: Partial<SummaryItem> = {}) => {
    if (value) fields.push({ key: label, label, value, ...extra });
  };
  let note = '';
  let heads: SummaryItem[] = [];
  let receipt: ReactNode = null;
  if (it.type === 'petty') {
    const r = it.row as PettyCashRequest;
    note = r.remarks || '';
    add('Project code', r.kekaCode);
    add('Project', r.projectName);
    add('Project owner', r.costCodeOwnerName, { hint: r.kekaApprovedAt ? `Approved ${shortDate(r.kekaApprovedAt, today)}` : null });
    if (r.onBehalf) add('Raised by', r.requestedByName);
    add('Reference', it.ref);
    if (r.kind === 'excess') add('Bills vs petty cash', `${money(r.billsTotal)} spent of ${money(r.allocatedTotal)}`);
    heads = list(r.departments)
      .filter((h) => !!h)
      .map((h, i) => ({ key: `${h.departmentId}-${i}`, label: h.departmentName || 'Other', value: money(h.amount) }));
    if (r.kind === 'excess')
      receipt = (
        <AccountRow
          icon={FileSpreadsheet}
          module="pettyCash"
          title="The bills in this extra claim"
          sub="Open the expense report"
          actionLabel="View"
          onPress={() => router.push({ pathname: '/petty-cash/statement/[batchId]', params: { batchId: '_', request: r.id } })}
        />
      );
  } else if (it.type === 'pcbill') {
    const b = it.row as PettyCashBill;
    note = b.description || '';
    add('Project code', b.kekaCode);
    add('Project', b.projectName);
    add('Uploaded by', b.uploadedByName);
    add('Reference', it.ref);
    if (b.hasFile)
      receipt = (
        <AccountRow icon={ReceiptText} module="pettyCash" title="Bill" sub="Photo or PDF" actionLabel="View" onPress={() => setFile({ title: 'Bill', load: () => fetchBillReceipt(b.id) })} />
      );
  } else if (it.type === 'claim') {
    const r = it.row as Reimbursement;
    add('Project code', r.keka_code);
    add('Project', r.project_name);
    add('Project owner', r.keka_approved_by_name || r.keka_owner_name, { hint: r.keka_approved_at ? `Approved ${shortDate(r.keka_approved_at, today)}` : 'Their own project code' });
    add('Reference', it.ref);
    receipt = <ReceiptButton id={r.id} fileBase={it.ref} fileName={r.receipt_name} />;
  } else {
    const b = bill!;
    const v = b.version;
    note = v?.description || '';
    add('Sent by', b.submitted_by_name);
    add('Project code', b.keka_code);
    add('Project owner', b.keka_owner_name);
    if (v && v.keka_approved_amount != null && Number(v.keka_approved_amount) !== Number(v.amount)) add('Bill amount', money(Number(v.amount)), { hint: `Project owner approved ${money(billAmount(b))}` });
    if (b.is_advance) add('Kind', 'Vendor advance');
    if (v?.id)
      receipt = (
        <AccountRow icon={FileText} module="vendor" title="Bill" sub={v.file_name || 'Invoice'} actionLabel="View" onPress={() => setFile({ title: 'Bill', load: () => fetchBillFile(v.id) })} />
      );
  }
  const payRows: SummaryItem[] = pay.startedAt
    ? [
        { key: 'started', label: 'Started', value: shortDate(pay.startedAt, today), hint: pay.by ? `By ${pay.by}` : null },
        ...(pay.ref ? [{ key: 'ref', label: 'Reference', value: pay.ref }] : []),
        ...(pay.method ? [{ key: 'method', label: 'Method', value: METHOD_LABEL[pay.method] ?? pay.method }] : []),
        ...(pay.response?.response
          ? [
              {
                key: 'resp',
                label: 'Their answer',
                value: pay.response.response === 'received' ? 'Received' : 'Not received',
                status: pay.response.response === 'received' ? ('done' as const) : ('failed' as const),
                hint: [pay.response.byName, pay.response.at ? shortDate(pay.response.at, today) : null].filter(Boolean).join(' · ') || null,
              },
            ]
          : []),
      ]
    : [];

  // ── Notices: at most one ──
  const rejectedWhy =
    it.type === 'petty'
      ? (it.row as PettyCashRequest).rejectionReason
      : it.type === 'claim'
        ? (it.row as Reimbursement).rejection_reason
        : it.type === 'bill'
          ? bill?.version?.accounts_reject_reason
          : (it.row as PettyCashBill).rejectionReason;
  const notice =
    it.stage === 'rejected' ? (
      <Banner tone="danger" title="Rejected by Accounts" message={rejectedWhy || 'No reason given.'} />
    ) : it.stage === 'not_received' ? (
      <Banner tone="warning" title={`${pay.whoConfirms} says the money didn’t arrive`} message={pay.response?.note ? `“${pay.response.note}”` : 'Check the details, then start the payment again.'} />
    ) : it.stage === 'processing' ? (
      <Banner tone="info" icon={Hourglass} title={`Waiting for ${pay.whoConfirms}`} message="They confirm in DASH whether the money arrived. Only that completes it." />
    ) : (it.stage === 'awaiting' || canStartPayment(it)) && roleMay && blockedOwn ? (
      <Banner tone="info" title="This one is yours" message="Someone else in Accounts has to act on it." />
    ) : (it.stage === 'awaiting' || canStartPayment(it)) && !roleMay ? (
      <Banner tone="info" title="View only" message="Accounts acts on this." />
    ) : null;

  const from: FromToItem = requesterItem(it.person, sentLine(it.at, now));
  const toItem: FromToItem =
    canDecide || canPay ? { title: 'You', subtitle: 'Accounts', avatar: { name: access.user?.name || 'You' } } : { title: 'Accounts', subtitle: STAGE_META[it.stage].label, icon: Landmark };
  const summary: SummaryItem[] = [
    { key: 'who', label: it.type === 'bill' ? 'Vendor' : 'For', value: it.title },
    { key: 'what', label: 'What', value: it.what },
    ...(it.kekaCode ? [{ key: 'code', label: 'Project code', value: it.kekaCode }] : []),
    { key: 'amount', label: 'Amount', value: money(it.amount) },
  ];

  const footer = canDecide ? (
    <ActionBar note={it.type === 'bill' ? 'Approving emails the person who sent it.' : it.type === 'claim' ? 'Approving emails the claimant.' : null}>
      <Button title="Approve" icon={<Check />} onPress={() => open('approve')} disabled={run.isPending} />
      <Button title="Reject" variant="ghost" icon={<X />} onPress={() => open('reject')} disabled={run.isPending} />
    </ActionBar>
  ) : canPay ? (
    <ActionBar>
      <Button title={it.stage === 'not_received' ? 'Start payment again' : 'Start payment'} icon={it.stage === 'not_received' ? <RotateCcw /> : <Play />} onPress={() => open('pay')} disabled={run.isPending} />
    </ActionBar>
  ) : undefined;

  return (
    <>
      <Screen header={<NavHeader title={title} />} footer={footer} onRefresh={() => invalidate()}>
        <SummaryHero icon={t.icon} module={t.module} label={STAGE_META[it.stage].label} value={it.amount} currency="₹" decimals={2} sub={[it.title, it.project || it.kekaCode].filter(Boolean).join(' · ') || undefined} />
        <WhoCards from={from} to={toItem} />
        {notice}
        {note ? <NoteCard label={it.type === 'bill' ? 'What the bill is for' : it.type === 'pcbill' ? 'What it was for' : 'Note'} text={note} /> : null}
        {fields.length ? <SummaryCard title="Details" rows={fields} /> : null}
        {heads.length ? <SummaryCard title="What it’s for" rows={heads} /> : null}
        {receipt}
        {payRows.length ? <SummaryCard title="Payment" rows={payRows} /> : null}
        <Timeline events={eventsOf(it, access.user?.id, bill)} today={today} />
      </Screen>

      <ConfirmSheet
        visible={sheet === 'approve'}
        onClose={() => setSheet(null)}
        title={`Approve this ${t.label.toLowerCase()}?`}
        from={from}
        to={{ title: STAGE_META.ready.label, subtitle: 'Not paid yet', icon: Banknote, module: t.module }}
        detailsTitle="Details"
        confirmLabel="Swipe to approve"
        onConfirm={() => act('approve')}
        loading={run.isPending}
        note={toldLine(it, 'approve')}>
        <SummaryCard rows={summary} />
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'pay'}
        onClose={() => setSheet(null)}
        title={it.stage === 'not_received' ? 'Start the payment again?' : 'Start this payment?'}
        from={{ title: 'Accounts', subtitle: 'Pays', icon: Landmark }}
        to={requesterItem(pay.whoConfirms, 'Confirms it arrived')}
        detailsTitle="Payment"
        confirmLabel={it.stage === 'not_received' ? 'Swipe to pay again' : 'Swipe to start payment'}
        onConfirm={() => act('pay')}
        loading={run.isPending}
        note={toldLine(it, 'pay')}>
        <SummaryCard rows={summary} />
      </ConfirmSheet>

      <ReasonConfirmSheet
        visible={sheet === 'reject'}
        onClose={() => setSheet(null)}
        title={`Reject this ${t.label.toLowerCase()}?`}
        rows={summary}
        reason={reason}
        onReason={setReason}
        minLength={minReason(it.type)}
        placeholder={it.type === 'bill' ? 'What’s wrong with the bill' : 'Why it can’t be approved'}
        note={toldLine(it, 'reject')}
        confirmLabel="Swipe to reject"
        busy={run.isPending}
        onConfirm={() => act('reject')}
      />

      <FileSheet file={file} onClose={() => setFile(null)} />
      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={close} />
    </>
  );
}

// The Inbox kinds' detail screens (/inbox/<key>/<id>).
export const PettyAcctDetail = ({ id }: { id: string }) => <AccountsItemScreen type={['petty', 'pcbill']} id={id} />;
export const ClaimAcctDetail = ({ id }: { id: string }) => <AccountsItemScreen type="claim" id={id} />;
export const BillAcctDetail = ({ id }: { id: string }) => <AccountsItemScreen type="bill" id={id} />;
