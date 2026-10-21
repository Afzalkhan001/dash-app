// Home's shortcut row: up to four round buttons in one line — Apply leave, Payslips, Attendance,
// Claim expense — each shown only when this person has that module, with the very gates the rest of
// the app uses:
//   Apply leave    useLeaveAccess().enabled (the personal leave area). Someone without leave gets
//                  the first kind they can request instead: "Work from home" or "Claim comp-off".
//                  Each opens the form fixed on that one kind (?kind=…), so the form's title is
//                  the tile's label and there is no kind switch to change it
//   Payslips       usePayAccess().payslips
//   Attendance     useAccess().sections.clock (people who clock in)
//   Claim expense  canSeeReimbursements (the web's Accounts ▸ Reimbursement roles). A verb, like
//                  "Apply leave": it opens a new claim form (the claims list lives in More)
// Home renders the row only when there are at least two (a lone button reads as a stray; everything
// here is also on Me or More).
//
// Drawn as the Payno "Bill Pay" grid (kit CategoryGrid, docs/REFERENCE-COMPONENTS.md item 9) right
// under the hero: equal frosted 56 dp circles, each with a thin line icon in its module's own colour
// (theme/tokens moduleTone, a lighter tint of the same family in dark mode), and a one- or two-word
// label under it (up to 2 lines, centred; the whole tile is the touch target, ≥ 48 dp). The kit keeps
// it one row while every label fits without breaking a word — 11 px labels on a 320 dp phone — and
// makes it a 2 × 2 grid with large text, so nothing is clipped or squeezed.

import { type Href, useRouter } from 'expo-router';
import { CalendarPlus, Fingerprint, type LucideIcon, ReceiptIndianRupee, ReceiptText } from 'lucide-react-native';

import { useSession } from '@/auth/session';
import { useLeaveAccess } from '@/features/leave/use-leave-access';
import { meHref } from '@/features/me/tabs';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { canSeeReimbursements } from '@/features/reimbursements/access';
import { useAccess } from '@/lib/use-access';
import { type ModuleKey, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { type CategoryItem, CategoryGrid } from '@/ui';

export type Shortcut = { key: string; label: string; href: Href; icon: LucideIcon; module: ModuleKey; hint?: string };

export function useShortcuts(): Shortcut[] {
  const user = useSession((s) => s.user);
  const access = useAccess();
  const leave = useLeaveAccess();
  const pay = usePayAccess();

  const list: Shortcut[] = [];
  if (leave.enabled) {
    if (leave.hasLeave) list.push({ key: 'leave', label: 'Apply leave', href: '/leave/apply?kind=leave', icon: CalendarPlus, module: 'leave' });
    else if (leave.hasWfh) list.push({ key: 'leave', label: 'Work from home', href: '/leave/apply?kind=wfh', icon: CalendarPlus, module: 'leave' });
    else {
      list.push({
        key: 'leave',
        label: 'Claim comp-off',
        href: '/leave/apply?kind=comp_off',
        icon: CalendarPlus,
        module: 'leave',
        hint: 'A day off for working on a holiday or weekend',
      });
    }
  }
  if (pay.payslips) list.push({ key: 'payslips', label: 'Payslips', href: '/pay/payslips', icon: ReceiptText, module: 'pay' });
  if (access.sections.clock) list.push({ key: 'attendance', label: 'Attendance', href: meHref('attendance'), icon: Fingerprint, module: 'attendance' });
  if (canSeeReimbursements(user)) list.push({ key: 'claim', label: 'Claim expense', href: '/reimbursements/new', icon: ReceiptIndianRupee, module: 'expenses', hint: 'Opens a new expense claim' });
  return list;
}

/** The quick-actions grid. Pass useShortcuts(); render it only when there are 2 or more. */
export function Shortcuts({ items }: { items: Shortcut[] }) {
  const router = useRouter();
  const list = (Array.isArray(items) ? items : []).filter((s) => !!s && !!s.key);
  if (!list.length) return null;
  const tiles: CategoryItem[] = list.map((s) => ({
    key: s.key,
    label: s.label,
    icon: s.icon,
    module: s.module,
    hint: s.hint,
    onPress: () => router.push(s.href),
  }));
  return <CategoryGrid items={tiles} columns={4} style={styles.row} />;
}

const styles = themedStyles(() => ({
  // A little air above and below, so the row reads as its own band between the hero and the lists.
  row: { paddingVertical: space.xxs },
}));
