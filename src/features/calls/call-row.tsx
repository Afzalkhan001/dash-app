// A call in a chat thread, between the messages (from the phone's call log, call-log.ts — the server
// writes no message for a call). On the caller's side, like a bubble: mine on the right, theirs on the
// left. An icon (incoming, outgoing, video, missed in red), what happened ("Voice call", "Missed voice
// call", "No answer"), who called in a group, how long, and the time. While the call is still going:
// "Call in progress" with a Join pill. Tapping a finished call calls back (StartCallSheet, which asks
// first).

import { Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Video } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { JoinPill } from '@/features/calls/call-bar';
import { type CallLogEntry, callHeadline, callLength, callerLine } from '@/features/calls/call-log';
import { timeOf } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Text } from '@/ui';

export const CallRow = memo(function CallRow({
  e,
  group,
  onJoin,
  onCallBack,
}: {
  e: CallLogEntry;
  group: boolean;
  onJoin: (e: CallLogEntry) => void;
  /** Absent when I can't call from this chat (I left it). */
  onCallBack?: () => void;
}) {
  const live = e.outcome === 'ringing';
  const bad = e.outcome === 'missed' || e.outcome === 'declined';
  const mine = e.direction === 'out';
  const Icon = live ? Phone : e.outcome === 'missed' ? PhoneMissed : e.outcome === 'declined' ? PhoneOff : e.video ? Video : mine ? PhoneOutgoing : PhoneIncoming;
  const tint = live ? palette.successInk : bad ? palette.dangerInk : palette.primaryText;
  const parts = [
    group || e.outcome !== 'answered' ? callerLine(e) : null,
    e.outcome === 'answered' && e.seconds ? callLength(e.seconds) : null,
    timeOf(e.at),
  ].filter(Boolean);
  const sub = parts.join(' · ');
  const headline = callHeadline(e);
  const press = live ? () => onJoin(e) : onCallBack;

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
      <Pressable
        onPress={press}
        disabled={!press}
        accessibilityRole={press ? 'button' : undefined}
        accessibilityLabel={`${headline}, ${sub}`}
        accessibilityHint={live ? 'Joins the call' : press ? 'Calls back. Asks first.' : undefined}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={[styles.icon, live ? styles.iconLive : bad ? styles.iconBad : styles.iconCalm]}>
          <Icon size={18} color={tint} strokeWidth={1.9} />
        </View>
        <View style={styles.text}>
          <Text variant="labelStrong" color={bad ? palette.dangerInk : palette.text} numberOfLines={1}>
            {headline}
          </Text>
          <Text variant="caption" muted numberOfLines={2}>
            {sub}
          </Text>
        </View>
        {/* The whole card is the button (the pill is only its look). */}
        {live ? <JoinPill /> : null}
      </Pressable>
    </View>
  );
});

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', paddingVertical: space.xxs },
  rowMine: { justifyContent: 'flex-end', paddingLeft: 48 },
  rowOther: { justifyContent: 'flex-start', paddingRight: 48 },
  card: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minWidth: 200,
    paddingVertical: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
  },
  pressed: { opacity: 0.85 },
  icon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconLive: { backgroundColor: palette.successSoft },
  iconBad: { backgroundColor: palette.dangerSoft },
  iconCalm: { backgroundColor: palette.primarySoft },
  text: { flexShrink: 1, gap: 2 },
}));
