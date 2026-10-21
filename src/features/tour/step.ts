// One tour step, the way every role tour builds it (features/tour/role-tours.ts) — shared so the domain
// plug-ins' tourSteps(ctx) (features/<domain>/tour.ts) write steps the same way. Integrator-owned.
//
//   tourStep('work.teamTasks', 'more.work.tasks', 'Your team’s tasks', 'Assign work and review what was sent.', {
//     screen: '/more',                       // opened first (the step then waits up to 1.5 s for the target)
//     when: () => ctx.workspaceRows.includes('work.tasks'),
//   })
//
// Copy rules (docs/TOUR.md): a title of at most 4 words, sentence case, no full stop; at most 2 short
// sentences that name the control as it reads on screen. The target is a <TourTarget id> on the screen.

import { type Href, router } from 'expo-router';

import type { TourStep } from '@/ui';

/** Steps that open another screen get longer to find their control (the screen mounts first). */
export const CROSS_MS = 1500;

/** Open a screen before the step looks for its control. */
export const openScreen = (href: Href) => () => {
  router.navigate(href);
};

export type TourStepOpts = { when?: () => boolean; screen?: Href };

export function tourStep(key: string, target: string, title: string, body: string, opts: TourStepOpts = {}): TourStep {
  return {
    key,
    target,
    title,
    body,
    when: opts.when,
    ...(opts.screen ? { onEnter: openScreen(opts.screen), timeout: CROSS_MS } : null),
  };
}
