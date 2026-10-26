// More's navigation: the WEBSITE SIDEBAR for the signed-in person, as sections that open into their
// pages (owner request: "every section has sub sections which can be accessed", like dash.html).
//
//   1. The flat sidebar: lib/access webNavList (dash.html navFor over navForRaw, every gate, the
//      company switches, /hr/me and the job-openings count).
//   2. Its folders: organize() is dash.html navOrganize (:1555) — Home/Dashboard · Tasks ▾ · People ▾ ·
//      Booking · Team roster · [Announcements] · Organization ▾ · Rewards ▾ · [Accounts ▾] · Reports ·
//      Service desk · Visitor desk · Visitors · System ▾ · Me ▾ · Support, with Assets and anything not
//      named (Vendor registrations, Bill approvals, the Visitor Manager's desk pages …) right under
//      Home in the role's own order. The platform owner's short list is left as it is (Sidebar :1594).
//      Accounts sits inside Organization for the roles that have Departments, as on the website.
//   3. The app pages: every page the app has (its own screens and every domain's workspaceRows) names
//      the website items it belongs to (ANCHORS, first present wins). A page is shown only when its own
//      gate lets this person in, so nothing the role cannot use appears; a website item with no app
//      page is left out. Pages the website keeps elsewhere (Chat and calls in its floating launcher,
//      HR's own setup pages) go to the nearest section; anything with no anchor at all lands in
//      "More tools", so every page stays reachable.
// Left out on the owner's request: Expense claims (Accounts › Reimbursement) and Agreements.
// Pure: call it during render.

import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import {
  Building2,
  CalendarPlus,
  ClipboardList,
  DoorOpen,
  GitFork,
  Headset,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MessageCircle,
  Package,
  Palmtree,
  BarChart3,
  ScrollText,
  Search,
  Settings2,
  Trophy,
  UserRound,
  Users,
  Wrench,
  Banknote,
} from 'lucide-react-native';

import { domainWorkspaceRows } from '@/features/domains';
import type { WorkspaceRow } from '@/features/plugin-types';
import { hasTeam } from '@/features/team/team';
import { webNavList } from '@/lib/access';
import type { Access } from '@/lib/use-access';
import type { ModuleKey } from '@/theme/tokens';

export type MoreNavItem = {
  key: string;
  label: string;
  subtitle?: string;
  href: Href;
  icon: LucideIcon;
  module: ModuleKey;
  tourId?: string;
  /**
   * A folder inside the section on the website (Organization › Accounts): its name is drawn as a small
   * heading over its pages.
   */
  group?: string;
  /** A number to show (policies to read). */
  count?: number;
};

export type MoreNavSection = {
  key: string;
  label: string;
  icon: LucideIcon;
  module: ModuleKey;
  items: MoreNavItem[];
};

export type MoreNav = {
  sections: MoreNavSection[];
  /** Rows that belong in Account (Notifications). */
  account: MoreNavItem[];
  /** Every page key shown, for the tour. */
  keys: string[];
};

/**
 * Pages the app adds BESIDE a website item (the website has them on that item's own page, or not at
 * all): drawn after the item's main page, so "Reports" starts with Reports.
 */
const BESIDE = new Set([
  'docs.hub',
  'excel.hub',
  'newsroom.studio',
  'newsroom.tvs',
  'adminadvanced.playlists',
  'bountyadmin.hub',
  'hiring.desk',
  'hradvanced.extend',
  'servicedesk.raise',
  'itdesk.support',
  'grids.tables',
  'grids.ledger',
  'hradvanced.branding',
  'hradvanced.categories',
  'adminadvanced.delete',
  'desk.scan',
]);

/** Workspace rows the owner asked to take out of the app. */
const REMOVED = new Set(['accounts.agreements']);

// Where each app page sits: the website items it belongs to, nearest first. Virtual ids: 'hr-extra'
// (always inside Me, for HR pages the website keeps on its HR page), 'chat' (Chat & calls), 'account'.
const ANCHORS: Record<string, string[]> = {
  'app.mytasks': ['mytasks', 'tasks'],
  'work.tasks': ['tasks', 'teamroster', 'mytasks'],
  'teamboard.board': ['teamroster', 'trmytasks', 'tasks', 'mytasks'],
  'booking.requests': ['requests', 'booking'],
  'booking.hub': ['booking'],
  'booking.reviews': ['home', 'booking'],
  'hradvanced.extend': ['booking', 'teamroster'],
  'company.dashboard': ['dashboard'],
  'company.users': ['users'],
  'people.roster': ['roster', 'employees', 'users'],
  'adminadvanced.employees': ['employees', 'roster'],
  'adminadvanced.managers': ['managers', 'employees', 'roster'],
  'people.departments': ['departments', 'roster'],
  'work.projects': ['projects'],
  'work.clients': ['clients', 'projects'],
  'app.team': ['org-directory'],
  'app.directory': ['org-directory'],
  'app.orgtree': ['org-tree'],
  'app.announcements': ['announcements'],
  'newsroom.studio': ['announcements', 'config'],
  'newsroom.tvs': ['announcements', 'assets', 'config'],
  'adminadvanced.playlists': ['announcements', 'assets', 'config'],
  'app.bounty': ['bounty'],
  'bountyadmin.hub': ['bounty', 'wallets'],
  'platform.wallets': ['wallets'],
  'hiring.refer': ['referrals'],
  'hiring.desk': ['referrals', 'roster', 'departments'],
  'insights.reports': ['reports'],
  'insights.devices': ['devices', 'assets'],
  'docs.hub': ['reports', 'config'],
  'excel.hub': ['reports', 'config'],
  'grids.tables': ['attendance', 'hr-extra'],
  'grids.ledger': ['accounts-bill-review', 'accounts-pettycash'],
  'company.settings': ['config'],
  'hradvanced.branding': ['config'],
  'hradvanced.categories': ['config'],
  'adminadvanced.delete': ['config', 'tenants', 'assets', 'servicedesk'],
  'company.audit': ['audit'],
  'company.subscriptions': ['subscriptions'],
  'accounts.desk': ['accounts-bill-review', 'accounts-pettycash'],
  'accounts.vendors': ['vendors', 'vendormaster'],
  'app.pettycash': ['accounts-pettycash'],
  'app.visitors': ['visitors'],
  'desk.board': ['visitors-desk', 'visitors-dashboard'],
  'desk.kiosk': ['visitors-kiosk', 'visitors-desk'],
  'desk.scan': ['visitors-qr', 'visitors-desk'],
  'desk.log': ['visitors-log', 'visitors-desk'],
  'desk.invites': ['visitors-invites', 'visitors-desk'],
  'desk.qr': ['visitors-qr', 'visitors-desk'],
  'itdesk.assets': ['assets'],
  'itdesk.rooms': ['rooms'],
  'itdesk.support': ['support'],
  'servicedesk.desk': ['servicedesk'],
  'servicedesk.raise': ['servicedesk', 'tasks'],
  'platform.companies': ['tenants'],
  'platform.features': ['features'],
  'hrtime.setup': ['attendance', 'hr-extra'],
  'payroll.hub': ['attendance', 'hr-extra'],
  'hradvanced.payroll-setup': ['attendance', 'hr-extra'],
  'adminadvanced.officemap': ['attendance', 'hr-extra'],
  'app.holidays': ['attendance', 'hr-extra'],
  'app.policies': ['attendance', 'hr-extra'],
  'app.timesheets': ['timesheets', 'hr-extra'],
  'app.support': ['support'],
  'chat.chat': ['chat'],
  'calls.calls': ['chat'],
  'push.settings': ['account'],
};

// The section names, in plain words but as the website says them.
const LABEL: Record<string, string> = {
  home: 'Pending reviews',
  dashboard: 'Dashboard',
  'grp-tasks': 'Tasks',
  'grp-people': 'People',
  'grp-org': 'Organization',
  'grp-rewards': 'Rewards',
  'grp-system': 'System',
  'grp-me': 'Me & HR',
  org: 'Organization',
  tasks: 'Tasks',
  mytasks: 'My tasks',
  requests: 'Requests',
  trmytasks: 'My team tasks',
  users: 'Users',
  roster: 'Employee roster',
  employees: 'Employees',
  managers: 'Managers',
  departments: 'Departments',
  projects: 'Projects',
  clients: 'Clients',
  booking: 'Booking',
  teamroster: 'Team roster',
  announcements: 'Announcements',
  bounty: 'Bounty system',
  wallets: 'Company wallets',
  referrals: 'Referral program',
  accounts: 'Accounts',
  'accounts-bill-review': 'Bill approvals',
  'accounts-pettycash': 'Petty cash',
  vendors: 'Vendor registrations',
  vendormaster: 'Vendor master',
  reports: 'Reports',
  servicedesk: 'Service desk',
  'visitors-desk': 'Visitor desk',
  'visitors-dashboard': 'Visitor desk',
  'visitors-kiosk': 'Kiosk mode',
  'visitors-log': 'Visitor log',
  'visitors-invites': 'Invites',
  'visitors-qr': 'Check-in QR',
  visitors: 'Visitors',
  assets: 'Assets',
  rooms: 'Rooms & locations',
  devices: 'Device monitoring',
  audit: 'Activity audit',
  config: 'Company settings',
  subscriptions: 'Subscriptions',
  attendance: 'HR',
  timesheets: 'Timesheets',
  tenants: 'Companies',
  features: 'Company features',
  support: 'Support',
  chat: 'Chat & calls',
  other: 'More tools',
};

// Section badges (a single-page section shows its page's own badge instead).
const SECTION_ICON: Record<string, { icon: LucideIcon; module: ModuleKey }> = {
  'grp-tasks': { icon: ListChecks, module: 'tasks' },
  tasks: { icon: ListChecks, module: 'tasks' },
  'grp-people': { icon: Users, module: 'people' },
  'grp-org': { icon: Building2, module: 'people' },
  org: { icon: Building2, module: 'people' },
  'grp-rewards': { icon: Trophy, module: 'bounty' },
  bounty: { icon: Trophy, module: 'bounty' },
  referrals: { icon: Trophy, module: 'bounty' },
  'grp-system': { icon: Settings2, module: 'security' },
  config: { icon: Settings2, module: 'policies' },
  'grp-me': { icon: UserRound, module: 'profile' },
  booking: { icon: CalendarPlus, module: 'tasks' },
  teamroster: { icon: KanbanSquare, module: 'tasks' },
  announcements: { icon: Megaphone, module: 'news' },
  accounts: { icon: Landmark, module: 'pettyCash' },
  'accounts-bill-review': { icon: Landmark, module: 'expenses' },
  reports: { icon: BarChart3, module: 'timesheets' },
  servicedesk: { icon: Headset, module: 'support' },
  'visitors-desk': { icon: LayoutDashboard, module: 'visitors' },
  'visitors-qr': { icon: LayoutDashboard, module: 'visitors' },
  visitors: { icon: DoorOpen, module: 'visitors' },
  assets: { icon: Package, module: 'support' },
  support: { icon: LifeBuoy, module: 'support' },
  chat: { icon: MessageCircle, module: 'news' },
  other: { icon: Wrench, module: 'policies' },
};

type Node = { id: string; children?: string[] };

/** dash.html navOrganize (:1555) on ids: where each sidebar item is drawn. Never adds or drops an item. */
function organize(flat: string[], role: string): Node[] {
  // The flat list → the sidebar's items: Accounts' children follow `accounts`; Org has two pages.
  const items: Node[] = [];
  for (let i = 0; i < flat.length; i += 1) {
    const id = flat[i]!;
    if (id === 'accounts') {
      const kids: string[] = [];
      while (i + 1 < flat.length && flat[i + 1]!.startsWith('accounts-')) kids.push(flat[(i += 1)]!);
      items.push({ id, children: kids });
    } else if (id === 'org') items.push({ id, children: ['org-directory', 'org-tree'] });
    else items.push({ id });
  }
  if (role === 'master_admin') return [...items, { id: 'chat' }];
  const byId = new Map(items.map((n) => [n.id, n]));
  const has = (id: string) => byId.has(id);
  const take = new Set<string>();
  const pick = (ids: string[]) => ids.filter(has).map((id) => (take.add(id), byId.get(id)!));
  const ids = (nodes: Node[]) => nodes.flatMap((n) => (n.children && n.id !== 'accounts' && n.id !== 'org' ? n.children : [n.id, ...(n.children ?? [])]));
  const grp = (id: string, kids: Node[]): Node | null => {
    if (!kids.length) return null;
    if (kids.length === 1) return kids[0]!;
    return { id, children: ids(kids) };
  };
  const orgItem = byId.get('org');
  if (orgItem) take.add('org');
  const accounts = byId.get('accounts');
  const orgAdmin = has('departments');
  const out: Node[] = [];
  const push = (n: Node | null) => {
    if (n) out.push(n);
  };
  pick(['home', 'dashboard']).forEach(push);
  const afterHome = out.length;
  const tasks = pick(['requests', 'tasks', 'mytasks', 'trmytasks']);
  if (tasks.length) out.push({ id: 'grp-tasks', children: ids(tasks) }); // kept as a folder, as on the web
  push(grp('grp-people', pick(['users', 'roster', 'employees', 'managers'])));
  pick(['booking', 'teamroster']).forEach(push);
  if (!orgAdmin) pick(['announcements']).forEach(push);
  const orgKids: Node[] = [...(orgItem ? [{ id: 'org-directory' }, { id: 'org-tree' }] : []), ...pick(orgAdmin ? ['departments', 'projects'] : ['projects'])];
  if (orgAdmin && accounts) {
    take.add('accounts');
    orgKids.push(accounts);
  }
  if (orgAdmin) orgKids.push(...pick(['subscriptions', 'announcements']));
  if (orgKids.length) out.push(orgKids.length === 1 && !orgItem ? orgKids[0]! : { id: 'grp-org', children: ids(orgKids) });
  push(grp('grp-rewards', pick(['bounty', 'referrals'])));
  if (!orgAdmin && accounts) {
    take.add('accounts');
    out.push(accounts);
  }
  pick(['reports', 'servicedesk', 'visitors-desk', 'visitors']).forEach(push);
  const assets = pick(['assets']);
  push(grp('grp-system', pick(['rooms', 'devices', 'audit', 'config'])));
  // Me always exists in the app: HR's own pages (holidays, policies, HR setup …) live there.
  out.push({
    id: 'grp-me',
    children: [...ids(pick(['attendance', 'timesheets', 'clients', 'profile'])), 'hr-extra'],
  });
  const support = has('support') ? (take.add('support'), byId.get('support')!) : null;
  out.splice(afterHome, 0, ...assets, ...items.filter((n) => !take.has(n.id)));
  out.push({ id: 'chat' });
  if (support) out.push(support);
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The app's own screens (not domain rows), each behind the gate the website uses for it. */
function appItems(access: Access, flat: string[], policiesToRead: number): (MoreNavItem & { order: number })[] {
  const role = access.user?.role;
  const s = access.sections;
  const on = (id: string) => flat.includes(id);
  const team = hasTeam(role);
  const out: (MoreNavItem & { order: number })[] = [];
  if (on('mytasks') || on('tasks'))
    out.push({
      key: 'app.mytasks',
      label: 'My tasks',
      subtitle: 'Work given to you',
      href: '/tasks',
      icon: ListChecks,
      module: 'tasks',
      tourId: 'more.myTasks',
      order: 5,
    });
  if (on('org')) {
    if (team)
      out.push({
        key: 'app.team',
        label: 'My team',
        subtitle: 'Your manager, teammates and who is off',
        href: '/team',
        icon: Users,
        module: 'people',
        tourId: 'more.myTeam',
        order: 1,
      });
    out.push({
      key: 'app.directory',
      label: 'Employee directory',
      subtitle: 'Find anyone in the company',
      href: '/people',
      icon: Search,
      module: 'people',
      tourId: team ? undefined : 'more.people',
      order: 2,
    });
    out.push({
      key: 'app.orgtree',
      label: 'Organization tree',
      subtitle: 'Who reports to whom',
      href: '/people/org',
      icon: GitFork,
      module: 'people',
      order: 3,
    });
  }
  if (on('announcements'))
    out.push({
      key: 'app.announcements',
      label: 'Announcements',
      subtitle: 'Company news and celebrations',
      href: '/announcements',
      icon: Megaphone,
      module: 'news',
      tourId: 'more.news',
      order: 1,
    });
  if (on('bounty'))
    out.push({
      key: 'app.bounty',
      label: 'Bounty system',
      subtitle: 'Earn coins for extra tasks',
      href: '/bounty',
      icon: Trophy,
      module: 'bounty',
      tourId: 'more.bounty',
      order: 1,
    });
  if (on('accounts-pettycash'))
    out.push({
      key: 'app.pettycash',
      label: 'Petty cash',
      subtitle: 'Ask for money and send your bills',
      href: '/petty-cash',
      icon: Banknote,
      module: 'pettyCash',
      tourId: 'more.pettyCash',
      order: 1,
    });
  if (on('visitors'))
    out.push({
      key: 'app.visitors',
      label: 'Visitors',
      subtitle: 'Invite a guest and see who is waiting',
      href: '/visitors',
      icon: DoorOpen,
      module: 'visitors',
      order: 1,
    });
  if (on('support'))
    out.push({
      key: 'app.support',
      label: 'Help & support',
      subtitle: 'Raise a ticket with HR, IT or admin',
      href: '/support',
      icon: LifeBuoy,
      module: 'support',
      tourId: 'more.support',
      order: 1,
    });
  if (s.holidays)
    out.push({
      key: 'app.holidays',
      label: 'Holidays',
      subtitle: 'This year’s holiday list',
      href: '/attendance/holidays',
      icon: Palmtree,
      module: 'holidays',
      order: 3,
    });
  if (s.timesheets)
    out.push({
      key: 'app.timesheets',
      label: 'Timesheets',
      subtitle: 'Your hours, day by day',
      href: '/attendance/timesheets',
      icon: ClipboardList,
      module: 'timesheets',
      order: 2,
    });
  if (s.policies) {
    const n = Number.isFinite(policiesToRead) && policiesToRead > 0 ? Math.round(policiesToRead) : 0;
    out.push({
      key: 'app.policies',
      label: 'Policies',
      subtitle: n ? `${plural(n, 'policy', 'policies')} to read` : 'Company rules to read',
      href: '/policies',
      icon: ScrollText,
      module: 'policies',
      count: n || undefined,
      order: 4,
    });
  }
  return out;
}

const fromRow = (r: WorkspaceRow): MoreNavItem & { order: number } => ({
  key: r.key,
  label: r.label,
  subtitle: r.subtitle,
  href: r.href,
  icon: r.icon,
  module: r.module,
  tourId: r.tourId,
  order: 100 + (typeof r.order === 'number' ? r.order : 100),
});

/** More's sections for this person, in the website's order. */
export function buildMoreNav(access: Access, extra: { policiesToRead?: number } = {}): MoreNav {
  const user = access.user;
  if (!user) return { sections: [], account: [], keys: [] };
  const flat = (
    webNavList(user, access.tenant, {
      hr: access.hr,
      jobOpenings: access.jobOpenings,
    }) as string[]
  ).filter((id) => id !== 'payroll');
  const nodes = organize(flat, user.role);
  const rows = domainWorkspaceRows(access).filter((r) => !REMOVED.has(r.key) && !!r.label && !!r.href && !!r.icon);
  const pages = [...appItems(access, flat, Number(extra.policiesToRead)), ...rows.map(fromRow)];

  // Every id a node holds (itself and its pages), in sidebar order.
  const nodeIds = nodes.map((n) => (n.children ? n.children : [n.id]));
  const where = new Map<string, { node: number; pos: number }>();
  nodeIds.forEach((list, node) =>
    list.forEach((id, pos) => {
      if (!where.has(id)) where.set(id, { node, pos });
    }),
  );
  const buckets: { item: MoreNavItem & { order: number }; pos: number }[][] = nodes.map(() => []);
  const other: (MoreNavItem & { order: number })[] = [];
  const account: MoreNavItem[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    const anchors = ANCHORS[p.key] ?? [];
    if (anchors[0] === 'account') {
      account.push(p);
      continue;
    }
    const at = anchors.map((a) => where.get(a)).find(Boolean);
    if (at) {
      // Accounts' pages inside Organization keep the website's Accounts folder as a heading.
      const ids = nodeIds[at.node]!;
      const inAccounts = nodes[at.node]!.id === 'grp-org' && ids[at.pos]!.startsWith('accounts');
      buckets[at.node]!.push({
        item: inAccounts ? { ...p, group: LABEL.accounts } : p,
        pos: at.pos,
      });
    } else other.push(p);
  }

  const strip = ({ order: _o, ...item }: MoreNavItem & { order: number }): MoreNavItem => item;
  const sectionOf = (id: string, list: (MoreNavItem & { order: number })[]): MoreNavSection | null => {
    if (!list.length) return null;
    const look = SECTION_ICON[id] ?? {
      icon: list[0]!.icon,
      module: list[0]!.module,
    };
    return {
      key: id,
      label: LABEL[id] ?? list[0]!.label,
      icon: look.icon,
      module: look.module,
      items: list.map(strip),
    };
  };
  const sections: MoreNavSection[] = [];
  nodes.forEach((n, i) => {
    const beside = (k: string) => (BESIDE.has(k) ? 1 : 0);
    // A website folder inside the section (Organization › Accounts) goes last, under its own heading.
    const nested = (x: { item: MoreNavItem }) => (x.item.group ? 1 : 0);
    const list = buckets[i]!
      .sort((a, b) => nested(a) - nested(b) || a.pos - b.pos || beside(a.item.key) - beside(b.item.key) || a.item.order - b.item.order)
      .map((b) => b.item);
    const sec = sectionOf(n.id, list);
    if (sec) sections.push(sec);
  });
  const rest = sectionOf('other', other);
  if (rest) sections.push(rest);
  return {
    sections,
    account,
    keys: [...sections.flatMap((s) => s.items.map((i) => i.key)), ...account.map((a) => a.key)],
  };
}
