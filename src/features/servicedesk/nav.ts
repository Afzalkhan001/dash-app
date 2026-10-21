// Servicedesk domain — what it adds to More, the + sheet and Home.
//   More › IT & office   "Service desk" for everyone the website shows it to (access.web('servicedesk'):
//                        IT Admin, Admin, App Manager, HR, Super Admin, CEO/COO, company switch on), and
//                        "Raise for someone" for the IT Admin (their `tasks` item, ITTaskOnBehalf)
//   + sheet              "Raise for someone" (IT Admin)
//   Home                 nothing of its own: what waits on the person is in Inbox and Home's "Needs you"
// Pure: reads `access` only.

import { Headset, UserPlus } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';
import { canRaiseForSomeone, deskSlice } from '@/features/servicedesk/access';

const SUBTITLE = {
  super: 'IT help, equipment, office requests and complaints',
  hr: 'Behaviour & work complaints',
  admin: 'Equipment requests and approvals',
  it: 'IT help and equipment requests',
} as const;

export function workspaceRows(access: Access): WorkspaceRow[] {
  const role = access.user?.role;
  const rows: WorkspaceRow[] = [];
  if (access.web('servicedesk')) {
    const slice = deskSlice(role);
    rows.push({
      key: 'servicedesk.desk',
      section: 'it',
      label: 'Service desk',
      subtitle: SUBTITLE[slice],
      href: '/admin/service-desk',
      icon: Headset,
      module: 'support',
      order: 10,
      tourId: 'more.servicedesk',
    });
  }
  if (canRaiseForSomeone(role, access.web('tasks'))) {
    rows.push({
      key: 'servicedesk.raise',
      section: 'it',
      label: 'Raise for someone',
      subtitle: 'A ticket or equipment request on someone’s behalf',
      href: '/admin/service-desk/raise',
      icon: UserPlus,
      module: 'support',
      order: 11,
      tourId: 'more.servicedesk.raise',
    });
  }
  return rows;
}

export function createActions(access: Access): CreateAction[] {
  if (!canRaiseForSomeone(access.user?.role, access.web('tasks'))) return [];
  return [
    {
      key: 'servicedesk.raise',
      label: 'Raise for someone',
      href: '/admin/service-desk/raise',
      icon: UserPlus,
      module: 'support',
      hint: 'Raise a ticket or equipment request for someone',
    },
  ];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
