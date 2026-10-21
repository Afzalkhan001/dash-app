// Badge on the Inbox tab (also used by Home): how many things are waiting on the signed-in person —
// every pending approval in the queues they review (HR requests, project claims, petty cash), plus
// visitors waiting for them at reception.
//
// Cheap by construction: it reads the very queries the Inbox screen shows (same keys, so one request
// per queue, served from the persisted cache on a cold start), refreshes the HR, project-claim and
// visitor lists once a minute while mounted (one shared timer — see useInboxPolling), only asks for
// queues this person can see (gated like their own screens), and is 0 until something has loaded.
// It never throws: failures just count as 0.
import { useInboxPolling, useInboxSummary } from '@/features/inbox/use-inbox';

export function useInboxCount(): number {
  useInboxPolling();
  return useInboxSummary().total;
}
