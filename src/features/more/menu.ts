// The app's own modules that More links to (More itself is now drawn from the website's sidebar,
// features/more/nav.ts). Kept as a flat list for the + sheet (which actions to offer) and the tour
// (`moreTiles`: which More pages exist for a role's steps). Each entry appears only when the website
// would show that module to this person:
//   - the per-role sidebar table (dash.html navForRaw:1531, with ceo/coo = super_admin and an
//     unknown role falling back to employee), cut down to the modules the app has screens for;
//   - navFor's injections (dash.html:1433): Org for everyone unless the company switched it off,
//     Visitors for all but the platform owner / display / visitor-desk accounts, Timesheets for
//     HR users who clock in;
//   - the company feature switches (FEATURE_REGISTRY, tenantFeatureOn) — never for master_admin;
//   - the HR sections from /hr/me (lib/access hrSections), exactly as the HR page shows them.
// The server re-checks every request; this only decides what is shown.

import type { LucideIcon } from 'lucide-react-native';
import {
  Banknote,
  ClipboardList,
  DoorOpen,
  LifeBuoy,
  ListChecks,
  Megaphone,
  Palmtree,
  ScrollText,
  Trophy,
  Users,
} from 'lucide-react-native';

import type { Tenant } from '@/api/me';
import { hasTeam } from '@/features/team/team';
import { webNav } from '@/lib/access';
import type { useAccess } from '@/lib/use-access';
import type { ModuleKey } from '@/theme/tokens';

type NavId = 'tasks' | 'mytasks' | 'announcements' | 'bounty' | 'accounts' | 'support' | 'profile';

/**
 * The website's sidebar test by role alone (lib/access webNav — the full navFor port). Only for these
 * role-table ids, which need nothing but the role and the company's switches. master_admin's own
 * "bounty" item is Company Wallets (`wallets` in webNav), so `bounty` stays false for it.
 */
export function webNavHas(role: string | undefined, id: NavId, tenant: Tenant | null | undefined) {
  if (!role) return false;
  return webNav({ id: '', role }, id, tenant);
}

export type MenuItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** The module's colour (theme/tokens moduleTone) for its badge. */
  module: ModuleKey;
  count?: number;
  /** A few plain words under a tile whose name alone doesn't say what it is for. */
  caption?: string;
  /** A <TourTarget id> for the tile (Workspace rows promoted to tiles keep their row's id). */
  tourId?: string;
};

type Access = ReturnType<typeof useAccess>;

export type MoreMenu = {
  /** The modules More links to, in a fixed order. */
  tiles: MenuItem[];
  /** Plain links under the grid (Holidays, Timesheets). */
  links: MenuItem[];
};

/**
 * Everything the More tab links to, each entry only when this person has it. The tiles are the
 * secondary modules (attendance, leave and pay live on the Me tab; approvals in Inbox). The only
 * badge is the number of policies waiting for my acknowledgement.
 */
export function buildMoreMenu(access: Access, extra: { policiesToRead?: number } = {}): MoreMenu {
  const role = access.user?.role;
  const t = access.tenant;
  const s = access.sections;
  const has = (id: NavId) => webNavHas(role, id, t);
  const orgOn = !!role && t?.orgEnabled !== false;
  const toRead = Number(extra.policiesToRead);

  const tiles: MenuItem[] = [];
  // Accounts ▸ Petty Cash (the ACN group in navForRaw). Expense claims (Accounts ▸ Reimbursement) is
  // left out of the app on the owner's request.
  if (has('accounts')) {
    tiles.push({ key: 'petty-cash', label: 'Petty cash', href: '/petty-cash', icon: Banknote, module: 'pettyCash', caption: 'Small office expenses' });
  }
  if (role && !['master_admin', 'announcement_viewer', 'visitor_manager'].includes(role)) {
    tiles.push({ key: 'visitors', label: 'Visitors', href: '/visitors', icon: DoorOpen, module: 'visitors', caption: 'Invite a guest' });
  }
  if (has('mytasks') || has('tasks')) tiles.push({ key: 'tasks', label: 'My tasks', href: '/tasks', icon: ListChecks, module: 'tasks' });
  if (has('support')) tiles.push({ key: 'support', label: 'Help & support', href: '/support', icon: LifeBuoy, module: 'support' });
  if (s.policies) {
    const count = Number.isFinite(toRead) && toRead > 0 ? toRead : undefined;
    tiles.push({ key: 'policies', label: 'Policies', href: '/policies', icon: ScrollText, module: 'policies', count });
  }
  // "My team" (my manager, peers, direct reports, who is off this week); the whole company directory
  // and the org chart open from there. The old /people links still go straight to the directory.
  // The platform owner and the office TV are not on a team: their tile stays "People" (the directory).
  if (orgOn) {
    tiles.push(
      hasTeam(role)
        ? { key: 'people', label: 'My team', href: '/team', icon: Users, module: 'people' }
        : { key: 'people', label: 'People', href: '/people', icon: Users, module: 'people' },
    );
  }
  if (has('announcements')) tiles.push({ key: 'announcements', label: 'Announcements', href: '/announcements', icon: Megaphone, module: 'news' });
  if (has('bounty')) tiles.push({ key: 'bounty', label: 'Bounty rewards', href: '/bounty', icon: Trophy, module: 'bounty', caption: 'Earn coins for extra tasks' });

  // Holidays and Timesheets are rows in Me › Attendance; they are listed here only for people who
  // don't have that segment (same test as the Me tab), so no one sees the same entry in two places.
  const meHasAttendance = s.attendance || s.clock || s.shifts || s.regularization;
  const links: MenuItem[] = [];
  if (s.holidays && !meHasAttendance) links.push({ key: 'holidays', label: 'Holidays', href: '/attendance/holidays', icon: Palmtree, module: 'holidays' });
  if (s.timesheets && !meHasAttendance) links.push({ key: 'timesheets', label: 'Timesheets', href: '/attendance/timesheets', icon: ClipboardList, module: 'timesheets' });

  return { tiles, links };
}

export const canSeeAnnouncements = (role: string | undefined, tenant: Tenant | null | undefined) =>
  webNavHas(role, 'announcements', tenant);
