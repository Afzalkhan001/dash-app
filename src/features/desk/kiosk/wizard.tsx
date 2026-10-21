// The running kiosk: the visitor check-in wizard, ported from VisitWizard with kiosk=true
// (dash.html:35318-35536) and VisitKioskOverlay (35859). Same steps, same words, same rules:
//
//   start          "How can we help you today?" → meet someone · I have an invite code
//                  (+ "check in on your own phone": a real QR of the check-in link, features/deskqr/qr)
//   host           ≥ 2 letters, 250 ms pause, then GET base/employees?q (≤ 25; never the whole staff list)
//   selfie         a live front-camera preview (features/deskqr/camera; the camera app or a photo as the
//                  fallback), shrunk to ≤ 640 px / ≤ 550 KB like visitShrink
//   details        name · mobile (visitMobileOk) · purpose (VISIT_PURPOSES, Other = free text) · consent
//                  (the web's exact words) → a ConfirmSheet + swipe naming who gets the WhatsApp
//   waiting        polls GET base/status/:id every 5 s → approved / rejected / no answer (the web's copy)
//   code           6 digits on the kit's OtpBoxes + NumericKeypad, or "Scan my pass" (front camera reads the
//                  pass QR, features/deskqr/pass) → POST base/invite
//   invite_selfie  "Welcome, <guest>" → photo → ConfirmSheet + swipe → POST base/invite/:id/arrive
//   invite_done    "You are checked in"
// After any result the screen clears itself 15 s later ("Next visitor in 15s · Done"), so the next
// visitor never sees the last one's name. Nothing here is cached or saved: it lives in this screen only.
// A 404 "link is not valid" from any call means the check-in link was regenerated: the kiosk says so and
// asks to be started again. A 429 shows the server's own words. "Exit kiosk" opens KioskExitSheet.

import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  BellRing,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImageUp,
  Link2Off,
  type LucideIcon,
  QrCode,
  ScanLine,
  Search,
  Ticket,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';

import {
  type KioskHost,
  type KioskInvite,
  type KioskVisit,
  KioskError,
  kioskCheckIn,
  kioskFindHosts,
  kioskInviteArrive,
  kioskInviteCode,
  kioskStatus,
} from '@/api/desk';
import { takeSelfie, type Selfie } from '@/features/desk/kiosk/selfie';
import { PhotoCapture, QrScanner } from '@/features/deskqr/camera';
import { codeFromScan, notAPassMessage } from '@/features/deskqr/pass';
import { QrImage } from '@/features/deskqr/qr';
import { mobileOk, timeWindow } from '@/features/visitors/format';
import { firstName } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  ActionRow,
  Avatar,
  Banner,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  haptic,
  KeypadWash,
  ListCard,
  ListRow,
  NumericKeypad,
  OtpBoxes,
  PillField,
  PressableScale,
  Screen,
  SummaryCard,
  Text,
  useCodeKeypad,
} from '@/ui';

/** VISIT_PURPOSES (dash.html:35176). */
const PURPOSES = ['Meeting', 'Interview', 'Delivery', 'Vendor', 'Personal', 'Other'] as const;
/** The consent line, word for word from the web (dash.html:35474). */
export const CONSENT_TEXT =
  'I agree that my photo, name and mobile number are recorded for security, shared with the person I am visiting, and that the result is sent to my mobile on WhatsApp. My photo is deleted after a short retention period.';
const RESET_AFTER = 15; // seconds (dash.html:35370)
const POLL_MS = 5_000; // the waiting screen's poll (dash.html:35361)

type Step = 'start' | 'host' | 'selfie' | 'details' | 'waiting' | 'code' | 'invite_selfie' | 'invite_done';
type Form = { name: string; mobile: string; purpose: (typeof PURPOSES)[number]; other: string; consent: boolean };
const EMPTY_FORM: Form = { name: '', mobile: '', purpose: 'Meeting', other: '', consent: false };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const first = (name?: string | null) => firstName(name || '') || 'your host';

export type KioskWizardProps = {
  base: string;
  companyName: string;
  /** The reception QR poster's link (DASH_URL + path), shown for "check in on your own phone". */
  linkUrl: string;
  /** A public call said the link is no longer valid (it was regenerated). */
  onLinkDead: () => void;
  onAskExit: () => void;
};

export function KioskWizard({ base, companyName, linkUrl, onLinkDead, onAskExit }: KioskWizardProps) {
  const [step, setStep] = useState<Step>('start');
  const [q, setQ] = useState('');
  const [host, setHost] = useState<KioskHost | null>(null);
  const [photo, setPhoto] = useState<Selfie | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [visit, setVisit] = useState<KioskVisit | null>(null);
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<KioskInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; busy?: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [left, setLeft] = useState(RESET_AFTER);
  const [pollTrouble, setPollTrouble] = useState(false);
  const [live, setLive] = useState(false);
  const [scanPass, setScanPass] = useState(false);

  const reset = () => {
    setStep('start');
    setQ('');
    setHost(null);
    setPhoto(null);
    setForm(EMPTY_FORM);
    setVisit(null);
    setCode('');
    setInvite(null);
    setBusy(false);
    setMsg(null);
    setConfirm(false);
    setDoneAt(null);
    setLeft(RESET_AFTER);
    setPollTrouble(false);
    setLive(false);
    setScanPass(false);
  };
  const go = (to: Step) => {
    setMsg(null);
    setStep(to);
  };
  const finish = () => {
    setDoneAt(Date.now());
    setLeft(RESET_AFTER);
  };
  /** A public call failed: a dead link ends the kiosk; anything else is shown on the step. */
  const failed = (e: unknown) => {
    haptic.error();
    if (e instanceof KioskError && e.problem === 'link') {
      onLinkDead();
      return;
    }
    const text = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
    setMsg({ text, busy: e instanceof KioskError && e.problem === 'busy' });
  };

  // ── host search: nothing until two letters, then only the matches ──────────
  const needle = useDebounced(q.trim(), 250);
  const typed = q.trim().length >= 2;
  const hosts = useQuery({
    queryKey: ['kiosk', 'hosts', base, needle],
    enabled: step === 'host' && needle.length >= 2,
    queryFn: ({ signal }) => kioskFindHosts(base, needle, signal),
    staleTime: 60_000,
    gcTime: 60_000,
    retry: (n, e) => !(e instanceof KioskError && e.problem !== 'offline') && n < 2,
    meta: { persist: false },
  });
  const hostsDead = hosts.error instanceof KioskError && hosts.error.problem === 'link';
  useEffect(() => {
    if (hostsDead) onLinkDead();
  }, [hostsDead, onLinkDead]);

  // ── waiting: ask every 5 s until the host (or the timeout) has answered ──────
  const waitingId = step === 'waiting' && visit?.status === 'pending' ? visit.visitId : '';
  useEffect(() => {
    if (!waitingId) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const r = await kioskStatus(base, waitingId);
        if (!alive) return;
        setPollTrouble(false);
        if (r.status && r.status !== 'pending') {
          setVisit((v) => (v ? { ...v, status: r.status, hostName: v.hostName || r.hostName } : v));
          setDoneAt(Date.now());
          setLeft(RESET_AFTER);
          if (r.status === 'approved') haptic.success();
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof KioskError && e.problem === 'link') onLinkDead();
        else setPollTrouble(true);
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [base, waitingId, onLinkDead]);

  // ── after a result: back to the first screen 15 s later ──────────────────────
  useEffect(() => {
    if (doneAt == null) return;
    const t = setInterval(() => {
      const n = RESET_AFTER - Math.floor((Date.now() - doneAt) / 1000);
      if (n <= 0) reset();
      else setLeft(n);
    }, 500);
    return () => clearInterval(t);
  }, [doneAt]);

  // ── actions ──────────────────────────────────────────────────────────────────
  const shoot = async (source: 'camera' | 'library' | 'live') => {
    setMsg(null);
    if (source === 'live') {
      setLive(true);
      return;
    }
    setLive(false);
    try {
      const shot = await takeSelfie(source);
      if (shot) setPhoto(shot);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'That photo could not be read. Try again.' });
    }
  };

  const checkDetails = () => {
    const name = form.name.trim();
    const purpose = form.purpose === 'Other' ? form.other.trim() : form.purpose;
    // The web's own words (dash.html:35380-35384).
    if (!name) return setMsg({ text: 'Please enter your name.' });
    if (!mobileOk(form.mobile)) return setMsg({ text: 'Enter your 10-digit mobile number — we send the result to it.' });
    if (!purpose) return setMsg({ text: 'Tell us why you are visiting.' });
    if (!form.consent) return setMsg({ text: 'Please tick the consent box to continue.' });
    setMsg(null);
    setConfirm(true);
  };

  const submit = async () => {
    if (!host || !photo || busy) return;
    setBusy(true);
    try {
      const r = await kioskCheckIn(base, {
        hostUserId: host.id,
        visitorName: form.name.trim(),
        visitorMobile: form.mobile,
        purpose: form.purpose === 'Other' ? form.other.trim() : form.purpose,
        photo: photo.dataUrl,
      });
      haptic.success();
      setBusy(false);
      setConfirm(false);
      setVisit({ ...r, hostName: r.hostName || host.name });
      go('waiting');
    } catch (e) {
      setBusy(false);
      setConfirm(false);
      failed(e);
    }
  };

  const checkCode = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await kioskInviteCode(base, c);
      setBusy(false);
      setInvite(r);
      setPhoto(null);
      go('invite_selfie');
    } catch (e) {
      setBusy(false);
      failed(e);
    }
  };
  const keypad = useCodeKeypad(code, setCode, { onComplete: (c) => void checkCode(c) });

  const arrive = async () => {
    if (!invite || !photo || busy) return;
    setBusy(true);
    try {
      const r = await kioskInviteArrive(base, invite.inviteId, photo.dataUrl);
      haptic.success();
      setBusy(false);
      setConfirm(false);
      setVisit({ visitId: r.visitId, status: 'approved', hostName: r.hostName || invite.hostName, hostHasMobile: true });
      go('invite_done');
      finish();
    } catch (e) {
      setBusy(false);
      setConfirm(false);
      failed(e);
    }
  };

  // ── screens ──────────────────────────────────────────────────────────────────
  const header = <KioskHeader companyName={companyName} onAskExit={onAskExit} />;
  const error = msg ? <Banner tone={msg.busy ? 'warning' : 'danger'} message={msg.text} /> : null;
  const back = (to: Step) => <BackLink onPress={() => go(to)} />;

  if (step === 'start') {
    return (
      <Screen key="start" header={header}>
        <Heading title="How can we help you today?" sub="Please choose an option to continue." />
        <BigOption primary icon={Users} label="I’m here to meet someone" onPress={() => go('host')} />
        <BigOption
          icon={Ticket}
          label="I have an invite code"
          onPress={() => {
            setCode('');
            go('code');
          }}
        />
        <Card style={styles.ownPhone}>
          <View style={styles.ownHead}>
            <QrCode size={22} color={moduleTone.visitors.fg} strokeWidth={1.8} />
            <Text variant="bodyStrong" style={styles.flex}>
              Check in on your own phone
            </Text>
          </View>
          <Text variant="label" muted>
            Scan this QR code with your phone camera. No app required.
          </Text>
          {linkUrl ? (
            <>
              <QrImage value={linkUrl} size={168} label="QR code for checking in on your own phone" />
              <Text variant="caption" muted selectable align="center" style={styles.link} accessibilityLabel={`Or open ${linkUrl}`}>
                {linkUrl}
              </Text>
            </>
          ) : null}
        </Card>
      </Screen>
    );
  }

  if (step === 'host') {
    const list = typed ? (hosts.data ?? []) : [];
    const searching = typed && (needle !== q.trim() || hosts.isFetching);
    return (
      <Screen key="host" header={header}>
        {back('start')}
        <Heading title="Who are you here to meet?" sub="Type their name to find them." />
        <PillField
          icon={Search}
          placeholder="Type a name…"
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          maxLength={60}
          accessibilityLabel="Name of the person you are visiting"
        />
        {list.length ? (
          <ListCard>
            {list.map((e) => (
              <ListRow
                key={e.id}
                size="lg"
                left={<Avatar name={e.name} size={48} />}
                title={e.name}
                subtitle={e.jobTitle || e.dept || null}
                chevron
                onPress={() => {
                  setHost(e);
                  setPhoto(null);
                  go('selfie');
                }}
                accessibilityLabel={[e.name, e.jobTitle].filter(Boolean).join(', ')}
                accessibilityHint="Chooses this person"
              />
            ))}
          </ListCard>
        ) : (
          <Text variant="body" muted align="center" style={styles.hint}>
            {!typed
              ? 'Start typing the name of the person you are visiting.'
              : searching
                ? 'Searching…'
                : hosts.isError
                  ? 'Can’t reach the check-in service. Please try again, or ask the security desk.'
                  : 'Nobody matches that name. Check the spelling, or ask the security desk.'}
          </Text>
        )}
      </Screen>
    );
  }

  if (step === 'selfie' || step === 'invite_selfie') {
    const forInvite = step === 'invite_selfie';
    const title = forInvite ? `Welcome, ${invite?.guestName ?? 'guest'}` : 'Take a quick photo';
    const sub = forInvite
      ? `You are expected by ${invite?.hostName || 'your host'}. Take a quick photo to check in.`
      : `So ${first(host?.name)} knows who is at the door.`;
    return (
      <Screen
        key={step}
        header={header}
        footer={
          <ActionBar>
            {photo ? (
              <ActionRow context="bar">
                <Button variant="ghost" size="lg" title="Retake" icon={<Camera />} onPress={() => void shoot('live')} disabled={busy} />
                <Button
                  size="lg"
                  title="Use this photo"
                  icon={<Check />}
                  onPress={() => {
                    if (forInvite) {
                      setMsg(null);
                      setConfirm(true);
                    } else go('details');
                  }}
                  disabled={busy}
                />
              </ActionRow>
            ) : (
              <ActionRow context="bar">
                <Button variant="ghost" size="lg" title="Choose a photo" icon={<ImageUp />} onPress={() => void shoot('library')} />
                <Button size="lg" title="Take photo" icon={<Camera />} onPress={() => void shoot('live')} />
              </ActionRow>
            )}
          </ActionBar>
        }>
        {back(forInvite ? 'code' : 'host')}
        <Heading title={title} sub={sub} />
        <PhotoFrame photo={photo} onPress={() => void shoot('live')} />
        {error}
        <PhotoCapture
          visible={live}
          title="Look at the camera"
          facing="front"
          onClose={() => setLive(false)}
          onFallback={() => void shoot('camera')}
          onPhoto={(p) => {
            setPhoto(p);
            setLive(false);
          }}
        />
        {forInvite && invite ? (
          <ConfirmSheet
            visible={confirm}
            onClose={() => {
              if (!busy) setConfirm(false);
            }}
            title={`Check in as ${invite.guestName}?`}
            confirmLabel="Swipe to check in"
            onConfirm={() => void arrive()}
            loading={busy}
            note={`${invite.hostName || 'Your host'} gets a WhatsApp with your photo saying you have arrived.`}>
            <SummaryCard
              rows={[
                { label: 'Guest', value: invite.guestName },
                { label: 'Meeting', value: invite.hostName || '—' },
                ...(timeWindow(invite.timeFrom, invite.timeTo) ? [{ label: 'Expected', value: timeWindow(invite.timeFrom, invite.timeTo) }] : []),
              ]}
            />
          </ConfirmSheet>
        ) : null}
      </Screen>
    );
  }

  if (step === 'details') {
    const hostFirst = first(host?.name);
    const set = (patch: Partial<Form>) => {
      setForm((f) => ({ ...f, ...patch }));
      if (msg) setMsg(null);
    };
    return (
      <Screen key="details" header={header} footer={<ActionBar><Button size="lg" title={`Notify ${hostFirst}`} icon={<BellRing />} onPress={checkDetails} /></ActionBar>}>
        {back('selfie')}
        <Heading title="Your details" sub={`Meeting ${host?.name ?? ''}`} />
        <View style={styles.thumbRow}>
          {photo ? <Image source={{ uri: photo.uri || photo.dataUrl }} style={styles.thumb} contentFit="cover" accessibilityLabel="Your photo" /> : null}
          <Button variant="ghost" size="sm" title="Retake" icon={<Camera />} onPress={() => go('selfie')} />
        </View>
        <PillField label="Your name" icon={UserRound} value={form.name} maxLength={120} autoCapitalize="words" autoComplete="name" textContentType="name" onChangeText={(t) => set({ name: t })} />
        <PillField
          label="Mobile number"
          placeholder="10-digit number"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={16}
          value={form.mobile}
          onChangeText={(t) => set({ mobile: t })}
          hint="You get the answer on WhatsApp."
        />
        <View style={styles.group}>
          <Text variant="labelStrong" muted>
            Purpose of visit
          </Text>
          {/* Wrapped, not a sideways scroll: all six reasons stay in sight on a 320 dp phone. */}
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Purpose of visit">
            {PURPOSES.map((p) => (
              <Chip key={p} label={p} selected={form.purpose === p} onPress={() => set({ purpose: p })} />
            ))}
          </View>
          {form.purpose === 'Other' ? <PillField placeholder="Tell us briefly" maxLength={200} value={form.other} onChangeText={(t) => set({ other: t })} /> : null}
        </View>
        <Pressable
          onPress={() => set({ consent: !form.consent })}
          style={styles.consent}
          accessibilityRole="checkbox"
          aria-checked={form.consent}
          accessibilityLabel={CONSENT_TEXT}>
          <Switch
            value={form.consent}
            onValueChange={(v) => set({ consent: v })}
            trackColor={{ false: palette.track, true: palette.primary }}
            thumbColor={palette.surface}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text variant="label" muted style={styles.flex}>
            {CONSENT_TEXT}
          </Text>
        </Pressable>
        {error}
        <ConfirmSheet
          visible={confirm}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
          title={`Send to ${hostFirst}?`}
          detailsTitle="Your check-in"
          confirmLabel={`Swipe to notify ${hostFirst}`}
          onConfirm={() => void submit()}
          loading={busy}
          note={`${host?.name ?? 'Your host'} gets a WhatsApp with your photo. You get the answer on WhatsApp.`}>
          <SummaryCard
            rows={[
              { label: 'Name', value: form.name.trim() },
              { label: 'Mobile', value: form.mobile.trim() },
              { label: 'Meeting', value: host?.name ?? '—' },
              { label: 'Purpose', value: form.purpose === 'Other' ? form.other.trim() : form.purpose },
            ]}
          />
        </ConfirmSheet>
      </Screen>
    );
  }

  if (step === 'waiting' && visit) {
    const st = visit.status;
    const hn = visit.hostName || 'Your host';
    if (st === 'pending') {
      return (
        <Screen key="waiting" header={header} animate={false}>
          <Result
            art={<Art icon={BellRing} tone="brand" />}
            title={`Waiting for ${hn}`}
            text={`${visit.hostHasMobile ? `We have told ${first(hn)} you are here.` : `We have notified ${first(hn)}.`} This page updates by itself — please keep it open.`}>
            <ActivityIndicator size="large" color={palette.primaryText} accessibilityLabel="Waiting for an answer" />
            {pollTrouble ? (
              <View style={styles.trouble}>
                <WifiOff size={16} color={palette.textMuted} />
                <Text variant="label" muted>
                  Can’t reach the check-in service — retrying
                </Text>
              </View>
            ) : null}
          </Result>
        </Screen>
      );
    }
    const meta =
      st === 'approved'
        ? { icon: Check, tone: 'ok' as const, title: 'You are approved', text: `${hn} has approved your visit. Please proceed — security will guide you.` }
        : st === 'rejected'
          ? { icon: X, tone: 'no' as const, title: 'Sorry, not right now', text: `${hn} is unable to meet you at the moment. Please speak to the security desk for further assistance.` }
          : { icon: Clock, tone: 'wait' as const, title: 'No response yet', text: `${hn} has not responded. Please speak to the security desk and they will help.` };
    return (
      <Screen key={`result-${st}`} header={header} footer={<NextVisitor left={left} onDone={reset} />} animate={false}>
        <Result art={<Art icon={meta.icon} tone={meta.tone} />} title={meta.title} text={meta.text} />
      </Screen>
    );
  }

  if (step === 'code') {
    return (
      <Screen
        key="code"
        header={header}
        footer={
          <KeypadWash>
            <NumericKeypad onKey={keypad.onKey} disabled={busy} />
          </KeypadWash>
        }>
        {back('start')}
        <Heading title="Enter your invite code" sub="It is the 6-digit number in the message your host sent you." />
        <OtpBoxes value={code} onChange={setCode} onComplete={(c) => void checkCode(c)} withKeypad error={!!msg && !msg.busy} disabled={busy} accessibilityLabel="Invite code" />
        {error}
        <Button size="lg" title={busy ? 'Checking…' : 'Continue'} loading={busy} disabled={code.length !== 6} onPress={() => void checkCode()} />
        <Button
          variant="ghost"
          size="lg"
          title="Scan my pass instead"
          icon={<ScanLine />}
          disabled={busy}
          onPress={() => {
            setMsg(null);
            setScanPass(true);
          }}
        />
        <QrScanner
          visible={scanPass}
          facing="front"
          title="Scan your visitor pass"
          hint="Hold the QR on your pass up to this screen."
          onClose={() => setScanPass(false)}
          onScanned={(data) => {
            const c = codeFromScan(data);
            if (!c) return notAPassMessage(data);
            setScanPass(false);
            setCode(c);
            void checkCode(c);
          }}
        />
      </Screen>
    );
  }

  if (step === 'invite_done' && visit) {
    return (
      <Screen key="invite_done" header={header} footer={<NextVisitor left={left} onDone={reset} />} animate={false}>
        <Result
          art={<Art icon={Check} tone="ok" />}
          title="You are checked in"
          text={`${visit.hostName || 'Your host'} has been told you have arrived. Please take a seat — they will be with you shortly.`}
        />
      </Screen>
    );
  }

  // A state that can't be drawn (e.g. waiting without a visit): start over.
  return (
    <Screen key="lost" header={header}>
      <Result art={<Art icon={Users} tone="brand" />} title="Let’s start again" text="Something went wrong with this check-in.">
        <Button size="lg" title="Start again" onPress={reset} />
      </Result>
    </Screen>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

/** The kiosk's top bar: "Visitor check-in", the company, and a quiet "Exit kiosk". */
export function KioskHeader({ companyName, onAskExit }: { companyName: string; onAskExit?: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Text variant="micro" color={palette.primaryText} style={styles.eyebrow}>
          VISITOR CHECK-IN
        </Text>
        <Text variant="heading" numberOfLines={1}>
          {companyName || 'Welcome'}
        </Text>
      </View>
      {onAskExit ? (
        <Pressable onPress={onAskExit} hitSlop={12} style={styles.exit} accessibilityRole="button" accessibilityLabel="Exit kiosk" accessibilityHint="Asks for your fingerprint, PIN or password">
          <Text variant="caption" muted>
            Exit kiosk
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={styles.heading}>
      <Text variant="hero" align="center" accessibilityRole="header">
        {title}
      </Text>
      {sub ? (
        <Text variant="body" muted align="center">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
      <ChevronLeft size={18} color={palette.textMuted} />
      <Text variant="label" muted>
        Back
      </Text>
    </Pressable>
  );
}

/** One of the two big choices on the first screen (≥ 72 dp tall). The primary one is the brand fill. */
function BigOption({ icon: Icon, label, onPress, primary }: { icon: LucideIcon; label: string; onPress: () => void; primary?: boolean }) {
  const fg = primary ? palette.onPrimary : palette.ink;
  return (
    <PressableScale onPress={onPress} style={[styles.option, primary ? styles.optionPrimary : styles.optionPlain]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.optionIcon, primary ? styles.optionIconPrimary : styles.optionIconPlain]}>
        <Icon size={28} color={primary ? palette.onPrimary : moduleTone.visitors.fg} strokeWidth={1.8} />
      </View>
      <Text variant="heading" color={fg} style={styles.flex} numberOfLines={2}>
        {label}
      </Text>
      <ChevronRight size={24} color={fg} />
    </PressableScale>
  );
}

function PhotoFrame({ photo, onPress }: { photo: Selfie | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.frame} accessibilityRole="button" accessibilityLabel={photo ? 'Your photo. Tap to take it again' : 'Take photo'}>
      {photo ? (
        <Image source={{ uri: photo.uri || photo.dataUrl }} style={styles.frameImg} contentFit="cover" />
      ) : (
        <View style={styles.framePlaceholder}>
          <Camera size={44} color={palette.textFaint} strokeWidth={1.5} />
          <Text variant="label" muted align="center">
            Look at the screen and smile
          </Text>
        </View>
      )}
    </Pressable>
  );
}

type ArtTone = 'brand' | 'ok' | 'no' | 'wait' | 'muted';

/** The result picture: a big soft disc with one mark (the web's VkPhone / VkPerson, in the app's tones). */
export function Art({ icon: Icon, tone }: { icon: LucideIcon; tone: ArtTone }) {
  const t =
    tone === 'ok'
      ? { bg: palette.successSoft, fill: palette.success }
      : tone === 'no'
        ? { bg: palette.dangerSoft, fill: palette.danger }
        : tone === 'wait'
          ? { bg: palette.warningSoft, fill: palette.warning }
          : tone === 'muted'
            ? { bg: palette.surfaceSunken, fill: palette.textMuted }
            : { bg: moduleTone.visitors.bg, fill: moduleTone.visitors.fg };
  return (
    <View style={[styles.artOuter, { backgroundColor: t.bg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.artInner, { backgroundColor: t.fill }]}>
        <Icon size={52} color={palette.onPrimary} strokeWidth={2.2} />
      </View>
    </View>
  );
}

export function Result({ art, title, text, children }: { art: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <View style={styles.result}>
      {art}
      <Text variant="hero" align="center" accessibilityRole="header" accessibilityLiveRegion="polite">
        {title}
      </Text>
      <Text variant="body" muted align="center">
        {text}
      </Text>
      {children}
    </View>
  );
}

/** "Next visitor in 15s · Done" (dash.html:35505). */
function NextVisitor({ left, onDone }: { left: number; onDone: () => void }) {
  return (
    <ActionBar>
      <View style={styles.next}>
        <Clock size={22} color={palette.textMuted} />
        <Text variant="body" style={styles.flex} accessibilityLiveRegion="polite">
          Next visitor in{' '}
          <Text variant="bodyStrong" color={palette.primaryText} tabular>
            {left}s
          </Text>
        </Text>
        <Button variant="accent" title="Done" onPress={onDone} />
      </View>
    </ActionBar>
  );
}

/** The kiosk's "this link no longer works" screen (any public 404 after Make a new link). */
export function KioskLinkDead({ companyName, onAskExit }: { companyName: string; onAskExit: () => void }) {
  return (
    <Screen header={<KioskHeader companyName={companyName} onAskExit={onAskExit} />} footer={<ActionBar><Button size="lg" title="Exit kiosk" onPress={onAskExit} /></ActionBar>}>
      <Result
        art={<Art icon={Link2Off} tone="muted" />}
        title="This kiosk’s check-in link was changed"
        text="Someone made a new check-in link, so this kiosk stopped working. Exit kiosk mode and start it again."
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.sm },
  eyebrow: { letterSpacing: 1.6 },
  exit: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: palette.track },
  heading: { gap: space.xs, paddingTop: space.sm, paddingBottom: space.xs },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 32 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 80, paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.xl },
  optionPrimary: { backgroundColor: palette.primary },
  optionPlain: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline },
  optionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  optionIconPrimary: { backgroundColor: palette.frostOnDark },
  optionIconPlain: { backgroundColor: moduleTone.visitors.bg },
  ownPhone: { gap: space.xs },
  ownHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { backgroundColor: palette.surfaceSunken, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs },
  hint: { paddingVertical: space.xl },
  frame: { width: '100%', maxWidth: 420, aspectRatio: 3 / 4, alignSelf: 'center', borderRadius: radius.xl, overflow: 'hidden', backgroundColor: palette.surfaceSunken },
  frameImg: { width: '100%', height: '100%' },
  framePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg },
  thumbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  group: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.xs },
  result: { alignItems: 'center', gap: space.md, paddingTop: space.xl },
  artOuter: { width: 200, height: 200, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  artInner: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  trouble: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  next: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
}));
