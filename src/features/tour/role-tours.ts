// The first-sign-in tours, one per role and vendor state (docs/TOUR.md §5, §7, §8). Plain data: every
// step names a tour target (src/ui/tour, marked on the screens with <TourTarget id> / useTourTarget),
// the screen to open first, its copy, and a `when` gate built from the same rules the screens use, so
// the dot count is right from the start. A step whose control still isn't on screen when the tour gets
// there is dropped by the engine (600 ms; 1.5 s after a screen change).
//
// The hosts (features/tour/hosts.tsx) build the context from hooks the app already runs, pick the tour
// with staffTourIdFor / vendorTourIdFor, and start it. All tour copy lives here; screens hold none.
//
// EXTENSION POINT (Wave 0, docs/port/EXTENSION-POINTS.md §7): each domain's tourSteps(ctx)
// (features/<domain>/tour.ts) is appended to the role's steps just before "See this again" (and so
// before the demo step), in registry order (features/domains). The domain's steps carry their own copy.

import type { Href } from 'expo-router';

import { domainTourSteps } from '@/features/domains';
import { meHref, type MeTab } from '@/features/me/tabs';
import { tourStep } from '@/features/tour/step';
import { ROLE_LABEL } from '@/lib/access';
import type { TourIntro, TourStep } from '@/ui';

/**
 * Bump only when the steps change in a way people should see again. The integrator bumps it ONCE, at
 * release time (PLAN §2.2.6) — never per domain.
 */
export const TOUR_VERSION = 2; // 2: integrator pass 3 (wave 3: Documents, Import & export, big tables, payroll setup, calls, delete data…)

export type StaffTourId =
  | 'employee'
  | 'professional'
  | 'manager'
  | 'admin'
  | 'hr'
  | 'leadership'
  | 'it_admin'
  | 'accounts'
  | 'app_manager'
  | 'visitor_manager'
  | 'display'
  | 'platform';

export type VendorTourId = 'vendor.approved' | 'vendor.onboarding' | 'vendor.changes';

/** Which tour a staff role gets (unknown roles get the employee tour, as their menus do). */
export function staffTourIdFor(role: string | null | undefined): StaffTourId {
  switch (role) {
    case 'professional':
    case 'manager':
    case 'admin':
    case 'hr':
    case 'it_admin':
    case 'accounts':
    case 'app_manager':
    case 'visitor_manager':
      return role;
    case 'super_admin':
    case 'ceo':
    case 'coo':
      return 'leadership';
    case 'announcement_viewer':
      return 'display';
    case 'master_admin':
      return 'platform';
    default:
      return 'employee';
  }
}

/** Which tour a vendor gets for their registration status (none for a deactivated account). */
export function vendorTourIdFor(status: string | null | undefined): VendorTourId | null {
  switch (status) {
    case 'approved':
      return 'vendor.approved';
    case 'draft':
    case 'mobile_verified':
    case 'submitted':
    case 'pending_verification':
      return 'vendor.onboarding';
    case 'correction_required':
    case 'rejected':
      return 'vendor.changes';
    default:
      return null;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────
/** What the staff tours need to know, from hooks the app already runs (hosts.tsx). */
export type StaffTourCtx = {
  firstName: string;
  role: string;
  /** sections.clock: the person clocks in (the Clock in pill, Me › Attendance's month). */
  clock: boolean;
  isSystemRole: boolean;
  /** The Me tab's segments, in order. */
  meSegments: MeTab[];
  /** Me › Leave shows the balance hero. */
  leaveBalance: boolean;
  /** Home's shortcut keys (leave, payslips, attendance, claim) and the label of the leave one. */
  shortcuts: string[];
  leaveShortcut: string | null;
  whosIn: boolean;
  needsYou: boolean;
  /** HR approval queues this person reviews. */
  approvals: number;
  inboxItems: number;
  /** Waiting items that are requests to decide (not visitors at reception). */
  inboxRequests: number;
  inboxKinds: number;
  /** Inbox has Past decisions (HR requests or project claims to review). */
  inboxReviews: boolean;
  /** Inbox shows the Waiting · Done today cards. */
  inboxSummary: boolean;
  /** What the + sheet offers, in order (labels as they read). */
  createLabels: string[];
  /** More's own pages (features/more/menu keys; drawn in More's sidebar sections) and whether People is "My team". */
  moreTiles: string[];
  hasTeam: boolean;
  /** The phone can lock DASH (biometrics enrolled). */
  lockAvailable: boolean;
  /** The demo account (More shows "Switch demo role"). */
  demo: boolean;
  /** Plug-in keys this person sees (features/domains): More › Workspace rows, + actions, Home cards. */
  workspaceRows: string[];
  createKeys: string[];
  homeCards: string[];
};

export type VendorTourCtx = {
  /** The name the business goes by (Home greets it). */
  name: string;
  status: string;
  bills: number;
  vendorCode: boolean;
  toSign: number;
  kycDone: boolean;
  openDocs: number;
  /** Open documents that are uploaded by hand (the rest are declarations signed during registration). */
  uploadDocs: number;
  docs: number;
  /** The demo account (Profile shows "Switch demo role"). */
  demo: boolean;
};

export type BuiltTour = { tourId: string; steps: TourStep[]; intro: TourIntro };

/** The record from a previous sign-in (for "You're now a Manager…"). */
export type PreviousTour = { tour: string } | null;

// ── Helpers ──────────────────────────────────────────────────────────────────
// One step = features/tour/step tourStep() (shared with the domain plug-ins' tour.ts).
const step = tourStep;

const SCREENS = {
  home: '/',
  meAttendance: meHref('attendance'),
  meLeave: meHref('leave'),
  inbox: '/inbox',
  more: '/more',
  vendorHome: '/portal',
  vendorProfile: '/portal/profile',
} satisfies Record<string, Href>;

/** "A", "A and B", "A, B and C" (or "or"). */
function listWords(words: string[], last: 'and' | 'or') {
  const w = words.filter(Boolean);
  if (w.length <= 1) return w[0] ?? '';
  return `${w.slice(0, -1).join(', ')} ${last} ${w[w.length - 1]}`;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// The + step's body, from what the sheet really offers this person (docs/TOUR.md §5).
const CREATE_VERB: Record<string, string> = {
  'Apply leave': 'apply for leave',
  'Work from home': 'ask to work from home',
  'Fix attendance': 'fix attendance',
  'Claim expense': 'claim an expense',
  'Petty cash bill': 'add a petty cash bill',
  'Raise a ticket': 'raise a ticket',
  'Invite a visitor': 'invite a visitor',
  'Salary advance': 'ask for a salary advance',
};

function createBody(labels: string[]) {
  const verbs = labels.map((l) => CREATE_VERB[l] ?? l.toLowerCase());
  const first = listWords(verbs.slice(0, 3), 'or');
  return verbs.length > 3 ? `Tap + to ${first}, and more.` : `Tap + to ${first}.`;
}

// Home's shortcut row, in words.
const SHORTCUT_VERB: Record<string, string> = {
  payslips: 'open payslips',
  attendance: 'see your attendance',
  claim: 'claim an expense',
};

function shortcutsBody(ctx: StaffTourCtx) {
  const verbs = ctx.shortcuts.map((k) =>
    k === 'leave'
      ? ctx.leaveShortcut === 'Work from home'
        ? 'ask to work from home'
        : ctx.leaveShortcut === 'Claim comp-off'
          ? 'claim a comp-off'
          : 'apply for leave'
      : (SHORTCUT_VERB[k] ?? k),
  );
  return `${cap(listWords(verbs.slice(0, 4), 'or'))} from here.`;
}

const ME_WORD: Record<MeTab, string> = { attendance: 'attendance', leave: 'leave', pay: 'pay' };

/** "Your attendance, leave and pay are on Me." (only the segments this person has). */
function meBody(ctx: StaffTourCtx, own = false) {
  const parts = ctx.meSegments.map((t) => ME_WORD[t]);
  const verb = parts.length > 1 ? 'are' : 'is';
  return `Your ${own ? 'own ' : ''}${listWords(parts, 'and')} ${verb} on Me.`;
}

/** Me holds the person's own clock, leave or pay. */
const mePersonal = (ctx: StaffTourCtx) => ctx.clock || ctx.meSegments.includes('leave') || ctx.meSegments.includes('pay');
/** Me holds only the team's attendance (system roles). */
const meTeamOnly = (ctx: StaffTourCtx) => ctx.isSystemRole && ctx.meSegments.length === 1 && ctx.meSegments[0] === 'attendance';
const hasTile = (ctx: StaffTourCtx, key: string) => ctx.moreTiles.includes(key);
const teamTile = (ctx: StaffTourCtx) => hasTile(ctx, 'people') && ctx.hasTeam;

// ── Shared staff steps (docs/TOUR.md §7.0) ───────────────────────────────────
function shared(ctx: StaffTourCtx, id: string) {
  const k = (n: string) => `${id}.${n}`;
  return {
    clock: (body = 'Tap Clock in when you start work. Tap Clock out when you leave.') =>
      step(k('clock'), 'home.clockButton', 'Clock in here', body, { screen: SCREENS.home, when: () => ctx.clock }),
    shortcuts: () =>
      step(k('shortcuts'), 'home.shortcuts', 'One-tap shortcuts', shortcutsBody(ctx), { screen: SCREENS.home, when: () => ctx.shortcuts.length >= 2 }),
    whosIn: (body: string) => step(k('whosIn'), 'home.whosIn', 'Who’s in today', body, { screen: SCREENS.home, when: () => ctx.whosIn }),
    needsYou: (body = 'The newest requests waiting for you. Tap one to open it.') =>
      step(k('needsYou'), 'home.needsYou', 'Needs you', body, { screen: SCREENS.home, when: () => ctx.needsYou }),
    avatar: (title: string, body: string) => step(k('avatar'), 'home.avatar', title, body, { screen: SCREENS.home }),
    me: (own = false) => step(k('me'), 'tabs.me', 'Your own work', meBody(ctx, own), { when: () => mePersonal(ctx) }),
    meTeam: (body = 'Who’s in today, holidays and shifts are on Me.') => step(k('meTeam'), 'tabs.me', 'Team attendance', body, { when: () => meTeamOnly(ctx) }),
    create: () => step(k('create'), 'tabs.create', 'Start something new', createBody(ctx.createLabels), { when: () => ctx.createLabels.length > 0 }),
    inbox: (title = 'Your Inbox', body = 'Anything waiting on you shows here. The red number says how many.', when?: () => boolean) =>
      step(k('inbox'), 'tabs.inbox', title, body, { when }),
    open: (body = 'Tap a request to see it in full. Approve or reject it there.') =>
      step(k('open'), 'inbox.firstItem', 'Open to decide', body, { screen: SCREENS.inbox, when: () => ctx.inboxRequests > 0 }),
    chips: (body = 'Tap a type to see only those, like Leave or Petty cash.') =>
      step(k('chips'), 'inbox.chips', 'Filter by type', body, { screen: SCREENS.inbox, when: () => ctx.inboxKinds >= 2 }),
    team: (body = 'Your manager, teammates and who is off this week.', title = 'My team') =>
      step(k('team'), 'more.myTeam', title, body, { screen: SCREENS.more, when: () => teamTile(ctx) }),
    tile: (key: string, target: string, title: string, body: string) =>
      step(k(key), target, title, body, { screen: SCREENS.more, when: () => hasTile(ctx, key) }),
    replay: () => step(k('replay'), 'more.showMeAround', 'See this again', 'Tap Show me around any time to replay this tour.', { screen: SCREENS.more }),
  };
}

const approves = (ctx: StaffTourCtx) => () => ctx.approvals > 0 || ctx.inboxRequests > 0;

const STAFF_INTRO: Record<StaffTourId, string> = {
  employee: 'Here’s where to clock in, apply for leave and find your payslips. It takes about a minute.',
  professional: 'Here’s where to clock in, see your bookings and find your payslips. It takes about a minute.',
  manager: 'Here’s where to clock in, approve your team’s requests and see who’s in. It takes about a minute.',
  admin: 'Here’s where to clock in, approve your team’s requests and find your tasks. It takes about a minute.',
  hr: 'Here’s where requests from every team wait for you, and where to find people. It takes about a minute.',
  leadership: 'Here’s where approvals from every team wait, and how to see who’s in. It takes about a minute.',
  it_admin: 'Here’s where your team’s requests and your IT tickets are. It takes about a minute.',
  accounts: 'Here’s where to sign off petty cash and find your own work. It takes about a minute.',
  app_manager: 'Here’s where to clock in, apply for leave and keep an eye on tasks and bounties. It takes about a minute.',
  visitor_manager: 'Here’s who is at reception, how to let visitors in and how to start the kiosk. It takes about a minute.',
  display: 'This is the office display account. News shows on the reception TV, not in this app.',
  platform: 'Here’s where every company on DASH is, with its wallet and features. It takes about a minute.',
};

function staffSteps(id: StaffTourId, ctx: StaffTourCtx): TourStep[] {
  const s = shared(ctx, id);
  switch (id) {
    case 'professional':
      return [
        s.clock('Tap Clock in when your work starts. Tap Clock out when it ends.'),
        s.me(),
        step(`${id}.calendar`, 'me.calendar', 'Your month', 'Each day shows if you were in, late or on leave. Tap a day to see it or fix it.', {
          screen: SCREENS.meAttendance,
          when: () => ctx.clock,
        }),
        s.create(),
        s.inbox('Your Inbox', 'Visitors at reception and policies to read show here.'),
        s.tile('tasks', 'more.myTasks', 'Your tasks', 'Shoot bookings and tasks given to you are here. Start and end each one from its card.'),
        s.team('See who you report to and who is off this week.'),
        s.replay(),
      ];
    case 'manager':
      return [
        s.clock(),
        s.whosIn('Teammates who clocked in today, and who is late. Tap See all for the full list.'),
        s.inbox('Approve in Inbox', 'Your team’s leave, attendance fixes and claims wait here. The red number says how many.', approves(ctx)),
        s.open(),
        s.me(true),
        s.create(),
        s.team('Your direct reports, peers and who is off this week.'),
        s.replay(),
      ];
    case 'admin':
      return [
        s.clock(),
        s.whosIn('See who in your team clocked in, and who is late.'),
        s.inbox('Approve in Inbox', 'Leave, attendance fixes and claims from your team wait here.', approves(ctx)),
        s.open(),
        s.me(),
        s.create(),
        s.tile('tasks', 'more.myTasks', 'My tasks', 'Tasks given to you are here. Start, pause and end each one from its card.'),
        s.replay(),
      ];
    case 'hr':
      return [
        s.needsYou(),
        s.whosIn('Who clocked in across the company, and who is late.'),
        s.inbox('Company approvals', 'Leave, attendance fixes, salary claims and salary advances from every team wait here.'),
        s.chips('Tap a type to see only those, like Salary advance.'),
        step(`${id}.history`, 'inbox.history', 'Past decisions', 'Everything you approved or rejected is here. Tap the clock button at the top.', {
          screen: SCREENS.inbox,
          when: () => ctx.inboxReviews,
        }),
        s.meTeam(),
        s.team('Find anyone, see each department and open the org chart.', 'People and teams'),
        s.replay(),
      ];
    case 'leadership':
      return [
        s.needsYou(),
        s.whosIn('Who clocked in across the company today, and who is late.'),
        s.inbox('All approvals', 'Requests from every team that wait for you are here.'),
        step(`${id}.summary`, 'inbox.summary', 'Waiting and done', 'How much is waiting, for how long, and what you decided today.', {
          screen: SCREENS.inbox,
          when: () => ctx.inboxSummary,
        }),
        s.meTeam('Who’s in today and the holiday list are on Me.'),
        s.tile('announcements', 'more.news', 'Announcements', 'Read company announcements here. New ones also show on Home.'),
        s.team('Find anyone, see each department and open the org chart.', 'People and teams'),
        s.replay(),
      ];
    case 'it_admin':
      return [
        s.needsYou(),
        s.inbox('Approve in Inbox', 'Leave, work from home and attendance fixes from your team wait here.', () => ctx.approvals > 0),
        s.open(),
        s.meTeam('Who’s in today and the holiday list are on Me.'),
        s.create(),
        s.tile('tasks', 'more.myTasks', 'Tickets and tasks', 'IT tickets and tasks given to you are here. Start and end each one from its card.'),
        s.team('Your IT team and who is off this week.'),
        s.replay(),
      ];
    case 'accounts':
      return [
        s.clock(),
        s.inbox('Sign off petty cash', 'Petty cash requests from every team wait here. The red number says how many.'),
        s.open('Check the amount and the reason. Approve or reject it there.'),
        s.chips('Tap a type to see only those, like Petty cash.'),
        s.me(),
        s.tile('petty-cash', 'more.pettyCash', 'Petty cash', 'Money you were given, your bills and expense reports are here.'),
        s.replay(),
      ];
    case 'app_manager':
      return [
        s.clock(),
        s.shortcuts(),
        s.me(),
        s.create(),
        s.inbox(),
        s.tile('tasks', 'more.myTasks', 'Tasks at a glance', 'See tasks and how they are going. Open one for its details.'),
        s.tile('bounty', 'more.bounty', 'Bounty system', 'See open bounties, claims and the leaderboard.'),
        s.replay(),
      ];
    case 'visitor_manager': {
      const ticket = ctx.createLabels.includes('Raise a ticket');
      return [
        s.avatar('Your profile', 'Tap your photo to see and update your details.'),
        step(
          `${id}.create`,
          'tabs.create',
          ticket ? 'Ask for help' : 'Start something new',
          ticket ? 'Tap + to raise a ticket with HR, IT or admin.' : createBody(ctx.createLabels),
          {
            when: () => ctx.createLabels.length > 0,
          },
        ),
        s.inbox('Your Inbox', 'Visitors waiting at reception show here. Tap one to let them in.'),
        // The desk's own steps follow (features/desk/tour): In the building on Home, then the Visitor
        // desk, Kiosk mode and the check-in link in More.
        s.replay(),
      ];
    }
    case 'display':
      return [
        s.avatar('Account details', 'Tap here to see this account’s details.'),
        step(`${id}.more`, 'tabs.more', 'Settings and people', 'The company directory and settings are in More.'),
        step(`${id}.people`, 'more.people', 'Find people', 'Search the company directory to find anyone.', {
          screen: SCREENS.more,
          when: () => hasTile(ctx, 'people'),
        }),
        step(`${id}.appearance`, 'more.appearance', 'Light or dark', 'Choose how DASH looks on this screen.', { screen: SCREENS.more }),
        s.replay(),
      ];
    case 'platform':
      return [
        s.avatar('Your profile', 'Tap your photo to see your details.'),
        // Companies on DASH on Home, then Companies, Company wallets and Company features in More come
        // from the platform's own steps (features/platform/tour).
        step(`${id}.more`, 'tabs.more', 'Everything else', 'Companies, wallets, features and your settings are in More.'),
        step(`${id}.lock`, 'more.appLock', 'App lock', 'Ask for your fingerprint or face each time DASH opens.', {
          screen: SCREENS.more,
          when: () => ctx.lockAvailable,
        }),
        s.replay(),
      ];
    case 'employee':
    default:
      return [
        s.clock(),
        s.shortcuts(),
        s.me(),
        step(`${id}.leave`, 'me.leaveBalance', 'Your leave balance', 'Days you have left, by leave type. Tap Apply leave to ask for time off.', {
          screen: SCREENS.meLeave,
          when: () => ctx.leaveBalance,
        }),
        s.create(),
        s.inbox('Your Inbox', 'Visitors waiting for you at reception and policies to read show here.'),
        s.team(),
        s.replay(),
      ];
  }
}

/** Demo only, just before "See this again": where to try the other Afzal roles. */
function withDemoStep(steps: TourStep[], id: string, target: string, screen: Href, demo: boolean): TourStep[] {
  if (!demo || steps.length < 1) return steps;
  const demoStep = step(`${id}.demo`, target, 'Try another role', 'Switch demo role shows DASH as any Afzal role. Everything here is sample data.', { screen });
  return [...steps.slice(0, -1), demoStep, steps[steps.length - 1]!];
}

/** The staff tour for this person. `prev` is their stored record: a different tour means a role change. */
/**
 * Which domain steps a tour keeps when a role has many (integrator pass 1): the steps that say what
 * this role is FOR come first. At most DOMAIN_MORE_CAP of the More-screen steps run; Home steps
 * (targets 'home.*': a desk hero, Team today, the company glance) always run.
 */
const DOMAIN_STEP_PRIORITY = [
  'platform.companies',
  'platform.wallets',
  'platform.features',
  'company.settings',
  'accounts.desk',
  'accounts.vendors',
  'work.tasks',
  'desk.board',
  'desk.kiosk',
  'desk.qr',
  'servicedesk.raise',
  'servicedesk.desk',
  'itdesk.assets',
  'teamboard.board',
  'bountyadmin.hub',
  'newsroom.studio',
  'hrtime.setup',
  'payroll.hub',
  'hiring.desk',
  'people.roster',
  'company.users',
  'company.audit',
  'company.subscriptions',
  'booking.reviews',
  'booking.hub',
  'chat.chat',
  // Pass 3 (wave 3), after everything above so the older tours keep their steps.
  'calls.calls',
  'docs.hub',
  'hradvanced.payroll',
  'hradvanced.extend',
  'excel.hub',
  'grids.tables',
  'hradvanced.branding',
  'adminadvanced.officemap',
  'adminadvanced.employees',
  'push.settings',
];
const DOMAIN_MORE_CAP = 4;

const onHome = (s: TourStep) => typeof s.target === 'string' && s.target.startsWith('home.');
const shows = (s: TourStep) => {
  try {
    return !s.when || s.when();
  } catch {
    return false;
  }
};

/**
 * The domain plug-ins' steps (features/<domain>/tour.ts, via features/domains). Home steps go right
 * after the role's own Home steps (so the tour doesn't jump back to Home later); More steps go just
 * before the last step ("See this again"), at most DOMAIN_MORE_CAP of them by DOMAIN_STEP_PRIORITY, in
 * their registry order. The demo step then lands between them and that last step.
 */
function withDomainSteps(steps: TourStep[], id: StaffTourId, ctx: StaffTourCtx): TourStep[] {
  const extra = domainTourSteps({ ...ctx, tourId: id }).filter(shows);
  if (!extra.length) return steps;
  const home = extra.filter(onHome);
  const rank = (s: TourStep) => {
    const i = DOMAIN_STEP_PRIORITY.indexOf(s.key ?? '');
    return i < 0 ? DOMAIN_STEP_PRIORITY.length : i;
  };
  const keep = new Set(
    extra
      .filter((s) => !onHome(s))
      .map((s, i) => ({ s, i }))
      .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
      .slice(0, DOMAIN_MORE_CAP)
      .map(({ s }) => s),
  );
  const more = extra.filter((s) => keep.has(s));
  if (steps.length < 1) return [...home, ...more];
  const body = steps.slice(0, -1);
  let lastHome = -1;
  body.forEach((s, i) => {
    if (onHome(s) && shows(s)) lastHome = i;
  });
  return [...body.slice(0, lastHome + 1), ...home, ...body.slice(lastHome + 1), ...more, steps[steps.length - 1]!];
}

export function buildStaffTour(ctx: StaffTourCtx, prev: PreviousTour): BuiltTour {
  const id = staffTourIdFor(ctx.role);
  const roleName = ROLE_LABEL[ctx.role] ?? 'new role';
  const changed = !!prev && prev.tour !== id && !prev.tour.startsWith('vendor.');
  return {
    tourId: id,
    steps: withDemoStep(withDomainSteps(staffSteps(id, ctx), id, ctx), id, 'more.switchDemo', SCREENS.more, ctx.demo),
    intro: {
      title: ctx.firstName ? `Welcome, ${ctx.firstName}` : 'Welcome to DASH',
      body: changed ? `You’re now ${/^[AEIOU]/.test(roleName) ? 'an' : 'a'} ${roleName}. Here’s what’s new for you.` : STAFF_INTRO[id],
    },
  };
}

// ── Vendor tours (docs/TOUR.md §8) ───────────────────────────────────────────
function vendorSteps(id: VendorTourId, ctx: VendorTourCtx): TourStep[] {
  const k = (n: string) => `${id}.${n}`;
  const replay = step(k('replay'), 'vendor.showMeAround', 'See this again', 'Tap Show me around any time to replay this tour.', {
    screen: SCREENS.vendorProfile,
  });
  const filling = ctx.status === 'draft' || ctx.status === 'mobile_verified';
  const review = ctx.status === 'submitted' || ctx.status === 'pending_verification';
  if (id === 'vendor.approved') {
    return [
      step(k('dues'), 'vendor.duesHero', 'Money due to you', 'What Tamada still owes you, split into waiting and to be paid.', {
        screen: SCREENS.vendorHome,
        when: () => ctx.bills > 0,
      }),
      step(k('vendorId'), 'vendor.vendorId', 'Your Vendor ID', 'Quote this ID when you contact our Accounts team.', {
        screen: SCREENS.vendorHome,
        when: () => ctx.vendorCode && ctx.bills > 0,
      }),
      step(k('toSign'), 'vendor.toSign', 'Agreements to sign', 'Agreements waiting for your signature show here. Tap one to read and sign it.', {
        screen: SCREENS.vendorHome,
        when: () => ctx.toSign > 0,
      }),
      step(k('bills'), 'vtabs.bills', 'Your bills', 'Every bill raised for you, with its status. Filter by waiting, approved or paid.'),
      step(k('agreements'), 'vtabs.agreements', 'Agreements', 'Read, sign and open your agreements. The red number says how many wait for you.'),
      step(k('details'), 'vendor.profileDetails', 'Your details', 'Your business, tax and bank details. Tap one to ask for a change.', {
        screen: SCREENS.vendorProfile,
      }),
      replay,
    ];
  }
  if (id === 'vendor.changes') {
    const rejected = ctx.status === 'rejected';
    return [
      step(
        k('hero'),
        'vendor.registrationHero',
        'What to fix',
        rejected ? 'Read the reason here, then update your details.' : 'Accounts listed what to change. Their note is in quotes.',
        { screen: SCREENS.vendorHome },
      ),
      step(
        k('fix'),
        'vendor.registrationButton',
        'Fix your details',
        `Tap ${rejected ? 'Update details' : 'Fix details'}, make the changes, then send your registration again.`,
        { screen: SCREENS.vendorHome },
      ),
      step(k('profile'), 'vtabs.profile', 'Your profile', 'Check the details and documents you sent.'),
      step(k('docs'), 'vendor.profileDocuments', 'Your documents', 'A document marked “Needs a new copy” must be uploaded again.', {
        screen: SCREENS.vendorProfile,
        when: () => ctx.docs > 0,
      }),
      replay,
    ];
  }
  return [
    step(
      k('hero'),
      'vendor.registrationHero',
      'Your registration',
      review
        ? 'Our Accounts team is checking your details. We’ll email you once you’re approved.'
        : 'This shows where your sign-up stands and the one thing to do next.',
      { screen: SCREENS.vendorHome },
    ),
    step(k('steps'), 'vendor.stepProgress', 'Steps to finish', 'Each bar is one step. You’ll pick up where you stopped.', {
      screen: SCREENS.vendorHome,
      when: () => filling,
    }),
    step(k('continue'), 'vendor.registrationButton', 'Continue here', 'Tap Continue registration for the next step. You can stop and come back later.', {
      screen: SCREENS.vendorHome,
      when: () => filling,
    }),
    step(k('kyc'), 'vendor.todoKyc', 'Verify ID and bank', 'It takes a few minutes with Digio, our checking partner. Start it from this row.', {
      screen: SCREENS.vendorHome,
      when: () => filling && !ctx.kycDone,
    }),
    step(
      k('docs'),
      'vendor.todoDocs',
      ctx.uploadDocs > 0 ? 'Documents to add' : 'Forms to sign',
      ctx.uploadDocs > 0 ? 'Upload a clear photo or PDF of each one.' : 'You’ll sign these during registration. Tap one to carry on.',
      {
        screen: SCREENS.vendorHome,
        when: () => filling && ctx.openDocs > 0,
      },
    ),
    step(k('check'), 'vendor.checkStatus', 'Check your status', 'Tap Check status to see if you’ve been approved.', {
      screen: SCREENS.vendorHome,
      when: () => review,
    }),
    step(k('after'), 'vtabs.home', 'After approval', 'Your bills, payments and agreements will show here once you’re approved.', { when: () => review }),
    step(k('profile'), 'vtabs.profile', 'Your profile', 'The details and documents you sent, and your password.'),
    replay,
  ];
}

const VENDOR_INTRO: Record<VendorTourId, (ctx: VendorTourCtx) => string> = {
  'vendor.approved': () => 'Here’s where to see what you’re owed, your bills and agreements to sign. It takes about a minute.',
  'vendor.onboarding': (ctx) =>
    ctx.status === 'submitted' || ctx.status === 'pending_verification'
      ? 'Here’s how to check where your registration stands.'
      : 'Here’s how to finish your registration and see where it stands. It takes about a minute.',
  'vendor.changes': (ctx) =>
    ctx.status === 'rejected'
      ? 'Your registration wasn’t approved. Here’s how to update it and send it again.'
      : 'Our Accounts team asked for a few changes. Here’s where to make them.',
};

/** The vendor tour for this registration status, or null (deactivated). */
export function buildVendorTour(ctx: VendorTourCtx, prev: PreviousTour): BuiltTour | null {
  const id = vendorTourIdFor(ctx.status);
  if (!id) return null;
  const nowApproved = id === 'vendor.approved' && !!prev && prev.tour !== id;
  return {
    tourId: id,
    steps: withDemoStep(vendorSteps(id, ctx), id, 'vendor.switchDemo', SCREENS.vendorProfile, ctx.demo),
    intro: {
      title: ctx.name ? `Welcome, ${ctx.name}` : 'Welcome to DASH',
      body: nowApproved ? 'You’re approved. Here’s where your bills and agreements are.' : VENDOR_INTRO[id](ctx),
    },
  };
}
