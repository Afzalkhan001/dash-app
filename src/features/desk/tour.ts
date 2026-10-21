// Desk domain — first-sign-in tour steps (docs/TOUR.md copy rules: ≤ 4-word title, ≤ 2 short sentences).
//   Visitor Manager: the desk hero on Home, then the Visitor desk and Check-in link rows in More.
//   Super Admin (leadership tour): the Visitor desk row in More.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  const steps: TourStep[] = [];
  if (ctx.homeCards.includes('desk.hero')) {
    steps.push(
      tourStep('desk.hero', 'home.desk', 'Your visitor desk', 'See who is in the building. Tap the arrow for today’s visitors.', {
        screen: '/',
      }),
    );
  }
  if (ctx.workspaceRows.includes('desk.board')) {
    steps.push(
      tourStep(
        'desk.board',
        'more.desk.board',
        'Today at reception',
        ctx.role === 'visitor_manager' ? 'Let visitors in for their host, and check them out.' : 'The visitor desk: who is in, who is waiting, and the log.',
        { screen: '/more' },
      ),
    );
  }
  if (ctx.role === 'visitor_manager' && ctx.workspaceRows.includes('desk.qr')) {
    steps.push(tourStep('desk.qr', 'more.desk.qr', 'The check-in link', 'Share the link visitors open to check in.', { screen: '/more' }));
  }
  return steps;
}
