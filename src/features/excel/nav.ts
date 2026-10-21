// Excel domain — one More › Workspace row, "Import & export", for anyone who has at least one bulk
// upload or Excel download on the website (features/excel/access). Every import and export screen
// hangs off that one hub; no other domain's menu is touched. No + actions, no Home cards.

import { FileSpreadsheet } from 'lucide-react-native';

import { excelGates } from '@/features/excel/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const g = excelGates(access);
  if (!g.any) return [];
  const imports = Object.values(g.imports).some(Boolean);
  return [
    {
      key: 'excel.hub',
      section: 'work',
      label: 'Import & export',
      subtitle: imports ? 'Upload sheets and download Excel files' : 'Download Excel files',
      href: '/admin/import',
      icon: FileSpreadsheet,
      module: 'timesheets',
      order: 95,
      tourId: 'more.excel.hub',
    },
  ];
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
