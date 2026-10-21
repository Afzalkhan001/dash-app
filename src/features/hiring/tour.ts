// Hiring domain (wave 2) — tour steps: where hiring lives in More (for creators, the Application Manager
// and forwarded reviewers) and the Refer & earn link (for everyone who has it). Appended before the demo
// step (features/tour/role-tours).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('hiring.desk', 'more.hiring.desk', 'Hiring on your phone', 'Post job openings and move referred candidates along in Hiring.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('hiring.desk'),
    }),
    tourStep('hiring.refer', 'more.hiring.refer', 'Refer and earn coins', 'Know someone for an open position? Refer them here and earn coins when they join.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('hiring.refer') && !ctx.workspaceRows.includes('hiring.desk'),
    }),
  ];
}
