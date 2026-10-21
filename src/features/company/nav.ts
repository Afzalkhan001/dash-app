// Company domain (wave 1) — what it adds to More, the + sheet and Home.
//   More › Workspace   Company dashboard, Users, Company settings, Activity audit, Subscriptions — each
//                      only with the website's sidebar item (features/company/access.ts). Leadership sees
//                      them under "Company"; an IT Admin's Subscriptions sits under "IT & office", and a
//                      Config grantee's under "Money" (subscriptions) or "Company" (audit).
//   Home               "Company at a glance" (the four dashboard counts) for Super Admin, CEO and COO.
//   + sheet            nothing (adding a login is a rare, deliberate task: Users › +).
// Pure: reads `access` only.

import { CreditCard, History, LayoutDashboard, Settings2, UserCog } from 'lucide-react-native';

import { CompanyGlanceCard } from '@/features/company/glance-card';
import {
  canSeeAudit,
  canSeeCompanyDashboard,
  canSeeCompanySettings,
  canSeeSubscriptionsHub,
  canSeeUsers,
} from '@/features/company/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const u = access.user;
  const t = access.tenant;
  if (!u) return [];
  const lead = canSeeCompanyDashboard(u);
  const rows: WorkspaceRow[] = [];
  if (lead) {
    rows.push({
      key: 'company.dashboard',
      section: 'company',
      label: 'Company dashboard',
      subtitle: 'People, teams and work at a glance',
      href: '/admin/company',
      icon: LayoutDashboard,
      module: 'security',
      order: 10,
      tourId: 'more.company.dashboard',
    });
  }
  if (canSeeUsers(u, t)) {
    rows.push({
      key: 'company.users',
      section: 'company',
      label: 'Users',
      subtitle: 'System logins and invitations',
      href: '/admin/company/users',
      icon: UserCog,
      module: 'people',
      order: 20,
      tourId: 'more.company.users',
    });
  }
  if (canSeeCompanySettings(u, t)) {
    rows.push({
      key: 'company.settings',
      section: 'company',
      label: 'Company settings',
      subtitle: 'Switches, and who can do what',
      href: '/admin/company/settings',
      icon: Settings2,
      module: 'policies',
      order: 30,
      tourId: 'more.company.settings',
    });
  }
  if (canSeeAudit(u, t)) {
    rows.push({
      key: 'company.audit',
      section: 'company',
      label: 'Activity audit',
      subtitle: 'Who did what in DASH, and when',
      href: '/admin/company/audit',
      icon: History,
      module: 'security',
      order: 40,
      tourId: 'more.company.audit',
    });
  }
  if (canSeeSubscriptionsHub(u, t)) {
    rows.push({
      key: 'company.subscriptions',
      section: lead ? 'company' : u.role === 'it_admin' ? 'it' : 'money',
      label: 'Subscriptions',
      subtitle: 'Software the company pays for',
      href: '/admin/company/subscriptions',
      icon: CreditCard,
      module: 'vendor',
      order: 50,
      tourId: 'more.company.subscriptions',
    });
  }
  return rows;
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(access: Access): HomeCard[] {
  if (!canSeeCompanyDashboard(access.user)) return [];
  return [{ key: 'company.glance', placement: 'top', order: 10, Card: CompanyGlanceCard }];
}
