// Payroll domain (wave 2) — nav.ts. One row in More › Workspace › People & HR: "Payroll", which opens
// the hub (/admin/payroll) for Super Admin and HR with the payroll, salary or tax module on
// (dash.html:5312 HR_SECTIONS payroll; gates in ./access.ts). The subtitle lists only the parts this
// person's modules switch on. No + action (a payroll run is monthly, not a daily "start something"),
// no Home card and no Inbox queue: nothing in payroll waits on anyone or messages anyone.

import { Banknote } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';
import { payrollGates } from '@/features/payroll/access';

export const PAYROLL_TOUR_ID = 'more.payroll.hub';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const g = payrollGates(access.hr, access.user);
  if (!g.any) return [];
  const parts = [g.runs ? 'monthly runs' : null, g.salaries ? 'salaries' : null, g.statutory ? 'statutory' : null].filter(Boolean) as string[];
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
  return [
    {
      key: 'payroll.hub',
      section: 'people',
      label: 'Payroll',
      subtitle: text.charAt(0).toUpperCase() + text.slice(1),
      href: '/admin/payroll',
      icon: Banknote,
      module: 'pay',
      order: 30,
      tourId: PAYROLL_TOUR_ID,
    },
  ];
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
