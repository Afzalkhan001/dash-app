// Building blocks of an Inbox item's detail screen, in the Payno "Transfer details" / "Confirm transfer"
// language (docs/REFERENCE-COMPONENTS.md §3 "Inbox", items 2, 3, 13, 28–30):
//
//   NavHeader     round frosted back button, the kind centred ("Leave request")
//   RequestHero   SummaryHero — the kind's icon in its module colour, what the figure is ("Asked for"),
//                 the key figure huge and light (days, ₹ with greyed paise, a date) and what it is for
//   WhoCards      FromToCards — the person asking → you (or whoever decided it)
//   notice        at most one: the decision already taken, or "Amount changed"
//   NoteCard      their own words ("Reason", "What for", "Note") in a frosted card
//   DetailsCard   SummaryCard — Status as a soft pill, then whatever the hero doesn't already say
//   extras        the bill (AccountRow → View), what petty cash is for, a claim's history
//   DecisionBar   sticky: "Swipe to approve" (SwipeToConfirm) over a frosted Reject button, only while
//                 it is mine to decide; Reject opens RejectSheet (the reason)
//   DecidedSheet  SuccessSheet after either decision — what happened, a short summary, Done
//
// Every card is frosted (Card tone="frostStrong" / SummaryCard) with its title inside, in the
// SectionHeader's regular 17 px, and the screen's gap between sections. The detail never says a thing
// twice: whatever the hero shows (figure, dates) and the From → To cards show (who, when it was sent)
// is not listed again in the details.

import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ban, CircleCheck, CircleX, DoorOpen, Hourglass, Inbox, Receipt, Share2, UserRoundCheck, X } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Alert, Text as RNText, useWindowDimensions, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { type Decision, fetchKekaReceipt } from '@/api/inbox';
import { dateTime, type Field, hrStatusLabel, hrStatusTone, type InboxKind, type TimelineEvent } from '@/features/inbox/format';
import { kindLook } from '@/features/inbox/kind-look';
import { FileError, saveDataUrl, shareFile } from '@/lib/files';
import { font, palette, radius, space, type StatusTone, type as typeScale } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  Banner,
  Button,
  Card,
  EmptyState,
  EventTimeline,
  FromToCards,
  type FromToItem,
  haptic,
  NavHeader,
  Row,
  Screen,
  Sheet,
  Skeleton,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  type SummaryItem,
  SwipeToConfirm,
  Text,
  TextField,
  TwoUp,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

// ── Hero ─────────────────────────────────────────────────────────────────────
// What the hero's figure is, in plain words (Payno's small "Available balance" line).
const FIGURE_LABEL: Record<InboxKind, string> = {
  leave: 'Asked for',
  wfh: 'Asked for',
  comp_off: 'Asked for',
  regularization: 'Day to fix',
  reimbursements: 'Claimed',
  loans: 'Asked for',
  keka: 'Claimed',
  petty: 'Asked for',
  visitors: 'Waiting at reception',
};

// 1 → 0, 1.5 → 1, 0.25 → 2: as many decimals as the count has (at most 2), never rounded away.
const figureDecimals = (n: number) => (Number.isInteger(n) ? 0 : Number.isInteger(n * 10) ? 1 : 2);

/**
 * A figure that is not a plain number or money ('+1' day of comp-off, 'Mon, 19 Oct' to fix, '12m' at
 * reception): the giant thin numeral while it is short, the lighter 32 px hero size when it is longer,
 * with an optional small muted unit after it. Shrinks to fit on one line.
 */
function FigureText({ value, unit }: { value: string; unit?: string }) {
  const short = value.length <= 4;
  const unitStyle = { fontFamily: typeScale.body.fontFamily, fontSize: typeScale.body.fontSize, letterSpacing: 0, color: palette.textMuted };
  return (
    <Text
      variant={short ? 'numeral' : 'hero'}
      color={palette.ink}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      tabular
      accessibilityLabel={unit ? `${value} ${unit}` : value}
      style={styles.shrink}>
      {value}
      {unit ? <RNText style={unitStyle}>{` ${unit}`}</RNText> : null}
    </Text>
  );
}

/**
 * Payno's light summary hero for the request: the kind's icon in its module colour and what the
 * figure is ("Asked for", or `label`), the key figure (`amount` → ₹ with greyed paise; `figure` → a
 * count such as leave days, with `unit`; otherwise `value` + `unit` as text) and what it is for
 * (`caption`, up to 2 lines).
 */
export function RequestHero({
  kind,
  label,
  value,
  amount,
  figure,
  unit,
  caption,
}: {
  kind: InboxKind;
  label?: string;
  value: string;
  amount?: number;
  figure?: number;
  unit?: string;
  caption?: string;
}) {
  const look = kindLook(kind);
  const heading = label ?? FIGURE_LABEL[kind];
  const sub = caption || undefined;
  if (amount != null && Number.isFinite(amount)) {
    return <SummaryHero icon={look.icon} module={look.module} label={heading} value={amount} currency="₹" decimals={2} sub={sub} />;
  }
  if (figure != null && Number.isFinite(figure)) {
    return <SummaryHero icon={look.icon} module={look.module} label={heading} value={figure} decimals={figureDecimals(figure)} unit={unit} sub={sub} />;
  }
  return <SummaryHero icon={look.icon} module={look.module} label={heading} figure={<FigureText value={value} unit={unit} />} sub={sub} />;
}

/**
 * Who is at reception: "Waiting at reception" with the visitor's check-in photo (pass a VisitPhoto)
 * beside how long they have waited ('12m'), when they arrived under it, and a chip once the visit
 * has timed out without an answer.
 */
export function VisitorHero({ photo, waited, arrived, timedOut }: { photo: ReactNode; waited: string; arrived: string; timedOut?: boolean }) {
  return (
    <SummaryHero
      icon={DoorOpen}
      module="visitors"
      label={FIGURE_LABEL.visitors}
      figure={
        <Row style={styles.visitorFigure}>
          {photo}
          <FigureText value={waited} unit="waiting" />
        </Row>
      }
      sub={arrived}
      info={timedOut ? { label: 'No answer yet', value: 'You can still decide' } : undefined}
    />
  );
}

// ── From → To ────────────────────────────────────────────────────────────────
/** The person asking: their initials (or photo), name and when it was sent. */
export const requesterItem = (name: string, sent?: string, uri?: string | null): FromToItem => ({
  title: name,
  subtitle: sent || 'Asked',
  avatar: { name, uri },
});

/** Someone named, with their initials and a role or status line under the name. */
export const personItem = (name: string, subtitle?: string): FromToItem => ({ title: name, subtitle, avatar: { name } });

/**
 * Where the request goes: "You" while it is yours to decide; once decided, whoever decided it and
 * what they decided ("Meera Iyer · Approved"); otherwise who it is waiting on (`role`).
 */
export function deciderItem({
  mine,
  me,
  status,
  by,
  role = 'Approver',
}: {
  /** Still waiting, and yours to decide. */
  mine: boolean;
  me?: string | null;
  /** The decision in words, once decided ("Approved", "Rejected"); undefined while waiting. */
  status?: string;
  by?: string | null;
  role?: string;
}): FromToItem {
  if (mine) return { title: 'You', subtitle: role, avatar: { name: me || 'You' } };
  const who = typeof by === 'string' && by.trim() ? by.trim() : '';
  if (status) return who ? { title: who, subtitle: status, avatar: { name: who } } : { title: role, subtitle: status, icon: UserRoundCheck };
  return { title: who || role, subtitle: 'Waiting', icon: Hourglass };
}

/** From → To (the person asking → you), side by side; stacked with a ↓ on a narrow phone or large text. */
export function WhoCards({ from, to }: { from: FromToItem; to: FromToItem }) {
  return <FromToCards from={from} to={to} />;
}

// ── Cards ────────────────────────────────────────────────────────────────────
/** A frosted card with its title inside, in the SectionHeader's regular 17 px. */
function TitledCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card tone="frostStrong" style={styles.titledCard}>
      <Text variant="heading" color={palette.ink} numberOfLines={2} accessibilityRole="header" style={styles.cardTitle}>
        {title}
      </Text>
      {children}
    </Card>
  );
}

/**
 * The request's details as a Payno SummaryCard: Status first (a soft pill), then the rows the hero
 * doesn't already show (`fields`; muted keys left, values right, long values under their key).
 * Nothing when there is neither.
 */
export function DetailsCard({ fields, status, title = 'Details' }: { fields: Field[]; status?: { label: string; tone: StatusTone } | null; title?: string }) {
  const shown = (Array.isArray(fields) ? fields : []).filter((f) => !!f && f.value != null && f.value !== '');
  const rows: SummaryItem[] = [
    ...(status ? [{ key: 'status', label: 'Status', value: status.label, status: status.tone }] : []),
    ...shown.map((f, i) => ({
      key: `${f.label}-${i}`,
      label: f.label,
      value: f.value,
      hint: f.hint,
      valueColor: f.tone === 'danger' ? palette.dangerInk : f.tone === 'muted' ? palette.textMuted : undefined,
    })),
  ];
  if (!rows.length) return null;
  return <SummaryCard title={title} rows={rows} />;
}

// The employee's own words (reason / what the claim was for) in a frosted card, or a notice (`tone="warning"`).
export function NoteCard({ label, text, tone }: { label: string; text: string; tone?: 'warning' }) {
  if (tone === 'warning') return <Banner tone="warning" title={label} message={text} />;
  return (
    <TitledCard title={label}>
      <Text variant="body" selectable>
        {text}
      </Text>
    </TitledCard>
  );
}

// A request someone already decided (or the employee cancelled): who, when, and what they said.
// Approved reads green and rejected red; a cancelled request is a plain frosted card, since colour is
// kept for meaning. A claim since paid or an advance since paid back was approved — the server's
// decided_by / decided_at are the approval's — so it says "Approved by …" (the status says Paid /
// Paid back), never "Paid by <the approver>". Pass `today` (useTodayIst()) for the date.
export function DecisionNote({
  status,
  by,
  at,
  note,
  today,
}: {
  status: string;
  by?: string | null;
  at?: string | null;
  note?: string;
  today?: string;
}) {
  const decided = status === 'paid' || status === 'closed' ? 'approved' : status;
  const tone = hrStatusTone(decided);
  const title = `${hrStatusLabel(decided)}${by ? ` by ${by}` : ''}`;
  const when = at ? dateTime(at, today) : undefined;
  if (tone !== 'done' && tone !== 'failed') {
    return (
      <Card tone="frostStrong" style={styles.note}>
        <Row style={styles.noteHead}>
          <Ban size={18} color={palette.textMuted} />
          <Text variant="labelStrong" numberOfLines={2} style={styles.noteTitle}>
            {title}
          </Text>
        </Row>
        {when ? (
          <Text variant="label" muted>
            {when}
          </Text>
        ) : null}
        {note ? (
          <Text variant="label" muted selectable>
            {`“${note}”`}
          </Text>
        ) : null}
      </Card>
    );
  }
  return (
    <Banner tone={tone === 'done' ? 'success' : 'danger'} icon={tone === 'done' ? CircleCheck : CircleX} title={title} message={when}>
      {note ? (
        <Text variant="label" muted selectable>
          {`“${note}”`}
        </Text>
      ) : null}
    </Banner>
  );
}

// ── Approve / Reject ─────────────────────────────────────────────────────────
export type DecisionProps = {
  /** Left out when only Reject is the viewer's (Accounts on petty cash still at its project owner). */
  onApprove?: () => void;
  onReject: () => void;
  approving: boolean;
  disabled: boolean;
  /** The words when "Approve" / "Reject" don't fit the thing (a visitor: "Let in" / "Turn away"). */
  approveLabel?: string;
  rejectLabel?: string;
  /** A short line above the swipe: what approving does next ("Approving sends it to Accounts"). */
  note?: string | null;
};

/**
 * The detail screen's frame: the Payno NavHeader (round back button, centred title) and the content,
 * with the sticky decision bar while the item is the viewer's to decide (`decision` null hides it —
 * already decided, or not theirs).
 */
export function DecisionScreen({ title, decision, children }: { title: string; decision?: DecisionProps | null; children: ReactNode }) {
  return (
    <Screen header={<NavHeader title={title} />} footer={decision ? <DecisionBar {...decision} /> : undefined}>
      {children}
    </Screen>
  );
}

/**
 * The sticky decision bar — pass it as `<Screen footer={…}>`. "Swipe to approve" (the kit's
 * SwipeToConfirm: drag the knob past 85 %; a plain button with a screen reader or Reduce Motion) on
 * top, and a frosted Reject button under it (`approveLabel` / `rejectLabel` rename them). While
 * Approve is saving the knob waits at the end with a spinner and Reject is disabled. Without
 * `onApprove` the bar holds Reject alone.
 */
export function DecisionBar({ onApprove, onReject, approving, disabled, approveLabel = 'Approve', rejectLabel = 'Reject', note }: DecisionProps) {
  return (
    <ActionBar note={note}>
      {onApprove ? (
        <SwipeToConfirm
          label={`Swipe to ${approveLabel.toLowerCase()}`}
          buttonLabel={approveLabel}
          onConfirm={onApprove}
          loading={approving}
          disabled={disabled && !approving}
        />
      ) : null}
      <Button title={rejectLabel} variant="ghost" icon={<X />} disabled={disabled} onPress={onReject} />
    </ActionBar>
  );
}

/**
 * Asks for the reason the employee will see. The one confirm button is the filled destructive one,
 * named for the outcome, and stays disabled until the reason is long enough (`minLength={0}` makes
 * the reason optional, for decisions whose server takes an empty one). Closing with a reason typed
 * asks before throwing it away.
 */
export function RejectSheet({
  visible,
  onClose,
  title,
  subtitle,
  note,
  onChangeNote,
  minLength,
  placeholder,
  busy,
  onSubmit,
  confirmLabel = 'Reject request',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  note: string;
  onChangeNote: (s: string) => void;
  minLength: number;
  placeholder: string;
  busy: boolean;
  onSubmit: () => void;
  confirmLabel?: string;
}) {
  const typed = note.trim().length;
  const ok = typed >= minLength;
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      dirty={!busy && typed > 0}
      title={title}
      subtitle={subtitle}
      footer={<Button title={confirmLabel} variant="destructive" loading={busy} disabled={!ok} onPress={onSubmit} />}>
      <TextField
        label={minLength > 0 ? 'Reason' : 'Reason (optional)'}
        value={note}
        onChangeText={onChangeNote}
        placeholder={placeholder}
        multiline
        maxLength={500}
        counter
        autoFocus
        hint={minLength > 1 ? `At least ${minLength} characters` : minLength === 1 ? 'Required' : undefined}
      />
    </Sheet>
  );
}

// ── After the decision ───────────────────────────────────────────────────────
/** What the success sheet says after a decision. */
export type Outcome = { decision: Decision; title: string; subtitle?: string; rows: SummaryItem[] };

// The reason sheet (an RN Modal) fades out in ~300 ms; iOS can't present the success sheet's Modal
// while another one is still being dismissed, so after a reject it opens a moment later.
const AFTER_SHEET_MS = 400;

/**
 * The decision's outcome: `show()` it from the mutation's onSuccess (pass `afterSheet` when the
 * reason sheet is closing at the same moment). `done` hides the decision bar at once; `open` drives
 * the DecidedSheet.
 */
export function useOutcome() {
  const [done, setDone] = useState<Outcome | null>(null);
  const [open, setOpen] = useState(false);
  const show = (outcome: Outcome, afterSheet = false) => {
    setDone(outcome);
    if (afterSheet) setTimeout(() => setOpen(true), AFTER_SHEET_MS);
    else setOpen(true);
  };
  return { done, open, show };
}

/**
 * Payno "Bill paid" after a decision: a green ✓, what happened ("Leave request approved"), a muted
 * line saying what happens next, a short summary, and Done — which (like ×) goes back to the list.
 */
export function DecidedSheet({ outcome, visible, onDone }: { outcome: Outcome | null; visible: boolean; onDone: () => void }) {
  return (
    <SuccessSheet visible={visible && !!outcome} onClose={onDone} onPrimary={onDone} title={outcome?.title ?? ''} subtitle={outcome?.subtitle}>
      {outcome && outcome.rows.length ? <SummaryCard rows={outcome.rows} /> : null}
    </SuccessSheet>
  );
}

/** The status row of an outcome's summary: "Approved" (green) or "Rejected" (red), or the given words. */
export const outcomeStatus = (decision: Decision, words?: { approve?: string; reject?: string }): SummaryItem => ({
  key: 'status',
  label: 'Status',
  value: decision === 'approve' ? (words?.approve ?? 'Approved') : (words?.reject ?? 'Rejected'),
  status: decision === 'approve' ? 'done' : 'failed',
});

// After a failed decision: say why (the server's words). When it is no longer waiting — decided by
// someone else, or gone — go back to the list, which refreshes itself.
export function explainDecisionError(e: unknown, leave: () => void) {
  const msg = (e instanceof Error && e.message) || 'Please try again.';
  const status = e instanceof ApiRequestError ? e.status : undefined;
  const gone = status === 404 || (status === 409 && /already|someone else|not waiting/i.test(msg));
  Alert.alert(gone ? 'No longer waiting on you' : "Couldn't save your decision", msg, [{ text: 'OK', onPress: gone ? leave : undefined }]);
}

// ── Project claim extras ─────────────────────────────────────────────────────
/** The claim's history in a frosted "History" card (oldest first, ending with what it is waiting on). Pass `today` (useTodayIst()). */
export function Timeline({ events, today }: { events: TimelineEvent[]; today?: string }) {
  const list = (Array.isArray(events) ? events : []).filter(Boolean);
  if (!list.length) return null;
  return (
    <TitledCard title="History">
      <EventTimeline
        events={list.map((e) => ({
          key: e.key,
          label: e.label,
          at: e.at ? dateTime(e.at, today) : undefined,
          by: e.by,
          detail: e.detail,
          note: e.note,
          tone: e.tone,
        }))}
      />
    </TitledCard>
  );
}

// The bill the employee attached (GET /reimbursements/:id/receipt), written to the cache.
async function loadReceipt(id: string, fileBase: string) {
  const r = await fetchKekaReceipt(id);
  const data = typeof r?.fileData === 'string' ? r.fileData : '';
  const mime = (/^data:([\w.+\/-]+);base64,/i.exec(data)?.[1] ?? '').toLowerCase();
  // Same rule as the web viewer: a PDF or a raster image, never SVG.
  if (mime !== 'application/pdf' && !(mime.startsWith('image/') && !mime.includes('svg'))) {
    throw new FileError('This bill could not be shown.');
  }
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  return { uri: await saveDataUrl(data, `${fileBase}-receipt.${ext}`), mime };
}

const receiptProblem = (e: unknown, fallback: string) => {
  haptic.error();
  Alert.alert('Couldn’t open the bill', (e instanceof Error && e.message) || fallback);
};

/**
 * The bill as a Payno AccountRow — receipt icon, "Bill" over the file's name, a frosted "View" pill
 * (the whole row is the button). Images open in a preview sheet; PDFs go straight to the share sheet
 * (save to Files, open in a PDF viewer, …).
 */
export function ReceiptButton({ id, fileBase, fileName }: { id: string; fileBase: string; fileName?: string | null }) {
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; mime: string } | null>(null);
  const name = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'Photo or PDF';

  const open = () => {
    if (busy) return;
    setBusy(true);
    loadReceipt(id, fileBase)
      .then((file) => (file.mime.startsWith('image/') ? setPreview(file) : shareFile(file.uri, file.mime, 'Bill')))
      .catch((e: unknown) => receiptProblem(e, 'This bill could not be shown.'))
      .finally(() => setBusy(false));
  };

  const share = () => {
    if (!preview) return;
    shareFile(preview.uri, preview.mime, 'Bill').catch((e: unknown) => receiptProblem(e, 'Could not share the bill.'));
  };

  return (
    <>
      <AccountRow
        icon={Receipt}
        module="expenses"
        title="Bill"
        sub={busy ? 'Opening…' : name}
        actionLabel="View"
        onPress={open}
        accessibilityLabel={busy ? 'Bill, opening' : `View bill, ${name}`}
        hint="Opens the bill the employee attached"
      />
      <Sheet
        visible={!!preview}
        onClose={() => setPreview(null)}
        title="Bill"
        footer={<Button title="Share or save" icon={<Share2 />} onPress={share} />}>
        {preview ? (
          <Image
            source={{ uri: preview.uri }}
            // The sheet tops out at 90 % of the window; leave room for its header and footer.
            style={[styles.receipt, { height: Math.max(240, Math.min(440, Math.round(height * 0.5))) }]}
            contentFit="contain"
            cachePolicy="none"
            accessibilityLabel="Bill photo"
          />
        ) : null}
      </Sheet>
    </>
  );
}

// ── Loading / not found ──────────────────────────────────────────────────────
/** While a request opened by link is still loading: the hero, the From → To pair and the details card's shapes. */
export function DetailSkeleton({ title }: { title: string }) {
  return (
    <Screen header={<NavHeader title={title} />}>
      <Skeleton height={196} radius={radius.xxl} />
      <TwoUp>
        <View key="from">
          <Skeleton height={136} radius={radius.xl} />
        </View>
        <View key="to">
          <Skeleton height={136} radius={radius.xl} />
        </View>
      </TwoUp>
      <Skeleton height={148} radius={radius.xl} />
    </Screen>
  );
}

// Gone from the list it was opened from: decided by someone else, withdrawn, or no longer theirs.
// The button goes to the Inbox tab (dismissTo pops back to the tabs already underneath), wherever
// the item was opened from.
export function MissingItem({ title }: { title: string }) {
  const router = useRouter();
  return (
    <Screen header={<NavHeader title={title} />}>
      <EmptyState
        icon={<Inbox color={palette.textMuted} strokeWidth={1.8} />}
        title="No longer waiting on you"
        message="Someone may have decided it already."
        action={<Button title="Back to Inbox" variant="accent" size="md" onPress={() => router.dismissTo('/inbox')} />}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  shrink: { flexShrink: 1 },
  visitorFigure: { alignItems: 'center', gap: space.md },
  titledCard: { gap: space.sm },
  // The kit SectionHeader / SummaryCard title: regular 17, ink.
  cardTitle: { fontFamily: font.regular, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  note: { gap: space.xxs },
  noteHead: { gap: space.sm },
  noteTitle: { flex: 1, minWidth: 0, flexShrink: 1 },
  receipt: { width: '100%', borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
}));
