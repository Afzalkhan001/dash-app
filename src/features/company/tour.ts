// Company domain (wave 1) — first-sign-in tour steps (docs/TOUR.md copy rules: ≤ 4-word titles,
// ≤ 2 short sentences naming the control as it reads). Appended before the demo step.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  const rows = ctx.workspaceRows;
  const lead = rows.includes('company.dashboard');
  return [
    tourStep('company.glance', 'home.company.glance', 'Your company at a glance', 'People, departments, open tasks and bookings waiting. Tap a number for the list.', {
      screen: '/',
      when: () => ctx.homeCards.includes('company.glance'),
    }),
    tourStep('company.settings', 'more.company.settings', 'Company settings', 'Switch features on or off for everyone, and choose who can post news or open the audit.', {
      screen: '/more',
      when: () => rows.includes('company.settings'),
    }),
    tourStep('company.users', 'more.company.users', 'System logins', 'Invite a new HR, IT or admin login, change a role, or remove access.', {
      screen: '/more',
      when: () => rows.includes('company.users'),
    }),
    tourStep('company.audit', 'more.company.audit', 'The activity audit', 'See who did what in DASH, and when.', {
      screen: '/more',
      when: () => !lead && rows.includes('company.audit'),
    }),
    tourStep('company.subscriptions', 'more.company.subscriptions', 'Subscriptions', 'Software the company pays for: what renews soon and what nobody uses.', {
      screen: '/more',
      when: () => !lead && rows.includes('company.subscriptions'),
    }),
  ];
}
