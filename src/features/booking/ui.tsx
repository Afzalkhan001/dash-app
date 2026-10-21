// Booking building blocks: the data every booking screen reads, one row for a booking, the hold
// countdown, star picker and the small "say who gets told" line.

import { Clapperboard, DoorClosed, Lock, type LucideIcon, MapPin, Star, TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import type { BookingRecord } from '@/api/booking';
import type { ProfType } from '@/api/me';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { holdClock } from '@/features/booking/use-slot-hold';
import { bookingDay, bookingTimes, minToHm, profTypesOf, statusOf, typeLabel } from '@/features/booking/model';
import { dateLabel, dayLabel, hmLabel } from '@/lib/dates';
import { addDaysYmd } from '@/lib/ist';
import { type ModuleKey, palette, space, type StatusTone } from '@/theme/tokens';
import { FIELD_LABEL_INSET, Avatar, Banner, Chip, ChipRow, DateField, haptic, ListRow, ModuleBadge, type Option, PressableScale, Row, StatusPill, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';

export const BOOKING_MODULE = 'tasks' as const;

export const typeIcon = (type?: string): LucideIcon => (type === 'rooms' ? DoorClosed : type === 'locations' ? MapPin : Clapperboard);

/** "Mon, 19 Oct · 9:00 AM – 1:00 PM". */
export function whenLine(b: BookingRecord, today: string) {
  const t = bookingTimes(b);
  const day = dateLabel(bookingDay(b), today);
  return t ? `${day} · ${hmLabel(t.start)} – ${hmLabel(t.end)}` : day;
}
export const timeRange = (b: BookingRecord) => {
  const t = bookingTimes(b);
  return t ? `${hmLabel(t.start)} – ${hmLabel(t.end)}` : '—';
};

/** The signed-in person as the booking writes need them (id and name). */
export function useMe() {
  const user = useSession((s) => s.user);
  if (!user) return null;
  return { id: user.id, name: user.name || '', role: user.role || '', dept: user.dept || (typeof user.departmentId === 'string' ? user.departmentId : '') };
}

/** The company's professional types (Config on the website), or the website's three defaults. */
export function useProfTypes(): ProfType[] {
  const t = useMyTenant();
  return profTypesOf(t.data?.profTypes);
}

/**
 * A booking-shaped row: the leading badge or initials, a medium title over a 2-line muted subtitle and
 * a 1-line note, and its StatusPill UNDER the text, so the title and the time keep the full width (a
 * status-only right column squeezes "11:00 AM – 12:00 PM" into a word per line on a 320 dp phone).
 * An optional figure (rating, waited days) stays on the right.
 */
export function StackedRow({
  title,
  subtitle,
  note,
  module,
  icon,
  person,
  status,
  value,
  valueMeta,
  titleColor,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string | null;
  note?: string | null;
  module?: ModuleKey;
  icon?: LucideIcon;
  person?: { name?: string | null } | null;
  status?: { label: string; tone: StatusTone } | null;
  value?: string | null;
  valueMeta?: string | null;
  titleColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const left = module && icon ? <ModuleBadge module={module} icon={icon} /> : person ? <Avatar name={person.name ?? undefined} size={40} ring={false} /> : null;
  return (
    <ListRow
      size="lg"
      left={left}
      title={title}
      titleWeight="medium"
      valueWeight="medium"
      titleColor={titleColor}
      subtitle={subtitle}
      subtitleLines={2}
      numberOfLines={2}
      meta={note}
      value={value}
      valueMeta={valueMeta}
      below={status ? <StatusPill label={status.label} tone={status.tone} /> : undefined}
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, note, value, valueMeta, status?.label].filter(Boolean).join(', ')}
    />
  );
}

/**
 * One booking as a row: type badge, what was booked, when, and its status. `who` adds a person line
 * ("Asked by Meera Nair") for the approvers' lists. `hideStatus` drops the pill on a list where every
 * row has the same one (say it once).
 */
export function BookingRow({
  b,
  today,
  types,
  who,
  hideStatus,
  onPress,
}: {
  b: BookingRecord;
  today: string;
  types: ProfType[];
  who?: 'requester' | 'resource';
  hideStatus?: boolean;
  onPress?: () => void;
}) {
  const st = statusOf(b);
  const person = who === 'requester' ? b.requestedBy : who === 'resource' ? b.resource : '';
  const title = who === 'requester' ? b.requestedBy || '—' : b.resource || '—';
  const kind = typeLabel(b, types);
  return (
    <StackedRow
      module={who ? undefined : BOOKING_MODULE}
      icon={who ? undefined : typeIcon(b.type)}
      person={who ? { name: person || '' } : undefined}
      title={title}
      subtitle={whenLine(b, today)}
      note={who === 'resource' ? kind : [kind, b.kekaCode || b.project].filter(Boolean).join(' · ')}
      status={hideStatus ? null : st}
      onPress={onPress}
      accessibilityLabel={[title, whenLine(b, today), kind, st.label].join(', ')}
    />
  );
}

/** The hold countdown (amber under a minute) or why the time couldn't be held (dash.html:27933 HoldBanner). */
export function HoldNotice({ secsLeft, holdErr }: { secsLeft: number; holdErr: string }) {
  if (holdErr) return <Banner tone="danger" icon={TriangleAlert} title="Pick another time" message={holdErr} />;
  if (!secsLeft) return null;
  return (
    <Banner
      tone={secsLeft <= 60 ? 'warning' : 'info'}
      icon={Lock}
      title={`Held for you · ${holdClock(secsLeft)} left`}
      message="Nobody else can book this time while you finish."
    />
  );
}

/** Five 48 dp stars (required rating). */
export function StarPicker({ value, onChange, label = 'Rating' }: { value: number; onChange: (n: number) => void; label?: string }) {
  return (
    <View style={styles.starsWrap}>
      <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
        {label}
      </Text>
      <Row style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= value;
          return (
            <PressableScale
              key={n}
              onPress={() => {
                haptic.select();
                onChange(n);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: n === value }}
              accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
              style={styles.star}>
              <Star size={30} color={on ? palette.goldInk : palette.textFaint} fill={on ? palette.goldInk : 'transparent'} strokeWidth={1.6} />
            </PressableScale>
          );
        })}
      </Row>
    </View>
  );
}

/** "Who gets told" in one muted line, under a confirm. */
export function NotifyLine({ text }: { text: string }) {
  return (
    <Text variant="caption" muted numberOfLines={4}>
      {text}
    </Text>
  );
}

/** Day chips from today: "Today", "Tomorrow", "Thu 23"… `days` chips, plus a date field for later days up to `maxDays`. */
export function DayStrip({ value, onChange, today, days, maxDays, label = 'Date' }: { value: string; onChange: (ymd: string) => void; today: string; days: number; maxDays?: number; label?: string }) {
  const list = Array.from({ length: days }, (_, i) => addDaysYmd(today, i));
  const later = !!maxDays && maxDays >= days;
  const last = maxDays ? addDaysYmd(today, maxDays) : list[list.length - 1]!;
  return (
    <View style={styles.dayWrap}>
      <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
        {label}
      </Text>
      <ChipRow>
        {list.map((d, i) => (
          <Chip key={d} label={i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayLabel(d, { weekday: 'short', day: 'numeric' }).replace(',', '')} selected={value === d} onPress={() => onChange(d)} />
        ))}
      </ChipRow>
      {later ? <DateField label="Or pick a later day" value={value && !list.includes(value) ? value : null} onChange={onChange} minimumDate={today} maximumDate={last} placeholder="Pick a date" /> : null}
    </View>
  );
}

/** Times every `step` minutes from `from` to `to` (inclusive) as select options ("9:15 AM"). */
export function timeOptions(from: number, to: number, step: number, keep: (min: number) => boolean = () => true): Option<string>[] {
  const out: Option<string>[] = [];
  for (let m = from; m <= to; m += step) if (keep(m)) out.push({ value: minToHm(m), label: hmLabel(minToHm(m)) });
  return out;
}

/** Names joined for a sentence: "Priya", "Priya and Deepa". */
export const andList = (names: string[]) => (names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

const styles = themedStyles(() => ({
  starsWrap: { gap: space.xs },
  dayWrap: { gap: space.xs },
  // Five stars always fit one line: each takes an equal share (never under 48 dp at 320 dp), capped at 56.
  stars: { alignSelf: 'stretch', maxWidth: 5 * 56 },
  star: { flex: 1, minWidth: 48, maxWidth: 56, height: 48, alignItems: 'center', justifyContent: 'center' },
}));
