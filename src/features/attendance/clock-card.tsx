// Today's clock — the app's ClockCard / HomeClockWidget (dash.html ~L4179/L4248) as one vermilion
// hero card, on Home and in Me › Attendance. It hides itself unless this person clocks in (HR_SECTIONS:
// attendance module on, and not a system role).
//
// The phone only sends its position; the server decides the office area, the time and the status, and
// its refusals (accuracy 422, outside the office 403, last week's timesheet 403) are shown verbatim.
// Office vs remote follows the web exactly: remoteOnly accounts always punch remote; otherwise, when
// the company allows remote, "Clock in remotely" / "Clock out remotely" sit in the "…" menu (the
// switch shows up front only before clock-in, on an approved work-from-home day or once chosen).
//
// Clock-out opens the timesheet sheet; its one "Clock out" gets the position FIRST (with the same
// precision rule the server applies), then saves the day, then punches out with that position — so a
// phone that can't get a good fix never leaves a saved timesheet behind (timesheet-sheet.tsx).
//
// The look (docs/REFERENCE-COMPONENTS.md §3 Home): the one bold colour moment on Home — the vermilion
// gradient hero (Card tone="primary"). Top row: a small translucent clock disc + the muted label
// ("Today · Tue, 20 Oct") and, once the day is over, its status pill. Then the figure as Lendora
// giant numerals (kit Numeral, ExtraLight): the running timer "2ʰ 14ᵐ 05ˢ" with tiny superscript
// units and the ticking seconds greyed like a balance's decimals, or the time worked once done; one
// muted status line; at most ONE message, picked by priority — a missed clock-out, an error, the
// remote switch, where you are (or no office), the hourly remote location — then the full-width white
// Clock in / Clock out pill with one round "…" (overflow menu) beside it. Clocking in and out both end
// with a toast.
//
// Light / dark: the hero gradient is the same family in both schemes, so the white text and the
// translucent white panels on it stay. The pill and the message panel are `surface` (white in light,
// umber in dark) and their inks are the scheme's text colours (primaryText, successInk, dangerInk).

import { useRouter } from 'expo-router';
import { CircleCheck, Clock3, House, LocateFixed, LogIn, LogOut, type LucideIcon, MoreHorizontal, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';

import type { AttendanceRow, TodayFull } from '@/api/attendance';
import { useAttendanceToday } from '@/api/hr';
import { clockTime, dayState, duration, haversineM, hms, modeShort, plainServerText, prettyHm, shortDay } from '@/features/attendance/format';
import { usePingStatus, useRemotePingAgent } from '@/features/attendance/ping-agent';
import { TimesheetSheet } from '@/features/attendance/timesheet-sheet';
import { ClockError, type Fix, getPosition, usePunch } from '@/features/attendance/use-clock';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { motion, palette, radius, space } from '@/theme/tokens';
import { Button, Card, ErrorState, haptic, IconButton, type MenuItem, MenuSheet, Numeral, PressableScale, Skeleton, StatusPill, Text, toast, TourTarget } from '@/ui';

// The hero's text colours (white, 80 % and 58 % white on the vermilion gradient). Read at render time,
// never in a module-level constant, so they always come from the live tokens.
const onHero = () => ({ white: palette.onPrimary, muted: palette.onPrimaryMuted, faint: palette.onPrimaryFaint });

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// "7h 42m 05s" → [{ n: '7', u: 'h' }, { n: '42', u: 'm' }, { n: '05', u: 's' }]; [] for anything else ("—").
function durationParts(text: string) {
  return Array.from(String(text).matchAll(/(\d+)\s*([a-z]+)/gi), (m) => ({ n: m[1]!, u: m[2]! }));
}

/**
 * A duration as the hero's figure: one kit Numeral per part — giant ExtraLight white digits with the
 * unit as a tiny superscript ("2ʰ 14ᵐ 05ˢ"), and (for the ticking timer) the seconds greyed out like a
 * balance's decimals. One line; each part shrinks to fit (never below the numeral's 36 px floor), so
 * "12ʰ 59ᵐ 59ˢ" still fits a 320 dp phone. Read out once, as words. Falls back to the plain text when
 * it is not a duration.
 */
function DurationFigure({ text, greySeconds, timer, spoken }: { text: string; greySeconds?: boolean; timer?: boolean; spoken?: string }) {
  const c = onHero();
  const parts = durationParts(text);
  if (!parts.length) {
    return (
      <Text variant="display" color={c.white} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {text}
      </Text>
    );
  }
  return (
    <View accessible accessibilityRole={timer ? 'timer' : 'text'} accessibilityLabel={spoken ?? text}>
      {/* The parts are one figure for screen readers: the wrapper above speaks for them. */}
      <View style={styles.figureRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {parts.map((p, i) => {
          const faint = greySeconds && p.u === 's';
          return (
            <Numeral
              key={`${i}${p.u}`}
              value={p.n}
              unit={p.u}
              onDark
              color={faint ? c.faint : c.white}
              animate={false}
              style={styles.figurePart}
            />
          );
        })}
      </View>
    </View>
  );
}

// "Worked 7 hours 50 minutes" — the figure in words, for screen readers.
function workedSpoken(min?: number | null) {
  if (typeof min !== 'number' || !Number.isFinite(min)) return 'Time worked not known';
  const n = Math.max(0, Math.round(min));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `Worked ${h ? `${h} ${h === 1 ? 'hour' : 'hours'} ` : ''}${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

// Ticks once a second while mounted, so only the timer re-renders.
function LiveElapsed({ since, skewMs }: { since: string; skewMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const started = new Date(since).getTime();
  const secs = Number.isFinite(started) ? Math.max(0, (now + skewMs - started) / 1000) : 0;
  const mins = Math.floor(secs / 60);
  return (
    <DurationFigure text={hms(secs)} greySeconds timer spoken={`Clocked in for ${Math.floor(mins / 60)} hours ${mins % 60} minutes`} />
  );
}

// The hero's one big action: a white pill (52 dp, like an lg Button) with a coloured icon disc and a
// coloured label — Clock in in green, Clock out in the brand teal with a warm sunset disc. White text
// never sits on the green (too little contrast), so the colour is in the disc and the label ink.
function HeroAction({
  title,
  icon: Icon,
  ink,
  disc,
  discIcon,
  loading,
  disabled,
  onPress,
}: {
  title: string;
  icon: LucideIcon;
  ink: string;
  disc: string;
  discIcon: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const blocked = !!(disabled || loading);
  return (
    <PressableScale
      onPress={onPress}
      disabled={blocked}
      scaleTo={blocked ? 1 : 0.97}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked, busy: !!loading }}
      style={[styles.heroBtn, disabled && !loading && styles.dimmed]}>
      <View style={[styles.heroBtnContent, loading && styles.hidden]}>
        <View style={[styles.heroDisc, { backgroundColor: disc }]}>
          <Icon size={18} color={discIcon} strokeWidth={2.2} />
        </View>
        <Text variant="bodyStrong" color={ink} numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.shrink}>
          {title}
        </Text>
      </View>
      {loading ? (
        <View style={[StyleSheet.absoluteFill, styles.spinner]} pointerEvents="none">
          <ActivityIndicator color={ink} />
        </View>
      ) : null}
    </PressableScale>
  );
}

// Same footprint as the loaded card, so nothing jumps when today's data arrives. Exported so Me can
// hold the same dark slot while access is still loading (no light→dark flash).
export function ClockSkeleton() {
  return (
    <Card tone="primary" style={[styles.card, styles.skeletonCard]} accessibilityLabel="Loading today’s attendance" accessibilityRole="progressbar">
      <View style={styles.top}>
        <View style={styles.headRow}>
          <Skeleton height={32} width={32} radius={16} style={styles.skel} />
          <Skeleton height={14} width="45%" style={styles.skel} />
        </View>
        <View style={styles.group}>
          <Skeleton height={54} width="62%" style={styles.skel} />
          <Skeleton height={12} width="40%" style={styles.skel} />
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Skeleton height={52} radius={radius.pill} style={styles.skel} />
        </View>
        <Skeleton height={52} width={52} radius={26} style={styles.skel} />
      </View>
    </Card>
  );
}

// "in office" / "remote" — the short form, mid-sentence; the distance and address are in the day's sheet.
function whereShort(mode?: string | null) {
  if (!mode) return '';
  const w = modeShort(mode);
  return w.charAt(0).toLowerCase() + w.slice(1);
}

// "40 m" / "2.4 km"
const distanceText = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

// The one message the card shows: a white panel above the button, the remote switch, or one muted
// line under the button.
type Slot =
  | { kind: 'alert'; text: string; danger?: boolean; action?: { label: string; onPress: () => void } }
  | { kind: 'switch' }
  | { kind: 'note'; text: string };

/** `tourId` marks the Clock in / Clock out pill for the first-sign-in tour (Home only; docs/TOUR.md). */
export function ClockCard({ tourId }: { tourId?: string } = {}) {
  const router = useRouter();
  const access = useAccess();
  const on = access.sections.clock;
  const todayQ = useAttendanceToday(on);
  const today = todayQ.data as unknown as TodayFull | undefined;
  const punch = usePunch();
  const ping = usePingStatus();

  const [remote, setRemote] = useState<boolean | null>(null); // null = follow today's clock-in mode
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [step, setStep] = useState<'locating' | 'sending' | null>(null); // clock-in progress
  const [err, setErr] = useState<{ message: string; status?: number; code?: ClockError['code'] } | null>(null);
  const [sheet, setSheet] = useState<'clockout' | 'entry' | null>(null);
  const [menu, setMenu] = useState(false);

  useRemotePingAgent(today?.ping, on && !!today);

  if (!on) return null;

  if (!today || typeof today !== 'object') {
    if (todayQ.error) {
      return (
        <Card>
          <ErrorState title="Couldn’t load today" message={(todayQ.error as Error)?.message ?? ''} onRetry={() => void todayQ.refetch()} />
        </Card>
      );
    }
    return <ClockSkeleton />;
  }

  const rec: AttendanceRow | null = today.record && typeof today.record === 'object' ? today.record : null;
  const s: Partial<TodayFull['settings']> = today.settings && typeof today.settings === 'object' ? today.settings : {};
  const locations = Array.isArray(today.locations) ? today.locations : [];
  const remoteOnly = !!today.rule?.remoteOnly;
  const open = !!rec && !rec.out_at;
  const done = !!rec && !!rec.out_at;
  const remoteOn = remote ?? (open && rec?.in_mode === 'remote');
  const busy = punch.isPending;
  // The day closed while the clock-out sheet was open (clocked out on another phone; the 409 reloads
  // today): there is nothing left to clock out, so the sheet goes instead of offering "Stay clocked in".
  if (sheet === 'clockout' && !open && !busy) setSheet(null);
  // Phone clocks drift; the server's clock is the one the record was stamped with.
  const skewRaw = today.serverTime ? new Date(today.serverTime).getTime() - todayQ.dataUpdatedAt : 0;
  const skewMs = Number.isFinite(skewRaw) && Math.abs(skewRaw) < 12 * 3600_000 ? skewRaw : 0;
  const maxAccuracy = typeof s.maxAccuracyM === 'number' ? s.maxAccuracyM : Infinity;
  const canEntry = open && access.sections.timesheets;
  const punchMode = (forceRemote = false): 'remote' | 'office' => (remoteOnly || remoteOn || forceRemote ? 'remote' : 'office');

  const nearest =
    fix && locations.length
      ? locations
          .filter((l) => typeof l?.lat === 'number' && typeof l?.lng === 'number')
          .map((l) => ({ l, m: Math.round(haversineM(fix.lat, fix.lng, l.lat, l.lng)) }))
          .sort((a, b) => a.m - b.m)[0]
      : null;

  // forceRemote: "Clock in remotely" (from the menu, or the way out of an outside-the-office refusal).
  const clockIn = (forceRemote = false) => {
    setErr(null);
    setStep('locating');
    punch.mutate(
      {
        kind: 'in',
        mode: punchMode(forceRemote),
        onFix: (f) => {
          setFix(f);
          setStep('sending');
        },
      },
      {
        onSuccess: (r) => {
          setRemote(null);
          setFix(null); // the distance mattered before the punch; after it, today's state says it all
          toast.show(r?.in_at ? `Clocked in at ${clockTime(r.in_at)}` : 'Clocked in');
        },
        onError: (e) =>
          setErr({
            message: e.message || 'Something went wrong. Try again.',
            status: e instanceof ClockError ? e.status : undefined,
            code: e instanceof ClockError ? e.code : undefined,
          }),
        onSettled: () => setStep(null),
      },
    );
  };

  // ── clock-out, run by the sheet: position first (same precision rule as the server), then the punch ──
  const locateForOut = async (): Promise<Fix> => {
    const f = await getPosition();
    if (!remoteOnly && f.accuracy > maxAccuracy) {
      throw new ClockError(`Your location isn’t precise enough (±${f.accuracy} m; needs ±${maxAccuracy} m). Move near a window and try again.`, 422);
    }
    return f;
  };
  const punchOut = async (f: Fix) => {
    const r = await punch.mutateAsync({ kind: 'out', mode: punchMode(), fix: f });
    setRemote(null);
    setFix(null);
    setErr(null);
    toast.show(r?.out_at ? `Clocked out at ${clockTime(r.out_at)}` : 'Clocked out');
  };

  const locate = async () => {
    setLocating(true);
    setErr(null);
    try {
      setFix(await getPosition());
    } catch (e) {
      setErr({ message: (e as Error)?.message || 'Couldn’t find your location.', code: e instanceof ClockError ? e.code : undefined });
    }
    setLocating(false);
  };

  // Same gate as always (company allows remote, not a remote-only account, day not over).
  const remoteOption = !!s.allowRemote && !remoteOnly && !done;
  // The switch is only for clocking IN: on an approved work-from-home day, or once "Clock in remotely"
  // was picked (so a failed try can be retried or switched off). Once in, "Clock out remotely" is in "…".
  const showSwitch = remoteOption && !rec && (!!s.wfhToday || remote !== null);
  const remoteDay = !done && (remoteOnly || remoteOn || rec?.in_mode === 'remote');
  // The hero's small label, like a balance card's "Available balance": what the figure is about.
  const dateText = isYmd(today.today) ? `Today · ${shortDay(today.today)}` : 'Today';

  // Last week's timesheet holds clock-in (403); offer the way out right under the message.
  const owesTimesheet = !!err && err.status === 403 && /timesheet/i.test(err.message) && access.sections.timesheets;
  // Location refused for DASH: on Android the prompt never comes back, so the way out is a button.
  const needsPermission = err?.code === 'permission';
  // Refused for being outside the office: remote work is allowed, so offer it right there.
  const offerRemote = !!err && err.status === 403 && !owesTimesheet && !rec && remoteOption && !remoteOn && /move closer|office location/i.test(err.message);

  // ── the ONE message, by priority ──
  let slot: Slot | null = null;
  if (rec?.state === 'incomplete') {
    const day = isYmd(rec.work_date) ? shortDay(rec.work_date, isYmd(today.today) ? today.today.slice(0, 4) : undefined) : 'an earlier day';
    slot = { kind: 'alert', danger: true, text: `You didn’t clock out on ${day}. Clock out now to close it.` };
  } else if (err) {
    slot = {
      kind: 'alert',
      danger: true,
      text: plainServerText(err.message),
      action: owesTimesheet
        ? { label: 'Open timesheets', onPress: () => router.push('/attendance/timesheets') }
        : needsPermission
          ? { label: 'Open settings', onPress: () => void Linking.openSettings().catch(() => {}) }
          : offerRemote
            ? {
                label: 'Clock in remotely',
                onPress: () => {
                  setRemote(true);
                  clockIn(true);
                },
              }
            : undefined,
    };
  } else if (showSwitch) {
    slot = { kind: 'switch' };
  } else if (fix && !done) {
    slot = {
      kind: 'note',
      text:
        fix.accuracy > maxAccuracy
          ? `Weak location signal (±${fix.accuracy} m). Move near a window and try again.`
          : nearest
            ? `You’re about ${distanceText(nearest.m)} from ${nearest.l.name || 'the office'}.`
            : 'Location found.',
    };
  } else if (!rec && !locations.length && !remoteOnly && !remoteOn) {
    slot = { kind: 'alert', text: 'No office is set up yet. Ask HR to add one.' };
  } else if (ping.active && ping.lastError) {
    slot = { kind: 'alert', danger: true, text: `Hourly location not sent. ${ping.lastError} Keep DASH open with location on.` };
  } else if (ping.active) {
    slot = { kind: 'note', text: `Hourly location: ${ping.recorded} of 9 sent${ping.nextDueAt ? ` · next at ${clockTime(ping.nextDueAt)}` : ''}. Keep DASH open.` };
  } else if (remoteDay && !open) {
    slot = { kind: 'note', text: 'Remote: DASH sends your location once an hour while it’s open.' };
  }

  // What the button is doing right now (not a message — it takes the muted line while it lasts).
  const progress = step === 'locating' ? 'Getting your location…' : step === 'sending' ? 'Clocking you in…' : locating ? 'Finding your location…' : null;
  const line = progress ?? (slot?.kind === 'note' ? slot.text : null);

  // ── the "…" menu: only what applies right now ──
  const menuItems: MenuItem[] = [];
  if (canEntry) {
    // Write down an hour while you still remember it; the same sheet the clock-out uses.
    menuItems.push({ key: 'entry', label: 'Add timesheet entry', icon: Plus, onPress: () => setSheet('entry') });
  }
  if (!rec && remoteOption && !showSwitch) {
    menuItems.push({
      key: 'remote',
      label: 'Clock in remotely',
      hint: 'Working away from the office. DASH sends your location once an hour.',
      icon: House,
      onPress: () => {
        setRemote(true); // the switch then shows, so a failed try can be retried or switched off
        clockIn(true);
      },
    });
  }
  if (open && remoteOption && !remoteOn) {
    // Finishing away from the office: the clock-out is sent as remote (the server still records
    // "in office" when you are inside the office area).
    menuItems.push({
      key: 'out-remote',
      label: 'Clock out remotely',
      hint: 'Finishing away from the office',
      icon: House,
      onPress: () => {
        setRemote(true);
        setSheet('clockout');
      },
    });
  }
  menuItems.push({
    key: 'locate',
    label: 'Check my location',
    hint: locations.length ? 'See how far you are from the office' : undefined,
    icon: LocateFixed,
    onPress: () => void locate(),
  });

  const c = onHero();
  return (
    <Card tone="primary" style={styles.card}>
      <View style={styles.top}>
        {/* Payno's top row: a small icon disc and the label (the day), and how it ended once it has */}
        <View style={styles.headRow}>
          <View style={styles.headDisc} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Clock3 size={16} color={c.white} strokeWidth={1.8} />
          </View>
          {/* 2 lines: with large text beside the status pill the date wraps instead of being cut */}
          <Text variant="label" color={c.muted} numberOfLines={2} style={styles.flexText}>
            {dateText}
          </Text>
          {rec && !open ? <StatusPill {...dayState(rec.state)} /> : null}
        </View>

        {/* The figure and its status line — cross-fades when the state changes (not on first show; the screen's entrance covers that) */}
        <LayoutAnimationConfig skipEntering>
          <Animated.View key={open ? 'open' : done ? 'done' : 'none'} entering={FadeIn.duration(motion.base)} style={styles.group}>
            {open ? (
              <>
                <LiveElapsed since={rec.in_at} skewMs={skewMs} />
                <Text variant="label" color={c.muted} numberOfLines={2}>
                  In at {clockTime(rec.in_at)}
                  {rec.late ? <Text variant="labelStrong" color={c.white}>{' · late'}</Text> : null}
                  {whereShort(rec.in_mode) ? ` · ${whereShort(rec.in_mode)}` : ''}
                </Text>
              </>
            ) : done ? (
              <>
                <DurationFigure text={duration(rec.worked_minutes)} spoken={workedSpoken(rec.worked_minutes)} />
                <Text variant="label" color={c.muted} numberOfLines={2}>
                  Worked today · {clockTime(rec.in_at)} – {clockTime(rec.out_at)}
                  {rec.early_out ? ' · left early' : ''}
                </Text>
              </>
            ) : (
              <>
                <Text variant="hero" color={c.white} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  Not clocked in
                </Text>
                {s.shiftName && s.shiftStart ? (
                  <Text variant="label" color={c.muted} numberOfLines={2}>
                    Shift {prettyHm(s.shiftStart)}
                    {s.shiftEnd ? ` – ${prettyHm(s.shiftEnd)}` : ''}
                  </Text>
                ) : null}
              </>
            )}
          </Animated.View>
        </LayoutAnimationConfig>
      </View>

      {slot?.kind === 'switch' ? (
        // Before clocking in only: the one question, when remote is allowed. The whole row is the one
        // touch target (≥ 48 dp); the Switch inside is just the visual state.
        <Pressable
          style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
          disabled={busy}
          onPress={() => {
            haptic.select();
            setRemote(!remoteOn);
          }}
          accessibilityRole="switch"
          accessibilityLabel="Working remotely"
          accessibilityState={{ checked: remoteOn, disabled: busy }}>
          <View style={styles.flexText}>
            <Text variant="bodyStrong" color={c.white} numberOfLines={1}>
              Working remotely
            </Text>
            {remoteOn || s.wfhToday ? (
              <Text variant="caption" color={c.muted} numberOfLines={2}>
                {remoteOn ? 'DASH sends your location once an hour.' : 'Your work from home is approved for today.'}
              </Text>
            ) : null}
          </View>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.fixed}>
            <Switch
              value={remoteOn}
              trackColor={{ false: 'rgba(255,255,255,0.25)', true: palette.accent }}
              thumbColor={c.white}
              ios_backgroundColor="rgba(255,255,255,0.25)"
            />
          </View>
        </Pressable>
      ) : null}

      {slot?.kind === 'alert' ? (
        <View style={styles.alert} accessibilityRole={slot.danger ? 'alert' : undefined}>
          <Text variant="label" color={slot.danger ? palette.dangerInk : palette.text}>
            {slot.text}
          </Text>
          {slot.action ? (
            <Button title={slot.action.label} variant="danger" size="sm" style={styles.alertAction} disabled={busy} onPress={slot.action.onPress} />
          ) : null}
        </View>
      ) : null}

      {/* The one main action, plus one round button; what the button is doing sits right under it */}
      <View style={styles.actionGroup}>
        <View style={styles.actions}>
          {!rec ? (
            // Tap-through for the tour: tapping the spotlit pill really clocks in (and ends the tour).
            <TourTarget id={tourId} radius={radius.pill} padding={4} style={styles.heroSlot} activate={busy || locating ? undefined : () => clockIn()}>
              <HeroAction
                title="Clock in"
                icon={LogIn}
                ink={palette.successInk}
                disc={palette.accent}
                discIcon={palette.onAccent}
                loading={busy}
                disabled={locating}
                onPress={() => clockIn()}
              />
            </TourTarget>
          ) : open ? (
            <TourTarget
              id={tourId}
              radius={radius.pill}
              padding={4}
              style={styles.heroSlot}
              activate={
                busy || locating
                  ? undefined
                  : () => {
                      setErr(null);
                      setSheet('clockout');
                    }
              }>
              <HeroAction
                title="Clock out"
                icon={LogOut}
                // primaryText: the brand ink that still reads on the umber pill in dark mode.
                ink={palette.primaryText}
                disc={palette.sunsetSoft}
                discIcon={palette.coralInk}
                loading={busy}
                disabled={locating}
                onPress={() => {
                  setErr(null);
                  setSheet('clockout');
                }}
              />
            </TourTarget>
          ) : (
            <View style={styles.doneRow} accessible accessibilityLabel="Done for today">
              <CircleCheck size={20} color={palette.accent} strokeWidth={2} />
              <Text variant="bodyStrong" color={c.white} numberOfLines={1} style={styles.shrink}>
                Done for today
              </Text>
            </View>
          )}
          {done ? null : (
            // Always a labelled menu, never a bare icon whose meaning has to be guessed.
            <IconButton tone="onPrimary" size={52} accessibilityLabel="More options" disabled={busy || locating} onPress={() => setMenu(true)}>
              {locating ? <ActivityIndicator color={c.white} /> : <MoreHorizontal size={22} color={c.white} strokeWidth={1.8} />}
            </IconButton>
          )}
        </View>
        {line ? (
          <Text variant="caption" color={c.muted} align="center" numberOfLines={2} accessibilityLiveRegion="polite">
            {line}
          </Text>
        ) : null}
      </View>

      <MenuSheet visible={menu} onClose={() => setMenu(false)} items={menuItems} />

      {sheet === 'clockout' ? (
        <TimesheetSheet
          mode="clockout"
          locate={locateForOut}
          punchOut={punchOut}
          onCancel={() => {
            setSheet(null);
            setRemote(null); // "Clock out remotely" applies to that one clock-out only
          }}
          onSubmitted={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'entry' ? <TimesheetSheet mode="entry" onCancel={() => setSheet(null)} onSubmitted={() => setSheet(null)} /> : null}
    </Card>
  );
}

const styles = themedStyles(() => ({
  // Payno balance hero: plenty of air between the label + figure, any message, and the pill.
  card: { gap: space.lg },
  skeletonCard: { minHeight: 248 },
  // Translucent white on the vermilion gradient (the same in light and dark: the hero doesn't change).
  skel: { backgroundColor: 'rgba(255,255,255,0.18)' },
  top: { gap: space.sm },
  group: { gap: space.xxs },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  headDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // The kit's frosted-on-dark veil and rim (theme/tokens), made for white icons on the brand fill.
    backgroundColor: palette.frostOnDark,
    borderWidth: 1,
    borderColor: palette.frostEdgeOnDark,
  },
  // The timer's parts on one line: "2ʰ 14ᵐ 05ˢ" (each part may shrink, never wrap).
  figureRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'flex-start', columnGap: space.sm, maxWidth: '100%' },
  figurePart: { flexShrink: 1, minWidth: 0 },
  flexText: { flex: 1, minWidth: 0 },
  fixed: { flexShrink: 0 },
  shrink: { flexShrink: 1 },
  // Inner panel on the dark hero (radius 16, 10 % white).
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  togglePressed: { opacity: 0.8 },
  // Inline notice on the dark hero (radius 12, white).
  alert: { backgroundColor: palette.surface, borderRadius: radius.sm, padding: space.sm, gap: space.xxs },
  alertAction: { alignSelf: 'flex-start', marginTop: space.xs },
  // The pill row and its muted progress / note line belong together: 8 between them, not the card's 20.
  actionGroup: { gap: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // The pill's slot in the row (a tour target wrapper); the pill fills it.
  heroSlot: { flex: 1, minWidth: 0 },
  heroBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    paddingHorizontal: space.xs,
    justifyContent: 'center',
  },
  heroBtnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minWidth: 0 },
  heroDisc: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dimmed: { opacity: 0.4 },
  hidden: { opacity: 0 },
  spinner: { alignItems: 'center', justifyContent: 'center' },
  doneRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52 },
}));
