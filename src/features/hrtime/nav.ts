// Hrtime domain (wave 1) — nav.ts. One row in More › Workspace › People & HR: "HR setup", which opens
// the hub (/admin/hr-time) for Super Admin and HR (hr.js hrAdminGate; dash.html gates in ./access.ts).
// The subtitle lists only the parts this person's modules switch on. No + action (nothing here is a
// daily "start something"), no Home card and no Inbox queue: HR setup sends no requests to anyone.

import { SlidersHorizontal } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';
import { hrTimeGates } from '@/features/hrtime/access';

export const HRTIME_TOUR_ID = 'more.hrtime.setup';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const g = hrTimeGates(access.hr, access.user);
  if (!g.any) return [];
  const parts = [
    g.attendance ? 'offices' : null,
    g.shifts ? 'shifts' : null,
    g.holidays ? 'holidays' : null,
    g.leave ? 'leave rules' : null,
    g.policies ? 'policies' : null,
  ].filter(Boolean) as string[];
  const subtitle = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
  return [
    {
      key: 'hrtime.setup',
      section: 'people',
      label: 'HR setup',
      subtitle: subtitle.charAt(0).toUpperCase() + subtitle.slice(1),
      href: '/admin/hr-time',
      icon: SlidersHorizontal,
      module: 'people',
      order: 20,
      tourId: HRTIME_TOUR_ID,
    },
  ];
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
