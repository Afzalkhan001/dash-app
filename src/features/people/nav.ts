// People domain (wave 1) — what the roster and departments add to More, the + sheet and Home
// (docs/port/EXTENSION-POINTS.md §3–6). Pure: decided from `access` only, on every render.
//   More › People & HR   "Employees" (navForRaw `roster`) and "Departments" (navForRaw `departments`),
//                        exactly where the website's sidebar shows them (features/people/access).
//   + sheet              "Add employee" for the roster roles (the website's "+ Add Employee", :5835).
//   Home                 nothing: the roster has no queue and nothing waits on anyone.

import { Building2, UserPlus, UsersRound } from 'lucide-react-native';

import { canSeeDepartments, canSeeRoster } from '@/features/people/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const rows: WorkspaceRow[] = [];
  if (canSeeRoster(access.user, access.tenant)) {
    rows.push({
      key: 'people.roster',
      section: 'people',
      label: 'Employees',
      subtitle: 'Add people, edit details, mark leavers',
      href: '/admin/people',
      icon: UsersRound,
      module: 'people',
      order: 10,
      tourId: 'more.people.roster',
    });
  }
  if (canSeeDepartments(access.user, access.tenant)) {
    rows.push({
      key: 'people.departments',
      section: 'people',
      label: 'Departments',
      subtitle: 'Teams and who runs them',
      href: '/admin/people/departments',
      icon: Building2,
      module: 'people',
      order: 20,
    });
  }
  return rows;
}

export function createActions(access: Access): CreateAction[] {
  if (!canSeeRoster(access.user, access.tenant)) return [];
  return [
    {
      key: 'people.add',
      label: 'Add employee',
      href: '/admin/people/edit',
      icon: UserPlus,
      module: 'people',
      hint: 'Opens the form to add someone to the roster',
      order: 60,
    },
  ];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
