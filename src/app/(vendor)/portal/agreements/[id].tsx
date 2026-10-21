// /portal/agreements/[id] — read, e-sign and open one agreement (web SignAgreementModal +
// SignedAgreementView). Signing = one drawn or uploaded signature + a fresh WhatsApp code to the
// vendor's own number, then POST /vendor/agreements/:id/sign { signatureType, signatureFileData,
// proofToken }. One tap on the PDF row hands it to the phone's PDF app via the share sheet. The website's
// "Download Signed Agreement" (a PDF re-rendered with pdf.js + jsPDF) has no Expo Go equivalent;
// the signature image and reference number are shown here instead.
//
// State first (Payno's light SummaryHero: the project name, the status pill and the deadline), then the
// action — 1. read the agreement, 2. add your signature, then "Sign agreement" in the sticky bar (its
// note says what is missing or how the confirmation works) — then, once signed, the record (signature
// image, reference and Tamada's own signature; the signed time is in the hero only). A good signature
// ends in Payno's SuccessSheet ("Agreement signed", with the reference and who was told). At most one
// notice at a time.

import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { FileSignature, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { isApiError } from '@/api/client';
import { signAgreement, useVendorAgreements, useVendorMe } from '@/api/vendor';
import { useNow } from '@/features/attendance/use-now';
import { type CapturedSignature, countersignText, mySpotsText, RecordedSignature, SignatureCapture } from '@/features/vendor/agreement';
import { agreementExpired, agreementSigned } from '@/features/vendor/constants';
import { FileRow, openAgreementDraft } from '@/features/vendor/files';
import { dateIN, dateTimeIN, prettyPhone } from '@/features/vendor/format';
import { OtpConfirmSheet } from '@/features/vendor/otp-sheet';
import { InfoRows, SectionCard } from '@/features/vendor/ui';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  haptic,
  NavHeader,
  Screen,
  Skeleton,
  StatusPill,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  Text,
  useLayout,
} from '@/ui';

export default function VendorAgreementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const now = useNow();
  const { gap } = useLayout();
  const me = useVendorMe();
  const approved = me.data?.status === 'approved';
  const q = useVendorAgreements(approved);
  const a = (Array.isArray(q.data) ? q.data : []).find((x) => !!x && x.id === id);

  const [opening, setOpening] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sig, setSig] = useState<CapturedSignature | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The SuccessSheet after a good signature; it stays up (with the fresh reference) until closed.
  const [justSigned, setJustSigned] = useState(false);

  async function finalize(proofToken: string) {
    setOtpOpen(false);
    if (!a || !sig) return;
    setSigning(true);
    setError(null);
    const r = await signAgreement(a.id, { signatureType: sig.signatureType, signatureFileData: sig.dataUrl, proofToken });
    setSigning(false);
    if (isApiError(r)) {
      haptic.error();
      return setError(r.error);
    }
    haptic.success();
    setSig(null);
    // Refresh first, so the SuccessSheet opens with the new reference (and well after the code sheet closed).
    await qc.invalidateQueries({ queryKey: ['vendor', 'agreements'] });
    setJustSigned(true);
  }

  async function openDraft() {
    if (!a || opening) return;
    setOpening(true);
    setFileError(null);
    const err = await openAgreementDraft(a.id, a.draft_file_name || 'Agreement');
    setOpening(false);
    if (err) setFileError(err);
  }

  const signed = !!a && agreementSigned(a);
  const pending = !!a && a.status === 'pending_signature';
  const expired = !!a && pending && agreementExpired(a, now);
  const canSign = pending && !expired;
  const phone = prettyPhone(me.data?.contactNumber);
  const sender = a?.created_by_name || 'Tamada Media';
  const spots = a ? mySpotsText(a) : '';
  const counter = a ? countersignText(a) : '';
  // Once signed, the file still opens the original draft; the signature is stored beside it.
  const fileMeta = signed ? 'PDF · your signature is saved with it' : 'PDF · opens in a PDF app';

  // The footer follows the body's branch: no sign button over a skeleton or an error (React Query keeps
  // stale data when a refetch fails, so `canSign` alone could still be true there).
  const ready = !(me.isPending || (approved && q.isPending)) && !(me.isError && !me.data) && !q.isError && !!a;
  const footer =
    canSign && ready ? (
      <ActionBar note={sig ? `We’ll send a WhatsApp code to ${phone || 'your number'} to confirm.` : 'Add your signature first.'}>
        <Button
          title="Sign agreement"
          icon={<ShieldCheck />}
          loading={signing}
          disabled={!sig || signing}
          onPress={() => {
            setError(null);
            setOtpOpen(true);
          }}
        />
      </ActionBar>
    ) : undefined;

  return (
    <>
      <Screen header={<NavHeader title="Agreement" />} footer={footer} onRefresh={() => Promise.all([me.refetch(), ...(approved ? [q.refetch()] : [])])}>
        {me.isPending || (approved && q.isPending) ? (
          <View style={{ gap }}>
            <Skeleton height={190} radius={radius.xxl} />
            <Skeleton height={110} radius={radius.xl} />
            <Skeleton height={260} radius={radius.xl} />
          </View>
        ) : me.isError && !me.data ? (
          <ErrorState message={me.error?.message ?? 'Could not load your account.'} onRetry={() => void me.refetch()} />
        ) : q.isError ? (
          <ErrorState message={q.error?.message ?? 'Could not load this agreement.'} onRetry={() => void q.refetch()} />
        ) : !a ? (
          <EmptyState icon={<FileSignature color={palette.textMuted} />} title="Agreement not found" message="It may have been withdrawn. Pull down to refresh." />
        ) : (
          <View style={{ gap }}>
            <SummaryHero
              icon={FileSignature}
              module="vendor"
              label={`From ${sender}${a.created_at ? ` · ${dateIN(a.created_at)}` : ''}`}
              figure={
                <View style={{ gap: space.xs, alignItems: 'flex-start' }}>
                  <StatusPill label={signed ? 'Signed' : expired ? 'Expired' : 'To sign'} tone={signed ? 'done' : expired ? 'failed' : 'pending'} />
                  {/* The one place the full project name shows: 3 lines cut a 55-character name at 320 dp. */}
                  <Text variant="title" numberOfLines={5} accessibilityRole="header">
                    {a.project_name || 'Agreement'}
                  </Text>
                </View>
              }
              sub={
                signed
                  ? `Signed ${dateTimeIN(a.signed_at)}`
                  : a.deadline_at
                    ? `${expired ? 'Deadline passed' : 'Sign by'} ${dateTimeIN(a.deadline_at)}`
                    : 'No signing deadline'
              }
            />

            {pending && expired ? <Banner tone="danger" title="Too late to sign" message={`Ask ${sender} to extend the deadline.`} /> : null}
            {canSign && error ? <Banner tone="danger" title="Couldn’t sign" message={error} /> : null}

            <SectionCard title={canSign ? '1. Read the agreement' : 'Agreement'}>
              <FileRow name={a.draft_file_name || 'Agreement.pdf'} meta={fileMeta} loading={opening} onPress={() => void openDraft()} />
              {fileError ? <Banner tone="danger" message={fileError} /> : null}
            </SectionCard>

            {canSign ? (
              <SectionCard title="2. Add your signature" overline={spots || undefined}>
                <SignatureCapture
                  value={sig}
                  onChange={(s) => {
                    setSig(s);
                    setError(null);
                  }}
                  disabled={signing}
                />
              </SectionCard>
            ) : null}

            {signed ? (
              <SectionCard title="Your signature">
                <RecordedSignature agreementId={a.id} />
                <InfoRows
                  rows={[
                    { label: 'Reference', value: a.signature_reference, mono: true },
                    { label: 'Tamada’s signature', value: counter },
                  ]}
                  hideEmpty
                />
              </SectionCard>
            ) : null}
          </View>
        )}
      </Screen>

      <OtpConfirmSheet
        visible={otpOpen}
        phone={me.data?.contactNumber ?? ''}
        title="Confirm it’s you"
        description={`Enter the code to sign ${a?.project_name ? `“${a.project_name}”` : 'this agreement'}.`}
        onClose={() => setOtpOpen(false)}
        onVerified={finalize}
      />

      <SuccessSheet
        visible={justSigned}
        onClose={() => setJustSigned(false)}
        title="Agreement signed"
        subtitle={`Thank you. ${sender} has been told.`}>
        <SummaryCard
          rows={[
            { label: 'Agreement', value: a?.project_name || 'Agreement' },
            { label: 'Signed', value: a?.signed_at ? dateTimeIN(a.signed_at) : null },
            { label: 'Reference', value: a?.signature_reference },
            { label: 'Tamada’s signature', value: counter },
          ]}
          hideEmpty
        />
      </SuccessSheet>
    </>
  );
}
