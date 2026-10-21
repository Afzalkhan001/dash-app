// Servicedesk domain — first-sign-in tour steps (docs/TOUR.md copy rules: ≤ 4-word title, ≤ 2 short
// sentences naming the control as it reads). Both point at More › IT & office rows (WorkspaceRow
// tourId), shown only when the person has the row.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

const DESK_BODY: Record<string, string> = {
  it_admin: 'Assign new tickets to your team and approve equipment. What waits on you is also in Inbox.',
  admin: 'Follow equipment requests here. You approve them when you run IT & Admin.',
  app_manager: 'Follow equipment requests here. You approve them when you run IT & Admin.',
  hr: 'Behaviour & work complaints come here. Change their status or reject them.',
  super_admin: 'Office requests and complaints wait on you here. IT help and equipment are here too.',
};

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep(
      'servicedesk.desk',
      'more.servicedesk',
      'Your service desk',
      DESK_BODY[ctx.role] ?? 'Every IT help and equipment request in the company, as it moves along.',
      { screen: '/more', when: () => ctx.workspaceRows.includes('servicedesk.desk') },
    ),
    tourStep('servicedesk.raise', 'more.servicedesk.raise', 'Raise for someone', 'Raise a ticket or equipment request for a colleague. It shows in their own requests.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('servicedesk.raise'),
    }),
  ];
}
