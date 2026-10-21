// One of my Support requests as a Payno activity row (the kit's ListRow in ActivityRow's calm style):
// the kind's icon in the Support colour, what I asked for, kind · type under it, the status pill under
// the text (never beside the title, so "Waiting for approval" can't squeeze a long subject) and the day
// it was raised on the right (under the kind on a narrow phone or with large text). Tapping opens /support/<id>, where the reference, details and Cancel live.

import type { Ticket } from '@/api/support';
import { useTodayIst } from '@/features/attendance/use-now';
import { byNewest, categoryOf, isOpenStatus, raisedShort, subjectLabel, ticketStatus, typeLabel } from '@/features/support/format';
import { ListRow, ModuleBadge, shouldStack, StatusPill, useLayout } from '@/ui';

/** Guards the API list once (non-array → [], null rows dropped) and sorts it newest first. */
export const asTickets = (x: unknown): Ticket[] =>
  (Array.isArray(x) ? x.filter((t): t is Ticket => !!t && typeof t === 'object') : []).sort(byNewest);

/** Still-open requests first (newest first within each group) — what you're waiting on comes first. */
export const openFirst = (list: Ticket[]) => [...list.filter((t) => isOpenStatus(t.status)), ...list.filter((t) => !isOpenStatus(t.status))];

export function SupportRequestRow({ t, onPress }: { t: Ticket; onPress: () => void }) {
  const today = useTodayIst();
  const c = categoryOf(t);
  const st = ticketStatus(t.status);
  const title = subjectLabel(t);
  const type = typeLabel(t);
  // For equipment and office items the title already names the item ("2x Laptop").
  const isItem = t.category === 'asset' || t.category === 'admin_request';
  const sub = !isItem && type && type !== '—' && type !== title ? `${c.label} · ${type}` : c.label;
  const when = raisedShort(t, today);
  // Below 360 dp or with large text the day moves under the kind, so the subject keeps the width.
  const tight = shouldStack(useLayout(), { below: 'narrow' });
  return (
    <ListRow
      size="lg"
      titleWeight="medium"
      left={<ModuleBadge module="support" icon={c.icon} />}
      title={title}
      numberOfLines={2}
      subtitle={sub}
      subtitleLines={1}
      below={<StatusPill label={st.label} tone={st.tone} />}
      meta={tight ? when || null : null}
      valueMeta={tight ? null : when || null}
      chevron
      onPress={onPress}
      accessibilityLabel={[title, st.label, sub, when].filter(Boolean).join(', ')}
    />
  );
}
