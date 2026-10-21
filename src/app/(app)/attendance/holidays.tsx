// Holiday calendar — the app's HolidaysPanel (dash.html ~L4651), read-only, in the Payno layout:
// NavHeader, the year switch (last / this / next year, like the web's year picker), then state first —
// a light SummaryHero counting down to the next holiday (its name and date in the info chip) — then the
// year's holidays as frosted lists under SectionHeaders: the ones still to come, then the past ones
// (greyed); optional ones carry a pill. HR admins (Super Admin and HR with Holidays on — dash.html
// HolidaysPanel admin, ported in features/hrtime) get a "+" in the header and tap a row to change or
// remove it (features/hrtime/holiday-sheet).

import { Palmtree, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Holiday, useHolidays } from '@/api/hr';
import { monthShort, shortDay, WEEKDAYS, weekdayOf } from '@/features/attendance/format';
import { useTodayIst } from '@/features/attendance/use-now';
import { canManageHolidays } from '@/features/hrtime/access';
import { HolidaySheet } from '@/features/hrtime/holiday-sheet';
import { useAccess } from '@/lib/use-access';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  Button,
  EmptyState,
  ErrorState,
  isDarkScheme,
  ListRow,
  NavHeader,
  Screen,
  Segmented,
  Skeleton,
  SkeletonList,
  StatusPill,
  SummaryHero,
  Text,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

const when = (n: number) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`);
// Whole days from one YYYY-MM-DD to another (read as UTC dates, so no timezone can shift them).
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
// Keeps a short phrase ("in 23 days") on one line, so a wrapping line breaks between phrases.
const NBSP = String.fromCharCode(0xa0);
const keep = (s: string) => s.replace(/\s/g, NBSP);
/** Separator inset past the 44 dp date disc. */
const DISC_INSET = space.md + 44 + space.sm;

// The solid disc of the next holiday: the module's text tone in light; in dark that tone is a light
// pink that would swallow the white number, so the hero's deeper stop is used there.
const solidHoliday = () => (isDarkScheme() ? moduleTone.holidays.gradient[0] : moduleTone.holidays.fg);

// The date disc on the left of each row: day number over the month, on the holiday tint. The next
// holiday is a solid holiday disc; past ones go quiet grey.
function DateDisc({ ymd, next, past }: { ymd: string; next: boolean; past: boolean }) {
  const HOL = moduleTone.holidays;
  const fg = next ? palette.onPrimary : past ? palette.textMuted : HOL.fg;
  return (
    <View style={[styles.disc, !past && styles.discUpcoming, next && styles.discNext]}>
      <Text variant="bodyStrong" color={fg} tabular maxFontSizeMultiplier={1.2} style={styles.discDay}>
        {Number(ymd.slice(8, 10))}
      </Text>
      <Text variant="micro" color={next ? palette.onPrimaryMuted : past ? palette.textMuted : HOL.fg}>
        {monthShort(ymd)}
      </Text>
    </View>
  );
}

export default function HolidaysScreen() {
  const access = useAccess();
  const { compact } = useLayout();
  const on = access.sections.holidays;
  const today = useTodayIst();
  const thisYear = today.slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const admin = canManageHolidays(access.hr, access.user);
  const [edit, setEdit] = useState<{ holiday: Holiday | null; key: number } | null>(null);
  const openNew = () => setEdit({ holiday: null, key: Date.now() });
  const q = useHolidays(year, on);
  const years = [-1, 0, 1].map((o) => String(Number(thisYear) + o));
  const raw: Holiday[] = Array.isArray(q.data?.holidays) ? q.data.holidays : [];
  const list = raw.filter((h) => h && isYmd(h.date)).sort((a, b) => a.date.localeCompare(b.date));
  // The hero is this year's next holiday only: in another year "next" would point at the wrong one.
  const next = year === thisYear ? list.find((h) => h.date >= today) : undefined;
  const upcoming = list.filter((h) => h.date >= today);
  const past = list.filter((h) => h.date < today);

  const row = (h: Holiday, i: number) => {
    const isPast = h.date < today;
    const isNext = next?.id === h.id && next?.date === h.date;
    const n = daysBetween(today, h.date);
    // The 'Optional' pill marks the exception. On compact phones (and with large text) it goes under
    // the text: beside the 44 dp disc it would leave a long holiday name about 75 dp at 320 dp.
    const pill = h.optional ? <StatusPill label="Optional" tone="neutral" /> : null;
    return (
      <ListRow
        key={h.id ?? `${h.date}-${i}`}
        size="lg"
        left={<DateDisc ymd={h.date} next={isNext} past={isPast} />}
        title={h.name || 'Holiday'}
        numberOfLines={2}
        titleColor={isPast ? palette.textMuted : undefined}
        // Weekday + countdown only. If it wraps, it breaks between the two parts, never inside "in 23 days".
        subtitle={`${WEEKDAYS[weekdayOf(h.date)]} · ${keep(isPast ? 'past' : when(n).toLowerCase())}`}
        subtitleLines={2}
        below={compact ? pill : undefined}
        right={compact || !pill ? undefined : <View>{pill}</View>}
        chevron={admin}
        onPress={admin ? () => setEdit({ holiday: h, key: Date.now() }) : undefined}
        accessibilityHint={admin ? 'Opens the holiday to change or remove it' : undefined}
      />
    );
  };

  const header = <NavHeader title="Holidays" actions={admin && on ? [{ icon: Plus, label: 'Add a holiday', onPress: openNew }] : undefined} />;
  if (!on) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={<Palmtree color={moduleTone.holidays.fg} strokeWidth={1.8} />}
          title="Holidays aren’t on"
          message="The holiday list isn’t switched on for your account."
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      <Segmented options={years.map((y) => ({ key: y, label: y }))} value={year} onChange={setYear} />

      {q.isLoading ? (
        <View style={styles.stack} accessibilityLabel="Loading" accessibilityRole="progressbar">
          <Skeleton height={156} radius={radius.xxl} />
          <SkeletonList rows={6} avatar tone="surface" />
        </View>
      ) : q.error && !list.length ? (
        <ErrorState message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />
      ) : !list.length ? (
        <EmptyState
          icon={<Palmtree color={moduleTone.holidays.fg} strokeWidth={1.8} />}
          title={`No holidays for ${year} yet`}
          message={admin ? 'Add the company’s holidays for this year.' : 'They’ll show here once HR adds them.'}
          action={admin ? <Button title="Add a holiday" icon={<Plus />} onPress={openNew} /> : undefined}
        />
      ) : (
        <View style={styles.sections}>
          {next ? <NextHoliday next={next} days={daysBetween(today, next.date)} /> : null}

          {upcoming.length ? (
            <ActivityList title={`${upcoming.length} coming up`} separatorInset={DISC_INSET}>
              {upcoming.map(row)}
            </ActivityList>
          ) : null}
          {past.length ? (
            <ActivityList title={`${past.length} past`} separatorInset={DISC_INSET}>
              {past.map(row)}
            </ActivityList>
          ) : null}
        </View>
      )}

      {list.length ? (
        <Text variant="caption" muted align="center">
          Holidays don’t use your leave.
        </Text>
      ) : null}
      {edit ? (
        <HolidaySheet
          key={edit.key}
          holiday={edit.holiday}
          today={today}
          defaultDate={year === thisYear ? today : `${year}-01-01`}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </Screen>
  );
}

// The Payno light hero: a countdown to the next holiday as the big figure ("20 days") with its name
// and date in the info chip; on the day itself the holiday's name is the figure. An optional one
// says so under it.
function NextHoliday({ next, days }: { next: Holiday; days: number }) {
  const name = next.name || 'Holiday';
  const optional = next.optional ? 'Optional holiday · take it or work as usual' : undefined;
  if (days === 0) {
    return (
      <SummaryHero
        icon={Palmtree}
        module="holidays"
        label="Today is a holiday"
        figure={
          <Text variant="hero" color={palette.ink} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.name}>
            {name}
          </Text>
        }
        sub={[shortDay(next.date), next.optional ? 'optional' : null].filter(Boolean).join(' · ')}
      />
    );
  }
  return (
    <SummaryHero
      icon={Palmtree}
      module="holidays"
      label="Next holiday in"
      value={days}
      unit={days === 1 ? 'day' : 'days'}
      info={{ label: name, value: shortDay(next.date), accessibilityLabel: `${name}, ${shortDay(next.date)}` }}
      sub={optional}
    />
  );
}

const styles = themedStyles(() => ({
  stack: { gap: space.sm },
  // The hero and each list are their own sections, with room between them.
  sections: { gap: space.lg },
  name: { flexShrink: 1 },
  disc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discUpcoming: { backgroundColor: moduleTone.holidays.bg },
  discNext: { backgroundColor: solidHoliday() },
  discDay: { lineHeight: 18 },
}));
