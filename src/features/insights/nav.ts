// Insights domain (wave 2) — what it adds to More, the + sheet and Home.
//   More › Workspace   "Reports" (Work) for whoever has the website's Reports item, and "Device
//                      monitoring" (Work; IT & office for an IT Admin) for the TM360 roles.
//   + sheet            nothing (nothing here is created).
//   Home               nothing (the live counts poll TM360; they stay on their own screen).
// Pure: reads `access` only (features/insights/access.ts).

import { BarChart3, MonitorSmartphone } from 'lucide-react-native';

import { canSeeDevices, canSeeReports, reportScopeOf } from '@/features/insights/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const u = access.user;
  if (!u) return [];
  const rows: WorkspaceRow[] = [];
  if (canSeeReports(access)) {
    rows.push({
      key: 'insights.reports',
      section: 'work',
      label: 'Reports',
      subtitle: reportScopeOf(u) === 'global' ? 'Hours by person, project and project code' : 'Your team’s hours by person and project',
      href: '/admin/insights/reports',
      icon: BarChart3,
      module: 'timesheets',
      order: 80,
      tourId: 'more.insights.reports',
    });
  }
  if (canSeeDevices(access)) {
    rows.push({
      key: 'insights.devices',
      section: u.role === 'it_admin' ? 'it' : 'work',
      label: 'Device monitoring',
      subtitle: ['manager', 'admin'].includes(u.role) ? 'Computers of the people who report to you' : 'Work computers tracked by TM360',
      href: '/admin/insights/devices',
      icon: MonitorSmartphone,
      module: 'security',
      order: 90,
      tourId: 'more.insights.devices',
    });
  }
  return rows;
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
