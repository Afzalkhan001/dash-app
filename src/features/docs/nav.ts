// What the docs domain adds to More and the + sheet (docs/port/EXTENSION-POINTS.md §3, §4). Pure.
//   More › links   "Documents" — every PDF this person can make, and agreement drafting
//   + sheet        "Agreement" — draft a vendor agreement (anyone who has Agreements on the website)

import { FilePlus2, FileText } from 'lucide-react-native';

import { canDraftAgreement, canSeeDocsHub } from '@/features/docs/access';
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

export function createActions(access: Access): CreateAction[] {
  if (!canDraftAgreement(access)) return [];
  return [{ key: 'docs.agreement', label: 'Agreement', href: '/admin/accounts/agreements/new', icon: FilePlus2, module: 'vendor', hint: 'Opens a new vendor agreement to send for signature', order: 100 }];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
