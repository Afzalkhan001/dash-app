// Rows for the vendor's bills and agreements lists (Home, Bills, Agreements), in the Payno
// "recent transactions" look (docs/LAYOUT-REFS.md #4) built on the kit's ListRow / ActivityRow, so
// paddings, press tint, the 68 dp separator inset and the single screen-reader stop match the app.
// They sit inside an ActivityList or a `tone="surface"` ListCard (one white card with hairlines).
//   Bill: 40 dp pay badge, the description (2 lines) with the status as a dot + word under it (it
//     may wrap — labels such as "Waiting for project approval" are too long for a pill beside an
//     amount at 360 dp); on the right the amount (semibold, tabular) over the date it was sent in.
//     "Vendor advance" is the muted subtitle when the bill has its own description.
//   Agreement: ActivityRow with a short status pill on the right (To sign / Expired / Signed; under
//     the text, with a chevron, below 360 dp); the deadline is the subtitle and the sender a small
//     note under it, so neither is cut. `showStatus={false}` where the list's title already says it
//     (Home's "To sign", the Agreements tab's "Signed"): the row ends in a chevron instead.
// A bill row's amount and date move under the text with text above 130 % (as ActivityRow does) and on
// narrow phones (BILL_STACK), so the title and the status line keep the full width.

import { FileSignature, HandCoins, Receipt } from 'lucide-react-native';
import { View } from 'react-native';

import type { VendorAgreement, VendorBill } from '@/api/vendor';
import { agreementExpired, agreementSigned, billStatus } from '@/features/vendor/constants';
import { dateIN, dateTimeIN, rupees } from '@/features/vendor/format';
import { font, statusTone, type StatusTone } from '@/theme/tokens';
import { ActivityRow, ListRow, ModuleBadge, shouldStack, type StackRule, StatusPill, Text, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';
/**
 * A bill row puts its amount and date under the text above 130 % text (same as ActivityRow), and also
 * when window width ÷ font scale is under 340 dp: beside them a 320 dp row leaves the status ~90 dp,
 * so "Waiting for project approval" was cut after two lines. 360 dp at 100 % keeps the side column;
 * 360 dp from 106 % text and every 320 dp phone stack.
 */
const BILL_STACK: StackRule = { text: 'huge', below: 'tight', perText: true };
/** An agreement row's status pill sits under the text when window width ÷ font scale is under 360 dp (as in ActivityRow). */
const PILL_BELOW: StackRule = { below: 'narrow', text: false, perText: true };

/** Status as a coloured dot + the word in the accessible ink; wraps instead of overflowing. */
export function StatusLine({ label, tone }: { label: string; tone: StatusTone }) {
  const t = statusTone[tone] ?? statusTone.neutral;
  return (
    <View style={styles.status}>
      <View style={[styles.statusDot, { backgroundColor: t.dot }]} />
      <Text variant="caption" color={t.fg} numberOfLines={2} maxFontSizeMultiplier={1.3} style={styles.statusText}>
        {label}
      </Text>
    </View>
  );
}

export function BillRow({ bill, onPress }: { bill: VendorBill; onPress: () => void }) {
  const stack = shouldStack(useLayout(), BILL_STACK);
  const st = billStatus(bill?.status ?? '');
  const advance = !!bill?.is_advance;
  const title = bill?.version?.description || (advance ? 'Vendor advance' : 'Bill');
  const amount = rupees(bill?.version?.amount);
  const sent = dateIN(bill?.created_at);
  // "Vendor advance" once: under a description, or as the title when there is none.
  const sub = advance && bill?.version?.description ? 'Vendor advance' : null;
  return (
    <ListRow
      size="lg"
      left={<ModuleBadge module="pay" icon={advance ? HandCoins : Receipt} />}
      title={title}
      numberOfLines={2}
      subtitle={sub}
      below={<StatusLine label={st.label} tone={st.tone} />}
      value={amount}
      valueMeta={sent}
      stackRight={stack}
      onPress={onPress}
      accessibilityLabel={[title, sub, amount, st.label, `Submitted ${sent}`].filter(Boolean).join(', ')}
    />
  );
}

export function AgreementRow({
  agreement: a,
  onPress,
  now,
  showStatus = true,
}: {
  agreement: VendorAgreement;
  onPress: () => void;
  now?: number;
  /** false where the list's own title already says the status (Home's "To sign", "Signed"). Still spoken. */
  showStatus?: boolean;
}) {
  const l = useLayout();
  const signed = agreementSigned(a);
  const expired = !signed && agreementExpired(a, now);
  const pill = signed
    ? { label: 'Signed', tone: 'done' as const }
    : expired
      ? { label: 'Expired', tone: 'failed' as const }
      : { label: 'To sign', tone: 'pending' as const };
  const title = a?.project_name || 'Agreement';
  // The deadline gets the subtitle to itself (the "Expired" pill already says it has passed); the
  // sender goes on the note line, so neither is cut beside the pill at 360 dp / font scale 1.3.
  const sub = signed
    ? `Signed ${dateIN(a?.signed_at)}`
    : a?.deadline_at
      ? `${expired ? 'Deadline passed' : 'Sign by'} ${dateTimeIN(a.deadline_at)}`
      : 'No signing deadline';
  const from = signed ? undefined : `From ${a?.created_by_name || 'Tamada Media'}`;
  const spoken = [title, pill.label, sub, from].filter(Boolean).join(', ');
  // Narrow phone: beside the pill a 320 dp row left the project name ~115 dp (two short lines), so the
  // pill goes under the text and the row ends in a chevron, like ActivityRow does with a value.
  if (showStatus && shouldStack(l, PILL_BELOW)) {
    return (
      <ListRow
        size="lg"
        left={<ModuleBadge module="vendor" icon={FileSignature} />}
        title={title}
        numberOfLines={2}
        subtitle={sub}
        subtitleLines={2}
        meta={from}
        below={<StatusPill label={pill.label} tone={pill.tone} />}
        chevron
        onPress={onPress}
        accessibilityLabel={spoken}
      />
    );
  }
  return (
    <ActivityRow
      module="vendor"
      icon={FileSignature}
      title={title}
      subtitle={sub}
      note={from}
      status={showStatus ? pill : null}
      chevron={!showStatus}
      onPress={onPress}
      accessibilityLabel={spoken}
    />
  );
}

const styles = themedStyles(() => ({
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  statusText: { flexShrink: 1, fontFamily: font.semibold },
}));
