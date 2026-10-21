// Accounts tour steps (docs/TOUR.md copy rules: ≤ 4-word title, ≤ 2 short sentences naming the control as
// it reads). Each runs only when its row is on this person's More screen; the payments card step only
// when Home shows it.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('accounts.desk', 'more.accounts.desk', 'Your Accounts desk', 'Accounts desk holds petty cash, claims and vendor bills at every stage. Approve them, then start each payment.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('accounts.desk'),
    }),
    tourStep('accounts.vendors', 'more.accounts.vendors', 'Check new vendors', 'Vendors lists new registrations to check and approve, and every approved vendor with their bills.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('accounts.vendors'),
    }),
  ];
}
