// Home tab content — the vendor's status and the ONE next step, nothing else (docs/REFERENCE-COMPONENTS.md
// §3 "Vendor portal": Payno's light summary hero, then "recent transactions"-style lists).
//   Not yet approved: one light SummaryHero "Your registration" with the status pill, a big title
//     saying what happens next ("Finish your registration", "We're checking your details", what
//     Accounts asked to fix), the step progress and one full-width primary pill. Under it, for a
//     registration still being filled in, a "Still to do" list (only the unfinished items; each row
//     opens the registration, where it is done).
//   Approved: the dues hero (DuesHero: what Tamada still owes, as the big light figure, split into
//     "Waiting" (the website's pending bucket) and "To be paid" (approved, not paid yet), with what was
//     already paid on the sub-line), then "To sign" (agreements waiting for the vendor's signature: the one next step) and
//     "Latest bills" (3 rows), each with a "See all" link to its tab.
// Both return ONE View (gap from useLayout) so the Screen's stacking gap applies inside them too.

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowRight, CircleDashed, CircleX, ClipboardList, Hourglass, Receipt, RefreshCw, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Vendor, VENDOR_ME_KEY, type VendorAgreement, type VendorBill } from '@/api/vendor';
import { useNow } from '@/features/attendance/use-now';
import {
  agreementExpired,
  agreementPending,
  BILL_AUTHORIZED,
  BILL_PENDING,
  docLabel,
  EDITABLE_STATUSES,
  fixItemsText,
  GENERATED_DECLARATIONS,
  vendorStatus,
} from '@/features/vendor/constants';
import { dateIN, rupees } from '@/features/vendor/format';
import { initForm, resumeStep, stepsFor } from '@/features/vendor/register-form';
import { AgreementRow, BillRow } from '@/features/vendor/rows';
import { StepProgress } from '@/features/vendor/ui';
import { font, palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  ActivityList,
  ActivityRow,
  Amount,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  shouldStack,
  Skeleton,
  SkeletonList,
  type StackRule,
  StatusPill,
  SummaryHero,
  Text,
  toast,
  TourTarget,
  useLayout,
} from '@/ui';

const amountOf = (b: VendorBill | null | undefined) => {
  const n = Number(b?.version?.amount || 0);
  return Number.isFinite(n) ? n : 0;
};

export const sumBills = (list: VendorBill[]) => (Array.isArray(list) ? list : []).reduce((s, b) => s + amountOf(b), 0);

/** Every bill (API data guarded) split into the website's three buckets. */
export function billBuckets(data: unknown) {
  const all = (Array.isArray(data) ? data : []).filter(Boolean) as VendorBill[];
  return {
    all,
    received: all.filter((b) => b.status === 'received'),
    pending: all.filter((b) => BILL_PENDING.includes(b.status)),
    authorized: all.filter((b) => BILL_AUTHORIZED.includes(b.status)),
  };
}

export const billsWord = (n: number) => `${n} ${n === 1 ? 'bill' : 'bills'}`;

/**
 * The hero's two small figures stack instead of sitting side by side when window width ÷ font scale
 * is under 300 dp (320 dp from about 107 % text, 360 dp above 120 %): under it a "₹13,59,067.50" no
 * longer fits half the card even at the Amount's 70 % shrink.
 */
const FIGURES_STACK: StackRule = { below: 'tiny', text: false, perText: true };

// ── Dues hero (Home + Bills tab) ───────────────────────────────────────────────────
/** One of the two small figures under the hero's big number: dot + label, the amount, a caption. */
function DueFigure({
  label,
  dot,
  amount,
  caption,
  hidden,
  stacked,
}: {
  label: string;
  dot: string;
  amount: number;
  caption: string;
  hidden: boolean;
  stacked: boolean;
}) {
  return (
    <View
      style={stacked ? styles.figureStacked : styles.figure}
      accessible
      accessibilityLabel={hidden ? `${label}: amount hidden, ${caption}` : `${label}: ₹${amount.toLocaleString('en-IN')}, ${caption}`}>
      <View style={styles.figureHead}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text variant="label" muted numberOfLines={1} style={styles.shrink}>
          {label}
        </Text>
      </View>
      {hidden ? (
        <Text variant="heading" color={palette.textFaint} numberOfLines={1}>
          ₹ ••••
        </Text>
      ) : (
        <Amount value={amount} decimals={2} variant="heading" />
      )}
      <Text variant="caption" muted numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

/**
 * Payno's light "Total Due Payments" hero for the vendor: the wallet in a white circle with "Due to
 * you", the money Tamada still owes (waiting for approval + approved but not paid yet — the website's
 * "approved" bucket also holds paid bills, which are left out here) as the huge light figure with greyed paise
 * and an eye that hides every amount on the card (not on a narrow phone, where the figure needs the room), the Vendor ID in the info chip (it is quoted to
 * Accounts, so it never truncates — the chip wraps), what was already paid on the sub-line, and the two
 * parts of the dues ("Waiting" and "To be paid") side by side under a hairline (stacked on a narrow
 * phone with large text). The ↗
 * button opens the Bills tab when `onOpen` is given.
 */
export function DuesHero({
  bills,
  code,
  onOpen,
  tour = false,
}: {
  bills: VendorBill[];
  code?: string | null;
  onOpen?: () => void;
  /** Home's hero: marks the Vendor ID chip for the first-sign-in tour (docs/TOUR.md). */
  tour?: boolean;
}) {
  const l = useLayout();
  const [hidden, setHidden] = useState(false);
  const { received, pending, authorized } = billBuckets(bills);
  const unpaid = authorized.filter((b) => b.status !== 'received');
  const waiting = sumBills(pending);
  const approved = sumBills(unpaid);
  const paid = sumBills(received);
  const stacked = shouldStack(l, FIGURES_STACK);
  // The eye takes ~48 dp beside the figure; on a narrow phone (or with large text) that room goes to the
  // amount instead, so a 7-digit sum with paise still fits at the hero's shrink-to-fit floor.
  const hideable = !shouldStack(l, { below: 'narrow' });
  const isHidden = hideable && hidden;
  return (
    <SummaryHero
      icon={Wallet}
      module="vendor"
      label="Due to you"
      value={waiting + approved}
      currency="₹"
      decimals={2}
      hideable={hideable}
      hidden={isHidden}
      onHiddenChange={setHidden}
      onArrowPress={onOpen}
      arrowLabel="Open your bills"
      info={code ? { label: 'Vendor ID', value: code, accessibilityLabel: `Vendor ID ${code}`, tourId: tour ? 'vendor.vendorId' : undefined } : undefined}
      sub={received.length ? `Paid to you so far • ${isHidden ? '₹ ••••' : rupees(paid)} · ${billsWord(received.length)}` : 'Nothing paid yet'}>
      <View style={styles.rule} />
      <View style={stacked ? styles.splitStacked : styles.split}>
        <DueFigure label="Waiting" dot={palette.warning} amount={waiting} caption={billsWord(pending.length)} hidden={isHidden} stacked={stacked} />
        <View style={stacked ? styles.rule : styles.splitRule} />
        {/* Not "Approved": the Bills filter's Approved (the website's bucket) also holds paid bills. */}
        <DueFigure label="To be paid" dot={palette.success} amount={approved} caption={billsWord(unpaid.length)} hidden={isHidden} stacked={stacked} />
      </View>
    </SummaryHero>
  );
}

// ── Not approved yet ───────────────────────────────────────────────────────────
type HeroCopy = { title: string; body?: string; quote?: string; cta?: string };

function registrationCopy(v: Vendor): HeroCopy {
  const toFix = fixItemsText(v.correction?.items);
  switch (v.status) {
    case 'correction_required':
      return {
        title: 'Fix a few details',
        body: toFix ? `Accounts asked you to fix: ${toFix}.` : 'Accounts asked you to change some details.',
        quote: v.correction?.comments || undefined,
        cta: 'Fix details',
      };
    // The pill already says "Not approved", so the title is the next step.
    case 'rejected':
      return {
        title: 'Update and send again',
        quote: v.rejection?.reason || undefined,
        cta: 'Update details',
      };
    case 'submitted':
    case 'pending_verification':
      return { title: 'We’re checking your details', body: 'Our Accounts team will email you when you’re approved.' };
    case 'inactive':
      return { title: 'Account deactivated', body: 'Contact our Accounts team if you think this is a mistake.' };
    case 'draft':
    case 'mobile_verified':
      return { title: 'Finish your registration', cta: 'Continue registration' };
    default:
      return { title: vendorStatus(v.status).label };
  }
}

type TodoState = 'progress' | 'failed' | 'todo';

/** How a to-do row looks: read at render time, so it follows light / dark. */
function todoLook(state: TodoState) {
  switch (state) {
    case 'progress':
      return { Icon: Hourglass, fg: palette.warningInk, bg: palette.warningSoft, word: 'Started' };
    case 'failed':
      return { Icon: CircleX, fg: palette.dangerInk, bg: palette.dangerSoft, word: 'Needs attention' };
    default:
      return { Icon: CircleDashed, fg: palette.textMuted, bg: palette.surfaceMuted, word: 'To do' };
  }
}

/** The to-do row's leading disc: a soft tint of its state's colour behind the state icon (40 dp). */
function TodoDisc({ state }: { state: TodoState }) {
  const { Icon, fg, bg } = todoLook(state);
  return (
    <View style={[styles.disc, { backgroundColor: bg }]}>
      <Icon size={20} color={fg} strokeWidth={1.8} />
    </View>
  );
}

/**
 * What is still to do on a registration being filled in: the Digio ID and bank check's state, and the
 * documents not uploaded yet (Aadhaar comes from the Digio check, never by hand). Home's "Still to do"
 * list and the first-sign-in tour both read this.
 */
export function registrationTodo(v: Vendor) {
  const identity = v.kyc?.stages?.identity;
  const kycState: TodoState | 'done' =
    identity?.status === 'completed'
      ? 'done'
      : identity?.status === 'in_progress'
        ? 'progress'
        : ['rejected', 'expired', 'failed'].includes(identity?.status ?? '')
          ? 'failed'
          : 'todo';
  const openDocs = (Array.isArray(v.checklist) ? v.checklist : []).filter((c) => c && typeof c.docType === 'string' && !c.uploaded && c.docType !== 'aadhaar');
  return { kycState, openDocs };
}

export function RegistrationHome({ vendor: v }: { vendor: Vendor }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { gap, compact } = useLayout();
  const [refreshing, setRefreshing] = useState(false);
  const st = vendorStatus(v.status);
  const editable = EDITABLE_STATUSES.includes(v.status);
  const underReview = v.status === 'submitted' || v.status === 'pending_verification';
  const filling = v.status === 'draft' || v.status === 'mobile_verified';
  const copy = registrationCopy(v);

  // The same step the wizard opens on, so "Continue" lands exactly where Home says.
  const form = initForm(v);
  const steps = stepsFor(form);
  const nextStep = resumeStep(v, form);

  // Aadhaar is fetched by the Digio check (the "Verify ID and bank" row), never uploaded by hand.
  const { kycState, openDocs } = registrationTodo(v);
  const showTodo = filling && (kycState !== 'done' || openDocs.length > 0);

  async function checkStatus() {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ queryKey: VENDOR_ME_KEY });
      // Nothing changed: say so, or the tap looks like it did nothing.
      if (qc.getQueryState(VENDOR_ME_KEY)?.status === 'success' && qc.getQueryData<Vendor>(VENDOR_ME_KEY)?.status === v.status) toast.show('No change yet. We’ll email you when you’re approved.', 'info');
    } finally {
      setRefreshing(false);
    }
  }

  const openRegister = () => router.push('/portal/register');
  const kycNote =
    kycState === 'progress' ? 'Started. Finish it in Digio.' : kycState === 'failed' ? 'Didn’t go through. Try again.' : 'Takes a few minutes with Digio';

  return (
    <View style={{ gap }}>
      <TourTarget id="vendor.registrationHero" radius={radius.xxl}>
        <SummaryHero
          icon={ClipboardList}
          module="vendor"
          label="Your registration"
          figure={
            <View style={styles.regFigure}>
              <StatusPill label={st.label} tone={st.tone} style={styles.pill} />
              <Text variant="title" accessibilityRole="header">
                {copy.title}
              </Text>
            </View>
          }>
          <View style={styles.regBody}>
            {copy.body || copy.quote || (underReview && v.submittedAt) ? (
              <View style={styles.regText}>
                {copy.body ? (
                  <Text variant="body" muted>
                    {copy.body}
                  </Text>
                ) : null}
                {copy.quote ? (
                  <Text variant="label" muted numberOfLines={3} style={styles.quote}>
                    “{copy.quote}”
                  </Text>
                ) : null}
                {underReview && v.submittedAt ? (
                  <Text variant="label" muted>
                    Sent on {dateIN(v.submittedAt)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {filling ? (
              <TourTarget id="vendor.stepProgress">
                <StepProgress steps={steps} current={nextStep} name />
              </TourTarget>
            ) : null}
            {/* No arrow when compact: 'Continue registration' needs ~227 dp at font scale 1.3. */}
            {editable && copy.cta ? (
              <TourTarget id="vendor.registrationButton" radius={radius.pill}>
                <Button title={copy.cta} icon={compact ? undefined : <ArrowRight />} onPress={openRegister} />
              </TourTarget>
            ) : null}
            {underReview ? (
              <TourTarget id="vendor.checkStatus" radius={radius.pill}>
                <Button title="Check status" variant="ghost" icon={<RefreshCw />} loading={refreshing} onPress={checkStatus} />
              </TourTarget>
            ) : null}
          </View>
        </SummaryHero>
      </TourTarget>

      {showTodo ? (
        <ActivityList title="Still to do">
          {kycState !== 'done' ? (
            <TourTarget key="kyc" id="vendor.todoKyc">
              <ActivityRow
                left={<TodoDisc state={kycState} />}
                title="Verify ID and bank"
                subtitle={kycNote}
                chevron
                onPress={openRegister}
                accessibilityLabel={`Verify ID and bank: ${todoLook(kycState).word}. ${kycNote}. Opens your registration`}
              />
            </TourTarget>
          ) : null}
          {openDocs.map((c, i) => {
            const label = docLabel(c.docType, c.label);
            const note = GENERATED_DECLARATIONS.includes(c.docType) ? 'You’ll sign it during registration' : 'Upload a photo or PDF';
            return (
              <TourTarget key={c.docType} id={i === 0 ? 'vendor.todoDocs' : null}>
                <ActivityRow
                  left={<TodoDisc state="todo" />}
                  title={label}
                  subtitle={note}
                  chevron
                  onPress={openRegister}
                  accessibilityLabel={`${label}: ${todoLook('todo').word}. ${note}. Opens your registration`}
                />
              </TourTarget>
            );
          })}
        </ActivityList>
      ) : null}
    </View>
  );
}

// ── Approved ───────────────────────────────────────────────────────────────────
type QueryLike<T> = { data?: T; isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown };

/** How many rows each Home list shows; "See all" opens the tab with the rest. */
const HOME_ROWS = 3;

export function ApprovedHome({
  bills,
  agreements,
  code,
}: {
  bills: QueryLike<VendorBill[]>;
  agreements: QueryLike<VendorAgreement[]>;
  /** The Vendor ID, shown in the dues hero's info chip. */
  code?: string | null;
}) {
  const router = useRouter();
  const now = useNow();
  const { gap } = useLayout();
  const list = billBuckets(bills.data).all;
  // Only agreements the vendor can still sign; past-deadline ones stay on the Agreements tab.
  const toSign = (Array.isArray(agreements.data) ? agreements.data : []).filter((a) => !!a && agreementPending(a) && !agreementExpired(a, now));

  return (
    <View style={{ gap }}>
      {/* Status (the money), then the action (what waits for a signature), then history (bills). */}
      {bills.isPending ? (
        <Skeleton height={300} radius={radius.xxl} />
      ) : bills.isError ? (
        <ErrorState message={bills.error?.message ?? 'Could not load your bills.'} onRetry={() => void bills.refetch()} />
      ) : list.length ? (
        <TourTarget id="vendor.duesHero" radius={radius.xxl}>
          <DuesHero bills={list} code={code} onOpen={() => router.push('/portal/bills')} tour />
        </TourTarget>
      ) : null}

      {agreements.isError ? (
        <Banner tone="warning" message="Couldn’t check your agreements." action={{ label: 'Try again', onPress: () => void agreements.refetch() }} />
      ) : null}
      {!agreements.isPending && !agreements.isError && toSign.length ? (
        <TourTarget id="vendor.toSign" radius={radius.xl}>
          <ActivityList title="To sign" onSeeAll={() => router.push('/portal/agreements')} seeAllAccessibilityLabel="See all agreements">
            {toSign.slice(0, HOME_ROWS).map((a) => (
              <AgreementRow key={a.id} agreement={a} now={now} showStatus={false} onPress={() => router.push(`/portal/agreements/${a.id}`)} />
            ))}
          </ActivityList>
        </TourTarget>
      ) : null}

      {bills.isPending ? (
        <SkeletonList rows={3} avatar tone="surface" />
      ) : bills.isError ? null : list.length ? (
        <ActivityList title="Latest bills" onSeeAll={() => router.push('/portal/bills')} seeAllAccessibilityLabel="See all bills">
          {list.slice(0, HOME_ROWS).map((b) => (
            <BillRow key={b.id} bill={b} onPress={() => router.push(`/portal/bills/${b.id}`)} />
          ))}
        </ActivityList>
      ) : (
        <EmptyState icon={<Receipt color={palette.textMuted} />} title="No bills yet" message="Bills raised for you by the Tamada team show here." />
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  shrink: { flexShrink: 1 },
  rule: { height: 1, backgroundColor: palette.separator },
  split: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  splitStacked: { gap: space.sm, marginTop: space.sm },
  splitRule: { width: 1, alignSelf: 'stretch', backgroundColor: palette.separator },
  figure: { flex: 1, minWidth: 0, gap: 2 },
  figureStacked: { gap: 2 },
  figureHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  regFigure: { gap: space.xs, alignItems: 'flex-start' },
  pill: { alignSelf: 'flex-start' },
  regBody: { gap: space.md },
  regText: { gap: space.xxs },
  quote: { fontFamily: font.serifItalic },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}));
