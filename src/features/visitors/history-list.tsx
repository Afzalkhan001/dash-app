// Past visitors (web: the History tab of MyVisitorsHub) in the Payno "Recent transactions" style:
// one frosted ActivityList per day — photo, name, why they came, the time they arrived (and left) and
// the status, and who answered (the web's decision line, dash.html:35894: "Approved by host …", or "Let in
// by Visitor Manager … — host did not answer" when the desk let them in without you). Tapping a row opens
// the full record (large photo, mobile, the decision) in a sheet, so each row stays short at 320 dp. <RecentVisitors> is the 3-row preview on the Visitors screen.

import { ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { Visit } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { clockOf, dateLabel, phoneLabel, visitDecision, visitStatus } from '@/features/visitors/format';
import { VisitPhoto } from '@/features/visitors/visit-photo';
import { space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Sheet, StatusPill, SummaryCard, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';

const nameOf = (v: Visit) => (typeof v.visitorName === 'string' && v.visitorName.trim()) || 'Visitor';
const purposeOf = (v: Visit) => (typeof v.purpose === 'string' && v.purpose.trim()) || '';

/**
 * One past visit: photo, name, reason, and on the right the arrival time over when they left (or,
 * with `showDate`, the day over the arrival time) and the status pill.
 */
export function VisitRow({ visit, today, showDate, onPress }: { visit: Visit; today: string; showDate?: boolean; onPress: () => void }) {
  const st = visitStatus(visit.status);
  const name = nameOf(visit);
  const inAt = clockOf(visit.createdAt);
  const outAt = visit.checkOutAt ? clockOf(visit.checkOutAt) : '';
  const value = showDate ? dateLabel(visit.createdAt, today) : inAt;
  const meta = showDate ? inAt : outAt ? `until ${outAt}` : null;
  const decision = visitDecision(visit);
  return (
    <ActivityRow
      left={<VisitPhoto visit={visit} size={40} />}
      title={name}
      subtitle={purposeOf(visit) || 'No reason given'}
      note={decision?.text ?? null}
      value={value}
      meta={meta}
      status={st}
      onPress={onPress}
      accessibilityLabel={[name, st.label, showDate ? value : '', `In ${inAt}`, outAt ? `out ${outAt}` : '', decision?.text ?? ''].filter(Boolean).join(', ')}
    />
  );
}

/** The full record of one visit: a large photo, the status and the details. */
export function VisitSheet({ visit, open, onClose }: { visit: Visit | null; open: boolean; onClose: () => void }) {
  const today = useTodayIst();
  const st = visit ? visitStatus(visit.status) : null;
  const decision = visitDecision(visit);
  return (
    <Sheet visible={open} onClose={onClose} title={visit ? nameOf(visit) : 'Visitor'} subtitle={visit ? dateLabel(visit.createdAt, today) : undefined}>
      {visit && st ? (
        <>
          <View style={styles.hero}>
            <VisitPhoto visit={visit} size={112} />
            <StatusPill label={st.label} tone={st.tone} style={styles.center} />
          </View>
          {decision?.override ? <Banner tone="warning" icon={ShieldAlert} message={decision.text} /> : null}
          <SummaryCard
            hideEmpty
            rows={[
              { label: 'Mobile', value: phoneLabel(visit.visitorMobile) },
              { label: 'Here for', value: purposeOf(visit) },
              { label: 'Arrived', value: clockOf(visit.createdAt) },
              { label: 'Left', value: visit.checkOutAt ? clockOf(visit.checkOutAt) : null },
              { label: 'Decision', value: decision && !decision.override ? decision.text : null },
            ]}
          />
        </>
      ) : null}
    </Sheet>
  );
}

/** Opens one visit in the sheet; the visit stays set while the sheet fades out. */
function useVisitSheet() {
  const [selected, setSelected] = useState<Visit | null>(null);
  const [open, setOpen] = useState(false);
  return {
    show: (v: Visit) => {
      setSelected(v);
      setOpen(true);
    },
    sheet: <VisitSheet visit={selected} open={open} onClose={() => setOpen(false)} />,
  };
}

const asList = (visits: Visit[]) => (Array.isArray(visits) ? visits : []).filter((v): v is Visit => !!v && typeof v === 'object');

/** Every past visit, one frosted list per day (the server sends newest first). */
export function HistoryList({ visits }: { visits: Visit[] }) {
  const { gap } = useLayout();
  const today = useTodayIst();
  const { show, sheet } = useVisitSheet();
  const list = asList(visits);

  // Consecutive visits on the same day share a list.
  const groups: { day: string; items: Visit[] }[] = [];
  for (const v of list) {
    const day = dateLabel(v.createdAt, today);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(v);
    else groups.push({ day, items: [v] });
  }

  return (
    <View style={{ gap }}>
      {groups.map((g, i) => (
        <ActivityList key={`${g.day}-${i}`} title={g.day}>
          {g.items.map((v, j) => (
            <VisitRow key={v.id ?? j} visit={v} today={today} onPress={() => show(v)} />
          ))}
        </ActivityList>
      ))}
      {sheet}
    </View>
  );
}

/** The latest few visits with "See all" (the Visitors screen). Nothing when there are none. */
export function RecentVisitors({ visits, onSeeAll, max = 3 }: { visits: Visit[]; onSeeAll: () => void; max?: number }) {
  const today = useTodayIst();
  const { show, sheet } = useVisitSheet();
  const list = asList(visits);
  if (!list.length) return null;
  return (
    <View>
      <ActivityList
        title="Recent visitors"
        onSeeAll={onSeeAll}
        seeAllAccessibilityLabel={list.length === 1 ? 'See your past visitor' : `See all ${list.length} past visitors`}>
        {list.slice(0, max).map((v, j) => (
          <VisitRow key={v.id ?? j} visit={v} today={today} showDate onPress={() => show(v)} />
        ))}
      </ActivityList>
      {sheet}
    </View>
  );
}

const styles = themedStyles(() => ({
  hero: { alignItems: 'center', gap: space.sm, paddingTop: space.xxs },
  center: { alignSelf: 'center' },
}));
