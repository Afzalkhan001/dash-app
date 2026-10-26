// Rows for the desk's lists. A waiting visitor is an AccountRow with a "Respond" pill (it opens the
// decision on /inbox/desk/<id>); every other visit is an ActivityRow — photo, name, who they came to
// meet, and who decided (the web's decision line, dash.html:35951 / :35998: "Let in by Visitor Manager …
// — host did not answer") or, while nobody has, why they came — with the arrival time (or day) and the
// status on the right. One idea per line, so a row stays short at 320 dp. Someone inside now is an AccountRow with a "Check out" pill.

import { useRouter } from 'expo-router';

import type { Visit } from '@/api/visitors';
import { hostName, purposeOf, visitorName } from '@/features/desk/format';
import { clockOf, dateLabel, visitDecision, visitStatus } from '@/features/visitors/format';
import { VisitPhoto } from '@/features/visitors/visit-photo';
import { AccountRow, ActivityRow } from '@/ui';

export function WaitingVisitRow({ visit }: { visit: Visit }) {
  const router = useRouter();
  const name = visitorName(visit);
  const timedOut = visit.status === 'no_response';
  const arrived = `Arrived ${clockOf(visit.createdAt)}`;
  // The time first (and the no-answer cue), so a long host name can't push them out of the two lines.
  const sub = [timedOut ? 'No answer' : '', arrived, `to meet ${hostName(visit)}`].filter(Boolean).join(' · ');
  return (
    <AccountRow
      left={<VisitPhoto visit={visit} size={44} />}
      title={name}
      sub={sub}
      actionLabel="Respond"
      onPress={() => router.push(`/inbox/desk/${encodeURIComponent(visit.id)}`)}
      accessibilityLabel={[name, `to meet ${hostName(visit)}`, timedOut ? 'no answer from the host' : '', arrived, purposeOf(visit)].filter(Boolean).join(', ')}
      hint="Opens Let in or Turn away"
    />
  );
}

/** `showStatus={false}` where the section already says it (everyone under "Inside now" is approved). */
export function DeskVisitRow({ visit, today, showDate, showStatus = true, onPress }: { visit: Visit; today: string; showDate?: boolean; showStatus?: boolean; onPress: () => void }) {
  const st = visitStatus(visit.status);
  const name = visitorName(visit);
  const inAt = clockOf(visit.createdAt);
  const outAt = visit.checkOutAt ? clockOf(visit.checkOutAt) : '';
  const purpose = purposeOf(visit);
  const decision = visitDecision(visit);
  return (
    <ActivityRow
      left={<VisitPhoto visit={visit} size={40} />}
      title={name}
      subtitle={`To meet ${hostName(visit)}`}
      note={decision?.text ?? (purpose || null)}
      value={showDate ? dateLabel(visit.createdAt, today) : inAt}
      meta={showDate ? inAt : outAt ? `until ${outAt}` : null}
      status={showStatus ? st : null}
      subtitleLines={1}
      onPress={onPress}
      accessibilityLabel={[name, `to meet ${hostName(visit)}`, st.label, showDate ? dateLabel(visit.createdAt, today) : '', `arrived ${inAt}`, outAt ? `left ${outAt}` : '', decision?.text ?? ''].filter(Boolean).join(', ')}
    />
  );
}

/**
 * Someone inside the building, with an inline "Check out" pill (web: VisitRowCard's Check out button,
 * dash.html:35866). The row opens the visit; the pill goes straight to the check-out swipe.
 */
export function InsideVisitRow({ visit, onPress, onCheckOut }: { visit: Visit; onPress: () => void; onCheckOut?: () => void }) {
  const name = visitorName(visit);
  const since = `In since ${clockOf(visit.createdAt)}`;
  return (
    <AccountRow
      left={<VisitPhoto visit={visit} size={44} />}
      title={name}
      sub={`${since} · to meet ${hostName(visit)}`}
      actionLabel="Check out"
      onPress={onPress}
      onChange={onCheckOut}
      actionAccessibilityLabel={`Check ${name} out`}
      accessibilityLabel={[name, `to meet ${hostName(visit)}`, since.toLowerCase(), purposeOf(visit)].filter(Boolean).join(', ')}
      hint="Opens the visit"
    />
  );
}
