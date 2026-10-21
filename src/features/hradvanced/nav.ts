// hradvanced — nav.ts. More › Workspace rows for the parts of the website the phone used to leave
// there (the owner's "everything in the website should be in the app"):
//   People & HR › Payroll setup      structure editor + statutory/TDS editor (Super Admin, HR; salary/tax)
//   Company › Branding               sidebar logo, logo text, report logo (the Config page: super_admin/ceo/coo)
//   Company › Professional categories  bookable categories, hours and gaps (the Config page)
//   Work › Extend a shoot            today's shoots of my reports (the manager role, dash.html ManagerHome)
// No + action (none of these is a daily "start something"), no Home card, no Inbox queue.

import { Clock, Image as ImageIcon, Layers, Tags } from 'lucide-react-native';

import { canEditCompanyConfig, canExtendShoots, payrollSetupGates } from '@/features/hradvanced/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export const HRADV_TOUR = { payroll: 'more.hradvanced.payroll', extend: 'more.hradvanced.extend', branding: 'more.hradvanced.branding' };

export function workspaceRows(access: Access): WorkspaceRow[] {
  const rows: WorkspaceRow[] = [];
  const g = payrollSetupGates(access.hr, access.user);
  if (g.any) {
    rows.push({
      key: 'hradvanced.payroll-setup',
      section: 'people',
      label: 'Payroll setup',
      subtitle: g.structures && g.statutory ? 'Edit salary structures, statutory and TDS' : g.structures ? 'Edit salary structures' : 'Edit statutory and TDS',
      href: '/admin/hr-advanced/payroll-setup',
      icon: Layers,
      module: 'pay',
      order: 31,
      tourId: HRADV_TOUR.payroll,
    });
  }
  if (canEditCompanyConfig(access.user, access.tenant)) {
    rows.push(
      {
        key: 'hradvanced.branding',
        section: 'company',
        label: 'Branding',
        subtitle: 'Logo, logo text and the PDF report logo',
        href: '/admin/hr-advanced/branding',
        icon: ImageIcon,
        module: 'profile',
        order: 60,
        tourId: HRADV_TOUR.branding,
      },
      {
        key: 'hradvanced.categories',
        section: 'company',
        label: 'Professional categories',
        subtitle: 'What can be booked, its hours and the gap after',
        href: '/admin/hr-advanced/categories',
        icon: Tags,
        module: 'tasks',
        order: 61,
      },
    );
  }
  if (canExtendShoots(access.user)) {
    rows.push({
      key: 'hradvanced.extend',
      section: 'work',
      label: 'Extend a shoot',
      subtitle: 'Give a team booking today a later end, without double-booking',
      href: '/admin/hr-advanced/extend',
      icon: Clock,
      module: 'tasks',
      order: 35,
      tourId: HRADV_TOUR.extend,
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
