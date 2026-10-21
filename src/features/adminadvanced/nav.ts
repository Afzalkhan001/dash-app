// Admin advanced (wave 3) — what it adds to More. Pure: reads `access` only.
//   Work           Managers (admin, app_manager), Employees (admin, manager, app_manager)
//   People & HR    Office map (Super Admin, HR with attendance) — next to HR setup
//   IT & office    TV playlists (Super Admin, CEO, COO) — next to Office TVs
//   IT & office /  Delete data (IT Admin: all assets, service requests; Super Admin: service requests)
//   Platform       Delete data (master_admin: a company)
// No + actions (nothing here is a daily "start something") and no Home cards.

import { ListVideo, Map, Trash2, UserCog, Users } from 'lucide-react-native';

import { canEditPlaylists, canSeeEmployees, canSeeManagers, canUseOfficeMap, deleteTools } from '@/features/adminadvanced/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const u = access.user;
  if (!u) return [];
  const rows: WorkspaceRow[] = [];
  if (canSeeManagers(access)) {
    rows.push({ key: 'adminadvanced.managers', section: 'work', label: 'Managers', subtitle: 'Managers in your departments and their teams', href: '/admin/advanced/managers', icon: UserCog, module: 'people', order: 60, tourId: 'more.adminadvanced.managers' });
  }
  if (canSeeEmployees(access)) {
    rows.push({ key: 'adminadvanced.employees', section: 'work', label: 'Employees', subtitle: 'Your team’s workload and equipment', href: '/admin/advanced/employees', icon: Users, module: 'people', order: 61, tourId: 'more.adminadvanced.employees' });
  }
  if (canUseOfficeMap(access.hr, u)) {
    rows.push({ key: 'adminadvanced.officemap', section: 'people', label: 'Office map', subtitle: 'Place offices and their clock-in circles on a map', href: '/admin/advanced/office-map', icon: Map, module: 'attendance', order: 21, tourId: 'more.adminadvanced.officemap' });
  }
  if (canEditPlaylists(u, access.tenant)) {
    rows.push({ key: 'adminadvanced.playlists', section: 'it', label: 'TV playlists', subtitle: 'Which posts the office TVs show, in what order', href: '/admin/advanced/playlists', icon: ListVideo, module: 'news', order: 71, tourId: 'more.adminadvanced.playlists' });
  }
  const del = deleteTools(access);
  if (del.any) {
    rows.push({
      key: 'adminadvanced.delete',
      section: del.company ? 'platform' : 'it',
      label: 'Delete data',
      subtitle: del.company ? 'Delete a company and everything in it' : del.assets ? 'Delete all assets or a service request' : 'Delete a service request',
      href: '/admin/advanced',
      icon: Trash2,
      module: 'security',
      order: 200,
      tourId: 'more.adminadvanced.delete',
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
