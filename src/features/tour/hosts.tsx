// The role tour hosts (docs/TOUR.md §2, §6.2): one invisible component per signed-in area, mounted in its
// tab layout so it lives exactly as long as the tabs do. Each builds the tour's context from hooks the
// app already runs (the same cached queries Home, Inbox, More and the + sheet read: nothing new is
// fetched), then hands it to useRoleTour, which starts the tour on first sign-in and serves "Show me
// around".
//   StaffTourHost   (app)/(tabs)/_layout.tsx — `creating` is the + sheet, which the tour waits behind
//   VendorTourHost  (vendor)/portal/(tabs)/_layout.tsx

import { usePathname } from 'expo-router';

import { useHrMe } from '@/api/me';
import { useVendorAgreements, useVendorBills, useVendorMe } from '@/api/vendor';
import { useSession } from '@/auth/session';
import { isDemoToken } from '@/demo/config';
import { useNow } from '@/features/attendance/use-now';
import { useCreateActions } from '@/features/create/create-sheet';
import { useShortcuts } from '@/features/home/shortcuts';
import { useWhosIn } from '@/features/home/whos-in';
import { hasInboxSummary } from '@/features/inbox/summary';
import { hasPastDecisions, useInboxSummary } from '@/features/inbox/use-inbox';
import { domainHomeCards } from '@/features/domains';
import { chipKeyOf } from '@/features/inbox/format';
import { buildWorkspace } from '@/features/more/workspace';
import { useLeaveAccess } from '@/features/leave/use-leave-access';
import { meSegmentsFor } from '@/features/me/tabs';
import { buildMoreMenu } from '@/features/more/menu';
import { useAppLock } from '@/features/more/security-card';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { usePolicyPendingCount } from '@/features/policies/use-policy-actions';
import { hasTeam } from '@/features/team/team';
import { buildStaffTour, buildVendorTour, staffTourIdFor, type StaffTourCtx, type VendorTourCtx, vendorTourIdFor } from '@/features/tour/role-tours';
import { useRoleTour } from '@/features/tour/use-role-tour';
import { agreementExpired, agreementPending, GENERATED_DECLARATIONS } from '@/features/vendor/constants';
import { billBuckets, registrationTodo } from '@/features/vendor/home';
import { useAccess } from '@/lib/use-access';
import { firstName } from '@/lib/format';

const STAFF_TABS = ['/', '/me', '/inbox', '/more'];
const VENDOR_TABS = ['/portal', '/portal/bills', '/portal/agreements', '/portal/profile'];

const str = (s: unknown) => (typeof s === 'string' ? s.trim() : '');

export function StaffTourHost({ creating }: { creating: boolean }) {
  const user = useSession((s) => s.user);
  const demo = useSession((s) => isDemoToken(s.token));
  const access = useAccess();
  const hrPending = useHrMe().isPending;
  const leave = useLeaveAccess();
  const pay = usePayAccess();
  const shortcuts = useShortcuts();
  const whosIn = useWhosIn();
  const summary = useInboxSummary();
  const toRead = usePolicyPendingCount();
  const create = useCreateActions();
  const lock = useAppLock();
  const pathname = usePathname();

  const menu = buildMoreMenu(access, { policiesToRead: toRead });
  const items = (Array.isArray(summary.items) ? summary.items : []).filter((i) => !!i && !!i.key);
  const queues = Array.isArray(summary.queues) ? summary.queues : [];
  const role = user?.role ?? '';
  const leaveShortcut = shortcuts.find((s) => s.key === 'leave')?.label ?? null;

  const ctx: StaffTourCtx = {
    firstName: firstName(user?.name),
    role,
    clock: access.sections.clock,
    isSystemRole: access.isSystemRole,
    meSegments: meSegmentsFor(access.sections, leave.enabled, pay.pay),
    leaveBalance: leave.enabled && leave.hasLeave,
    shortcuts: shortcuts.map((s) => s.key),
    leaveShortcut,
    whosIn: !!whosIn,
    needsYou: summary.total > 0 || toRead > 0,
    approvals: Array.isArray(access.approvals) ? access.approvals.length : 0,
    inboxItems: items.length,
    inboxRequests: items.filter((i) => i.kind !== 'visitors' && !(i.kind === 'plugin' && !i.decides)).length,
    inboxKinds: new Set(items.map(chipKeyOf)).size,
    inboxReviews: queues.some(hasPastDecisions),
    inboxSummary: hasInboxSummary(queues),
    createLabels: create.map((a) => a.label),
    moreTiles: menu.tiles.map((t) => t.key),
    hasTeam: hasTeam(role),
    lockAvailable: !!(lock.support?.hardware && lock.support.enrolled),
    demo,
    // What the domain plug-ins show this person (features/domains), for their tour steps.
    workspaceRows: buildWorkspace(access).keys,
    createKeys: create.map((a) => a.key),
    homeCards: domainHomeCards(access).map((c) => c.key),
  };

  useRoleTour({
    kind: 'staff',
    userKey: user?.id ? `staff:${user.id}` : null,
    tourId: user ? staffTourIdFor(role) : null,
    // Access is known and Inbox knows which queues this person has, so every gate is decided.
    loaded: !!user && !hrPending && !access.loading && !summary.discovering,
    pathname,
    home: '/',
    tabRoots: STAFF_TABS,
    blocked: creating,
    build: (prev) => buildStaffTour(ctx, prev),
    skipToast: 'You can see the tour again in More.',
  });
  return null;
}

export function VendorTourHost() {
  const demo = useSession((s) => isDemoToken(s.token));
  const me = useVendorMe();
  const v = me.data;
  const approved = v?.status === 'approved';
  const bills = useVendorBills(approved);
  const agreements = useVendorAgreements(approved);
  const now = useNow();
  const pathname = usePathname();

  const todo = v ? registrationTodo(v) : null;
  const docs = v && Array.isArray(v.documents) ? v.documents.filter((d) => d && typeof d.docType === 'string') : [];
  const toSign = (Array.isArray(agreements.data) ? agreements.data : []).filter((a) => !!a && agreementPending(a) && !agreementExpired(a, now));

  const ctx: VendorTourCtx = {
    name: str(v?.business?.tradeName) || str(v?.business?.legalEntityName),
    status: v?.status ?? '',
    bills: billBuckets(bills.data).all.length,
    vendorCode: !!str(v?.vendorCode),
    toSign: toSign.length,
    kycDone: todo?.kycState === 'done',
    openDocs: todo?.openDocs.length ?? 0,
    uploadDocs: (todo?.openDocs ?? []).filter((c) => !GENERATED_DECLARATIONS.includes(c.docType)).length,
    docs: docs.length,
    demo,
  };

  useRoleTour({
    kind: 'vendor',
    userKey: v?.id ? `vendor:${v.id}` : null,
    tourId: v ? vendorTourIdFor(v.status) : null,
    // Approved vendors' Home shows their bills and agreements, so wait for those too.
    loaded: !!v && (!approved || (!bills.isPending && !agreements.isPending)),
    pathname,
    home: '/portal',
    tabRoots: VENDOR_TABS,
    build: (prev) => buildVendorTour(ctx, prev),
    skipToast: 'You can see the tour again in Profile.',
  });
  return null;
}
