// Leave types and rules — the website's Leave setup "Leave types" and "Leave settings" cards
// (dash.html LeaveSetup ~L4886): GET/POST /hr/leave/types, PUT/DELETE /hr/leave/types/:id and
// GET/PUT /hr/leave/settings (hr_leave.js ~L99–178). Super Admin and HR with Leave on.
//
// Types as Lendora MetricRows (days a year, how they build up, Paid / Unpaid); tap to change, + to
// add. Retiring a type has no way back (the server has no un-retire), so it goes through
// ConfirmSheet + SwipeToConfirm. The rules are one sheet with one Save — not the website's
// save-on-blur, so a phone keyboard never writes by surprise. Balances are calculated, not stored:
// the sheets say when a change moves everyone's balance. Nobody is messaged.

import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type LeaveSettings, type LeaveType, useLeaveSettings, useLeaveTypes } from '@/api/leave';
import { useLeaveSetupActions } from '@/api/hrtime';
import { errorText, fmtDays, GateFallback, intOf, NumberField, Stepper, ToggleRow, useHrTimeGate, noun } from '@/features/hrtime/ui';
import { MONTHS_LONG } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  ActionRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  MetricRow,
  NavHeader,
  PillButton,
  PillField,
  Screen,
  SectionHeader,
  Segmented,
  SelectField,
  Sheet,
  Skeleton,
  SkeletonList,
  SummaryCard,
  Text,
  toast,
} from '@/ui';

const BLANK: Omit<LeaveType, 'id'> = { code: '', name: '', paid: true, annual_quota: 12, accrual: 'annual', carry_forward_max: 0, allow_half_day: true, is_comp_off: false };

export default function LeaveSetupScreen() {
  const { pending, allowed } = useHrTimeGate('leave');
  const types = useLeaveTypes(allowed);
  const settings = useLeaveSettings(allowed);
  const [edit, setEdit] = useState<{ type: LeaveType | null; key: number } | null>(null);
  const [rulesKey, setRulesKey] = useState<number | null>(null);
  const header = (
    <NavHeader title="Leave types and rules" actions={allowed ? [{ icon: Plus, label: 'New leave type', onPress: () => setEdit({ type: null, key: Date.now() }) }] : undefined} />
  );
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const list = (Array.isArray(types.data?.types) ? types.data.types : []).filter((t) => t && t.id);
  const s = settings.data?.settings;
  const hasCompOff = list.some((t) => t.is_comp_off);

  return (
    <Screen header={header} onRefresh={() => Promise.all([types.refetch(), settings.refetch()])}>
      <SectionHeader title="Leave types" />
      {types.isPending ? (
        <SkeletonList rows={4} tone="surface" />
      ) : types.error && !list.length ? (
        <ErrorState message={errorText(types.error)} onRetry={() => void types.refetch()} />
      ) : !list.length ? (
        <Card tone="surface">
          <EmptyState
            icon={<CalendarDays color={moduleTone.leave.fg} strokeWidth={1.8} />}
            title="No leave types yet"
            message="Nobody can apply for leave until you add one."
            action={<Button title="New leave type" icon={<Plus />} onPress={() => setEdit({ type: null, key: Date.now() })} />}
          />
        </Card>
      ) : (
        <View style={styles.list}>
          {list.map((t) => (
            <MetricRow
              key={t.id}
              module="leave"
              label={`${t.name} · ${t.code}`}
              value={t.is_comp_off ? 'Earned' : !t.paid && !t.annual_quota ? 'No limit' : fmtDays(t.annual_quota)}
              unit={t.is_comp_off || (!t.paid && !t.annual_quota) ? undefined : 'a year'}
              sub={
                t.is_comp_off
                  ? `Earned by working a day off${s ? ` · lasts ${s.compOffExpiryDays} days` : ''}`
                  : [t.accrual === 'monthly' ? 'Builds up monthly' : 'All at year start', t.carry_forward_max > 0 ? `carry up to ${fmtDays(t.carry_forward_max)}` : 'no carry forward', t.allow_half_day ? 'half days' : null]
                      .filter(Boolean)
                      .join(' · ')
              }
              status={{ label: t.paid ? 'Paid' : 'Unpaid', tone: t.paid ? 'done' : 'neutral' }}
              onPress={() => setEdit({ type: t, key: Date.now() })}
              hint="Opens the leave type to change or retire it"
            />
          ))}
        </View>
      )}

      {settings.isPending ? (
        <Skeleton height={260} radius={radius.xl} />
      ) : settings.error || !s ? (
        <ErrorState message={errorText(settings.error)} onRetry={() => void settings.refetch()} />
      ) : (
        <SummaryCard
          title="Rules"
          right={<PillButton label="Change" icon={<Pencil size={14} color={palette.text} />} chevron={false} onPress={() => setRulesKey(Date.now())} />}
          rows={[
            { label: 'Leave year starts', value: `1 ${MONTHS_LONG[s.leaveYearStartMonth - 1] ?? 'January'}` },
            { label: 'Requests may go back', value: `${s.backdateDays} ${noun(s.backdateDays, 'day')}` },
            { label: 'Longest single request', value: `${s.maxSpanDays} ${noun(s.maxSpanDays, 'day')}` },
            { label: 'Comp-off lasts', value: `${s.compOffExpiryDays} ${noun(s.compOffExpiryDays, 'day')}` },
            { label: 'Claim comp-off within', value: `${s.compOffClaimWindowDays} ${noun(s.compOffClaimWindowDays, 'day')} of the day worked` },
          ]}
        />
      )}

      {edit ? <TypeSheet key={edit.key} type={edit.type} compOffTaken={hasCompOff} onClose={() => setEdit(null)} /> : null}
      {rulesKey && s ? <RulesSheet key={rulesKey} settings={s} onClose={() => setRulesKey(null)} /> : null}
    </Screen>
  );
}

function TypeSheet({ type, compOffTaken, onClose }: { type: LeaveType | null; compOffTaken: boolean; onClose: () => void }) {
  const { saveType, retireType } = useLeaveSetupActions();
  const start = type ?? BLANK;
  const [code, setCode] = useState(start.code);
  const [name, setName] = useState(start.name);
  const [quota, setQuota] = useState(start.annual_quota);
  const [accrual, setAccrual] = useState<LeaveType['accrual']>(start.accrual);
  const [carry, setCarry] = useState(start.carry_forward_max);
  const [paid, setPaid] = useState(start.paid);
  const [halfDays, setHalfDays] = useState(start.allow_half_day);
  const [compOff, setCompOff] = useState(start.is_comp_off);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const saving = saveType.isPending;
  const dirty =
    code !== start.code || name !== start.name || quota !== start.annual_quota || accrual !== start.accrual || carry !== start.carry_forward_max || paid !== start.paid || halfDays !== start.allow_half_day || compOff !== start.is_comp_off;
  const movesBalances = !!type && (quota !== type.annual_quota || accrual !== type.accrual);

  const submit = async () => {
    setError(null);
    try {
      await saveType.mutateAsync({
        id: type?.id,
        input: { code: code.trim().toUpperCase(), name: name.trim(), paid, annual_quota: compOff ? 0 : quota, accrual, carry_forward_max: compOff ? 0 : carry, allow_half_day: halfDays, is_comp_off: compOff },
      });
      toast.show(type ? 'Leave type saved.' : 'Leave type added.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const retire = async () => {
    if (!type) return;
    try {
      await retireType.mutateAsync(type.id);
      setConfirm(false);
      toast.show(`${type.name} retired.`);
      onClose();
    } catch (e) {
      setConfirm(false);
      setError(errorText(e));
    }
  };

  return (
    <>
      <Sheet
        visible={!confirm}
        onClose={saving ? () => {} : onClose}
        dirty={dirty && !saving}
        title={type ? `Change ${type.name}` : 'New leave type'}
        footer={
          <>
            {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
            {movesBalances ? <Banner tone="warning" message="Changing the days or how they build up changes everyone’s balance straight away." /> : null}
            <ActionRow context="sheet">
              {type ? <Button title="Retire" variant="danger" icon={<Trash2 />} onPress={() => setConfirm(true)} disabled={saving} /> : null}
              <Button title={type ? 'Save' : 'Add leave type'} loading={saving} disabled={!dirty} onPress={() => void submit()} />
            </ActionRow>
          </>
        }>
        <PillField label="Short code" value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} maxLength={12} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. CL" hint="2–12 capital letters or digits, starting with a letter." />
        <PillField label="Name" value={name} onChangeText={setName} maxLength={60} placeholder="e.g. Casual leave" />
        {!type ? (
          <Card tone="surface" style={styles.toggles}>
            <ToggleRow
              label="Comp-off type"
              sub={compOffTaken ? 'There is already a comp-off type.' : 'Earned by working a weekly off or holiday. Only one can exist.'}
              value={compOff}
              onChange={(v) => setCompOff(v)}
              disabled={compOffTaken && !compOff}
            />
          </Card>
        ) : null}
        {compOff ? (
          <Text variant="caption" muted>
            Comp-off has no yearly days and no carry forward: people earn it day by day.
          </Text>
        ) : (
          <>
            <Stepper label="Days a year" value={quota} onChange={setQuota} unit={noun(quota, 'day')} />
            <View style={styles.group}>
              <Text variant="labelStrong" muted>
                How the days build up
              </Text>
              <Segmented
                options={[
                  { key: 'annual', label: 'At year start' },
                  { key: 'monthly', label: 'Monthly' },
                ]}
                value={accrual}
                onChange={(k) => setAccrual(k as LeaveType['accrual'])}
              />
              <Text variant="caption" muted>
                {accrual === 'monthly' ? 'One twelfth of the days each month.' : 'All the days on the first day of the leave year.'}
              </Text>
            </View>
            <Stepper label="Carry forward up to" value={carry} onChange={setCarry} unit={noun(carry, 'day')} hint="Unused days moved into next year, at most this many. 0 = none." />
          </>
        )}
        <Card tone="surface" style={styles.toggles}>
          <ToggleRow label="Paid" sub={paid ? 'Counts against the balance.' : 'Loss of pay: never limited by a balance.'} value={paid} onChange={setPaid} />
          <ToggleRow label="Half days allowed" value={halfDays} onChange={setHalfDays} />
        </Card>
      </Sheet>
      {type ? (
        <ConfirmSheet
          visible={confirm}
          onClose={() => setConfirm(false)}
          title={`Retire ${type.name}?`}
          from={{ title: type.name, subtitle: type.code, icon: CalendarDays, module: 'leave' }}
          to={{ title: 'Retired', subtitle: 'History kept' }}
          detailsTitle="What happens"
          confirmLabel="Swipe to retire"
          onConfirm={() => void retire()}
          loading={retireType.isPending}
          note="Nobody is messaged.">
          <SummaryCard
            rows={[
              { label: 'New requests', value: 'Can’t use this type' },
              { label: 'Past requests', value: 'Kept as they are' },
              { label: 'Undo', value: 'Not possible, in the app or on the website' },
            ]}
          />
        </ConfirmSheet>
      ) : null}
    </>
  );
}

function RulesSheet({ settings: s, onClose }: { settings: LeaveSettings; onClose: () => void }) {
  const { saveRules } = useLeaveSetupActions();
  const [month, setMonth] = useState(String(s.leaveYearStartMonth));
  const [backdate, setBackdate] = useState(String(s.backdateDays));
  const [span, setSpan] = useState(String(s.maxSpanDays));
  const [expiry, setExpiry] = useState(String(s.compOffExpiryDays));
  const [claim, setClaim] = useState(String(s.compOffClaimWindowDays));
  const [error, setError] = useState<string | null>(null);
  const saving = saveRules.isPending;
  const patch = {
    leaveYearStartMonth: Number(month),
    backdateDays: intOf(backdate),
    maxSpanDays: intOf(span),
    compOffExpiryDays: intOf(expiry),
    compOffClaimWindowDays: intOf(claim),
  };
  const dirty = (Object.keys(patch) as (keyof LeaveSettings)[]).some((k) => patch[k] !== s[k]);
  const submit = async () => {
    setError(null);
    if (Object.values(patch).some((v) => v == null)) return setError('Fill in every number.');
    try {
      await saveRules.mutateAsync(patch as LeaveSettings);
      toast.show('Leave rules saved.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Sheet
      visible
      onClose={saving ? () => {} : onClose}
      dirty={dirty && !saving}
      title="Leave rules"
      footer={
        <>
          {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
          {Number(month) !== s.leaveYearStartMonth ? (
            <Banner tone="warning" message="Moving the start of the leave year recalculates everyone’s balance." />
          ) : null}
          <ActionRow context="sheet">
            <Button title="Cancel" variant="accent" onPress={onClose} disabled={saving} />
            <Button title="Save rules" loading={saving} disabled={!dirty} onPress={() => void submit()} />
          </ActionRow>
        </>
      }>
      <SelectField
        label="Leave year starts on 1"
        value={month}
        onChange={setMonth}
        options={MONTHS_LONG.map((m, i) => ({ value: String(i + 1), label: m }))}
      />
      <NumberField label="Requests may go back" value={backdate} onChange={setBackdate} unit="days" hint="0 to 365. How far in the past a request may start." />
      <NumberField label="Longest single request" value={span} onChange={setSpan} unit="days" hint="1 to 366 calendar days." />
      <NumberField label="Comp-off lasts" value={expiry} onChange={setExpiry} unit="days" hint="1 to 730 days after the day worked." />
      <NumberField label="Claim comp-off within" value={claim} onChange={setClaim} unit="days" hint="1 to 365 days after the day worked." />
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  list: { gap: space.sm },
  group: { gap: space.xs },
  toggles: { paddingVertical: space.xs, paddingHorizontal: space.xs },
}));
