// "Invite a guest" (web: VisitorInvites form). The guest gets a 6-digit code on WhatsApp; at reception
// they enter it, take a photo and are checked in already approved. Same fields, same checks and the
// same request as the web: POST /visitors/invites { guestName, guestMobile, visitDate, timeFrom,
// timeTo, purpose }.
//
// useInviteForm() holds the state and the flow: "Review invite" (the screen's sticky bar) checks the
// fields, then a ConfirmSheet (You → the guest, the visit as a SummaryCard) sends it with a swipe, then
// a SuccessSheet shows the guest's code in OtpBoxes with Share pass / Done. <InviteFields> draws the
// form: PillFields for the guest, SelectTiles for the day (Today / Tomorrow / Other day) and the time
// (Any time / Set a time). A server error is an Alert over the confirm sheet, so it can be retried.

import { CalendarDays, Clock, MessageSquareText, Phone, Sun, Sunrise, Timer, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { type InviteCreated, useCreateInvite } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { dateLabel, mobileOk, phoneLabel, timeWindow } from '@/features/visitors/format';
import { CodeBoxes } from '@/features/visitors/invites';
import { todayIst } from '@/lib/dates';
import { space } from '@/theme/tokens';
import {
  ConfirmSheet,
  DateField,
  FieldMessage,
  FieldPair,
  haptic,
  PillField,
  SectionHeader,
  SelectTiles,
  shouldStack,
  SuccessSheet,
  SummaryCard,
  Text,
  TimeField,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

type FormErrors = { guestName?: string; guestMobile?: string; visitDate?: string; timeTo?: string };

// Exactly the InviteInput the server takes — nothing else is sent.
const blankForm = (day: string) => ({ guestName: '', guestMobile: '', visitDate: day, timeFrom: '', timeTo: '', purpose: '' });
type InviteFormValues = ReturnType<typeof blankForm>;

/** Wait for one sheet's close before the next opens (iOS can't present a Modal while one is closing). */
export const SHEET_SWAP_MS = 380;

/** 'YYYY-MM-DD' + n days (calendar arithmetic in UTC, so no timezone can shift it). */
function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function useInviteForm() {
  const today = useTodayIst();
  const [form, setForm] = useState(() => blankForm(today));
  const [errors, setErrors] = useState<FormErrors>({});
  // What the confirm sheet shows and sends: a copy taken when it opens.
  const [review, setReview] = useState<InviteFormValues | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [made, setMade] = useState<InviteCreated | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  // Bumped after each invite, so the form's own choices (day and time tiles) start over too.
  const [round, setRound] = useState(0);
  const create = useCreateInvite();

  const edit = (patch: Partial<InviteFormValues>) => {
    setForm((f) => ({ ...f, ...patch }));
    // A new From time can fix "To is before From" too.
    const keys = [...Object.keys(patch), ...('timeFrom' in patch ? ['timeTo'] : [])] as (keyof FormErrors)[];
    if (keys.some((k) => errors[k])) {
      setErrors((e) => {
        const next = { ...e };
        for (const k of keys) delete next[k];
        return next;
      });
    }
  };

  /** "Review invite": the web's checks, then the confirm sheet. */
  const submit = () => {
    if (create.isPending) return;
    const next: FormErrors = {};
    if (!form.guestName.trim()) next.guestName = 'Enter your guest’s name.';
    if (!mobileOk(form.guestMobile)) next.guestMobile = 'Enter a 10-digit mobile number.';
    if (!form.visitDate || form.visitDate < today) next.visitDate = 'Pick today or a later date.';
    if (form.timeFrom && form.timeTo && form.timeTo <= form.timeFrom) next.timeTo = 'Pick a time after the From time.';
    setErrors(next);
    if (Object.keys(next).length) {
      haptic.warning();
      return;
    }
    setReview(form);
    setConfirmOpen(true);
  };

  /** The swipe: send the reviewed invite; on success the confirm sheet gives way to the code. */
  const send = () => {
    if (!review || create.isPending) return;
    create.mutate(review, {
      onSuccess: (r) => {
        setMade(r);
        setForm(blankForm(todayIst()));
        setRound((n) => n + 1);
        setConfirmOpen(false);
        setTimeout(() => setDoneOpen(true), SHEET_SWAP_MS);
      },
      onError: (e) => {
        haptic.error();
        Alert.alert('Couldn’t send the invite', e.message || 'Try again.');
      },
    });
  };

  return {
    form,
    edit,
    errors,
    today,
    round,
    submit,
    send,
    review,
    confirmOpen,
    closeConfirm: () => {
      if (!create.isPending) setConfirmOpen(false);
    },
    made,
    doneOpen,
    closeDone: () => setDoneOpen(false),
    busy: create.isPending,
  };
}

export type InviteFormState = ReturnType<typeof useInviteForm>;

type DayChoice = 'today' | 'tomorrow' | 'other';
type TimeChoice = 'any' | 'set';

/** The invitation fields, single column: who is coming, then when. The submit lives in the screen's ActionBar. */
export function InviteFields({ state }: { state: InviteFormState }) {
  const { form, edit, errors, today } = state;
  const l = useLayout();
  const tomorrow = addDays(today, 1);
  const [dayPick, setDayPick] = useState<DayChoice | null>(null);
  const [timePick, setTimePick] = useState<TimeChoice | null>(null);
  // The tiles follow the form's values; "Other day" / "Set a time" stay chosen while the fields under them are filled in.
  const day: DayChoice = dayPick === 'other' ? 'other' : form.visitDate === today ? 'today' : form.visitDate === tomorrow ? 'tomorrow' : 'other';
  const time: TimeChoice = form.timeFrom || form.timeTo || timePick === 'set' ? 'set' : 'any';
  // FieldPair only stacks below 340 dp; at 360 dp with large text a half-width field would cut
  // "10:00 AM" to "10:00 …", so stack them here too.
  const largeText = shouldStack(l, { text: 'large' });
  const fromField = <TimeField label="From" value={form.timeFrom || null} placeholder="Pick a time" onChange={(v) => edit({ timeFrom: v })} />;
  const toField = <TimeField label="To" value={form.timeTo || null} placeholder="Pick a time" onChange={(v) => edit({ timeTo: v })} error={errors.timeTo} />;

  return (
    <View style={{ gap: l.gap + space.xs }}>
      <View style={styles.group}>
        <SectionHeader title="Who’s coming" />
        <PillField
          icon={UserRound}
          label="Guest name"
          placeholder="Full name"
          value={form.guestName}
          maxLength={120}
          onChangeText={(v) => edit({ guestName: v })}
          autoCapitalize="words"
          textContentType="name"
          returnKeyType="next"
          error={errors.guestName}
        />
        <PillField
          icon={Phone}
          label="Mobile number"
          placeholder="10-digit mobile"
          value={form.guestMobile}
          maxLength={16}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          onChangeText={(v) => edit({ guestMobile: v })}
          error={errors.guestMobile}
          hint="They get a 6-digit check-in code on WhatsApp."
        />
      </View>

      <View style={styles.group}>
        <SectionHeader title="When" />
        <SelectTiles<DayChoice>
          accessibilityLabel="Visit day"
          value={day}
          onChange={(v) => {
            setDayPick(v);
            if (v === 'today') edit({ visitDate: today });
            else if (v === 'tomorrow') edit({ visitDate: tomorrow });
          }}
          options={[
            { value: 'today', label: 'Today', icon: Sun, sub: dateLabel(today, today) },
            { value: 'tomorrow', label: 'Tomorrow', icon: Sunrise, sub: dateLabel(tomorrow, today) },
            { value: 'other', label: 'Other day', icon: CalendarDays, sub: day === 'other' && form.visitDate ? dateLabel(form.visitDate, today) : 'Pick a date' },
          ]}
        />
        {day === 'other' ? (
          <DateField label="Visit date" value={form.visitDate} minimumDate={today} onChange={(v) => edit({ visitDate: v })} error={errors.visitDate} />
        ) : errors.visitDate ? (
          <FieldMessage error={errors.visitDate} />
        ) : null}
        <SelectTiles<TimeChoice>
          accessibilityLabel="Visit time"
          value={time}
          onChange={(v) => {
            setTimePick(v);
            if (v === 'any') edit({ timeFrom: '', timeTo: '' });
          }}
          options={[
            { value: 'any', label: 'Any time', icon: Clock, sub: 'During the day' },
            { value: 'set', label: 'Set a time', icon: Timer, sub: time === 'set' ? timeWindow(form.timeFrom, form.timeTo) || 'From – to' : 'From – to' },
          ]}
        />
        {time === 'set' ? (
          largeText ? (
            <View style={styles.group}>
              {fromField}
              {toField}
            </View>
          ) : (
            <FieldPair>
              {fromField}
              {toField}
            </FieldPair>
          )
        ) : null}
        <PillField
          icon={MessageSquareText}
          label="Reason for visit (optional)"
          placeholder="Interview, delivery, meeting…"
          value={form.purpose}
          maxLength={200}
          onChangeText={(v) => edit({ purpose: v })}
        />
      </View>
    </View>
  );
}

/** Confirm: You → the guest, the visit as a SummaryCard, "Swipe to send invite". */
export function InviteConfirmSheet({ state }: { state: InviteFormState }) {
  const me = useSession((s) => s.user?.name) || '';
  const r = state.review;
  const guest = r?.guestName.trim() || 'Guest';
  const win = r ? timeWindow(r.timeFrom, r.timeTo) : '';
  return (
    <ConfirmSheet
      visible={state.confirmOpen}
      onClose={state.closeConfirm}
      title="Send this invite?"
      from={{ title: 'You', subtitle: me || 'Host', avatar: { name: me || 'You' } }}
      to={{ title: guest, subtitle: r ? phoneLabel(r.guestMobile) : undefined, avatar: { name: guest } }}
      detailsTitle="Visit details"
      confirmLabel="Swipe to send invite"
      onConfirm={state.send}
      loading={state.busy}
      note="They get a 6-digit code on WhatsApp.">
      <SummaryCard
        hideEmpty
        rows={[
          { label: 'Date', value: r ? dateLabel(r.visitDate, state.today) : null },
          { label: 'Time', value: win || 'Any time' },
          { label: 'Reason', value: r?.purpose.trim() || null },
        ]}
      />
    </ConfirmSheet>
  );
}

/** Done: the guest's code in OtpBoxes, with Share pass (secondary) and Done (primary). */
export function InviteDoneSheet({
  state,
  sharing,
  onShare,
  onDone,
}: {
  state: InviteFormState;
  sharing: boolean;
  onShare: () => void;
  onDone: () => void;
}) {
  const made = state.made;
  return (
    <SuccessSheet
      visible={state.doneOpen && !!made}
      onClose={state.closeDone}
      title="Invite sent"
      subtitle={made ? `${made.guestName || 'Your guest'} · ${dateLabel(made.visitDate, state.today)}` : undefined}
      secondaryLabel={sharing ? 'Getting pass…' : 'Share pass'}
      onSecondary={onShare}
      primaryLabel="Done"
      onPrimary={onDone}>
      {made ? (
        <View style={styles.code}>
          <CodeBoxes code={made.code} />
          <Text variant="caption" muted align="center">
            We sent the code on WhatsApp. If it doesn’t arrive, share the pass.
          </Text>
        </View>
      ) : null}
    </SuccessSheet>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.md },
  code: { gap: space.sm },
}));
