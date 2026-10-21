// Chat domain tour step (docs/TOUR.md copy rules): one step on More's "Chat" link, for everyone who
// has it. The Home header's chat button is not a tour target yet (the kit's IconPillGroup does not
// wrap its buttons in a TourTarget; see HANDOFF.md).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('chat.chat', 'more.chat', 'Chat with your team', 'Message a colleague or a group, and send photos and files.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('chat.chat'),
    }),
  ];
}
