// Calls domain — first-sign-in tour step on More's Calls link (docs/port/EXTENSION-POINTS.md §7).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('calls.calls', 'more.calls', 'Call a colleague', 'Start a voice or video call, or see what a ring looks like.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('calls.calls'),
    }),
  ];
}
