// Someone waiting at reception for me (web: VisitCard), as a Payno AccountRow: photo, name, why they
// came and when, and a small "Respond" pill. The whole row opens the visitor in the Inbox
// (/inbox/visitors/<id>), where the phone number is and where "Let in" / "Turn away" live in the
// sticky bar. So the decision has one home — the same screen Home's "Needs you" and the Inbox open —
// and this screen never shows a charcoal button per visitor. The pill says the next step in words.

import { useRouter } from 'expo-router';

import type { Visit } from '@/api/visitors';
import { clockOf, visitStatus } from '@/features/visitors/format';
import { VisitPhoto } from '@/features/visitors/visit-photo';
import { AccountRow } from '@/ui';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function VisitCard({ visit }: { visit: Visit }) {
  const router = useRouter();
  const name = str(visit.visitorName) || 'Visitor';
  const purpose = str(visit.purpose);
  const timedOut = visit.status === 'no_response';
  const id = visit.id != null && visit.id !== '' ? String(visit.id) : '';
  const arrived = `Arrived ${clockOf(visit.createdAt)}`;
  // The time first, so a long reason can't push it out of the two lines.
  const sub = [timedOut ? visitStatus('no_response').label : '', arrived, purpose || 'No reason given'].filter(Boolean).join(' · ');

  return (
    <AccountRow
      left={<VisitPhoto visit={visit} size={44} />}
      title={name}
      sub={sub}
      actionLabel="Respond"
      onPress={id ? () => router.push(`/inbox/visitors/${encodeURIComponent(id)}`) : undefined}
      accessibilityLabel={[name, purpose, arrived, timedOut ? visitStatus('no_response').label : ''].filter(Boolean).join(', ')}
      hint="Opens Let in or Turn away"
    />
  );
}
