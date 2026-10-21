// What the Accounts domain adds to More, the + sheet and Home (docs/port/EXTENSION-POINTS.md §3, §4, §6;
// spec docs/port/accounts.md §4 "Entry points"). Pure: decided from `access` only.
//   More › Money  Accounts desk (Accounts, Super Admin; CEO / COO for petty cash, view only)
//                 Vendors (Accounts: registrations and the vendor list — the website's own menu)
//                 Vendor agreements (Accounts and the leadership roles; anyone named to countersign
//                 also gets the Inbox kind `agree-sign`)
//   + sheet       nothing: Accounts starts nothing new on a phone (agreement drafting waits for D4)
//   Home          Payments to start (the people who start payments)

import { FileSignature, Landmark, Store } from 'lucide-react-native';

import { canActAccountsClaims, canActAccountsPetty, canActVendorBills, canSeeAccountsDesk, canSeeVendors, showAgreementsRow } from '@/features/accounts/access';
import { PaymentsHomeCard } from '@/features/accounts/home-card';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const rows: WorkspaceRow[] = [];
  if (canSeeAccountsDesk(access))
    rows.push({
      key: 'accounts.desk',
      section: 'money',
      label: 'Accounts desk',
      subtitle: canActAccountsPetty(access)
        ? 'Approve petty cash, claims and vendor bills, and start payments'
        : canActVendorBills(access)
          ? 'Approve vendor bills and start their payments; see petty cash and claims'
          : 'Petty cash waiting on Accounts, to follow',
      href: '/admin/accounts',
      icon: Landmark,
      module: 'expenses',
      order: 10,
      tourId: 'more.accounts.desk',
    });
  if (canSeeVendors(access))
    rows.push({
      key: 'accounts.vendors',
      section: 'money',
      label: 'Vendors',
      subtitle: 'New registrations to check, and every approved vendor',
      href: '/admin/accounts/vendors',
      icon: Store,
      module: 'vendor',
      order: 11,
      tourId: 'more.accounts.vendors',
    });
  if (showAgreementsRow(access))
    rows.push({
      key: 'accounts.agreements',
      section: 'money',
      label: 'Vendor agreements',
      subtitle: 'Countersign, follow up and give vendors more time',
      href: '/admin/accounts/agreements',
      icon: FileSignature,
      module: 'vendor',
      order: 12,
    });
  return rows;
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(access: Access): HomeCard[] {
  if (!(canActAccountsPetty(access) || canActAccountsClaims(access) || canActVendorBills(access))) return [];
  return [{ key: 'accounts.payments', placement: 'needs', order: 50, Card: PaymentsHomeCard }];
}
