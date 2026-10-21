// One vendor, for Accounts — the website's VendorVerification (dash.html:25399), in the phone's order:
//   hero          name, vendor ID, where the registration stands, "4 of 6 checks done"
//   notices       possible duplicate business · corrections asked for · GSTIN doesn't match the PAN ·
//                 206AB "specified person" · why it was rejected            (only what applies)
//   tabs          Details · Bills · Agreements (approved vendors only)
//   checklist     one switch per check (only while it waits on Accounts) — saved at once
//   details       Business, Contact, Tax (with the PAN–Aadhaar check for vendors without GST), Aadhaar,
//                 GST, MSME, the 206AB declaration, Bank (account number masked; Show asks for the phone's
//                 fingerprint / face / PIN first), Documents (opened one at a time), History
//   changes       the vendor's own change requests: Approve (rewrites their details) or Reject
//   bar           Approve (once every check is ticked) · More: Ask for corrections, Reject
//                 approved: ⋯ → Switch off (signs them out at once) · switched off: Switch back on
// Every action is a ConfirmSheet with a swipe that says who is emailed (vendor.js: approve emails the
// vendor and the Tamada contact; reject emails both the reason; corrections email the vendor).
// The GET has side effects on the server (a paid Digio check on first open), so it is fetched only here.
// The summary print with every document stays on the website; each document opens on its own.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { Redirect } from 'expo-router';
import { BadgeCheck, CircleSlash, FileText, MoreHorizontal, Power, Store, X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import {
  accountsKeys,
  type AccountsVendor,
  approveVendor,
  decideChangeRequest,
  fetchVendorDocument,
  recordPanAadhaar,
  rejectVendor,
  requestCorrection,
  runPanAadhaarCheck,
  setVendorStatus,
  setVerification,
  useAccountsVendor,
} from '@/api/accounts';
import { ApiRequestError, isApiError, unwrap } from '@/api/client';
import type { ChangeRequest } from '@/api/vendor';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeVendors } from '@/features/accounts/access';
import { FileSheet, type FileLoad, ReasonConfirmSheet, ToggleRow } from '@/features/accounts/ui';
import { useInvalidateAccounts } from '@/features/accounts/use-items';
import { checkLabel, CORRECTION_LABELS, correctionLabel, maskAccount, NON_GST_REASON, panAadhaarLabel, panAadhaarTone, REVIEWABLE, vendorStatusMeta, yesNo } from '@/features/accounts/vendor-format';
import { VendorAgreementsTab, VendorBillsTab } from '@/features/accounts/vendor-tabs';
import { Timeline } from '@/features/inbox/detail';
import type { TimelineEvent } from '@/features/inbox/format';
import { shortDate } from '@/features/petty-cash/logic';
import { changeFieldLabel, docStatus } from '@/features/vendor/constants';
import { fileSize } from '@/features/vendor/format';
import { useAccess } from '@/lib/use-access';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  ActionBar,
  ActionRow,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Chip,
  ChipRow,
  ConfirmSheet,
  ErrorState,
  ListCard,
  MenuSheet,
  NavHeader,
  Screen,
  Segmented,
  Skeleton,
  SummaryCard,
  SummaryHero,
  type SummaryItem,
  Text,
  TextField,
  toast,
} from '@/ui';

type SheetKind = 'approve' | 'reject' | 'correction' | 'off' | 'on' | null;
type Tab = 'details' | 'bills' | 'agreements';

const msgOf = (e: unknown, fallback = 'Please try again.') => (e instanceof Error && e.message) || fallback;

// Unmask the account number only after the phone's own lock (biometrics or PIN) when it has one.
async function confirmIdentity() {
  if (Platform.OS === 'web') return true;
  try {
    const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    if (!ok) return true;
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Show the bank account number', cancelLabel: 'Cancel' });
    return r.success;
  } catch {
    return false;
  }
}

function historyEvents(v: AccountsVendor): TimelineEvent[] {
  return [...(v.history ?? [])]
    .filter((h) => !!h && !!h.created_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((h, i) => {
      const what = String(h.action || '').replace(/_/g, ' ');
      // A correction lists the server's item ids ("bank_proof, declaration_206ab") — show their names.
      if (/correction/.test(String(h.action)) && h.new_value && !h.prev_value)
        h = { ...h, new_value: String(h.new_value).split(/\s*,\s*/).map(correctionLabel).join(', ') };
      return {
        key: String(i),
        label: what.charAt(0).toUpperCase() + what.slice(1),
        at: h.created_at,
        by: [h.actor_name, h.actor_role ? `(${String(h.actor_role).replace(/_/g, ' ')})` : ''].filter(Boolean).join(' ') || undefined,
        detail: [h.field, h.prev_value || h.new_value ? `${h.prev_value || '—'} → ${h.new_value || '—'}` : ''].filter(Boolean).join(' · ') || undefined,
        tone: /reject|deactivat/.test(h.action) ? 'bad' : /approv|verified|reactivat/.test(h.action) ? 'good' : 'neutral',
      } satisfies TimelineEvent;
    });
}

export function VendorDetailScreen({ id }: { id: string }) {
  const access = useAccess();
  const today = useTodayIst();
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const invalidate = useInvalidateAccounts();
  const vq = useAccountsVendor(id, canSeeVendors(access));
  const [tab, setTab] = useState<Tab>('details');
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [menu, setMenu] = useState(false);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [outstanding, setOutstanding] = useState<string | null>(null);
  const [showAcct, setShowAcct] = useState(false);
  const [file, setFile] = useState<FileLoad | null>(null);
  const [panFailed, setPanFailed] = useState<string | null>(null);
  const [change, setChange] = useState<{ cr: ChangeRequest; decision: 'approved' | 'rejected' } | null>(null);
  const [changeNote, setChangeNote] = useState('');

  const refresh = () => Promise.all([vq.refetch(), invalidate()]);
  const patchCache = (fn: (v: AccountsVendor) => AccountsVendor) => qc.setQueryData<AccountsVendor>(accountsKeys.vendor(uid, id), (old) => (old ? fn(old) : old));

  const action = useMutation({
    mutationFn: async (kind: Exclude<SheetKind, null>) => {
      if (kind === 'approve') {
        const r = await approveVendor(id);
        if (isApiError(r)) {
          const out = (r as { outstanding?: { item: string; label?: string }[] }).outstanding;
          const list = Array.isArray(out) && out.length ? out.map((o) => checkLabel(o.item)).join(', ') : null;
          setOutstanding(list);
          // The sheet shows what is still to check; the toast is for every other failure.
          throw Object.assign(new ApiRequestError(r), { outstanding: list });
        }
        return r;
      }
      if (kind === 'reject') return unwrap(rejectVendor(id, reason.trim()));
      if (kind === 'correction') return unwrap(requestCorrection(id, [...new Set(items)], reason.trim()));
      return unwrap(setVendorStatus(id, kind === 'off' ? 'inactive' : 'approved', kind === 'off' ? 'Deactivated by Accounts' : undefined));
    },
    onSuccess: (_r, kind) => {
      setSheet(null);
      toast.show(
        kind === 'approve'
          ? 'Vendor approved. They can now sign in.'
          : kind === 'reject'
            ? 'Registration rejected. The vendor is emailed your reason.'
            : kind === 'correction'
              ? 'Corrections asked for. The vendor is emailed.'
              : kind === 'off'
                ? 'Vendor switched off and signed out.'
                : 'Vendor switched back on.',
      );
    },
    onError: (e, kind) => {
      const listed = kind === 'approve' && !!(e as { outstanding?: string | null }).outstanding;
      if (!listed) toast.show(msgOf(e), 'danger');
    },
    onSettled: () => void refresh(),
  });

  const toggle = useMutation({
    mutationFn: ({ item, verified }: { item: string; verified: boolean }) => unwrap(setVerification(id, item, verified)),
    onMutate: ({ item, verified }) => patchCache((v) => ({ ...v, verification: { ...v.verification, [item]: { ...(v.verification?.[item] ?? {}), verified } } })),
    // The server's copy carries who ticked it and when.
    onSuccess: (r, { item }) => {
      const saved = r?.verification?.[item];
      if (saved) patchCache((v) => ({ ...v, verification: { ...v.verification, [item]: saved } }));
    },
    onError: (e) => {
      toast.show(msgOf(e, 'Couldn’t save that check.'), 'danger');
      void vq.refetch();
    },
  });

  const pan = useMutation({
    mutationFn: async (how: 'check' | 'force' | 'linked' | 'not_linked') => {
      const r = how === 'check' || how === 'force' ? await runPanAadhaarCheck(id, how === 'force') : await recordPanAadhaar(id, how === 'linked');
      if (isApiError(r)) throw new ApiRequestError(r);
      return r;
    },
    onSuccess: () => {
      setPanFailed(null);
      void vq.refetch();
    },
    onError: (e) => setPanFailed(msgOf(e, 'Digio didn’t answer.')),
  });

  const decideChange = useMutation({
    mutationFn: ({ cr, decision }: { cr: ChangeRequest; decision: 'approved' | 'rejected' }) => unwrap(decideChangeRequest(cr.id, decision, changeNote.trim() || undefined)),
    onSuccess: (_r, { decision }) => {
      setChange(null);
      toast.show(decision === 'approved' ? 'Change applied.' : 'Change rejected.');
    },
    onError: (e) => toast.show(msgOf(e), 'danger'),
    onSettled: () => void refresh(),
  });

  if (!canSeeVendors(access)) return <Redirect href="/" />;
  const v = vq.data;
  if (!v) {
    return (
      <Screen header={<NavHeader title="Vendor" />}>
        {vq.isPending ? (
          <>
            <Skeleton height={196} radius={28} />
            <Skeleton height={240} radius={24} />
          </>
        ) : (
          <ErrorState message={vq.error?.message || 'Vendor not found.'} onRetry={() => void vq.refetch()} />
        )}
      </Screen>
    );
  }

  const st = vendorStatusMeta(v.status);
  const checks = v.applicableChecks ?? [];
  const done = checks.filter((c) => v.verification?.[c]?.verified).length;
  const left = checks.length - done;
  const canAct = REVIEWABLE.includes(v.status);
  const approved = v.status === 'approved';
  const name = v.business.legalEntityName || v.business.tradeName || v.contactNumber;
  const gstReg = v.gst.status === 'registered';
  const d206 = v.declaration206ab ?? {};
  const specified = d206.itrFiled2425 === 'no' && d206.itrFiled2324 === 'no' && d206.tdsOver50k === 'yes';
  const liveDocs = (v.documents ?? []).filter((x) => !x.superseded);
  const oldDocs = (v.documents ?? []).filter((x) => x.superseded);
  const pending = (v.changeRequests ?? []).filter((c) => c.status === 'pending');
  const chk = v.tax.panAadhaarCheck;
  const panState = chk?.status || (v.tax.panLinkedToAadhaar === true ? 'linked' : v.tax.panLinkedToAadhaar === false ? 'not_linked' : 'unchecked');
  const poc = v.business.pocEmail;
  const openDoc = (docId: string, title: string) => setFile({ title, load: () => fetchVendorDocument(v.id, docId) });

  const row = (label: string, value?: string | null, hint?: string | null, extra: Partial<SummaryItem> = {}): SummaryItem => ({ key: label, label, value: value || null, hint: hint ?? null, ...extra });
  const bankNo = v.bank.accountNumber ? (showAcct ? v.bank.accountNumber : maskAccount(v.bank.accountNumber)) : null;

  const footer = canAct ? (
    <ActionBar note={left > 0 ? `${left} ${left === 1 ? 'check' : 'checks'} still to tick before approving.` : null}>
      <ActionRow context="bar">
        <Button title="More" variant="ghost" icon={<MoreHorizontal />} onPress={() => setMenu(true)} />
        <Button
          title="Approve"
          icon={<BadgeCheck />}
          disabled={left > 0}
          onPress={() => {
            setOutstanding(null);
            setSheet('approve');
          }}
        />
      </ActionRow>
    </ActionBar>
  ) : v.status === 'inactive' ? (
    <ActionBar>
      <Button title="Switch back on" icon={<Power />} onPress={() => setSheet('on')} />
    </ActionBar>
  ) : undefined;

  return (
    <>
      <Screen
        header={<NavHeader title="Vendor" actions={approved ? [{ icon: MoreHorizontal, label: 'More actions', onPress: () => setMenu(true) }] : undefined} />}
        footer={footer}
        onRefresh={() => refresh()}>
        <SummaryHero
          icon={Store}
          module="vendor"
          label={[v.vendorCode, st.label].filter(Boolean).join(' · ')}
          figure={
            <Text variant="title" numberOfLines={3} selectable>
              {name}
            </Text>
          }
          sub={[v.contactNumber, v.email].filter(Boolean).join(' · ') || undefined}
          info={checks.length ? { label: 'Checks', value: `${done} of ${checks.length} done` } : undefined}
        />

        {(v.possibleDuplicates ?? []).length ? (
          <Banner tone="warning" title="Possible duplicate business" message="The same business may already be registered with another number. They are never merged — check before approving.">
            {v.possibleDuplicates.map((d) => (
              <Text key={d.id} variant="label" muted>
                {`${d.legalEntityName || d.id} (${d.contactNumber}) · same ${d.matchedOn.join(', ')} · ${vendorStatusMeta(d.status).label}`}
              </Text>
            ))}
          </Banner>
        ) : null}
        {v.correction && v.status === 'correction_required' ? (
          <Banner tone="warning" title="Corrections asked for" message={(v.correction.items ?? []).map(correctionLabel).join(' · ')}>
            {v.correction.comments ? (
              <Text variant="label" muted>
                {`“${v.correction.comments}”`}
              </Text>
            ) : null}
          </Banner>
        ) : null}
        {v.status === 'rejected' ? <Banner tone="danger" title={`Rejected${v.rejection?.by ? ` by ${v.rejection.by}` : ''}`} message={v.rejection?.reason || 'No reason recorded.'} /> : null}
        {v.status === 'inactive' ? <Banner tone="info" icon={CircleSlash} title="Switched off" message="This vendor can’t sign in until they are switched back on." /> : null}

        {approved ? (
          <Segmented
            options={[
              { key: 'details', label: 'Details' },
              { key: 'bills', label: 'Bills' },
              { key: 'agreements', label: 'Agreements' },
            ]}
            value={tab}
            onChange={setTab}
          />
        ) : null}

        {approved && tab === 'bills' ? <VendorBillsTab vendorId={v.id} pocEmail={poc} /> : null}
        {approved && tab === 'agreements' ? <VendorAgreementsTab vendorId={v.id} /> : null}

        {!approved || tab === 'details' ? (
          <>
            {canAct && checks.length ? (
              <View style={styles.block}>
                <Text variant="labelStrong" muted style={styles.label}>
                  Checklist — tick every check before approving
                </Text>
                <ListCard>
                  {checks.map((c) => (
                    <ToggleRow
                      key={c}
                      label={checkLabel(c)}
                      sub={v.verification?.[c]?.verified && v.verification[c]?.by ? `By ${v.verification[c]?.by}` : undefined}
                      value={!!v.verification?.[c]?.verified}
                      onChange={(next) => toggle.mutate({ item: c, verified: next })}
                    />
                  ))}
                </ListCard>
                {!v.msme.registered ? (
                  <Text variant="caption" muted style={styles.label}>
                    MSME certificate — doesn’t apply
                  </Text>
                ) : null}
              </View>
            ) : null}

            <SummaryCard
              title="Business"
              hideEmpty
              rows={[
                row('Legal name', v.business.legalEntityName),
                row('Trade name', v.business.tradeName),
                row('Business type', v.business.businessType),
                row('Brand', v.business.brandName),
                row('Registered address', v.business.registeredAddress),
              ]}
            />
            <SummaryCard
              title="Contact"
              hideEmpty
              rows={[
                row('Contact person', v.business.contactPerson, v.business.designation || null),
                row('Phone', v.contactNumber),
                row('Email', v.email),
                row('Tamada contact', poc),
              ]}
            />
            <SummaryCard
              title="Tax"
              hideEmpty
              rows={[
                row('PAN', v.tax.pan, v.tax.panHolderType || null),
                ...(v.kyc?.panVerification?.verified ? [row('PAN checked by Digio', v.kyc.panVerification.holderName || '—', v.kyc.panVerification.verifiedAt ? shortDate(v.kyc.panVerification.verifiedAt, today) : null)] : []),
                ...(!gstReg ? [row('PAN linked to Aadhaar', panAadhaarLabel(panState), chk?.note || null, { status: panAadhaarTone(panState) })] : []),
              ]}
            />
            {!gstReg ? (
              <View style={styles.block}>
                <ActionRow context="screen">
                  {panState === 'not_applicable' ? <Button title="Ask Digio anyway" variant="ghost" size="md" loading={pan.isPending && pan.variables === 'force'} disabled={pan.isPending || !v.tax.pan} onPress={() => pan.mutate('force')} /> : null}
                  <Button title={chk ? 'Check again with Digio' : 'Check with Digio'} variant="accent" size="md" loading={pan.isPending && pan.variables === 'check'} disabled={pan.isPending || !v.tax.pan} onPress={() => pan.mutate('check')} />
                </ActionRow>
                {chk ? (
                  <Text variant="caption" muted style={styles.label}>
                    {[chk.source === 'digio' ? 'Confirmed with Digio' : chk.source === 'manual' ? 'Recorded by hand' : chk.source === 'digio_status' ? 'From Digio’s PAN status' : 'From the PAN itself', chk.by ? `by ${chk.by}` : '', chk.at ? shortDate(chk.at, today) : ''].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {panFailed ? (
                  <Banner tone="warning" title="Digio didn’t answer" message={`${panFailed} Check it on Digio or the income-tax site, then record what you see.`}>
                    <ActionRow context="card">
                      <Button title="Linked" variant="ghost" size="sm" disabled={pan.isPending} onPress={() => pan.mutate('linked')} />
                      <Button title="Not linked" variant="ghost" size="sm" disabled={pan.isPending} onPress={() => pan.mutate('not_linked')} />
                    </ActionRow>
                  </Banner>
                ) : null}
              </View>
            ) : null}
            {!gstReg ? (
              <SummaryCard
                title="Aadhaar"
                rows={
                  v.kyc?.aadhaarVerification?.verified
                    ? [
                        row('Name on Aadhaar', v.kyc.aadhaarVerification.nameOnAadhaar),
                        row('Aadhaar', v.kyc.aadhaarVerification.last4 ? `•••• ${v.kyc.aadhaarVerification.last4}` : null, 'Only the last 4 digits are kept'),
                        row('Address', v.kyc.aadhaarVerification.address),
                        row('Checked on', v.kyc.aadhaarVerification.verifiedAt ? shortDate(v.kyc.aadhaarVerification.verifiedAt, today) : null),
                      ]
                    : [row('Status', 'Not checked yet')]
                }
                hideEmpty
              />
            ) : null}
            {gstReg && !v.gst.gstinMatchesPan ? <Banner tone="danger" title="GSTIN doesn’t match the PAN" message="Characters 3 to 12 of the GSTIN should be the PAN. Worth checking before approving." /> : null}
            <SummaryCard
              title="GST"
              hideEmpty
              rows={[
                row('GST', gstReg ? 'Registered' : v.gst.status === 'not_registered' ? 'Not registered' : null),
                ...(gstReg ? [row('GSTIN', v.gst.gstin), ...(v.kyc?.gstVerification?.verified ? [row('Checked by Digio', v.kyc.gstVerification.legalName || '—', v.kyc.gstVerification.verifiedAt ? shortDate(v.kyc.gstVerification.verifiedAt, today) : null)] : [])] : []),
                ...(v.gst.status === 'not_registered' ? [row('Why not', NON_GST_REASON[v.gst.nonGstReason] || v.gst.nonGstReason, v.gst.nonGstReasonText || null)] : []),
              ]}
            />
            <SummaryCard title="MSME" hideEmpty rows={[row('MSME registered', v.msme.registered ? 'Yes' : 'No'), ...(v.msme.registered ? [row('Udyam number', v.msme.number)] : [])]} />
            {specified ? <Banner tone="danger" title="May be a “specified person” (Section 206AB)" message="No tax return in either year and TDS of ₹50,000 or more. Confirm the higher TDS rate with your tax advisor." /> : null}
            <SummaryCard
              title="Section 206AB declaration"
              hideEmpty
              rows={[
                row('Type of entity', d206.entityType),
                row('Return filed 2024-25', yesNo(d206.itrFiled2425), d206.itrFiled2425 === 'yes' ? [d206.itrAck2425, d206.itrDate2425 ? shortDate(d206.itrDate2425, today) : null].filter(Boolean).join(' · ') : d206.itrReason2425 || null),
                row('Return filed 2023-24', yesNo(d206.itrFiled2324), d206.itrFiled2324 === 'yes' ? [d206.itrAck2324, d206.itrDate2324 ? shortDate(d206.itrDate2324, today) : null].filter(Boolean).join(' · ') : d206.itrReason2324 || null),
                row('TDS of ₹50,000 or more', yesNo(d206.tdsOver50k)),
                row('Signed by', d206.declarantName, [d206.declarationDate ? shortDate(d206.declarationDate, today) : null, d206.declarationPlace].filter(Boolean).join(' · ') || null),
              ]}
            />
            <SummaryCard
              title="Bank"
              right={
                v.bank.accountNumber ? (
                  <Button
                    title={showAcct ? 'Hide' : 'Show'}
                    variant="text"
                    size="sm"
                    onPress={async () => {
                      if (showAcct) return setShowAcct(false);
                      if (await confirmIdentity()) setShowAcct(true);
                    }}
                    accessibilityLabel={showAcct ? 'Hide the account number' : 'Show the account number'}
                  />
                ) : undefined
              }
              rows={[
                row('Checked', v.bank.verified ? 'Penny drop by Digio' : 'Typed by the vendor', v.bank.verified ? [v.bank.holderNameOnBank ? `Name at bank: ${v.bank.holderNameOnBank}` : null, v.bank.verifiedAt ? shortDate(v.bank.verifiedAt, today) : null].filter(Boolean).join(' · ') : 'Check it against the cheque before approving', { status: v.bank.verified ? 'done' : 'pending' }),
                row('Account name', v.bank.accountName),
                row('Bank', v.bank.bankName),
                row('Account number', bankNo),
                row('IFSC', v.bank.ifsc),
                row('Branch', v.bank.branchName, v.bank.branchAddress || null),
              ]}
              hideEmpty
            />

            <ActivityList title="Documents" empty="No documents uploaded.">
              {liveDocs.map((doc) => {
                const ds = docStatus(doc.status);
                return (
                  <ActivityRow
                    key={doc.id}
                    module="vendor"
                    icon={FileText}
                    title={doc.label}
                    subtitle={[doc.generated ? 'E-signed' : null, `Version ${doc.version}`, fileSize(doc.file_size)].filter(Boolean).join(' · ')}
                    note={doc.signature?.signatoryName ? `Signed by ${doc.signature.signatoryName}${doc.signature.signedAt ? ` · ${shortDate(doc.signature.signedAt, today)}` : ''}${doc.signature.reference ? ` · Ref ${doc.signature.reference}` : ''}` : null}
                    status={ds ? { label: ds.label, tone: ds.tone } : undefined}
                    chevron
                    onPress={() => openDoc(doc.id, doc.label)}
                  />
                );
              })}
            </ActivityList>
            {oldDocs.length ? (
              <ActivityList title="Older versions">
                {oldDocs.map((doc) => (
                  <ActivityRow key={doc.id} module="vendor" icon={FileText} title={doc.label} subtitle={`Version ${doc.version} · ${shortDate(doc.uploaded_at, today)}`} chevron onPress={() => openDoc(doc.id, `${doc.label} (version ${doc.version})`)} />
                ))}
              </ActivityList>
            ) : null}

            {pending.length ? (
              <View style={styles.block}>
                <Text variant="heading">Changes the vendor asked for</Text>
                {pending.map((cr) => (
                  <View key={cr.id} style={styles.block}>
                    <SummaryCard
                      title={changeFieldLabel(cr.field)}
                      rows={[row('Now', cr.prev_value || '—'), row('Change to', cr.new_value), row('Why', cr.reason), row('Asked', shortDate(cr.requested_at, today))]}
                      hideEmpty
                    />
                    <ActionRow context="screen">
                      <Button
                        title="Reject"
                        variant="ghost"
                        size="md"
                        onPress={() => {
                          setChangeNote('');
                          setChange({ cr, decision: 'rejected' });
                        }}
                      />
                      <Button
                        title="Apply change"
                        variant="accent"
                        size="md"
                        onPress={() => {
                          setChangeNote('');
                          setChange({ cr, decision: 'approved' });
                        }}
                      />
                    </ActionRow>
                  </View>
                ))}
              </View>
            ) : null}

            <Timeline events={historyEvents(v)} today={today} />
          </>
        ) : null}
      </Screen>

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={name}
        items={
          canAct
            ? [
                {
                  key: 'fix',
                  label: 'Ask for corrections',
                  icon: FileText,
                  hint: 'The vendor is emailed what to fix',
                  onPress: () => {
                    setMenu(false);
                    setItems([]);
                    setReason('');
                    setSheet('correction');
                  },
                },
                {
                  key: 'reject',
                  label: 'Reject registration',
                  icon: X,
                  tone: 'danger',
                  hint: 'The vendor is emailed your reason',
                  onPress: () => {
                    setMenu(false);
                    setReason('');
                    setSheet('reject');
                  },
                },
              ]
            : approved
              ? [
                  {
                    key: 'off',
                    label: 'Switch off this vendor',
                    icon: Power,
                    tone: 'danger',
                    hint: 'Signs them out at once',
                    onPress: () => {
                      setMenu(false);
                      setSheet('off');
                    },
                  },
                ]
              : []
        }
      />

      <ConfirmSheet
        visible={sheet === 'approve'}
        onClose={() => setSheet(null)}
        title="Approve this vendor?"
        from={{ title: name, subtitle: v.vendorCode || 'New vendor', icon: Store, module: 'vendor' }}
        to={{ title: 'Approved', subtitle: 'Can sign in and send bills', icon: BadgeCheck, module: 'vendor' }}
        confirmLabel="Swipe to approve"
        onConfirm={() => action.mutate('approve')}
        loading={action.isPending}
        note={`The vendor${poc ? ` and the Tamada contact (${poc})` : ''} are emailed.`}>
        <SummaryCard rows={[row('Checks', `${done} of ${checks.length} done`), row('Documents', `${liveDocs.length}`)]} />
        {outstanding ? <Banner tone="danger" title="Still to check" message={outstanding} /> : null}
      </ConfirmSheet>

      <ReasonConfirmSheet
        visible={sheet === 'reject'}
        onClose={() => setSheet(null)}
        title="Reject this registration?"
        reason={reason}
        onReason={setReason}
        minLength={1}
        placeholder="e.g. The PAN doesn’t match the business name."
        note={`The vendor${poc ? ` and the Tamada contact` : ''} are emailed this reason. It can’t be undone.`}
        confirmLabel="Swipe to reject"
        busy={action.isPending}
        onConfirm={() => action.mutate('reject')}
      />

      <ConfirmSheet
        visible={sheet === 'correction'}
        onClose={() => setSheet(null)}
        title="Ask for corrections"
        detailsTitle="What needs fixing"
        confirmLabel="Swipe to send"
        onConfirm={() => action.mutate('correction')}
        loading={action.isPending}
        disabled={!items.length || !reason.trim()}
        note="The vendor is emailed and sees these flagged when they sign in.">
        <ChipRow wrap bleed="none">
          {CORRECTION_LABELS.map(([key, label]) => {
            const on = items.includes(key);
            return <Chip key={key} label={label} selected={on} onPress={() => setItems((x) => (x.includes(key) ? x.filter((i) => i !== key) : [...x, key]))} />;
          })}
        </ChipRow>
        <TextField label="Comments" value={reason} onChangeText={setReason} placeholder="What the vendor needs to change or upload again" multiline maxLength={500} counter />
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'off'}
        onClose={() => setSheet(null)}
        title="Switch off this vendor?"
        from={{ title: name, subtitle: 'Approved', icon: Store, module: 'vendor' }}
        to={{ title: 'Switched off', subtitle: 'Can’t sign in', icon: Power }}
        confirmLabel="Swipe to switch off"
        onConfirm={() => action.mutate('off')}
        loading={action.isPending}
        note="They are signed out at once and can’t sign back in until you switch them on again."
      />
      <ConfirmSheet
        visible={sheet === 'on'}
        onClose={() => setSheet(null)}
        title="Switch this vendor back on?"
        confirmLabel="Swipe to switch on"
        onConfirm={() => action.mutate('on')}
        loading={action.isPending}
        note="They can sign in and send bills again."
      />

      <ConfirmSheet
        visible={!!change}
        onClose={() => setChange(null)}
        title={change?.decision === 'approved' ? 'Apply this change?' : 'Reject this change?'}
        confirmLabel={change?.decision === 'approved' ? 'Swipe to apply' : 'Swipe to reject'}
        onConfirm={() => change && decideChange.mutate(change)}
        loading={decideChange.isPending}
        note={change?.decision === 'approved' ? 'Their details change at once. A bank change may need the checks again.' : 'The vendor sees that it was rejected when they sign in.'}>
        {change ? <SummaryCard rows={[row(changeFieldLabel(change.cr.field), change.cr.new_value, `Now: ${change.cr.prev_value || '—'}`)]} /> : null}
        <TextField label="Note (optional)" value={changeNote} onChangeText={setChangeNote} multiline maxLength={300} />
      </ConfirmSheet>

      <FileSheet file={file} onClose={() => setFile(null)} />
    </>
  );
}

const styles = themedStyles(() => ({
  block: { gap: space.xs },
  label: { marginHorizontal: space.xxs },
}));

