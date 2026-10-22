// Scan a pass — reception checks in an invited guest (no web screen of its own: on the website the guest
// types the code at the kiosk; here the desk does the same thing for them, with the same server calls).
//   1. Scan the guest's pass QR (back camera; features/deskqr/pass.ts) or type the 6-digit code.
//   2. POST /public/visit/<company>/<token>/invite {code} with the desk's check-in link (GET /visitors/qr):
//      the server's own words for a wrong (404) or used (409) code.
//   3. A photo of the guest (live camera, or the camera app / a photo) — the arrival needs one.
//   4. ConfirmSheet + swipe: POST …/invite/<id>/arrive {photo} → an approved visit, the code is used up, and
//      the host gets a WhatsApp with the photo. Then "Scan the next pass".
// Desk roles with Kiosk Mode only (features/deskqr/access.ts); anyone else is sent home. Nothing is cached:
// the guest's name and photo live in this screen only. Limits are per network address (12 per 10 min).

import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { Camera, Check, ImageUp, Keyboard, RotateCcw, ScanLine, Ticket, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { deskKeys, type KioskInvite, KioskError, kioskBase, kioskInviteArrive, kioskInviteCode, useDeskQr } from '@/api/desk';
import { visitorKeys } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { takeSelfie, type Selfie } from '@/features/desk/kiosk/selfie';
import { canScanPass } from '@/features/deskqr/access';
import { PhotoCapture, QrScanner } from '@/features/deskqr/camera';
import { codeFromScan, notAPassMessage } from '@/features/deskqr/pass';
import { timeWindow } from '@/features/visitors/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
  ActionBar,
  ActionRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  haptic,
  NavHeader,
  OtpBoxes,
  Screen,
  SummaryCard,
  SummaryHero,
  Text,
} from '@/ui';

type Step = 'find' | 'photo' | 'done';

export default function ScanPassScreen() {
  const access = useAccess();
  const allowed = canScanPass(access);
  const qr = useDeskQr(allowed);
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);

  const [step, setStep] = useState<Step>('find');
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'danger' | 'warning' } | null>(null);
  const [invite, setInvite] = useState<KioskInvite | null>(null);
  const [photo, setPhoto] = useState<Selfie | null>(null);
  const [live, setLive] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [doneHost, setDoneHost] = useState('');

  if (!allowed) return <Redirect href="/" />;

  const base = qr.data ? kioskBase(qr.data) : '';

  const problemText = (e: unknown) => {
    if (e instanceof KioskError) {
      if (e.problem === 'link') return { text: 'The check-in link was just changed. Pull down to refresh, then scan again.', tone: 'danger' as const };
      if (e.problem === 'offline') return { text: 'Can’t reach DASH. Check the Wi-Fi or mobile data and try again.', tone: 'warning' as const };
      if (e.problem === 'busy') return { text: e.message, tone: 'warning' as const };
      return { text: e.message, tone: 'danger' as const };
    }
    return { text: e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.', tone: 'danger' as const };
  };

  const lookUp = async (c: string): Promise<string | void> => {
    if (!base) return qr.isError ? 'Can’t load the desk’s check-in link. Close the camera and pull down to refresh.' : 'Getting the desk ready. Try again in a moment.';
    if (busy || c.length !== 6) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await kioskInviteCode(base, c);
      haptic.success();
      setInvite(r);
      setCode(c);
      setPhoto(null);
      setScanning(false);
      setStep('photo');
    } catch (e) {
      haptic.error();
      const p = problemText(e);
      if (e instanceof KioskError && e.problem === 'link') void qr.refetch();
      setMsg(p);
      setCode(c);
      return p.text;
    } finally {
      setBusy(false);
    }
  };

  const onScanned = async (data: string) => {
    const c = codeFromScan(data);
    if (!c) return notAPassMessage(data);
    if (!base) return lookUp(c); // not ready yet: say so and keep the scanner open
    const err = await lookUp(c);
    if (err) setScanning(false);
    return undefined;
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    setLive(false);
    try {
      const p = await takeSelfie(source);
      if (p) setPhoto(p);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'That photo could not be read. Try again.', tone: 'danger' });
    }
  };

  const arrive = async () => {
    if (!invite || !photo || busy) return;
    setBusy(true);
    try {
      const r = await kioskInviteArrive(base, invite.inviteId, photo.dataUrl);
      haptic.success();
      setConfirm(false);
      setDoneHost(r.hostName || invite.hostName);
      setStep('done');
      void qc.invalidateQueries({ queryKey: deskKeys.today(userId) });
      void qc.invalidateQueries({ queryKey: deskKeys.logAll(userId) });
      // The code is used up: Invites (and the host's own Visitors, when the desk user invited them) change too.
      void qc.invalidateQueries({ queryKey: visitorKeys.invites(userId) });
      void qc.invalidateQueries({ queryKey: visitorKeys.mine(userId) });
    } catch (e) {
      haptic.error();
      setConfirm(false);
      setMsg(problemText(e));
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setStep('find');
    setCode('');
    setInvite(null);
    setPhoto(null);
    setMsg(null);
    setDoneHost('');
  };

  const banner = msg ? <Banner tone={msg.tone} message={msg.text} /> : null;
  const when = invite ? timeWindow(invite.timeFrom, invite.timeTo) : '';

  if (step === 'done' && invite) {
    return (
      <Screen
        header={<NavHeader title="Scan a pass" />}
        footer={
          <ActionBar>
            <Button size="lg" title="Scan the next pass" icon={<ScanLine />} onPress={restart} />
          </ActionBar>
        }>
        <SummaryHero icon={Check} module="visitors" label="Checked in" figure={<Text variant="title" numberOfLines={2}>{invite.guestName}</Text>} sub={`${doneHost || 'The host'} has been told on WhatsApp. The visit is on today’s board.`} />
        {photo ? <Image source={{ uri: photo.dataUrl }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo of ${invite.guestName}`} /> : null}
      </Screen>
    );
  }

  if (step === 'photo' && invite) {
    return (
      <Screen
        header={<NavHeader title="Scan a pass" onBack={restart} />}
        footer={
          <ActionBar>
            {photo ? (
              <ActionRow context="bar">
                <Button variant="ghost" title="Retake" icon={<RotateCcw />} onPress={() => setLive(true)} disabled={busy} />
                <Button title="Check in" icon={<Check />} onPress={() => setConfirm(true)} disabled={busy} />
              </ActionRow>
            ) : (
              <ActionRow context="bar">
                <Button variant="ghost" title="Choose a photo" icon={<ImageUp />} onPress={() => void pickPhoto('library')} />
                <Button title="Take photo" icon={<Camera />} onPress={() => setLive(true)} />
              </ActionRow>
            )}
          </ActionBar>
        }>
        <SummaryHero icon={Ticket} module="visitors" label="Pass found" figure={<Text variant="title" numberOfLines={2}>{invite.guestName}</Text>} sub={`Expected by ${invite.hostName || 'their host'}${when ? ` · ${when}` : ''}`} />
        {photo ? (
          <Image source={{ uri: photo.dataUrl }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo of ${invite.guestName}`} />
        ) : (
          <Card style={styles.noPhoto}>
            <UserRound size={40} color={palette.textFaint} strokeWidth={1.5} />
            <Text variant="label" muted align="center">
              A photo is needed to check them in. Their host sees it with the arrival message.
            </Text>
          </Card>
        )}
        {banner}
        <PhotoCapture visible={live} title={`Photo of ${invite.guestName}`} facing="back" onClose={() => setLive(false)} onFallback={() => void pickPhoto('camera')} onPhoto={(p) => { setPhoto(p); setLive(false); }} />
        <ConfirmSheet
          visible={confirm}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
          title={`Check in ${invite.guestName}?`}
          from={{ title: invite.guestName, subtitle: 'Invited guest', avatar: { name: invite.guestName, uri: photo?.dataUrl } }}
          to={{ title: invite.hostName || 'Their host', subtitle: 'Gets a WhatsApp', icon: UserRound, module: 'visitors' }}
          confirmLabel="Swipe to check in"
          onConfirm={() => void arrive()}
          loading={busy}
          note={`${invite.hostName || 'The host'} gets a WhatsApp with this photo saying their guest has arrived.`}>
          <SummaryCard
            rows={[
              { label: 'Guest', value: invite.guestName },
              { label: 'Meeting', value: invite.hostName || '—' },
              ...(when ? [{ label: 'Expected', value: when }] : []),
              { label: 'Code', value: code },
            ]}
          />
          <Banner tone="info" message="The code is used up once they are in, so it can’t be used again." />
        </ConfirmSheet>
      </Screen>
    );
  }

  return (
    <Screen header={<NavHeader title="Scan a pass" />} onRefresh={() => qr.refetch()}>
      <SummaryHero
        icon={ScanLine}
        module="visitors"
        label="Invited guests"
        figure={<Text variant="title">Scan their pass</Text>}
        sub="Point the camera at the QR on their visitor pass. Invited guests go straight in."
        action={{ title: 'Open the scanner', icon: <ScanLine />, onPress: () => { setMsg(null); setScanning(true); } }}
      />
      {qr.isError && !qr.data ? <ErrorState message={qr.error?.message ?? ''} onRetry={() => void qr.refetch()} /> : null}
      <Card style={styles.typeCard}>
        <View style={styles.typeHead}>
          <Keyboard size={18} color={palette.textMuted} strokeWidth={1.8} />
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Or type the 6-digit code
          </Text>
        </View>
        <OtpBoxes value={code} onChange={(v) => { setCode(v); setMsg(null); }} onComplete={(c) => void lookUp(c)} error={msg?.tone === 'danger'} disabled={busy || !base} accessibilityLabel="Invite code" />
        {/* The boxes look the code up by themselves when full; this is the fallback, so it stays secondary to the scanner. */}
        <Button variant="ghost" title={busy ? 'Checking…' : 'Find the invite'} loading={busy} disabled={code.length !== 6 || !base} onPress={() => void lookUp(code)} />
      </Card>
      {banner}
      <Text variant="caption" muted>
        Only today’s invites work, and each code works once. The guest’s host is told when you check them in.
      </Text>
      <QrScanner
        visible={scanning}
        title="Scan a visitor pass"
        hint="Hold the pass QR inside the square."
        onScanned={onScanned}
        onClose={() => setScanning(false)}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  photo: { width: '100%', maxWidth: 320, aspectRatio: 3 / 4, alignSelf: 'center', borderRadius: radius.xl, backgroundColor: palette.surfaceSunken },
  noPhoto: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  typeCard: { gap: space.md },
  typeHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
}));
