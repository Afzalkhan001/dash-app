// Start / End codes I have to read out (web: PendingOtpBanner on the home dashboard).
// When someone taps Start or End on work I raised, requested or created, the server puts a 6-digit
// code on it; it shows here, I read it out, they type it in. Polls every 20 s while the screen is in
// front, a code lives 10 minutes, and a card disappears on its own once used or expired.
// Shown at the top of My tasks (only while a code is live); Home shows the same codes as rows in its
// "Needs you" card (features/home/needs-you.tsx) with the same words ("Start code" / "End code").
//
//   const codes = useLiveCodes();
//   {codes.list.length ? <PendingOtpsCard codes={codes} /> : null}   // no empty Screen slot
//
// A frosted card per code: who is waiting, the code in the kit's OtpBoxes (read-only, Payno's code
// boxes) and how long it stays valid.

import { useIsFocused } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { View } from 'react-native';

import { type PendingOtp, usePendingOtps } from '@/api/tasks';
import { useNow } from '@/features/tasks/live-timer';
import { CodeBoxes } from '@/features/visitors/invites';
import { space } from '@/theme/tokens';
import { Card, ModuleBadge, StatusPill, Text, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';

/** The codes still valid right now, soonest to expire first, and the clock they were judged by. */
export function useLiveCodes() {
  const focused = useIsFocused();
  const otps = usePendingOtps({ poll: focused });
  const now = useNow(focused, 15_000); // keeps "8m left" honest between polls
  const list = (Array.isArray(otps.data) ? otps.data : [])
    .filter((p) => !!p?.otp && Number(p.otp.expiresAt) > now)
    .sort((a, b) => Number(a.otp.expiresAt) - Number(b.otp.expiresAt));
  return { list, now };
}

function OtpCard({ p, now }: { p: PendingOtp; now: number }) {
  const minsLeft = Math.max(1, Math.round((Number(p.otp.expiresAt) - now) / 60000));
  const code = String(p.otp.code ?? '');
  const who = p.assignee || 'them';
  const what = p.otp.type === 'start' ? 'Start code' : 'End code';
  return (
    <Card tone="frostStrong" style={styles.card}>
      <View style={styles.head}>
        <ModuleBadge module="tasks" icon={KeyRound} />
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={2} style={styles.shrink}>
            {what} for {who}
          </Text>
          {p.title ? (
            <Text variant="label" muted numberOfLines={2} style={styles.shrink}>
              {p.title}
            </Text>
          ) : null}
        </View>
      </View>
      <CodeBoxes code={code} label={`Read it out to ${who}`} a11yLabel={`${what} for ${who}: ${code.split('').join(' ')}`} />
      <View style={styles.foot}>
        <StatusPill label={`${minsLeft}m left`} tone="pending" />
        <Text variant="caption" muted numberOfLines={2} style={styles.shrink}>
          They type it in to {p.otp.type === 'start' ? 'start' : 'end'} the work.
        </Text>
      </View>
    </Card>
  );
}

export function PendingOtpsCard({ codes }: { codes: ReturnType<typeof useLiveCodes> }) {
  const { gap } = useLayout();
  const list = Array.isArray(codes?.list) ? codes.list : [];
  if (!list.length) return null;
  return (
    <View style={{ gap }}>
      {list.map((p, i) => (
        <OtpCard key={p.key ?? i} p={p} now={codes.now} />
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  text: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1 },
  // The time-left pill sits with the instruction, not beside the title, so the name keeps its room.
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, rowGap: space.xs },
}));
