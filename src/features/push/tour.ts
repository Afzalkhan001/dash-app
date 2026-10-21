// Push domain — one tour step for everyone: where notifications are turned on (More › Notifications).
// Copy rules: docs/TOUR.md (≤ 4-word title, ≤ 2 short sentences).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  if (!ctx.workspaceRows.includes('push.settings')) return [];
  return [tourStep('push.settings', 'more.push.settings', 'Notifications', 'Get told when a visitor arrives or something needs you.', { screen: '/more' })];
}
