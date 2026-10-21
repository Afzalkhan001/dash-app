// One request on the desk as a Payno activity row (the kit's ListRow in ActivityRow's calm style, like
// Support's own request row): the kind's icon in the Support colour, what it is (2 lines), who raised it
// and their team, a short note (what happens next, else the reference and type), and the status pill
// under the text — never beside the title, so "Waiting for approval" can't squeeze a long subject on a
// 320 dp phone. Tapping opens the request.

import type { DeskTicket } from '@/api/servicedesk';
import { deptOf, kindIcon, raiserOf, whatOf } from '@/features/servicedesk/format';
import { ticketStatus } from '@/features/support/format';
import { ListRow, ModuleBadge, StatusPill } from '@/ui';

export function DeskRow({ t, note, onPress }: { t: DeskTicket; note: string; onPress?: () => void }) {
  const st = ticketStatus(t.status);
  const dept = deptOf(t);
  const who = `${raiserOf(t)}${dept ? ` · ${dept}` : ''}`;
  return (
    <ListRow
      size="lg"
      titleWeight="medium"
      left={<ModuleBadge module="support" icon={kindIcon(t)} />}
      title={whatOf(t)}
      numberOfLines={2}
      subtitle={who}
      subtitleLines={2}
      meta={note || null}
      below={<StatusPill label={st.label} tone={st.tone} />}
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={[whatOf(t), st.label, who, note].filter(Boolean).join(', ')}
    />
  );
}
