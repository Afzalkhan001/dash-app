// Everything on the Accounts desk, loaded the way Bill Approvals loads it (dash.html:34834): vendor bills
// (+ the vendor names), and — for Accounts and Super Admin — petty cash requests, old petty cash bills and
// expense claims. CEO / COO read only petty cash (their PettyCashAccountsQueue). The three queues share
// their cache with the Inbox kinds (['inbox', 'petty-acct' | 'reimb-acct' | 'vbill', uid]).

import { useQueryClient } from '@tanstack/react-query';

import { useAccountsBills, useAccountsPetty, useAccountsReimbursements, useBillVendors } from '@/api/accounts';
import {
  canActAccountsClaims,
  canActAccountsPetty,
  canActVendorBills,
  canSeeAccountsClaims,
  canSeeAccountsPetty,
  canSeeVendorBills,
} from '@/features/accounts/access';
import { type AccountsItem, billItem, claimItem, type ItemType, pcBillItem, pettyItem } from '@/features/accounts/model';
import type { Access } from '@/lib/use-access';

export type DeskGates = {
  petty: boolean;
  claims: boolean;
  bills: boolean;
  actPetty: boolean;
  actClaims: boolean;
  actBills: boolean;
};

export const deskGates = (a: Access): DeskGates => ({
  petty: canSeeAccountsPetty(a),
  claims: canSeeAccountsClaims(a),
  bills: canSeeVendorBills(a),
  actPetty: canActAccountsPetty(a),
  actClaims: canActAccountsClaims(a),
  actBills: canActVendorBills(a),
});

/** May this person act on this item at all (role only; the own-item rule comes on top)? */
export const mayAct = (g: DeskGates, type: ItemType) => (type === 'bill' ? g.actBills : type === 'claim' ? g.actClaims : g.actPetty);

const newestFirst = (a: AccountsItem, b: AccountsItem) => b.at.localeCompare(a.at);

export function useAccountsItems(access: Access) {
  const qc = useQueryClient();
  const g = deskGates(access);
  const pettyQ = useAccountsPetty(g.petty);
  const claimsQ = useAccountsReimbursements(g.claims);
  const billsQ = useAccountsBills(g.bills);
  const vendorsQ = useBillVendors(g.bills);
  const user = access.user;
  const vendors = new Map((vendorsQ.data ?? []).map((v) => [v.id, v]));

  const items: AccountsItem[] = [];
  if (g.petty && pettyQ.data) {
    for (const r of pettyQ.data.requests) {
      const it = pettyItem(r, user);
      // Waiting items the viewer raised or is paid by are not theirs to approve (web rItems filter).
      if (it && !(it.stage === 'awaiting' && it.own)) items.push(it);
    }
    for (const b of pettyQ.data.bills) {
      const it = pcBillItem(b, user);
      if (it && !(it.stage === 'awaiting' && it.own)) items.push(it);
    }
  }
  if (g.claims && claimsQ.data) {
    for (const r of claimsQ.data) {
      const it = claimItem(r, user);
      if (it && !(it.stage === 'awaiting' && it.own)) items.push(it);
    }
  }
  if (g.bills && billsQ.data) {
    for (const b of billsQ.data) {
      const it = billItem(b, user, vendors);
      if (it) items.push(it);
    }
  }
  items.sort(newestFirst);

  const queries = [g.petty ? pettyQ : null, g.claims ? claimsQ : null, g.bills ? billsQ : null].filter((q) => q !== null);
  const loading = queries.some((q) => q.isPending);
  const failed = queries.filter((q) => q.isError && !q.data);
  const errorText = failed.map((q) => (q.error instanceof Error ? q.error.message : '')).find(Boolean) || null;

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['inbox', 'petty-acct'] }),
      qc.invalidateQueries({ queryKey: ['inbox', 'reimb-acct'] }),
      qc.invalidateQueries({ queryKey: ['inbox', 'vbill'] }),
      qc.invalidateQueries({ queryKey: ['accounts', 'bill-vendors'] }),
    ]);

  return {
    gates: g,
    items,
    vendors,
    loading,
    /** Every visible queue failed and nothing is cached. */
    error: queries.length > 0 && failed.length === queries.length ? errorText || 'Couldn’t load the Accounts queues.' : null,
    /** Some (not all) queues failed — show what loaded with a note. */
    partial: failed.length > 0 && failed.length < queries.length ? errorText || 'Some lists didn’t load.' : null,
    refresh,
  };
}

/** After any Accounts write: the queues, the petty cash and claims screens' own caches. */
export function useInvalidateAccounts() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['inbox', 'petty-acct'] }),
      qc.invalidateQueries({ queryKey: ['inbox', 'reimb-acct'] }),
      qc.invalidateQueries({ queryKey: ['inbox', 'vbill'] }),
      qc.invalidateQueries({ queryKey: ['inbox', 'agree-sign'] }),
      qc.invalidateQueries({ queryKey: ['accounts'] }),
      qc.invalidateQueries({ queryKey: ['petty'] }),
    ]);
}
