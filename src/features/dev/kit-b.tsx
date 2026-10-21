// Kit gallery section B (dev only): inputs & flows — docs/REFERENCE-COMPONENTS.md #24–30.
// PillField, OtpBoxes, NumericKeypad on a KeypadWash, AmountEntry, FromToCards, SwipeToConfirm,
// ConfirmSheet and SuccessSheet, each under a caption with its name so it can be compared with Payno.

import { Lock, Mail, PenLine, Phone, Plane, ShieldCheck } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Platform, View } from 'react-native';

import { palette, radius, shadow, space } from '@/theme/tokens';
import {
  AmountEntry,
  Button,
  ConfirmSheet,
  FromToCards,
  KeypadWash,
  KeyValueList,
  type KeyValueItem,
  NumericKeypad,
  OtpBoxes,
  PillButton,
  PillField,
  SuccessSheet,
  SwipeToConfirm,
  Text,
  toast,
  useAmountKeypad,
  useCodeKeypad,
  useSurface,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
/** Small caption above each gallery item: the component name and what to look for. */
function Item({ name, note, children }: { name: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.item}>
      <View style={styles.caption}>
        <Text variant="labelStrong" color={palette.primaryText}>
          {name}
        </Text>
        {note ? (
          <Text variant="caption" muted>
            {note}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Stand-in for the SummaryCard (another lane): key → value rows in one frosted card. */
function DemoDetails({ rows }: { rows: KeyValueItem[] }) {
  const sheet = useSurface() === 'sheet';
  return <KeyValueList rows={rows} style={[styles.details, sheet ? styles.detailsSheet : styles.detailsFrost]} />;
}

const LEAVE_ROWS: KeyValueItem[] = [
  { label: 'Type', value: 'Casual leave' },
  { label: 'Dates', value: 'Mon 26 – Tue 27 Oct' },
  { label: 'Days', value: '2', tabular: true },
  { label: 'Balance after', value: '4 days', tone: 'muted' },
];

const DONE_ROWS: KeyValueItem[] = [
  { label: 'Request ID', value: 'LV-2026-0418', tabular: true },
  { label: 'Type', value: 'Casual leave' },
  { label: 'Dates', value: '26 – 27 Oct 2026' },
  { label: 'Status', value: '• Pending approval', tone: 'warning' },
];

export function KitSectionB() {
  // PillField
  const [phone, setPhone] = useState('83286 17610');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('ananya.reddy@tamada');
  const [reason, setReason] = useState('');

  // OTP on the system keyboard / on the keypad
  const [otpPlain, setOtpPlain] = useState('2718');
  const [otp, setOtp] = useState('271');
  const [otpBusy, setOtpBusy] = useState(false);
  const verify = (code: string) => {
    setOtpBusy(true);
    setTimeout(() => {
      setOtpBusy(false);
      toast.show(code === '123456' ? 'Code verified' : `Checked ${code} (demo)`);
    }, 900);
  };
  const codePad = useCodeKeypad(otp, setOtp, { onComplete: verify });

  // AmountEntry + keypad
  const [advance, setAdvance] = useState('12500');
  const amountPad = useAmountKeypad(advance, setAdvance, { max: 50000 });

  // Swipe + sheets
  const [clockingOut, setClockingOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const clockOut = () => {
    setClockingOut(true);
    setTimeout(() => {
      setClockingOut(false);
      toast.show('Clocked out at 6:42 pm (demo)');
    }, 1200);
  };

  const applyLeave = () => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setConfirmOpen(false);
      setTimeout(() => setSuccessOpen(true), 380);
    }, 1200);
  };

  return (
    <View style={styles.section}>
      <View style={{ gap: 2 }}>
        <Text variant="title" accessibilityRole="header">
          B · Inputs & flows
        </Text>
        <Text variant="label" muted>
          Payno sign-in, verify OTP, send money, confirm sheet and bill paid — in Ember colours.
        </Text>
      </View>

      <Item name="PillField" note="Frosted 54 dp pill · leading thin icon · eye toggle · error · helper">
        <View style={styles.stack}>
          <PillField icon={Phone} placeholder="Mobile number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <PillField icon={Lock} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} autoCapitalize="none" />
          <PillField
            icon={Mail}
            placeholder="Work email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            error={email.includes('.com') ? null : 'Enter a full email, like name@tamadamedia.com'}
          />
          <PillField
            icon={PenLine}
            label="Reason (optional)"
            placeholder="Family function in Vijayawada"
            value={reason}
            onChangeText={setReason}
            maxLength={120}
            hint="Shown to your approver, Meera Iyer"
            trailing={
              <Text variant="caption" muted tabular>
                {reason.length}/120
              </Text>
            }
          />
        </View>
      </Item>

      <Item name="OtpBoxes" note="System keyboard + paste / SMS autofill (tap the boxes) · error state below">
        <View style={styles.stack}>
          <OtpBoxes value={otpPlain} onChange={setOtpPlain} autoFocus={false} onComplete={(c) => toast.show(`Code ${c} entered (demo)`)} />
          <OtpBoxes value="481920" onChange={() => {}} autoFocus={false} error />
        </View>
      </Item>

      <Item name="OtpBoxes + NumericKeypad on KeypadWash" note="Payno Verify OTP: the active box has a brand rim and caret; ⌫ long-press clears">
        <View style={styles.phone}>
          <View style={styles.phoneTop}>
            <View style={styles.verifyIcon}>
              <ShieldCheck size={24} color={palette.primaryText} strokeWidth={1.6} />
            </View>
            <Text variant="title" align="center">
              Verify it’s you
            </Text>
            <Text variant="label" muted align="center">
              We sent a 6-digit code to +91 ••••• 17610 on WhatsApp.
            </Text>
            <OtpBoxes value={otp} onChange={setOtp} onComplete={verify} withKeypad />
            <Button title="Verify code" onPress={() => verify(otp)} loading={otpBusy} disabled={!codePad.complete} />
          </View>
          <KeypadWash safeArea={false}>
            <NumericKeypad onKey={codePad.onKey} disabled={otpBusy} />
          </KeypadWash>
        </View>
      </Item>

      <Item name="AmountEntry + useAmountKeypad" note="Superscript ₹, greyed paise, blinking caret, helper chip + meta · max ₹50,000">
        <View style={styles.phone}>
          <View style={styles.phoneTop}>
            <AmountEntry
              label="Salary advance"
              value={advance}
              right={<PillButton label="INR" onPress={() => toast.show('Only rupees for now', 'info')} />}
              helper="Recovered over 3 salaries"
              meta="Up to ₹50,000"
              error={amountPad.atMax ? 'That’s the most you can ask for this month.' : null}
            />
          </View>
          <KeypadWash safeArea={false}>
            <NumericKeypad onKey={amountPad.onKey} decimal={amountPad.decimal} />
          </KeypadWash>
        </View>
      </Item>

      <Item name="AmountEntry (empty · static)" note="Empty shows a greyed ₹0.00 · caret off for a read-only figure">
        <View style={styles.stack}>
          <AmountEntry label="Petty cash bill" value="" helper="Attach the bill photo next" meta="Advance ₹5,000" />
          <AmountEntry label="Expense claim" value="2349.5" caret={false} helper="Fuel · Hyderabad → Warangal" />
        </View>
      </Item>

      <Item name="NumericKeypad (light)" note="Frost keys with ink digits, for a keypad on the light canvas">
        <NumericKeypad tone="light" decimal onKey={(k) => toast.show(`Key ${k}`, 'info')} />
      </Item>

      <Item name="FromToCards" note="Two frosted cards with a round arrow between · stacks with ↓ on 320 dp / large text">
        <FromToCards
          from={{ title: 'Casual leave', subtitle: '6 days left', icon: Plane, module: 'leave' }}
          to={{ title: 'Meera Iyer', subtitle: 'Approver · HR', avatar: { name: 'Meera Iyer' } }}
        />
      </Item>

      <Item name="SwipeToConfirm" note="Drag the knob past 85 % · springs back otherwise · button when a screen reader is on">
        <View style={styles.stack}>
          <SwipeToConfirm label="Swipe to clock out" onConfirm={clockOut} loading={clockingOut} />
          <SwipeToConfirm label="Swipe to submit claim" onConfirm={() => {}} disabled />
        </View>
      </Item>

      <Item name="ConfirmSheet → SuccessSheet" note="Floating ×, FromToCards, details, swipe · then the ✓ sheet with two buttons">
        <View style={styles.row}>
          <Button title="Apply leave" onPress={() => setConfirmOpen(true)} style={{ flex: 1 }} />
          <Button title="Success" variant="ghost" onPress={() => setSuccessOpen(true)} style={{ flex: 1 }} />
        </View>
      </Item>

      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm leave"
        from={{ title: 'Casual leave', subtitle: '2 days · 26–27 Oct', icon: Plane, module: 'leave' }}
        to={{ title: 'Meera Iyer', subtitle: 'Approver', avatar: { name: 'Meera Iyer' } }}
        detailsTitle="Leave details"
        confirmLabel="Swipe to apply leave"
        onConfirm={applyLeave}
        loading={submitting}
        note="You can cancel it until Meera approves it.">
        <DemoDetails rows={LEAVE_ROWS} />
      </ConfirmSheet>

      <SuccessSheet
        visible={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="Leave applied"
        subtitle="Meera Iyer will review it. We’ll let you know once it’s approved."
        secondaryLabel="View request"
        onSecondary={() => {
          setSuccessOpen(false);
          toast.show('Opening LV-2026-0418 (demo)', 'info');
        }}>
        <DemoDetails rows={DONE_ROWS} />
      </SuccessSheet>
    </View>
  );
}

const IOS = Platform.OS === 'ios';

const styles = themedStyles(() => ({
  section: { gap: space.xl, paddingTop: space.lg },
  item: { gap: space.sm },
  caption: { gap: 2, paddingHorizontal: space.xxs },
  stack: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  phone: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: palette.canvasTop,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
  },
  phoneTop: { padding: space.md, gap: space.sm },
  verifyIcon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    ...(IOS ? shadow.soft : null),
  },
  details: { borderRadius: radius.xl, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.xxs },
  detailsFrost: { backgroundColor: palette.frostStrong, borderColor: palette.glassEdge },
  detailsSheet: { backgroundColor: palette.surface, borderColor: palette.glassLine },
}));
