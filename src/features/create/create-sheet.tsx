// The tab bar's centre "+" (TabFab) opens this sheet (docs/REFERENCE-COMPONENTS.md item 5, Payno): a
// grid of round tinted icons, 4 per row (kit QuickActions), for everything a person can start from
// anywhere. Each entry appears only when the screen it opens would let this person in, using the very
// gates (and routes) the rest of the app uses:
//   Apply leave        useLeaveAccess(): enabled && hasLeave   → /leave/apply?kind=leave  (Home shortcuts)
//   Work from home     useLeaveAccess(): enabled && hasWfh     → /leave/apply?kind=wfh    (Home shortcuts)
//   Fix attendance     useAccess().sections.regularization    → /attendance/fix          (the Fix form's own gate)
//   Claim expense      canSeeReimbursements(user)              → /reimbursements/new      (Home shortcuts)
//   Petty cash bill    More's "Petty cash" tile                → /petty-cash/bills/new    (buildMoreMenu)
//   Raise a ticket     More's "Help & support" tile            → /support/new             (buildMoreMenu)
//   Invite a visitor   More's "Visitors" tile                  → /visitors/invite         (buildMoreMenu)
//   Salary advance     usePayAccess().advances                 → /pay/loans               (Me › Pay)
//   …then every domain's createActions(access) (features/<domain>/nav.ts via features/domains), in
//   the integrator's CREATE_ORDER (Assign task, Book, New chat, Raise for someone, Add asset, Start
//   kiosk, Invite visitor, Add employee) — the EXTENSION POINT from Wave 0
//   (docs/port/EXTENSION-POINTS.md §4). A domain action whose key or screen repeats a built-in one is
//   dropped, and the sheet holds at most CREATE_CAP actions (12: three rows of four).
// Choosing one closes the sheet, then opens the screen after the close animation (like MenuSheet).
// With nothing to start (a display or platform account) the sheet says so instead of showing a grid.

import { useRouter } from 'expo-router';
import { Banknote, CalendarClock, CalendarPlus, HandCoins, Laptop, ReceiptIndianRupee, TicketPlus, UserPlus } from 'lucide-react-native';

import { useSession } from '@/auth/session';
import { CREATE_CAP, domainCreateActions } from '@/features/domains';
import { useLeaveAccess } from '@/features/leave/use-leave-access';
import { buildMoreMenu } from '@/features/more/menu';
import { usePayAccess } from '@/features/pay/use-pay-access';
import type { CreateAction } from '@/features/plugin-types';
import { canSeeReimbursements } from '@/features/reimbursements/access';
import { useAccess } from '@/lib/use-access';
import { palette } from '@/theme/tokens';
import { EmptyState, type QuickAction, QuickActions, Sheet } from '@/ui';

export type { CreateAction };

/** What this person can start from the "+" button, in a fixed order, each only when they have access. */
export function useCreateActions(): CreateAction[] {
  const user = useSession((s) => s.user);
  const access = useAccess();
  const leave = useLeaveAccess();
  const pay = usePayAccess();
  const more = buildMoreMenu(access);
  const moreHas = (key: string) => more.tiles.some((t) => t.key === key);

  const list: CreateAction[] = [];
  if (leave.enabled && leave.hasLeave) {
    list.push({ key: 'leave', label: 'Apply leave', href: '/leave/apply?kind=leave', icon: CalendarPlus, module: 'leave', hint: 'Opens a new leave request' });
  }
  if (leave.enabled && leave.hasWfh) {
    list.push({ key: 'wfh', label: 'Work from home', href: '/leave/apply?kind=wfh', icon: Laptop, module: 'leave', hint: 'Opens a new work-from-home request' });
  }
  if (access.sections.regularization) {
    list.push({ key: 'fix', label: 'Fix attendance', href: '/attendance/fix', icon: CalendarClock, module: 'attendance', hint: 'Ask to correct a day’s clock-in or out' });
  }
  if (canSeeReimbursements(user)) {
    list.push({ key: 'claim', label: 'Claim expense', href: '/reimbursements/new', icon: ReceiptIndianRupee, module: 'expenses', hint: 'Opens a new expense claim' });
  }
  if (moreHas('petty-cash')) {
    list.push({ key: 'petty-bill', label: 'Petty cash bill', href: '/petty-cash/bills/new', icon: Banknote, module: 'pettyCash', hint: 'Add bills for petty cash you were given' });
  }
  if (moreHas('support')) {
    list.push({ key: 'ticket', label: 'Raise a ticket', href: '/support/new', icon: TicketPlus, module: 'support', hint: 'Ask HR, IT or admin for help' });
  }
  if (moreHas('visitors')) {
    list.push({ key: 'visitor', label: 'Invite a visitor', href: '/visitors/invite', icon: UserPlus, module: 'visitors', hint: 'Send a guest an entry code' });
  }
  if (pay.advances) {
    list.push({ key: 'advance', label: 'Salary advance', href: '/pay/loans', icon: HandCoins, module: 'pay', hint: 'Ask HR for a salary advance' });
  }
  // The domains' actions come after the built-in ones (their keys and screens never repeat one of
  // these), in the integrator's order, trimmed so the sheet stays at most CREATE_CAP (3 rows of 4).
  const extra = domainCreateActions(
    access,
    list.map((a) => a.key),
    list.map((a) => String(a.href)),
  );
  return [...list, ...extra.slice(0, Math.max(0, CREATE_CAP - list.length))];
}

/**
 * The "+" sheet: a 4-per-row grid of round tinted actions (3 across on a 320 dp phone, 2 per row with
 * large text). `items` defaults to useCreateActions(); pass a list to preview it (kit gallery).
 */
export function CreateSheet({ visible, onClose, items }: { visible: boolean; onClose: () => void; items?: CreateAction[] }) {
  const router = useRouter();
  const own = useCreateActions();
  const list = (Array.isArray(items) ? items : own).filter((a) => !!a && !!a.key);
  const actions: QuickAction[] = list.map((a) => ({
    key: a.key,
    label: a.label,
    icon: a.icon,
    module: a.module,
    hint: a.hint,
    onPress: () => {
      onClose();
      setTimeout(() => router.push(a.href), 280);
    },
  }));
  return (
    <Sheet visible={visible} onClose={onClose} title="Start something" subtitle="Requests and forms you can open from anywhere">
      {actions.length ? (
        <QuickActions items={actions} columns={4} />
      ) : (
        <EmptyState
          icon={<CalendarPlus color={palette.textMuted} strokeWidth={1.8} />}
          title="Nothing to start here"
          message="Your account has no requests or forms to open. Your HR team can switch them on."
        />
      )}
    </Sheet>
  );
}
