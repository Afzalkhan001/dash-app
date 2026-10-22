// Petty cash building blocks: the light summary hero with what the person has left to spend (Payno
// SummaryHero + a striped "bills / money given" bar), request / bill / expense report rows (the kit's
// ActivityRow: three lines at most, the amount over the status on the right), the history timeline, a
// searchable picker (project codes, teammates — a field or a Payno AccountRow), and the sheets the
// employee meets: the 6-digit code to confirm a request (OtpBoxes), "Did you get the money?"
// (PaymentAnswerSheet — Expense claims asks the same question with the same sheet) and the receipt viewer.
// Everything is built from the UI kit (docs/DESIGN.md) so it fits a 320 dp phone and large text.
// Money: exact (with paise) in figures and sheets, whole rupees in list rows (logic.ts money / rowMoney).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Check, ChevronDown, CircleCheck, CircleX, FileSpreadsheet, type LucideIcon, ReceiptText, Search, Share2, TrendingUp, Wallet, X } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/client';
import { confirmPettyCashRequest, type PettyCashRequest, type PettyCashSubmission, resendPettyCashOtp, respondPettyCashPayment } from '@/api/petty-cash';
import { useTodayIst } from '@/features/attendance/use-now';
import { plural } from '@/lib/format';
import { font, type ModuleKey, palette, radius, space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
  AccountRow,
  ActionRow,
  ActivityRow,
  AmountEntry,
  Banner,
  Button,
  EventTimeline,
  FieldMessage,
  haptic,
  isDarkScheme,
  OtpBoxes,
  SelectTiles,
  Sheet,
  StripedProgress,
  SummaryHero,
  type SummaryHeroAction,
  SwipeToConfirm,
  Text,
  TextField,
  type TimelineTone,
  toast,
  useSurface,
  withAlpha,
} from '@/ui';

import { amount, type BillBatch, dateTime, excessStatusText, type HistoryEvent, list, money, pettyCashRef, rowMoney, shortDate, statusMeta } from './logic';

import { themedStyles } from '@/theme/themed';

// ── Small pieces ─────────────────────────────────────────────────────────────
type TagTone = 'neutral' | 'warning' | 'success' | 'danger';
// Read at render time (never a module-level table), so the tints follow light / dark.
function tagColors(tone: TagTone): { bg: string; fg: string } {
  switch (tone) {
    case 'warning':
      return { bg: palette.warningSoft, fg: palette.warningInk };
    case 'success':
      return { bg: palette.successSoft, fg: palette.successInk };
    case 'danger':
      return { bg: palette.dangerSoft, fg: palette.dangerInk };
    default:
      return { bg: palette.surfaceMuted, fg: palette.textMuted };
  }
}

/** A quiet attribute tag (soft fill, ink text) — "Extra claim". Not a status. */
export function PettyTag({ label, tone = 'neutral' }: { label: string; tone?: TagTone }) {
  const c = tagColors(tone);
  return (
    <View style={[styles.tag, { backgroundColor: c.bg }]}>
      <Text variant="caption" color={c.fg} numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.tagText}>
        {label}
      </Text>
    </View>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
/**
 * What I have left to spend (Payno SummaryHero): the advance approved for me minus the bills I have
 * added, as one big figure; an info chip for money on the way (or extra claimed); a striped bar of bills
 * against the money given; and the screen's one primary action ("Request money"). Before anything is approved, the line says how much I asked for is still waiting
 * (`waiting`), or what to do first when nothing is.
 */
export function PettyCashHero({
  remaining,
  advance,
  spent,
  awaitingPayment,
  extra,
  waiting = 0,
  action,
}: {
  remaining: number;
  advance: number;
  spent: number;
  awaitingPayment: number;
  extra: number;
  /** Money asked for me that is not approved yet. */
  waiting?: number;
  /** The full-width primary pill inside the card. */
  action?: SummaryHeroAction;
}) {
  const left = amount(remaining);
  const over = left < 0;
  const shown = Math.abs(left);
  const given = amount(advance);
  const used = amount(spent);
  const empty = !given && !used;
  // How it adds up is the striped bar (bills / money given) once anything was given; before that one
  // muted line says what is waiting, or what to do first. (A hero shows money exactly, with paise.)
  const line = given > 0
    ? undefined
    : !empty
      ? `${money(used)} in bills, nothing approved yet`
      : amount(waiting) > 0
        ? `${money(waiting)} waiting for approval`
        : 'Ask for money first, then add your bills.';
  const info =
    amount(awaitingPayment) > 0
      ? { label: 'On the way to you', value: money(awaitingPayment) }
      : amount(extra) > 0
        ? { label: 'Extra claimed', value: money(extra) }
        : undefined;
  return (
    <SummaryHero
      icon={over ? TrendingUp : Wallet}
      module="pettyCash"
      label={over ? 'Spent more than approved' : 'Left to spend'}
      value={shown}
      currency="₹"
      info={info}
      sub={line}>
      {given > 0 || action ? (
        <View style={styles.heroFoot}>
          {given > 0 ? (
            <StripedProgress label="Bills so far" used={Math.min(used, given)} total={given} valueText={`${rowMoney(used)} / ${rowMoney(given)}`} />
          ) : null}
          {/* The bar first, then the one primary action (SummaryHero would put its action above the bar). */}
          {action ? (
            <Button title={action.title} icon={action.icon} loading={action.loading} disabled={action.disabled} onPress={action.onPress} />
          ) : null}
        </View>
      ) : null}
    </SummaryHero>
  );
}

// ── List rows (inside an ActivityList) ──────────────────────────────────────
// All three are the kit's ActivityRow, like every other list in the app: title, one muted line, at most
// one more small line, and the amount (whole rupees) over a status pill on the right. The list passes
// `today` (useTodayIst()) for the dates, so a row never reads the clock while it renders.

export type PettyPool = { allocated: number; spent: number; extra: 'none' | 'open' | 'rejected' };

/**
 * One petty cash request: the project, its code and date, and at most ONE extra line (the most useful
 * of: why it was rejected, who it is for, what is left to spend). The full story, the requester's note
 * included, is on the request's own screen.
 */
export function PettyCashRequestRow({
  r,
  pool,
  meId,
  today,
  onPress,
}: {
  r: PettyCashRequest;
  pool?: PettyPool | null;
  meId?: string;
  today?: string;
  onPress?: () => void;
}) {
  const s = statusMeta(r.status);
  const forSomeoneElse = !!r.onBehalf && r.employeeId !== meId;
  const excess = r.kind === 'excess';
  const title = r.projectName || r.kekaCode || 'Petty cash request';
  const subtitle = [excess ? 'Extra claim' : null, r.projectName ? r.kekaCode : null, r.createdAt ? shortDate(r.createdAt, today) : null].filter(Boolean).join(' · ') || null;
  const over = pool ? pool.spent > pool.allocated : false;
  const diff = pool ? Math.abs(pool.spent - pool.allocated) : 0;
  const meta =
    r.status === 'rejected' && r.rejectionReason
      ? r.rejectionReason
      : r.onBehalf
        ? forSomeoneElse
          ? `For ${r.employeeName || 'a teammate'}`
          : `Asked for you by ${r.requestedByName || 'a teammate'}`
        : pool && !excess && pool.allocated > 0
          ? `${rowMoney(diff)} ${over ? 'over' : 'left to spend'}`
          : null;
  const value = rowMoney(r.amount);
  return (
    <ActivityRow
      module="pettyCash"
      icon={excess ? TrendingUp : Wallet}
      title={title}
      subtitle={subtitle}
      note={meta}
      value={value}
      status={s}
      onPress={onPress}
      accessibilityLabel={[title, subtitle, value, s.label, meta].filter(Boolean).join(', ')}
    />
  );
}

/**
 * One bill I added. Pressing it opens the caller's menu (receipt / expense report). The last line keeps
 * the bill number (the number people quote to Accounts), or says why the bill needs a second look.
 */
export function PettyCashBillRow({
  b,
  excessRequest,
  busy,
  today,
  onPress,
}: {
  b: PettyCashSubmission;
  excessRequest?: PettyCashRequest | null;
  /** The receipt is being fetched. */
  busy?: boolean;
  today?: string;
  onPress?: () => void;
}) {
  const rejected = b.status === 'rejected';
  const title = b.description || b.departmentName || 'Bill';
  const day = b.billDate || b.createdAt;
  const subtitle = [day ? shortDate(day, today) : null, b.kekaCode, b.description ? b.departmentName : null].filter(Boolean).join(' · ') || null;
  // Only a bill that needs a second look gets a status; an ordinary bill shows none.
  const status = rejected ? { label: 'Rejected', tone: 'failed' as const } : b.excessRequestId ? { label: 'Extra claim', tone: 'pending' as const } : null;
  const meta = busy
    ? 'Opening receipt…'
    : rejected
      ? [b.rejectionReason, `By ${b.rejectedByName || 'Accounts'}`].filter(Boolean).join(' · ')
      : b.excessRequestId
        ? excessStatusText(excessRequest)
        : [`Bill no. ${pettyCashRef('bill', b)}`, b.paidTo ? `Paid to ${b.paidTo}` : null].filter(Boolean).join(' · ');
  const value = rowMoney(b.amount);
  return (
    <ActivityRow
      module="pettyCash"
      icon={ReceiptText}
      title={title}
      subtitle={subtitle}
      note={meta}
      value={value}
      valueColor={rejected ? palette.textMuted : undefined}
      status={status}
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={[title, subtitle, value, status?.label, meta].filter(Boolean).join(', ')}
    />
  );
}

/**
 * One expense report (one set of bills sent together): the projects (their names first and the codes
 * under them, like a request row), the total, the bill count and date.
 */
export function PettyStatementRow({ batch, today, onPress }: { batch: BillBatch; today?: string; onPress?: () => void }) {
  const codes = list(batch.codes).filter(Boolean);
  const projects = list(batch.projects).filter(Boolean);
  const title = projects.join(', ') || codes.join(', ') || 'Expense report';
  const subtitle = projects.length ? codes.join(', ') || null : null;
  const date = batch.submittedAt ? shortDate(batch.submittedAt, today) : null;
  const meta = [plural(batch.count - batch.rejected, 'bill'), batch.rejected ? `${batch.rejected} rejected` : null, date ? `Sent ${date}` : null].filter(Boolean).join(' · ');
  const value = rowMoney(batch.total);
  return (
    <ActivityRow
      module="pettyCash"
      icon={FileSpreadsheet}
      title={title}
      subtitle={subtitle}
      note={meta}
      value={value}
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={[title, subtitle, value, meta].filter(Boolean).join(', ')}
    />
  );
}

// ── History timeline ─────────────────────────────────────────────────────────
const HISTORY_TONE: Record<HistoryEvent['kind'], TimelineTone> = {
  step: 'neutral',
  authorized: 'info',
  payment: 'info',
  ok: 'good',
  bad: 'bad',
  waiting: 'wait',
};

/** The request's history (dash.html PettyCashHistoryModal) on the kit's EventTimeline. Pass `today` (useTodayIst()). */
export function HistoryTimeline({ events, today }: { events: HistoryEvent[]; today?: string }) {
  const rows = list(events)
    .filter(Boolean)
    .map((e, i) => ({
      key: `${i}-${e.label}`,
      label: e.label,
      at: dateTime(e.at, today) || null,
      by: e.by || null,
      note: e.note || null,
      tone: HISTORY_TONE[e.kind] ?? 'neutral',
      detail:
        list(e.detail)
          .filter((d) => Array.isArray(d) && d[1])
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ') || null,
    }));
  return <EventTimeline events={rows} />;
}

// ── Searchable picker (project codes, teammates) ─────────────────────────────
export type PickerItem = { id: string; title: string; subtitle?: string; keywords?: string };

const PICKER_LIMIT = 60;

/**
 * A field that opens a searchable sheet of options. Looks and behaves like the kit's SelectField, or —
 * `variant="row"` — like a Payno AccountRow: an icon circle, the choice (or `placeholder`) over its
 * sub-line, and a small "Change" pill (the money forms' project code and teammate).
 */
export function SearchPickerField({
  label,
  placeholder,
  value,
  items,
  onPick,
  emptyHint,
  requireQuery = false,
  error,
  hint,
  variant = 'field',
  icon,
  module = 'pettyCash',
  rowSub,
  display,
}: {
  label: string;
  placeholder: string;
  value: PickerItem | null;
  items: PickerItem[];
  onPick: (item: PickerItem) => void;
  emptyHint?: string;
  requireQuery?: boolean; // like the website: long lists (hundreds of project codes) only show matches
  error?: string | null;
  /** Muted helper line under the field (hidden while an error shows). */
  hint?: string | null;
  /** 'field' (default) or 'row' (AccountRow with a "Change" pill). */
  variant?: 'field' | 'row';
  /** The row's icon (variant 'row'). */
  icon?: LucideIcon;
  module?: ModuleKey;
  /** The row's muted line before anything is chosen (variant 'row'); also the sheet's search placeholder. */
  rowSub?: string;
  /** How the chosen item reads in the row (variant 'row'); default: its title over its subtitle. */
  display?: (item: PickerItem) => { title: string; sub?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const surface = useSurface();
  const all = list(items).filter((i) => !!i && !!i.id);
  const needle = q.trim().toLowerCase();
  const found = needle ? all.filter((i) => `${i.title} ${i.subtitle || ''} ${i.keywords || ''}`.toLowerCase().includes(needle)) : requireQuery ? [] : all;
  const matches = found.slice(0, PICKER_LIMIT);
  const more = found.length - matches.length;
  const openSheet = () => {
    setQ('');
    setOpen(true);
  };
  const shown = value ? (display ? display(value) : { title: value.title, sub: value.subtitle }) : null;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="labelStrong" muted numberOfLines={2} style={FIELD_LABEL_INSET}>
        {label}
      </Text>
      {variant === 'row' ? (
        <AccountRow
          icon={icon ?? Search}
          module={module}
          title={shown ? shown.title : placeholder}
          sub={shown ? shown.sub || null : rowSub || null}
          actionLabel={value ? 'Change' : 'Choose'}
          accessibilityLabel={`${label}: ${value ? value.title : 'none chosen'}`}
          hint={value ? `Change the ${label.toLowerCase()}` : `Choose the ${label.toLowerCase()}`}
          onPress={openSheet}
          style={error ? styles.rowError : undefined}
        />
      ) : (
        <Pressable
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? value.title : placeholder}`}
          style={({ pressed }) => [styles.field, surface === 'sheet' && { backgroundColor: palette.surfaceMuted }, pressed && { backgroundColor: palette.surface }, !!error && styles.fieldError]}>
          <Search size={18} color={palette.textMuted} />
          <View style={styles.flexText}>
            <Text variant="body" color={value ? palette.text : palette.textFaint} numberOfLines={1}>
              {value ? value.title : placeholder}
            </Text>
            {value?.subtitle ? (
              <Text variant="caption" muted numberOfLines={1}>
                {value.subtitle}
              </Text>
            ) : null}
          </View>
          <ChevronDown size={18} color={palette.textMuted} />
        </Pressable>
      )}
      <FieldMessage error={error} hint={hint} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label.replace(/\s*\*$/, '')}>
        <TextField
          value={q}
          onChangeText={setQ}
          placeholder={variant === 'row' ? rowSub || placeholder : placeholder}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={`Search ${label.replace(/\s*\*$/, '').toLowerCase()}`}
          left={<Search size={18} color={palette.textMuted} />}
          right={
            q ? (
              <Pressable onPress={() => setQ('')} hitSlop={15} accessibilityRole="button" accessibilityLabel="Clear search">
                <X size={18} color={palette.textMuted} />
              </Pressable>
            ) : undefined
          }
        />
        <View style={{ gap: space.xxs }}>
          {matches.map((i) => {
            const on = value?.id === i.id;
            return (
              <Pressable
                key={i.id}
                onPress={() => {
                  if (!on) haptic.select();
                  onPick(i);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: palette.surfaceMuted }, on && { backgroundColor: palette.primarySoft }]}>
                <View style={styles.flexText}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {i.title}
                  </Text>
                  {i.subtitle ? (
                    <Text variant="label" muted numberOfLines={1}>
                      {i.subtitle}
                    </Text>
                  ) : null}
                </View>
                {on ? <Check size={18} color={palette.primaryText} /> : null}
              </Pressable>
            );
          })}
          {!matches.length ? (
            <Text variant="label" muted align="center" style={{ paddingVertical: space.lg }}>
              {needle ? `Nothing matches “${q.trim()}”.` : emptyHint || (requireQuery ? `Type to search ${all.length} options.` : 'Nothing to choose from yet.')}
            </Text>
          ) : more > 0 ? (
            <Text variant="caption" muted align="center" style={{ paddingVertical: space.sm }}>
              Showing the first {PICKER_LIMIT}. Keep typing to narrow it down.
            </Text>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

// ── The 6-digit code that confirms a request raised for someone ──────────────
/**
 * A plain code sheet: one short line, the 6 boxes (it sends itself on the 6th digit), "Send a new
 * code", and [Later] [Confirm] pinned at the bottom. `intro` replaces the default one-liner.
 */
export function OtpConfirmSheet({
  request,
  visible,
  onClose,
  onDone,
  intro,
}: {
  request: PettyCashRequest | null;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
  intro?: ReactNode;
}) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tried, setTried] = useState(''); // the code last sent, so a re-render never re-submits it
  // Every opening starts clean (state adjusted during render rather than in an effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setCode('');
      setMsg(null);
      setTried('');
    }
  }

  const confirm = useMutation({
    mutationFn: async (value: string) => {
      const r = await confirmPettyCashRequest(request!.id, value);
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      haptic.success();
      onDone();
    },
    onError: (e: Error) => {
      haptic.error();
      setMsg({ ok: false, text: e.message });
    },
  });
  const resend = useMutation({
    mutationFn: async () => {
      const r = await resendPettyCashOtp(request!.id);
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onSuccess: () => setMsg({ ok: true, text: 'A new code was sent.' }),
    onError: (e: Error) => setMsg({ ok: false, text: e.message }),
  });

  const submit = (value: string) => {
    if (value.length !== 6 || confirm.isPending || tried === value) return;
    setTried(value);
    setMsg(null);
    confirm.mutate(value);
  };

  return (
    <Sheet
      visible={visible && !!request}
      onClose={onClose}
      title="Enter the code"
      subtitle={request ? `${money(request.amount)} · ${request.projectName || request.kekaCode}` : undefined}
      footer={
        <ActionRow context="sheet">
          <Button title="Later" variant="accent" onPress={onClose} />
          <Button
            title="Confirm"
            icon={<Check />}
            loading={confirm.isPending}
            disabled={code.length !== 6}
            onPress={() => {
              // An explicit tap may retry the same code (e.g. after a network error).
              if (confirm.isPending) return;
              setMsg(null);
              setTried(code);
              confirm.mutate(code);
            }}
          />
        </ActionRow>
      }>
      {request ? (
        <View style={{ gap: space.md }}>
          {intro ?? (
            <Text variant="body">
              {request.requestedByName || 'A teammate'} asked for this for you. Enter the 6-digit code from your email.
            </Text>
          )}
          <OtpBoxes
            value={code}
            accessibilityLabel="Code from the email"
            error={!!msg && !msg.ok}
            disabled={confirm.isPending}
            onChange={(v) => {
              setCode(v);
              if (v.length < 6) setTried('');
              else submit(v);
            }}
          />
          {msg ? (
            msg.ok ? (
              <View style={styles.okLine} accessibilityLiveRegion="polite">
                <CircleCheck size={14} color={palette.successInk} strokeWidth={2.2} />
                <Text variant="caption" color={palette.successInk} style={styles.shrink}>
                  {msg.text}
                </Text>
              </View>
            ) : (
              <FieldMessage error={msg.text} />
            )
          ) : null}
          <Button
            title="Send a new code"
            variant="text"
            loading={resend.isPending}
            disabled={confirm.isPending}
            onPress={() => resend.mutate()}
            style={{ alignSelf: 'center' }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

// ── "Did you get the money?" ─────────────────────────────────────────────────
export type PaymentAnswer = 'received' | 'not_received';

/**
 * The one way the app asks whether a payment arrived (petty cash here, Expense claims in
 * features/reimbursements/sheets): the amount and what it was for, two big choices (Received / Not
 * received — preselected when a Received / Not received button opened the sheet, otherwise none), an
 * optional note, and the send control named for the answer (a swipe for "Received", which can't be
 * undone; a button for "Not received"). Presentational: the caller sends the answer.
 */
export function PaymentAnswerSheet({
  visible,
  initial,
  amount: value,
  subtitle,
  meta,
  busy,
  error,
  onClose,
  onSend,
}: {
  visible: boolean;
  initial: PaymentAnswer | null;
  amount: number;
  /** What it was for ("TM_CODE · Project", "Food · TM_CODE"). */
  subtitle?: string;
  /** One muted line under the amount (reference, who asked, when Accounts paid). */
  meta?: string | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSend: (answer: PaymentAnswer, note: string) => void;
}) {
  const [choice, setChoice] = useState<PaymentAnswer | null>(initial);
  const [note, setNote] = useState('');
  // Every opening starts from the button that opened it (state adjusted during render).
  const openKey = visible ? `${initial}` : '';
  const [opened, setOpened] = useState(openKey);
  if (openKey !== opened) {
    setOpened(openKey);
    if (visible) {
      setChoice(initial);
      setNote('');
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Did you get the money?"
      subtitle={subtitle || undefined}
      dirty={!!note.trim() && !busy}
      footer={
        // "Received" closes the payment for good, so it is swiped (Payno SwipeToConfirm; a plain button
        // for screen readers and Reduce Motion). "Not received" only asks Accounts to look again.
        choice === 'received' ? (
          <SwipeToConfirm label="Swipe to confirm" buttonLabel="Confirm received" loading={busy} onConfirm={() => onSend('received', note.trim())} />
        ) : (
          <Button
            title={choice === 'not_received' ? 'Report not received' : 'Choose an answer'}
            variant={choice === 'not_received' ? 'danger' : 'primary'}
            icon={choice === 'not_received' ? <X /> : <Check />}
            disabled={!choice}
            loading={busy}
            onPress={() => {
              if (choice) onSend(choice, note.trim());
            }}
          />
        )
      }>
      {/* Read-only: the exact figure (two decimals, so a float like 0.30000000000000004 never leaks in). */}
      <AmountEntry label="Amount" value={amount(value).toFixed(2)} caret={false} helper={meta || undefined} />
      <SelectTiles<PaymentAnswer>
        accessibilityLabel="Did you get the money?"
        columns={2}
        value={choice}
        onChange={setChoice}
        options={[
          { value: 'received', label: 'Received', icon: CircleCheck },
          { value: 'not_received', label: 'Not received', icon: CircleX },
        ]}
      />
      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        counter
        multiline
        placeholder={choice === 'not_received' ? 'e.g. Nothing has come in yet' : 'Anything Accounts should know'}
        hint={choice === 'not_received' ? 'Accounts will follow up.' : 'Confirming closes this payment. You can’t undo it.'}
      />
      {error ? <Banner tone="danger" title="Couldn’t send your answer" message={error} /> : null}
    </Sheet>
  );
}

/** The toast once an answer is saved: the same words for petty cash and expense claims. */
export function showPaymentAnswerToast(answer: PaymentAnswer) {
  if (answer === 'received') toast.show('Marked as received');
  else toast.show('Reported as not received. Accounts will follow up.', 'info');
}

/** "Did you get the money?" for a petty cash request (POST /petty_cash_requests/:id/respond). */
export function PaymentRespondSheet({
  request,
  initial,
  visible,
  onClose,
  onDone,
}: {
  request: PettyCashRequest | null;
  initial: PaymentAnswer | null;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const today = useTodayIst();
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setErr(null);
  }
  // The request stays on the sheet while it fades out after closing (callers clear `request`).
  const [last, setLast] = useState(request);
  if (request && request !== last) setLast(request);
  const shown = request ?? last;

  const send = useMutation({
    mutationFn: async ({ answer, note }: { answer: PaymentAnswer; note: string }) => {
      const r = await respondPettyCashPayment(request!.id, answer, note);
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onSuccess: (_r, { answer }) => {
      haptic.success();
      showPaymentAnswerToast(answer);
      onDone();
    },
    onError: (e: Error) => {
      haptic.error();
      setErr(e.message);
    },
  });

  // The same line as an expense claim's sheet: the payment's reference, or when the payment was sent.
  const sentOn = shown?.processingAt || shown?.paidAt;
  const meta = shown
    ? [shown.onBehalf ? `Asked for you by ${shown.requestedByName || 'a teammate'}` : null, shown.paymentReference ? `Reference ${shown.paymentReference}` : null]
        .filter(Boolean)
        .join(' · ') || (sentOn ? `Payment sent on ${shortDate(sentOn, today)}` : null)
    : null;

  return (
    <PaymentAnswerSheet
      visible={visible && !!request}
      initial={initial}
      amount={amount(shown?.amount)}
      subtitle={shown ? [shown.kekaCode, shown.projectName].filter(Boolean).join(' · ') : undefined}
      meta={meta}
      busy={send.isPending}
      error={err}
      onClose={onClose}
      onSend={(answer, note) => {
        setErr(null);
        send.mutate({ answer, note });
      }}
    />
  );
}

// ── Receipt image viewer ─────────────────────────────────────────────────────
export function ReceiptImageSheet({ dataUrl, title, onClose, onShare }: { dataUrl: string | null; title?: string; onClose: () => void; onShare: () => void }) {
  return (
    <Sheet visible={!!dataUrl} onClose={onClose} title={title || 'Receipt'} footer={<Button title="Share or save" icon={<Share2 />} onPress={onShare} />}>
      {dataUrl ? (
        <Image
          source={{ uri: dataUrl }}
          style={styles.receipt}
          contentFit="contain"
          transition={200}
          accessible
          accessibilityLabel={`Receipt image${title ? `: ${title}` : ''}`}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * An empty, untouchable stand-in for a Screen `footer` while a screen has no action to pin.
 * Screen wraps its content in a KeyboardAvoidingView only when it has a footer, so passing this
 * (instead of `undefined`) keeps the same tree when the ActionBar comes and goes — the scroll position
 * is kept and the entrance doesn't replay. Its height (the home indicator) gives the content the same
 * bottom padding as a Screen without a footer.
 */
export function PettyIdleFooter() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={{ height: insets.bottom }} />;
}

export function useInvalidatePettyCash() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['petty'] });
}

const styles = themedStyles(() => ({
  shrink: { flexShrink: 1 },
  flexText: { flex: 1, minWidth: 0, gap: 2 },

  tag: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 24, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, justifyContent: 'center', flexShrink: 1 },
  tagText: { fontFamily: font.semibold, flexShrink: 1 },

  heroFoot: { gap: space.md },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    // The kit field fill: a white veil in light, the stronger frost in dark.
    backgroundColor: isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.7),
    borderWidth: 1,
    borderColor: withAlpha(palette.ink, 0.07),
  },
  fieldError: { borderWidth: 1.5, borderColor: palette.dangerInk },
  rowError: { borderWidth: 1.5, borderColor: palette.dangerInk },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md },

  okLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receipt: { width: '100%', aspectRatio: 0.75, borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
}));
