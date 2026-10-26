// What the docs domain adds to More and the + sheet (docs/port/EXTENSION-POINTS.md §3, §4). Pure.
//   More › links   "Documents" — every PDF this person can make, and agreement drafting
//   + sheet        nothing (the owner took "Agreement" off the + sheet; drafting stays in Documents
//                  and Accounts › Agreements)

import { FileText } from 'lucide-react-native';

import { canSeeDocsHub } from '@/features/docs/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  if (!canSeeDocsHub(access)) return [];
  return [
    {
      key: 'docs.hub',
      section: 'links',
      label: 'Documents',
      subtitle: 'Make PDFs: timesheet, expense reports, schedules and reports',
      href: '/admin/docs',
      icon: FileText,
      module: 'policies',
      order: 50,
      tourId: 'more.docs.hub',
    },
  ];
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
