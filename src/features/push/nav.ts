// Push domain — what it adds to More and Home (docs/port/signin-push.md §4.3, §5.4).
//   More › (links)  "Notifications" for every staff member, next to Chat & calls (the integrator may
//                   move it beside App lock in More's own settings card — HANDOFF.md).
//   Home (top)      the one-time soft ask "Know the moment something needs you" (it also starts the
//                   push bridge). No + action: there is nothing to create.
// Pure: decided from `access` only.

import { Bell } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';
import { canUsePush } from '@/features/push/access';
import { PushAskCard } from '@/features/push/home-card';
import { PUSH_ROUTES } from '@/features/push/routes';

export function workspaceRows(access: Access): WorkspaceRow[] {
  if (!canUsePush(access)) return [];
  return [
    {
      key: 'push.settings',
      section: 'links',
      label: 'Notifications',
      subtitle: 'Visitors, approvals and tasks on your lock screen',
      href: PUSH_ROUTES.settings,
      icon: Bell,
      module: 'security',
      order: 90,
      tourId: 'more.push.settings',
    },
  ];
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(access: Access): HomeCard[] {
  if (!canUsePush(access)) return [];
  return [{ key: 'push.ask', placement: 'top', order: 5, Card: PushAskCard }];
}
