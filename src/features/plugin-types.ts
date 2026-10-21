// The extension-point types every domain plugs in with (docs/port/EXTENSION-POINTS.md, PLAN §2.1.3).
// Type-only (plus two identity helpers), so a domain file can import it without pulling in any shared
// screen — and without import cycles. Integrator-owned: domains import from here, never edit it.
//
//   features/<domain>/nav.ts     workspaceRows(access) → WorkspaceRow[]   More › Workspace sections
//                                createActions(access) → CreateAction[]   the + sheet, after the built-in 8
//                                homeCards(access)     → HomeCard[]       Home slots
//   features/<domain>/inbox.ts   inboxKinds: InboxKindPlugin[]          Inbox list, counts, polling,
//                                                                        detail route, Past decisions
//   features/<domain>/tour.ts    tourSteps(ctx)        → TourStep[]       first-sign-in tour, before the demo step
//   features/<domain>/access.ts  the domain's own gates (pure functions ported from dash.html)
//
// Rules for every plug-in function (they run during render, on every render):
//   - pure and fast: read `access` only (no fetching, no clock, no hooks — except InboxKindPlugin.useItems,
//     which IS a hook and is called on every render, in a fixed order);
//   - return [] when the person lacks the gate; copy the website's role rules exactly;
//   - keys are unique app-wide: prefix them with the domain ('work.tasks', 'desk.kiosk').

import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import type { ComponentType } from 'react';

import type { Decision } from '@/api/inbox';
import type { RowModel } from '@/features/inbox/format';
import type { StaffTourCtx, StaffTourId } from '@/features/tour/role-tours';
import type { Access } from '@/lib/use-access';
import type { ModuleKey } from '@/theme/tokens';
import type { TourStep } from '@/ui';

export type { Access, Decision, RowModel, TourStep };

// ── More › Workspace ─────────────────────────────────────────────────────────
/**
 * The Workspace sections under More's app grid, in this order (features/more/workspace.ts holds the
 * titles): Work · People & HR · Money · IT & office · Company · Platform · Reception. `links` rows are
 * plain links in one untitled card right under the grid ("Chat & calls", "Refer & earn").
 */
export type WorkspaceSectionKey = 'work' | 'people' | 'money' | 'it' | 'company' | 'platform' | 'reception' | 'links';

export type WorkspaceRow = {
  /** Unique app-wide, domain-prefixed: 'work.tasks'. Also the tour's `ctx.workspaceRows` entry. */
  key: string;
  section: WorkspaceSectionKey;
  /** Plain words, sentence case ("Team tasks", not "Task Management"). */
  label: string;
  /** One short muted line under the label ("Assign and review work"). */
  subtitle?: string;
  href: Href;
  icon: LucideIcon;
  /** The module colour of the row's badge (theme/tokens ModuleKey). */
  module: ModuleKey;
  /** Sort inside its section, low first (default 100; ties keep registry order). */
  order?: number;
  /** A <TourTarget id> around the row, for the domain's tour steps. */
  tourId?: string;
};

// ── The + sheet ──────────────────────────────────────────────────────────────
export type CreateAction = {
  /** Unique app-wide, domain-prefixed ('work.assign'). The built-in 8 use plain keys. */
  key: string;
  /** At most 2 short words: it sits under a round icon ("Assign task", "Book"). */
  label: string;
  href: Href;
  icon: LucideIcon;
  module: ModuleKey;
  /** Spoken hint: what opens ("Opens a new task for someone on your team"). */
  hint?: string;
  /** Sort among the domain actions, low first (default 100; ties keep registry order). */
  order?: number;
};

// ── Home ─────────────────────────────────────────────────────────────────────
/**
 * Where a Home card goes:
 *   hero   replaces the light "Today" card for people who do not clock in (the Visitor Manager's desk
 *          hero); ignored when the person has the clock card. The first hero card wins.
 *   top    right under the hero and the shortcuts (leadership KPIs);
 *   needs  right under "Needs you" (default: the manager's Team today / Tomorrow);
 *   end    after everything, before News.
 */
export type HomeCardPlacement = 'hero' | 'top' | 'needs' | 'end';

export type HomeCard = {
  /** Unique app-wide, domain-prefixed ('desk.hero'). */
  key: string;
  placement?: HomeCardPlacement;
  /** Sort inside its placement, low first (default 100; ties keep registry order). */
  order?: number;
  /**
   * The card. Home's sections are fixed slots with gaps between them, so return a card only when this
   * person should see it (decide in homeCards from `access`); the component must render something —
   * a skeleton while loading, a short empty line when there is nothing — never `null`.
   */
  Card: ComponentType;
};

// ── Inbox ────────────────────────────────────────────────────────────────────
/** One thing waiting, as a plug-in returns it. `record` is the server's own row (your type). */
export type InboxPluginItem<R = unknown> = {
  /** The id in your detail route: /inbox/<plugin key>/<id>. */
  id: string;
  /** When it came in (ISO) — orders the list and puts it under Today / Yesterday / a date. */
  at: string;
  /** The person asking (row title, avatar initials on Home). */
  who: string;
  record: R;
};

/** What `useItems` returns, on every render. */
export type InboxPluginResult<R = unknown> = {
  /** False when this person does not have this queue at all: no chip, no count, no request fired. */
  visible: boolean;
  /** Everything waiting on the signed-in person, any order (the Inbox sorts). */
  items: InboxPluginItem<R>[];
  /** How many are waiting; null while the first load is out. Defaults to items.length once loaded. */
  pending?: number | null;
  /** The queue failed and nothing is cached. */
  error?: boolean;
  /** Still finding out whether this person has the queue (keeps the Inbox skeleton up). */
  discovering?: boolean;
  /** Decisions already in the cache, for the "Done today" card (optional). */
  decided?: { id: string; at: string; decision: Decision }[];
};

export type InboxRowCtx = { today: string; now: number };
export type InboxDetailProps = { id: string; params: Record<string, string | undefined> };

export type InboxKindPlugin<R = unknown> = {
  /**
   * Unique, url-safe ('task', 'booking', 'desk-it'); the Inbox route is /inbox/<key>/<id> and
   * /inbox?type=<key> opens the list on it. Never one of the built-in kinds (the HR kinds, keka, petty,
   * visitors).
   */
  key: string;
  /** Chip label, plain words ("Bookings"). */
  label: string;
  /** Detail screen title ("Booking request"). */
  title: string;
  module: ModuleKey;
  icon: LucideIcon;
  /**
   * True for approval queues (they bring the Waiting / Done today cards and count as "requests" in the
   * tour); false for notices like people at the desk. Default true.
   */
  decides?: boolean;
  /** Pin this kind's rows in a group of their own at the top (like visitors "At reception"). */
  pin?: { key: string; label: string };
  /**
   * A HOOK, called on every render of every Inbox consumer (tab badge, Home, Inbox), always, in a fixed
   * order — gate inside it with `enabled`, never by returning early. Put your queries under the query
   * key prefix ['inbox', <key>, …] so the Inbox's focus refresh, pull to refresh and the one-minute
   * poll (unless `poll: false`) cover them. Never import features/inbox/use-inbox from a plug-in.
   */
  useItems: (access: Access) => InboxPluginResult<R>;
  /** The list row in the Inbox's words (who, "fact · what", figure, note). Pure; use format.ts helpers. */
  row: (item: InboxPluginItem<R>, ctx: InboxRowCtx) => RowModel;
  /** /inbox/<key>/<id>: the whole decision screen (NavHeader included; see features/inbox/detail). */
  Detail: ComponentType<InboxDetailProps>;
  /** Past decisions for this kind (one chip on /inbox/history). Omit when there are none. */
  History?: ComponentType;
  /** Refresh with the one-minute Inbox timer (default true). */
  poll?: boolean;
};

/** Identity helper that keeps your record type while storing the plug-in in `inboxKinds`. */
export function defineInboxKind<R>(p: InboxKindPlugin<R>): InboxKindPlugin {
  return p as unknown as InboxKindPlugin;
}

// ── Tour ─────────────────────────────────────────────────────────────────────
/**
 * What tourSteps(ctx) gets: the staff tour context (features/tour/role-tours StaffTourCtx: role, the
 * Me segments, + labels, More tiles, …), which tour is running, and the keys of what this person sees
 * from the plug-ins. Build steps with features/tour/step `tourStep()`; gate each with `when`.
 */
export type DomainTourCtx = StaffTourCtx & {
  tourId: StaffTourId;
  /** WorkspaceRow keys shown in More for this person. */
  workspaceRows: string[];
  /** CreateAction keys in the + sheet. */
  createKeys: string[];
  /** HomeCard keys on Home. */
  homeCards: string[];
};

export type { StaffTourCtx, StaffTourId };
