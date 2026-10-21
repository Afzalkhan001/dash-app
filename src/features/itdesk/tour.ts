// IT desk — first-sign-in tour steps (docs/TOUR.md copy rules: ≤ 4-word title, ≤ 2 short sentences
// naming the control as it reads). Each points at its More › IT & office row and runs only when the
// person has that row.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { isSupportItAdmin } from '@/features/itdesk/access';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('itdesk.assets', 'more.itdesk.assets', 'Company equipment', 'Every asset, who has it and when warranties end. Assign, take back or add one here.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('itdesk.assets'),
    }),
    tourStep('itdesk.rooms', 'more.itdesk.rooms', 'Rooms and locations', 'Open or close rooms and shoot locations, cancel a room booking and set booking purposes.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('itdesk.rooms'),
    }),
    tourStep('itdesk.support', 'more.itdesk.support', 'Support centre',
      isSupportItAdmin(ctx.role)
        ? 'Keep branch Wi-Fi and office contacts up to date. Everyone sees them in Help & support.'
        : 'Choose the office items people can request and the complaint types they can pick.',
      {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('itdesk.support'),
    }),
  ];
}
