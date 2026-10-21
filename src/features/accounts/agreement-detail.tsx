// One vendor agreement: /admin/accounts/agreements/<id>. Facts, the draft and the signatures (each fetched
// only when opened), and the two things a phone can do with it:
//   Extend deadline  ExtendDeadlineModal (dash.html:34379) — the drafter or an overseer, while it waits on
//                    the vendor; default now + 7 days; later than both the current deadline and now. The
//                    vendor is emailed the new date (vendor_agreements.js:314).
//   Countersign      InternalSignAgreementModal (dash.html:34321) — the person named to countersign, once
//                    the vendor has signed: draw or upload, then swipe. Final; the drafter is emailed.
// There is no list GET for one agreement, so it is read from the agreement lists.
// Used by /admin/accounts/agreements/<id> and the Inbox kind `agree-sign` (/inbox/agree-sign/<id>).

import { useMutation } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { CalendarClock, FileDown, FileSignature, FileText, PenLine, Signature } from 'lucide-react-native';
import { useState } from 'react';

import { type AccountsAgreement, countersignAgreement, extendAgreementDeadline, fetchAgreementDraft, fetchAgreementSignature, useAgreements, useBillVendors, usePendingMySignature } from '@/api/accounts';
import { unwrap } from '@/api/client';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { canExtendAgreement, canSeeAgreements } from '@/features/accounts/access';
import { FileSheet, type FileLoad } from '@/features/accounts/ui';
import { useInvalidateAccounts } from '@/features/accounts/use-items';
import { agreementExpired, agreementStatus } from '@/features/accounts/vendor-format';
import { canSignedCopy } from '@/features/docs/access';
import { useCountersigned, useRememberCountersigned, withCountersigned } from '@/features/docs/countersigned';
import { MissingItem } from '@/features/inbox/detail';
import { dateTime, shortDate } from '@/features/petty-cash/logic';
import { type CapturedSignature, SignatureCapture } from '@/features/vendor/agreement';
import { istHmOf, istIsoAt } from '@/lib/ist';
import { istDateOf } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  AccountRow,
  ActionBar,
  Banner,
  Button,
  ConfirmSheet,
  DateField,
  ErrorState,
  FieldMessage,
  LabelledSection,
  NavHeader,
  Screen,
  Section,
  Skeleton,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  Text,
  TimeField,
  toast,
} from '@/ui';

export function AgreementDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const now = useNow();
  const allowed = canSeeAgreements(access);
  const listQ = useAgreements({}, allowed);
  const pendingQ = usePendingMySignature(allowed);
  const vendorsQ = useBillVendors(allowed);
  const invalidate = useInvalidateAccounts();
  const keptQ = useCountersigned(allowed);
  const remember = useRememberCountersigned();
  const [file, setFile] = useState<FileLoad | null>(null);
  const [sheet, setSheet] = useState<'extend' | 'sign' | null>(null);
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [floor, setFloor] = useState(0);
  const [sig, setSig] = useState<CapturedSignature | null>(null);
  const [done, setDone] = useState(false);
  // Once signed it may leave both lists (a colleague who only countersigns never sees it in /mine), so
  // the screen keeps its own copy for the success sheet.
  const [held, setHeld] = useState<AccountsAgreement | null>(null);

  const extend = useMutation({
    mutationFn: (deadlineAt: string) => unwrap(extendAgreementDeadline(String(id), deadlineAt)),
    onSuccess: () => {
      setSheet(null);
      toast.show('Deadline extended. The vendor is emailed the new date.');
    },
    onError: (e) => toast.show((e instanceof Error && e.message) || 'Couldn’t extend it.', 'danger'),
    onSettled: () => void invalidate(),
  });
  const sign = useMutation({
    mutationFn: ({ s }: { s: CapturedSignature; row: AccountsAgreement }) => unwrap(countersignAgreement(String(id), s.signatureType, s.dataUrl)),
    onSuccess: (_r, { row }) => {
      const signedRow: AccountsAgreement = { ...row, status: 'signed', internal_signed_at: new Date().toISOString() };
      setHeld(signedRow);
      // Kept on this phone so a countersigner who isn't the drafter can reopen it later.
      void remember(signedRow);
      setSheet(null);
      setTimeout(() => setDone(true), 400);
    },
    onError: (e) => toast.show((e instanceof Error && e.message) || 'Couldn’t sign it.', 'danger'),
    onSettled: () => void invalidate(),
  });

  if (!allowed) return <Redirect href="/" />;
  const live = withCountersigned([...(listQ.data?.agreements ?? []), ...(pendingQ.data ?? [])], keptQ.data).find((x) => x.id === id) ?? null;
  const a = live && !(held && live.status !== 'signed') ? live : held;
  if (!a) {
    if (listQ.isPending || pendingQ.isPending || keptQ.isPending)
      return (
        <Screen header={<NavHeader title="Agreement" />}>
          <Skeleton height={196} radius={radius.xxl} />
          <Skeleton height={200} radius={radius.xl} />
        </Screen>
      );
    if (listQ.isError && !listQ.data)
      return (
        <Screen header={<NavHeader title="Agreement" />}>
          <ErrorState message={listQ.error?.message || 'Couldn’t load the agreement.'} onRetry={() => void listQ.refetch()} />
        </Screen>
      );
    return <MissingItem title="Agreement" />;
  }

  const vendor = (vendorsQ.data ?? []).find((v) => v.id === a.vendor_id)?.legalEntityName || 'Vendor';
  const st = agreementStatus(a, now);
  const expired = agreementExpired(a, now);
  const isOverseer = !!listQ.data?.isOverseer;
  const mayExtend = canExtendAgreement(access.user, a, isOverseer);
  const maySign = a.status === 'pending_internal_signature' && !!access.user && a.signer_id === access.user.id && !done;
  // vendor_agreements.js:358 emails whoever drafted it — unless that is the person signing.
  const drafterTold = a.created_by && a.created_by === access.user?.id ? 'Nobody else is emailed' : `${a.created_by_name || 'The person who drafted it'} is emailed`;

  const copyAllowed = canSignedCopy(access);
  const openCopy = () => router.push({ pathname: '/admin/docs/agreement/[id]', params: { id: a.id } });

  const openExtend = () => {
    // A passed deadline is the usual reason to be here, so the new one is measured from now.
    const base = Math.max(Date.parse(a.deadline_at || '') || 0, Date.now());
    const next = new Date(base + 7 * 86400000).toISOString();
    setFloor(base);
    setDay(istDateOf(next) || today);
    setTime(istHmOf(next) || '18:00');
    setSheet('extend');
  };
  const chosen = day && time ? istIsoAt(day, time) : '';
  const chosenMs = chosen ? Date.parse(chosen) : NaN;
  const extendError = !chosen || !Number.isFinite(chosenMs) ? 'Pick a date and a time.' : chosenMs <= floor ? (expired ? 'Pick a time in the future.' : 'Pick a time later than the current deadline.') : null;

  return (
    <>
      <Screen
        header={<NavHeader title="Agreement" />}
        onRefresh={() => invalidate()}
        footer={
          maySign ? (
            <ActionBar note={sig ? null : 'Sign in the box above first.'}>
              <Button title="Countersign" icon={<Signature />} disabled={!sig} onPress={() => setSheet('sign')} />
            </ActionBar>
          ) : mayExtend ? (
            <ActionBar>
              <Button title="Extend deadline" icon={<CalendarClock />} variant={expired ? 'primary' : 'ghost'} onPress={openExtend} />
            </ActionBar>
          ) : undefined
        }>
        <SummaryHero
          icon={FileSignature}
          module="vendor"
          label={st.label}
          figure={
            <Text variant="title" numberOfLines={3}>
              {a.project_name}
            </Text>
          }
          sub={vendor}
          info={a.deadline_at && a.status === 'pending_signature' ? { label: expired ? 'Was due' : 'Sign by', value: dateTime(a.deadline_at, today) } : undefined}
        />
        {expired ? <Banner tone="danger" title="The deadline has passed" message="The vendor can’t sign until the deadline is extended." /> : null}
        {done ? <Banner tone="success" title="Signed" message={`${drafterTold}.`} /> : null}

        <SummaryCard
          title="Details"
          hideEmpty
          rows={[
            { key: 'vendor', label: 'Vendor', value: vendor },
            { key: 'code', label: 'Project code', value: a.keka_code || null },
            { key: 'by', label: 'Drafted by', value: a.created_by_name || null, hint: shortDate(a.created_at, today) },
            { key: 'signer', label: 'Countersigner', value: a.signer_name || 'None — vendor only' },
            { key: 'vsigned', label: 'Vendor signed', value: a.signed_at ? dateTime(a.signed_at, today) : null, hint: a.signature_reference ? `Ref ${a.signature_reference}` : null },
            { key: 'isigned', label: 'Countersigned', value: a.internal_signed_at ? dateTime(a.internal_signed_at, today) : null, hint: a.internal_signature_reference ? `Ref ${a.internal_signature_reference}` : null },
          ]}
        />

        <LabelledSection title="Files" style={styles.files}>
          <AccountRow icon={FileText} module="vendor" title="Agreement" sub={a.draft_file_name || 'PDF'} actionLabel="Open" onPress={() => setFile({ title: 'Agreement', load: () => fetchAgreementDraft(a.id) })} />
          {a.signed_at ? <AccountRow icon={PenLine} module="vendor" title="Vendor’s signature" sub={dateTime(a.signed_at, today)} actionLabel="View" onPress={() => setFile({ title: 'Vendor’s signature', load: () => fetchAgreementSignature(a.id) })} /> : null}
          {a.signed_at && copyAllowed ? <AccountRow icon={FileDown} module="vendor" title="Signed copy" sub="One PDF with every signature" actionLabel="Open" onPress={openCopy} /> : null}
          {a.internal_signed_at ? <AccountRow icon={Signature} module="vendor" title="Countersignature" sub={a.signer_name || ''} actionLabel="View" onPress={() => setFile({ title: 'Countersignature', load: () => fetchAgreementSignature(a.id, true) })} /> : null}
        </LabelledSection>

        {maySign ? (
          <Section title="Your signature">
            <Text variant="label" muted>
              The vendor has signed. Yours goes on the spot marked for you. Open the agreement first to read it.
            </Text>
            <SignatureCapture value={sig} onChange={setSig} disabled={sign.isPending} />
          </Section>
        ) : null}
      </Screen>

      <ConfirmSheet
        visible={sheet === 'extend'}
        onClose={() => setSheet(null)}
        title="Extend the deadline"
        confirmLabel="Swipe to extend"
        onConfirm={() => chosen && extend.mutate(new Date(chosenMs).toISOString())}
        loading={extend.isPending}
        disabled={!!extendError}
        note="The vendor is emailed the new date.">
        <SummaryCard rows={[{ key: 'now', label: 'Now', value: a.deadline_at ? dateTime(a.deadline_at, today) : '—', hint: expired ? 'Passed' : null }]} />
        <DateField label="New date" value={day} onChange={setDay} minimumDate={today} />
        <TimeField label="Time" value={time} onChange={setTime} />
        <FieldMessage error={extendError} />
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'sign'}
        onClose={() => setSheet(null)}
        title="Countersign this agreement?"
        from={{ title: vendor, subtitle: 'Signed', icon: PenLine, module: 'vendor' }}
        to={{ title: 'You', subtitle: 'Countersign', avatar: { name: access.user?.name || 'You' } }}
        confirmLabel="Swipe to sign"
        onConfirm={() => sig && sign.mutate({ s: sig, row: a })}
        loading={sign.isPending}
        disabled={!sig}
        note={`This is final. ${drafterTold} that it is signed.`}>
        <SummaryCard rows={[{ key: 'p', label: 'Agreement', value: a.project_name }, { key: 'c', label: 'Project code', value: a.keka_code || '—' }]} />
      </ConfirmSheet>

      <SuccessSheet
        visible={done}
        onClose={() => setDone(false)}
        title="Agreement signed"
        subtitle={`${drafterTold}. The signed copy is ready to open.`}
        primaryLabel={copyAllowed ? 'Open the signed copy' : undefined}
        onPrimary={
          copyAllowed
            ? () => {
                setDone(false);
                openCopy();
              }
            : undefined
        }
        secondaryLabel="Back to agreements"
        onSecondary={() => {
          setDone(false);
          router.back();
        }}
      />
      <FileSheet file={file} onClose={() => setFile(null)} />
    </>
  );
}

const styles = themedStyles(() => ({
  files: { gap: space.sm },
}));
