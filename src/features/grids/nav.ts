// Grids domain — nav.ts. The website's wide tables, as phone tables (sticky first column, sideways
// scroll, three text sizes). Two rows in More › Workspace, each only for people the website shows the
// table to (gates in ./access.ts):
//   People & HR  "Big tables" → /admin/grids: attendance month sheet, leave balances, payroll register,
//                salaries and the employee table — whichever this person may see.
//   Money        "Petty cash ledger" → /admin/grids/petty-ledger (Accounts and Super Admin).
// No + action, no Home card, no Inbox kind: the tables are read-only and message nobody.

import { BookOpenCheck, Table2 } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';
import { gridGates } from '@/features/grids/access';

export const GRIDS_TOUR_ID = 'more.grids.tables';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const g = gridGates(access);
  const rows: WorkspaceRow[] = [];
  const parts = [
    g.attendance ? 'attendance month' : null,
    g.balances ? 'leave balances' : null,
    g.payroll ? 'payroll register' : null,
    g.salaries ? 'salaries' : null,
    g.roster ? 'employee details' : null,
  ].filter(Boolean) as string[];
  if (parts.length) {
    const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]!;
    rows.push({
      key: 'grids.tables',
      section: 'people',
      label: 'Big tables',
      subtitle: `The website’s wide tables: ${text}`,
      href: '/admin/grids',
      icon: Table2,
      module: 'people',
      order: 90,
      tourId: GRIDS_TOUR_ID,
    });
  }
  if (g.ledger)
    rows.push({
      key: 'grids.ledger',
      section: 'money',
      label: 'Petty cash ledger',
      subtitle: 'Money given, bills in and bills still to come, per request',
      href: '/admin/grids/petty-ledger',
      icon: BookOpenCheck,
      module: 'pettyCash',
      order: 90,
    });
  return rows;
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
