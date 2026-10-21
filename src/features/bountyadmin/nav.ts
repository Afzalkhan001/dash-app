// Bounty admin — what it adds to More, the + sheet and Home (docs/port/hr-people.md §4.6).
//   More › People & HR  "Bounty admin" for anyone with an admin part of the website's BountyHub
//                       (dash.html:14885): Super Admin / CEO / COO, HR (task posters + use-coins
//                       requests), task posters (their tasks and funds) and the App Manager (view).
//   + sheet             "Post task" for task posters (isBountyCreator, dash.html:11908).
//   Home                nothing: what waits on a person reaches Home through the Inbox kinds.
// Pure: reads `access` only. Bounty must be on for the company (bountySystemOn); Master Admin's
// Bounty page is Company Wallets (the platform domain).

import { Coins, SquarePlus } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

import { bountyAdminGates, canOpenBountyAdmin } from './access';

function subtitleFor(access: Access) {
  const g = bountyAdminGates(access.user, access.tenant);
  if (g.superTier) return 'Give coins, task posters and approvals';
  if (g.create) return 'Your bounty tasks and task funds';
  if (g.overseer) return 'Tasks, approvals and the ledger';
  return 'Task posters and use-coins requests';
}

export function workspaceRows(access: Access): WorkspaceRow[] {
  const g = bountyAdminGates(access.user, access.tenant);
  if (!canOpenBountyAdmin(g)) return [];
  return [
    {
      key: 'bountyadmin.hub',
      section: 'people',
      label: 'Bounty admin',
      subtitle: subtitleFor(access),
      href: '/admin/bounty',
      icon: Coins,
      module: 'bounty',
      order: 60,
      tourId: 'more.bountyadmin.hub',
    },
  ];
}

export function createActions(access: Access): CreateAction[] {
  const g = bountyAdminGates(access.user, access.tenant);
  if (!g.create) return [];
  return [{ key: 'bountyadmin.post', label: 'Post task', href: '/admin/bounty/tasks/new', icon: SquarePlus, module: 'bounty', hint: 'Opens a new bounty task for the company', order: 60 }];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
