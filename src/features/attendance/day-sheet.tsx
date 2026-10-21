// One calendar day, in one sheet. State first: clock-in and clock-out as two tiles and the time
// worked; the day's flags (late, left early, remote, fixed) sit in the subtitle. Addresses and the
// full punch history (hourly remote check-ins, map links) are one tap away under "Show details".
// Days without a record say why in one line (holiday, weekly off, approved leave, absence), and a
// past day inside the fix window offers "Request a fix" (the Fix attendance form, on that day).
//
// PunchTiles, PunchAddress and PunchDetails are shared with the Who's in today sheet. Modes read the
// same everywhere (format.ts MODE_WORD: In office / Remote / Outside office area / Fixed).

import { useRouter } from 'expo-router';
import { Info, LogIn, LogOut, type LucideIcon, MapPin, PencilLine } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { AttendanceRow } from '@/api/attendance';
import { addDays, clockTime, dayState, duration, modeLabel, shortDay } from '@/features/attendance/format';
import { PunchHistory } from '@/features/attendance/punch-history';
import type { DayInfo } from '@/features/attendance/use-month-days';
import { useTodayIst } from '@/features/attendance/use-now';
import { palette, radius, space } from '@/theme/tokens';
import { Button, KeyValueRow, Sheet, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Clock-in and clock-out as two tiles: the time (shrinks to fit, never wraps) over where it happened.
 * Clock in sits on a soft green, clock out on a soft sunset, each with its icon and a coloured label.
 */
export function PunchTiles({ r, inLabel = 'Clock in', outLabel = 'Clock out' }: { r: AttendanceRow; inLabel?: string; outLabel?: string }) {
  if (!r) return null;
  const outNote = r.out_at ? modeLabel(r.out_mode, r.out_distance_m) : r.state === 'in_progress' || !r.state ? 'Still working' : 'No clock-out';
  return (
    <View style={styles.tiles}>
      <Tile label={inLabel} value={clockTime(r.in_at)} note={modeLabel(r.in_mode, r.in_distance_m)} icon={LogIn} bg={palette.successSoft} ink={palette.successInk} />
      <Tile label={outLabel} value={clockTime(r.out_at)} note={outNote} icon={LogOut} bg={palette.sunsetSoft} ink={palette.coralInk} />
    </View>
  );
}

function Tile({ label, value, note, icon: Icon, bg, ink }: { label: string; value: string; note: string; icon: LucideIcon; bg: string; ink: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }]} accessible accessibilityLabel={`${label} ${value}, ${note}`}>
      <View style={styles.tileHead}>
        <Icon size={14} color={ink} strokeWidth={2.2} />
        <Text variant="caption" color={ink} numberOfLines={1} style={styles.flexText}>
          {label}
        </Text>
      </View>
      <Text variant="title" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text variant="caption" muted numberOfLines={2}>
        {note}
      </Text>
    </View>
  );
}

/** "In: 12 MG Road, Bengaluru" with a pin; wraps over as many lines as the address needs. */
export function PunchAddress({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.addr}>
      <MapPin size={14} color={palette.textMuted} style={styles.addrIcon} />
      <Text variant="caption" muted style={styles.flexText}>
        <Text variant="caption" color={palette.text}>
          {label}:{' '}
        </Text>
        {text}
      </Text>
    </View>
  );
}

/** Where (addresses) and every punch of the day (with map links and hourly remote check-ins). */
export function PunchDetails({ r }: { r: AttendanceRow }) {
  if (!r) return null;
  return (
    <>
      {r.in_address || r.out_address ? (
        <View style={styles.addresses}>
          {r.in_address ? <PunchAddress label="In" text={String(r.in_address)} /> : null}
          {r.out_address ? <PunchAddress label="Out" text={String(r.out_address)} /> : null}
        </View>
      ) : null}
      <View style={styles.history}>
        <Text variant="labelStrong" muted accessibilityRole="header">
          Timeline
        </Text>
        <PunchHistory r={r} />
      </View>
    </>
  );
}

// "Present · Late · Remote · Fixed" — the day's state in one line, so no row of pills is needed.
export function dayFlags(r: AttendanceRow) {
  return [
    dayState(r.state).label,
    r.late ? 'Late' : null,
    r.early_out ? 'Left early' : null,
    r.in_mode === 'remote' ? 'Remote' : null,
    r.regularized ? 'Fixed' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Why a day has no record, in one short line.
function noRecordNote(shown: DayInfo, date: string, today: string) {
  if (shown.kind === 'holiday' && shown.holiday) return `${shown.holiday.name || 'Holiday'} · ${shown.holiday.optional ? 'optional holiday' : 'company holiday'}.`;
  if (shown.kind === 'weekoff') return 'Weekly off.';
  if (shown.kind === 'leave' && shown.leave) {
    if (shown.leave.kind === 'wfh') return 'Approved work from home.';
    const half = shown.leave.half_day && shown.leave.half_day !== 'none' ? ' · half day' : '';
    return `Approved leave${shown.leave.leave_code ? ` (${shown.leave.leave_code})` : ''}${half}.`;
  }
  if (shown.kind === 'absent') return 'No clock-in on this day.';
  if (date > today) return 'This day hasn’t come yet.';
  // A past day can be 'none' too (before you joined, or while the month is still loading).
  if (date < today) return 'Nothing recorded on this day.';
  return 'Nothing recorded yet today.';
}

export function DaySheet({
  info,
  onClose,
  canRegularize,
  regWindowDays,
}: {
  info: DayInfo | null;
  onClose: () => void;
  canRegularize: boolean;
  regWindowDays: number;
}) {
  const router = useRouter();
  const today = useTodayIst();
  // Keep the last day on screen while the sheet fades out, instead of an empty sheet.
  const [last, setLast] = useState<DayInfo | null>(info);
  const [details, setDetails] = useState(false);
  if (info && info !== last) {
    setLast(info);
    setDetails(false);
  }
  const shown = info ?? last;
  const r = shown?.record && typeof shown.record === 'object' ? shown.record : undefined;
  const date = isYmd(shown?.date) ? shown.date : today;
  const windowDays = Number.isFinite(regWindowDays) ? regWindowDays : 30;
  const inWindow = date <= today && date >= addDays(today, -windowDays);
  // A day with a problem makes fixing it the main action; on a normal day it stays quiet.
  const problem = r ? r.state === 'incomplete' : shown?.kind === 'absent';

  // A day with a record: its flags. Without one, the note in the body already says what the day was
  // ("Weekly off.", "Diwali · company holiday."), so no subtitle repeats it.
  const subtitle = r ? dayFlags(r) : undefined;

  // Close the sheet first, then open the form once the sheet has faded (one layer at a time).
  const fix = () => {
    onClose();
    setTimeout(() => router.push(`/attendance/fix?date=${date}`), 280);
  };

  const worked = r ? (r.worked_minutes != null ? duration(r.worked_minutes) : r.state === 'in_progress' ? 'Still working' : '—') : null;

  return (
    <Sheet
      visible={!!info}
      onClose={onClose}
      title={shown ? shortDay(date, today.slice(0, 4)) : undefined}
      subtitle={subtitle}
      footer={
        canRegularize && inWindow && shown ? (
          <Button title="Request a fix" variant={problem ? 'primary' : 'accent'} icon={<PencilLine />} onPress={fix} />
        ) : undefined
      }>
      {r ? (
        <>
          <PunchTiles r={r} />
          <View style={styles.panel}>
            <KeyValueRow label="Worked" value={worked} strong tabular />
          </View>
          {details ? (
            <PunchDetails r={r} />
          ) : (
            <Button title="Show details" variant="text" size="sm" onPress={() => setDetails(true)} style={styles.center} />
          )}
        </>
      ) : shown ? (
        <View style={styles.note}>
          <Info size={18} color={palette.textMuted} strokeWidth={1.8} style={styles.noteIcon} />
          <Text variant="body" style={styles.flexText}>
            {noRecordNote(shown, date, today)}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

// A solid panel inside the sheet (read inside the factory, so it follows light / dark).
const card = () => ({ backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.glassLine }) as const;

const styles = themedStyles(() => ({
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, minWidth: 0, padding: space.md, gap: 2, borderRadius: radius.md },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  panel: { ...card(), paddingHorizontal: space.md, paddingVertical: space.xxs },
  addresses: { gap: space.xs },
  addr: { flexDirection: 'row', gap: 6 },
  addrIcon: { marginTop: 1, flexShrink: 0 },
  flexText: { flex: 1, minWidth: 0 },
  center: { alignSelf: 'center' },
  history: { gap: space.xxs },
  note: { ...card(), flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md },
  noteIcon: { marginTop: 2, flexShrink: 0 },
}));
