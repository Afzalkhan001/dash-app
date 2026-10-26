// The Accounts Inbox kinds — "With Accounts" (docs/port/accounts.md §4, PLAN §2.5): everything waiting on
// Accounts to approve, where approvers already look. Each reads the same query as the desk (under
// ['inbox', <key>, uid], so the one-minute poll and pull to refresh cover it):
//   petty-acct  petty cash at Accounts' stage (pending_accounts_approval — approved by its project owner,
//               or raised on a code the person owns) and old-flow petty cash bills still pending.
//               Accounts only (pettyCashIsApprover, dash.html:16248); never your own (server.js:3802).
//   reimb-acct  expense claims at Accounts' stage. Accounts only (reimbursements.js ACCOUNTS_ACT); never
//               your own.
//   vbill       vendor bills approved by their project owner. Accounts and Super Admin
//               (vendor_bills.js ACCOUNTS_ROLES + the Bill Approvals page).
//   agree-sign  vendor agreements the vendor has signed that name the viewer as the countersigner
//               (GET /vendor-agreements/pending-my-signature). Anyone can be named at draft time, and on
//               the website every staff role reaches "Agreements Sign" (Accounts › Vendor), so this is
//               how a named colleague finds it on the phone.
// This fills the hole the plan names: before, petty cash at Accounts' stage never reached Accounts in the
// app. The built-in `petty` kind (the project owner's stage) is unchanged.

import { Banknote, FileText, PenLine, Receipt } from 'lucide-react-native';
import { createElement } from 'react';

import { type AccountsAgreement, useAccountsBills, useAccountsPetty, useAccountsReimbursements, useBillVendors, usePendingMySignature } from '@/api/accounts';
import { canActAccountsClaims, canActAccountsPetty, canActVendorBills, canSeeAgreements } from '@/features/accounts/access';
import { AgreementDetailScreen } from '@/features/accounts/agreement-detail';
import { BillAcctHistory, ClaimAcctHistory, PettyAcctHistory } from '@/features/accounts/history';
import { BillAcctDetail, ClaimAcctDetail, PettyAcctDetail } from '@/features/accounts/item-detail';
import { type AccountsItem, billItem, claimItem, pcBillItem, pettyItem } from '@/features/accounts/model';
import { ago, rowInr } from '@/features/inbox/format';
import { type Access, defineInboxKind, type InboxKindPlugin, type InboxPluginItem, type InboxPluginResult } from '@/features/plugin-types';

type Item = InboxPluginItem<AccountsItem>;
const waiting = (it: AccountsItem | null): it is AccountsItem => !!it && it.stage === 'awaiting' && !it.own;
const asItem = (it: AccountsItem, at?: string | null): Item => ({ id: it.id, at: at || it.at, who: it.title, record: it });

function usePettyQueue(access: Access): InboxPluginResult<AccountsItem> {
  const on = canActAccountsPetty(access);
  const q = useAccountsPetty(on);
  const user = access.user;
  const items: Item[] = [];
  if (on && q.data) {
    for (const r of q.data.requests) {
      const it = pettyItem(r, user);
      if (waiting(it)) items.push(asItem(it, r.kekaApprovedAt || r.confirmedAt));
    }
    for (const b of q.data.bills) {
      const it = pcBillItem(b, user);
      if (waiting(it)) items.push(asItem(it));
    }
  }
  return { visible: on, items, pending: on && q.data ? items.length : null, error: on && q.isError && !q.data };
}

function useClaimQueue(access: Access): InboxPluginResult<AccountsItem> {
  const on = canActAccountsClaims(access);
  const q = useAccountsReimbursements(on);
  const items: Item[] = [];
  if (on && q.data) {
    for (const r of q.data) {
      const it = claimItem(r, access.user);
      if (waiting(it)) items.push(asItem(it, r.keka_approved_at));
    }
  }
  return { visible: on, items, pending: on && q.data ? items.length : null, error: on && q.isError && !q.data };
}

function useBillQueue(access: Access): InboxPluginResult<AccountsItem> {
  const on = canActVendorBills(access);
  const q = useAccountsBills(on);
  const vendorsQ = useBillVendors(on);
  const vendors = new Map((vendorsQ.data ?? []).map((v) => [v.id, v]));
  const items: Item[] = [];
  if (on && q.data) {
    for (const b of q.data) {
      const it = billItem(b, access.user, vendors);
      // No self-check on approving a vendor bill (vendor_bills.js:475), so your own ones are listed too.
      if (it && it.stage === 'awaiting') items.push(asItem(it, b.version?.keka_approved_at));
    }
  }
  return { visible: on, items, pending: on && q.data ? items.length : null, error: on && q.isError && !q.data };
}

type Sign = AccountsAgreement & { vendorName: string };

function useSignQueue(access: Access): InboxPluginResult<Sign> {
  const on = canSeeAgreements(access);
  const q = usePendingMySignature(on);
  const vendorsQ = useBillVendors(on && !!q.data?.length);
  const names = new Map((vendorsQ.data ?? []).map((v) => [v.id, v.legalEntityName]));
  const items: InboxPluginItem<Sign>[] = [];
  if (on && q.data) {
    for (const a of q.data) {
      if (!a || !a.id) continue;
      const vendorName = names.get(a.vendor_id) || 'Vendor';
      items.push({ id: a.id, at: a.signed_at || a.created_at, who: vendorName, record: { ...a, vendorName } });
    }
  }
  return { visible: on, items, pending: on && q.data ? items.length : null, error: on && q.isError && !q.data };
}

const SignDetail = ({ id }: { id: string }) => createElement(AgreementDetailScreen, { id });

export const inboxKinds: InboxKindPlugin[] = [
  defineInboxKind<AccountsItem>({
    key: 'petty-acct',
    label: 'Petty cash for Accounts',
    title: 'Petty cash',
    module: 'pettyCash',
    icon: Banknote,
    useItems: usePettyQueue,
    row: (item, { now }) => ({
      title: item.who,
      subtitle: `${item.record.project || item.record.kekaCode || '—'} · ${item.record.type === 'pcbill' ? 'Petty cash bill' : item.record.what}`,
      // A code with no owner: Accounts gave the first approval (kekaStageBy 'accounts'), so someone else authorizes it.
      meta:
        item.record.type === 'pcbill'
          ? 'Old-style bill to approve'
          : (item.record.row as { kekaStageBy?: string }).kekaStageBy === 'accounts'
            ? 'First approval by Accounts'
            : 'Approved by the project owner',
      value: rowInr(item.record.amount),
      age: ago(item.at, now),
    }),
    Detail: PettyAcctDetail,
    History: PettyAcctHistory,
  }),
  defineInboxKind<AccountsItem>({
    key: 'reimb-acct',
    label: 'Claims for Accounts',
    title: 'Expense claim',
    module: 'expenses',
    icon: Receipt,
    useItems: useClaimQueue,
    row: (item, { now }) => ({
      title: item.who,
      subtitle: `${item.record.what.replace(/^Expense claim · /, '')} · Expense claim`,
      meta: item.record.project || item.record.kekaCode || undefined,
      value: rowInr(item.record.amount),
      age: ago(item.at, now),
    }),
    Detail: ClaimAcctDetail,
    History: ClaimAcctHistory,
  }),
  defineInboxKind<AccountsItem>({
    key: 'vbill',
    label: 'Vendor bills',
    title: 'Vendor bill',
    module: 'vendor',
    icon: FileText,
    useItems: useBillQueue,
    row: (item, { now }) => ({
      title: item.who,
      subtitle: `${item.record.kekaCode || '—'} · ${item.record.what}`,
      meta: `Sent by ${item.record.person}`,
      value: rowInr(item.record.amount),
      age: ago(item.at, now),
    }),
    Detail: BillAcctDetail,
    History: BillAcctHistory,
  }),
  defineInboxKind<Sign>({
    key: 'agree-sign',
    label: 'Agreements to sign',
    title: 'Vendor agreement',
    module: 'vendor',
    icon: PenLine,
    useItems: useSignQueue,
    row: (item, { now }) => ({
      title: item.record.vendorName,
      subtitle: `${item.record.project_name || 'Agreement'} · Countersign`,
      meta: item.record.created_by_name ? `Drafted by ${item.record.created_by_name}` : undefined,
      age: ago(item.at, now),
    }),
    Detail: SignDetail,
  }),
];
