// Visitor log (web: VisitorLog, dash.html:35728; GET /visitors/log?from&to&status&q).
// Filters as the web has them: a search (visitor, mobile, host, reason — sent on return or after a short
// pause), the dates (Today · 7 days (default) · 30 days · Custom, IST, on the visit's day) and the status.
// The list is newest first, one frosted card per day, 50 at a time ("Show more"); a row opens the visit
// (read-only, like the web — no edits, no export). The server sends at most 2,000 visits, so a full
// page says to narrow the dates. Desk roles only.

import { Redirect } from 'expo-router';
import { CalendarDays, History, ListFilter, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { LOG_LIMIT, useVisitorLog, VISIT_STATUSES } from '@/api/desk';
import type { Visit } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { canRunDesk, canSeeVisitorLog } from '@/features/desk/access';
import { plural } from '@/features/desk/format';
import { DeskVisitRow } from '@/features/desk/visit-row';
import { useDeskVisitSheet } from '@/features/desk/visit-sheet';
import { dateLabel, visitStatus } from '@/features/visitors/format';
import { istDateOf } from '@/lib/dates';
import { addDaysYmd } from '@/lib/ist';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { ActivityList, Banner, Button, DateField, EmptyState, ErrorState, MenuSheet, NavHeader, PillField, PillSelector, Screen, SkeletonList, Text, useLayout } from '@/ui';

type Range = 'today' | '7' | '30' | 'custom';
const RANGE_LABEL: Record<Range, string> = { today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days', custom: 'Pick dates' };
const PAGE = 50;

export default function VisitorLogScreen() {
  const access = useAccess();
  const today = useTodayIst();
  const { gap } = useLayout();
  const allowed = canRunDesk(access) && canSeeVisitorLog(access);
  const sheet = useDeskVisitSheet({ desk: false });

  const [range, setRange] = useState<Range>('7');
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({ from: addDaysYmd(today, -7), to: today }));
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [menu, setMenu] = useState<'range' | 'status' | null>(null);

  // Search after a short pause, as well as on return.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(t);
  }, [text]);

  // The web's default is 7 days ago → today (VisitorLog `ago(7)`), on the visit's day.
  const from = range === 'today' ? today : range === '7' ? addDaysYmd(today, -7) : range === '30' ? addDaysYmd(today, -30) : custom.from;
  const to = range === 'custom' ? custom.to : today;
  const badDates = range === 'custom' && !!from && !!to && from > to;
  const log = useVisitorLog({ from, to, status, q }, allowed && !badDates);

  if (!allowed) return <Redirect href="/" />;

  const list = log.data ?? [];
  const page = list.slice(0, shown);
  const groups = byDay(page, today);
  const st = status ? visitStatus(status) : null;
  const pick = (r: Range) => {
    setRange(r);
    setShown(PAGE);
  };

  return (
    <Screen header={<NavHeader title="Visitor log" />} onRefresh={() => log.refetch()}>
      <View style={styles.filters}>
        <PillField
          icon={Search}
          placeholder="Search visitors"
          value={text}
          onChangeText={(v) => {
            setText(v);
            setShown(PAGE);
          }}
          maxLength={60}
          returnKeyType="search"
          onSubmitEditing={() => setQ(text.trim())}
          autoCorrect={false}
          accessibilityLabel="Search the visitor log by name, mobile, host or reason"
        />
        <View style={styles.pills}>
          <PillSelector icon={CalendarDays} label={RANGE_LABEL[range]} onPress={() => setMenu('range')} accessibilityLabel={`Dates: ${RANGE_LABEL[range]}`} />
          <PillSelector icon={ListFilter} label={st ? st.label : 'All statuses'} onPress={() => setMenu('status')} accessibilityLabel={`Status: ${st ? st.label : 'all'}`} />
        </View>
        {range === 'custom' ? (
          <View style={{ gap }}>
            <DateField label="From" value={custom.from} maximumDate={today} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} />
            <DateField
              label="To"
              value={custom.to}
              maximumDate={today}
              onChange={(v) => setCustom((c) => ({ ...c, to: v }))}
              error={badDates ? 'Pick a date on or after the From date.' : null}
            />
          </View>
        ) : null}
      </View>

      {badDates ? null : log.data ? (
        list.length ? (
          <>
            {list.length >= LOG_LIMIT ? (
              <Banner tone="warning" title={`Showing the newest ${LOG_LIMIT.toLocaleString('en-IN')}`} message="There may be more. Narrow the dates to see them." />
            ) : null}
            {groups.map((g, i) => (
              <ActivityList key={`${g.day}-${i}`} title={g.label}>
                {g.items.map((v) => (
                  <DeskVisitRow key={v.id} visit={v} today={today} onPress={() => sheet.show(v)} />
                ))}
              </ActivityList>
            ))}
            <View style={styles.footer}>
              <Text variant="caption" muted align="center">
                {page.length < list.length ? `Showing ${page.length} of ${plural(list.length, 'visit', 'visits')}` : `Showing ${plural(list.length, 'visit', 'visits')}`}
              </Text>
              {page.length < list.length ? <Button variant="ghost" size="md" title="Show more" onPress={() => setShown((n) => n + PAGE)} /> : null}
            </View>
          </>
        ) : (
          <EmptyState
            icon={<History color={palette.textMuted} />}
            title="No visitors found"
            message={q || status ? 'Try another search or status, or wider dates.' : 'Nobody visited in these dates.'}
          />
        )
      ) : log.isError ? (
        <ErrorState message={log.error?.message ?? ''} onRetry={() => void log.refetch()} />
      ) : (
        <SkeletonList rows={6} avatar />
      )}

      <MenuSheet
        visible={menu === 'range'}
        onClose={() => setMenu(null)}
        title="Dates"
        items={(['today', '7', '30', 'custom'] as Range[]).map((r) => ({ key: r, label: RANGE_LABEL[r], icon: CalendarDays, onPress: () => pick(r) }))}
      />
      <MenuSheet
        visible={menu === 'status'}
        onClose={() => setMenu(null)}
        title="Status"
        items={[
          { key: 'all', label: 'All statuses', icon: ListFilter, onPress: () => setStatus('') },
          ...VISIT_STATUSES.map((s) => ({ key: s, label: visitStatus(s).label, icon: ListFilter, onPress: () => setStatus(s) })),
        ]}
      />
      {sheet.element}
    </Screen>
  );
}

// Consecutive visits on the same India day share a card (the server sends newest first).
function byDay(list: Visit[], today: string) {
  const groups: { day: string; label: string; items: Visit[] }[] = [];
  for (const v of list) {
    // The server filters on the visit's work date (IST), so group on it too.
    const day = v.workDate || istDateOf(v.createdAt) || '';
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(v);
    else groups.push({ day: day || `n${groups.length}`, label: day === today ? 'Today' : dateLabel(day, today), items: [v] });
  }
  return groups;
}

const styles = themedStyles(() => ({
  filters: { gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  footer: { alignItems: 'center', gap: space.xs },
}));
