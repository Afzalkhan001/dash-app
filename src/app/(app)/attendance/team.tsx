// Who's in today — the app's TeamAttendance (dash.html ~L4430). GET /hr/attendance/team?date=: HR
// admins see the whole company, a department admin only the departments they run (the server scopes
// it). Shows the people who clocked in on that day; tap one for where and when, with punch history.
//
// List template (docs/DESIGN.md §10.4) in the Payno look: NavHeader with a round calendar action
// (another day is one tap away; today, the common question, needs no form field), then a light
// SummaryHero — how many clocked in that day as the big figure, split into in office · remote · late
// under it — then a SectionHeader over a FlashList whose rows are painted as one frosted card
// (GroupedRow tone="surface" + ActivityRow); the person opens in a sheet.

import DateTimePicker from '@react-native-community/datetimepicker';
import { FlashList } from '@shopify/flash-list';
import { CalendarDays, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AttendanceRow, useTeamAttendance } from '@/api/attendance';
import { dayFlags, PunchDetails, PunchTiles } from '@/features/attendance/day-sheet';
import { clockTime, dayState, duration, modeShort, shortDay } from '@/features/attendance/format';
import { useTodayIst } from '@/features/attendance/use-now';
import { useAccess } from '@/lib/use-access';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  ActivityRow,
  Button,
  EmptyState,
  ErrorState,
  GroupedRow,
  haptic,
  isDarkScheme,
  KeyValueRow,
  NavHeader,
  Screen,
  SectionHeader,
  Sheet,
  Skeleton,
  SkeletonList,
  SummaryHero,
  Text,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
// Keeps a short phrase ("In 9:05 AM") on one line, so a line that has to wrap breaks between
// phrases and never inside a time.
const NBSP = String.fromCharCode(0xa0);
const keep = (s: string) => s.replace(/\s/g, NBSP);

// Where they clocked in, in the same words as everywhere else (format.ts MODE_WORD: In office /
// Remote / Outside office area / Fixed). The distance and the address are in the person's sheet.
const whereOf = (r: AttendanceRow) => (r.in_mode ? modeShort(r.in_mode) : null);

// 'YYYY-MM-DD' ⇄ the picker's Date (noon, so no timezone can move the day) — as the kit's DateField.
const toDay = (ymd: string) => new Date(`${ymd}T12:00:00`);
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The same date picker the kit's DateField opens (Android: the system dialog; iOS: an inline calendar
// in a sheet), opened from the header's calendar button instead of a form field.
function DayPicker({ open, draft, max, onDraft, onClose, onPick }: {
  open: boolean;
  draft: Date | null;
  max: string;
  onDraft: (d: Date) => void;
  onClose: () => void;
  onPick: (ymd: string) => void;
}) {
  if (Platform.OS === 'android') {
    return open && draft ? (
      <DateTimePicker
        value={draft}
        mode="date"
        maximumDate={toDay(max)}
        onValueChange={(_, d) => {
          onClose();
          haptic.select();
          onPick(ymdOf(d));
        }}
        onDismiss={onClose}
      />
    ) : null;
  }
  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title="Pick a day"
      footer={
        <Button
          title="Done"
          onPress={() => {
            if (draft) onPick(ymdOf(draft));
            onClose();
          }}
        />
      }>
      {draft ? (
        <DateTimePicker
          value={draft}
          mode="date"
          display="inline"
          maximumDate={toDay(max)}
          accentColor={palette.primaryText}
          themeVariant={isDarkScheme() ? 'dark' : 'light'}
          onValueChange={(_, d) => onDraft(d)}
        />
      ) : null}
    </Sheet>
  );
}

// One person as a Payno row, like every other list: name, then when (in · out), then the flags and
// where; the hours as the row's figure. Everyone here clocked in, so a plain "Present" day needs no
// pill: only a day that is different (Working, Half day, Short hours, No clock-out) shows ONE pill
// (under the text on narrow phones, so the name keeps its width; the whole right column moves under
// the text with large text). Without the pill the in · out line keeps its room on one line.
//   [avatar] Name …………………… 9h 55m  ›
//            In 9:05 AM · Out 7:00 PM
//            Late · In office
function TeamRow({ r, onPress }: { r: AttendanceRow; onPress: () => void }) {
  const st = dayState(r.state);
  const name = r.employee_name || '—';
  const hours = r.worked_minutes != null ? duration(r.worked_minutes) : null;
  const inAt = `In ${clockTime(r.in_at)}`;
  const outAt = `Out ${clockTime(r.out_at)}`;
  const flags = [r.late ? 'Late' : null, r.early_out ? 'Left early' : null, whereOf(r)].filter((f): f is string => !!f);
  return (
    <ActivityRow
      person={{ name: r.employee_name }}
      title={name}
      // Two lines: beside the hours and the chevron a full name gets ~90 dp at 320 dp, and one line
      // cut it mid-word ("Priya Raghun…").
      titleLines={2}
      subtitle={`${keep(inAt)} · ${keep(outAt)}`}
      note={flags.join(' · ') || null}
      value={hours}
      status={r.state === 'present' ? undefined : st}
      chevron
      onPress={onPress}
      accessibilityLabel={[name, st.label, inAt, outAt, hours ? `worked ${hours}` : null, ...flags].filter(Boolean).join(', ')}
    />
  );
}

// The day as a Payno light hero: how many clocked in as the big figure, and under it three figures
// split by hairlines (each label may wrap to two lines). They answer "who is in the office" without
// reading every row.
function Summary({ label, total, inOffice, remote, late }: { label: string; total: number; inOffice: number; remote: number; late: number }) {
  return (
    <SummaryHero icon={Users} module="people" label={label} value={total} unit="clocked in">
      <View style={styles.summary}>
        <SummaryCell n={inOffice} label="in office" color={moduleTone.attendance.fg} />
        <View style={styles.vsep} />
        <SummaryCell n={remote} label="remote" color={moduleTone.visitors.fg} />
        <View style={styles.vsep} />
        <SummaryCell n={late} label="late" color={late ? palette.warningInk : undefined} />
      </View>
    </SummaryHero>
  );
}

function SummaryCell({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <View style={styles.cell} accessible accessibilityLabel={`${n} ${label}`}>
      <Text variant="hero" color={color} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {n}
      </Text>
      <Text variant="caption" muted align="center" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export default function TeamAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const access = useAccess();
  const allowed = access.sections.attendance && (access.isHrAdmin || access.hr.adminsDepts.length > 0);
  const today = useTodayIst();
  const [date, setDate] = useState(today);
  const q = useTeamAttendance(date, allowed);
  const [open, setOpen] = useState<AttendanceRow | null>(null);
  // Keep the last person on screen while the sheet fades out.
  const [last, setLast] = useState<AttendanceRow | null>(null);
  if (open && open !== last) setLast(open);
  const shown = open ?? last;
  const [refreshing, setRefreshing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);
  const rows = (Array.isArray(q.data) ? q.data : []).filter((r): r is AttendanceRow => !!r && typeof r === 'object');
  const late = rows.filter((r) => r.late).length;
  const inOffice = rows.filter((r) => r.in_mode === 'office').length;
  const remote = rows.filter((r) => r.in_mode === 'remote').length;
  const isToday = date === today;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  if (!allowed) {
    return (
      <Screen header={<NavHeader title="Who’s in today" />}>
        <EmptyState
          icon={<Users color={moduleTone.people.fg} strokeWidth={1.8} />}
          title="Not available"
          message="This is for HR and department admins."
        />
      </Screen>
    );
  }

  const header = (
    <NavHeader
      title={isToday ? 'Who’s in today' : 'Who was in'}
      actions={[
        {
          icon: CalendarDays,
          label: 'Pick a day',
          onPress: () => {
            setDraft(toDay(date));
            setPicking(true);
          },
        },
      ]}
    />
  );

  const listHeader = (
    <View style={styles.listHeader}>
      {q.data ? (
        <Summary label={isToday ? 'Today' : shortDay(date, today.slice(0, 4))} total={rows.length} inOffice={inOffice} remote={remote} late={late} />
      ) : q.isLoading ? (
        <Skeleton height={196} radius={radius.xxl} />
      ) : null}
      {rows.length && !q.isLoading ? <SectionHeader title="People" /> : null}
    </View>
  );

  const data = q.isLoading || (q.error && !rows.length) ? [] : rows;

  return (
    <Screen scroll={false} header={header}>
      <FlashList
        data={data}
        keyExtractor={(r, i) => String(r.id ?? r.employee_id ?? i)}
        renderItem={({ item, index }) => (
          <GroupedRow tone="surface" hairline first={index === 0} last={index === data.length - 1}>
            <TeamRow r={item} onPress={() => setOpen(item)} />
          </GroupedRow>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          q.isLoading ? (
            <SkeletonList rows={5} avatar tone="surface" />
          ) : q.error ? (
            <ErrorState message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState
              icon={<Users color={moduleTone.people.fg} strokeWidth={1.8} />}
              title={isToday ? 'Nobody has clocked in yet' : 'Nobody clocked in that day'}
              message="Only people who clocked in are listed."
            />
          )
        }
        // The pull-to-refresh spinner in the app's colours (the brand's text tone reads on dark too).
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.primaryText}
            colors={[palette.primaryText]}
            progressBackgroundColor={palette.surface}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      />

      <Sheet
        visible={!!open}
        onClose={() => setOpen(null)}
        title={shown?.employee_name || 'Attendance'}
        subtitle={shown ? dayFlags(shown) : undefined}>
        {shown ? (
          <>
            <PunchTiles r={shown} />
            <View style={styles.panel}>
              <KeyValueRow
                label="Worked"
                value={shown.worked_minutes != null ? duration(shown.worked_minutes) : shown.state === 'in_progress' ? 'Still working' : '—'}
                strong
                tabular
              />
            </View>
            <PunchDetails r={shown} />
          </>
        ) : null}
      </Sheet>

      <DayPicker
        open={picking}
        draft={draft}
        max={today}
        onDraft={setDraft}
        onClose={() => setPicking(false)}
        onPick={(ymd) => setDate(ymd > today ? today : ymd)}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  listHeader: { gap: space.lg, paddingBottom: space.xs },
  summary: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
  },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingHorizontal: space.xxs },
  vsep: { width: StyleSheet.hairlineWidth, backgroundColor: palette.separator, marginVertical: space.xxs },
  panel: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassLine,
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
  },
}));
