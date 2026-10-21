// A vertical status timeline (bill detail). Each step is done, current, failed or still to come.
// The bill's steps follow vendor_bills.js's pipeline: submitted → project owner approval ("Keka Code"
// owner on the server, "project approval" to the vendor) → Accounts approval → payment → paid
// (confirmed by the submitter). Dates come from the latest version's own stamps; vendors never see
// who acted (the server strips that).
//
// Visual: a 20 dp rail disc per step (done = green with a check, current = amber ring, failed = red
// with a cross, upcoming = hollow) joined by a 2 dp connector; the label always carries the word, so
// colour is never the only cue. Colours are read at render time (light / dark): the filled discs carry
// a white glyph, so dark mode fills them with the bright status colour, not the light text inks.

import { Check, X } from 'lucide-react-native';
import { View } from 'react-native';

import type { VendorBill } from '@/api/vendor';
import { dateIN } from '@/features/vendor/format';
import { palette, space } from '@/theme/tokens';
import { isDarkScheme, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
export type StepState = 'done' | 'current' | 'failed' | 'upcoming';
export type TimelineStep = { label: string; state: StepState; note?: string; at?: string | null };

export function billTimeline(b: VendorBill): TimelineStep[] {
  const s = b?.status ?? '';
  const v = b?.version;
  const kekaPending = s === 'pending_keka_approval' || s === 'pending_keka_reapproval';
  const authorised = ['accepted', 'payment_processing', 'received', 'not_received'].includes(s);

  const submitted: TimelineStep = {
    label: 'Submitted',
    state: 'done',
    at: b?.created_at,
    note: (b?.current_version ?? 1) > 1 ? `Corrected copy (version ${b.current_version})` : undefined,
  };

  const keka: TimelineStep = kekaPending
    ? { label: 'Project approval', state: 'current', note: 'Waiting' }
    : s === 'rejected_keka'
      ? { label: 'Project approval', state: 'failed', note: 'Rejected', at: v?.keka_rejected_at }
      : { label: 'Project approval', state: 'done', note: v?.keka_approval_required === false ? 'Not needed' : 'Approved', at: v?.keka_approved_at };

  const accounts: TimelineStep =
    s === 'pending_accounts_approval'
      ? { label: 'Accounts approval', state: 'current', note: 'Waiting' }
      : s === 'rejected_accounts'
        ? { label: 'Accounts approval', state: 'failed', note: 'Rejected', at: v?.accounts_rejected_at }
        : authorised
          ? { label: 'Accounts approval', state: 'done', note: 'Approved for payment', at: v?.accounts_accepted_at }
          : { label: 'Accounts approval', state: 'upcoming' };

  const payment: TimelineStep =
    s === 'accepted'
      ? { label: 'Payment', state: 'current', note: 'Starting soon' }
      : s === 'payment_processing'
        ? { label: 'Payment', state: 'current', note: 'In progress' }
        : s === 'received' || s === 'not_received'
          ? { label: 'Payment', state: 'done', note: 'Sent' }
          : { label: 'Payment', state: 'upcoming' };

  const received: TimelineStep =
    s === 'received'
      ? { label: 'Paid', state: 'done', note: 'Payment received', at: b?.updated_at }
      : s === 'not_received'
        ? { label: 'Paid', state: 'failed', note: 'Not received. Accounts is checking.', at: b?.updated_at }
        : { label: 'Paid', state: 'upcoming' };

  return [submitted, keka, accounts, payment, received];
}

/** The note's colour for a step state (read at render time so it follows light / dark). */
function noteColor(state: StepState) {
  return state === 'current' ? palette.warningInk : state === 'failed' ? palette.dangerInk : palette.textMuted;
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  const list = (Array.isArray(steps) ? steps : []).filter(Boolean);
  return (
    <View>
      {list.map((st, i) => {
        const last = i === list.length - 1;
        const stateWord = st.state === 'done' ? 'done' : st.state === 'current' ? 'in progress' : st.state === 'failed' ? 'failed' : 'not started';
        return (
          <View
            key={`${st.label}-${i}`}
            style={styles.item}
            accessible
            accessibilityLabel={[`${st.label}, ${stateWord}`, st.note, st.at ? dateIN(st.at) : null].filter(Boolean).join(', ')}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  st.state === 'done' && styles.dotDone,
                  st.state === 'failed' && styles.dotFailed,
                  st.state === 'current' && styles.dotCurrent,
                  st.state === 'upcoming' && styles.dotUpcoming,
                ]}>
                {st.state === 'done' ? <Check size={12} color={palette.onPrimary} strokeWidth={3} /> : null}
                {st.state === 'failed' ? <X size={12} color={palette.onPrimary} strokeWidth={3} /> : null}
                {st.state === 'current' ? <View style={styles.dotCore} /> : null}
              </View>
              {!last ? <View style={[styles.line, st.state === 'done' && { backgroundColor: palette.success }]} /> : null}
            </View>
            <View style={[styles.body, !last && { paddingBottom: space.md }]}>
              <Text variant="bodyStrong" color={st.state === 'upcoming' ? palette.textMuted : palette.text}>
                {st.label}
              </Text>
              {st.note ? (
                <Text variant="label" color={noteColor(st.state)}>
                  {st.note}
                </Text>
              ) : null}
              {st.at ? (
                <Text variant="caption" muted tabular>
                  {dateIN(st.at)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  item: { flexDirection: 'row', gap: space.sm },
  rail: { width: 20, alignItems: 'center' },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  dotDone: { backgroundColor: isDarkScheme() ? palette.success : palette.successInk },
  dotFailed: { backgroundColor: isDarkScheme() ? palette.danger : palette.dangerInk },
  dotCurrent: { backgroundColor: palette.warningSoft, borderWidth: 2, borderColor: palette.warning },
  dotCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.warning },
  dotUpcoming: { backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.hairline },
  line: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1, backgroundColor: palette.separator },
  body: { flex: 1, minWidth: 0, gap: 2 },
}));
