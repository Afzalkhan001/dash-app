// Platform domain (wave 3) — first-sign-in tour steps for the platform owner (docs/TOUR.md copy rules:
// ≤ 4-word titles, ≤ 2 short sentences naming the control as it reads). Appended before the demo step.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  const rows = ctx.workspaceRows;
  return [
    tourStep('platform.hero', 'home.platform.hero', 'Companies on DASH', 'How many companies use DASH and how many people they have. Tap the arrow for the list.', {
      screen: '/',
      when: () => ctx.homeCards.includes('platform.hero'),
    }),
    tourStep('platform.companies', 'more.platform.companies', 'Your companies', 'Open a company to edit its details, or register a new one.', {
      screen: '/more',
      when: () => rows.includes('platform.companies'),
    }),
    tourStep('platform.wallets', 'more.platform.wallets', 'Company wallets', 'Add bounty coins to a company, or take back coins nobody has used.', {
      screen: '/more',
      when: () => rows.includes('platform.wallets'),
    }),
    tourStep('platform.features', 'more.platform.features', 'Company features', 'Switch a feature or HR on or off for everyone at one company.', {
      screen: '/more',
      when: () => rows.includes('platform.features'),
    }),
  ];
}
