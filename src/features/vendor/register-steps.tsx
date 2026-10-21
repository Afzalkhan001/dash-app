// The registration steps (web VP_STEPS: Mobile, GST Status, Verify, Business, Summary, Non-GST Decl.,
// Annexure 1, Review) — same fields, values and documents as the website's VendorRegistrationFlow
// (dash.html ~31724-32025), in plain words with one short line of help per step. Step 5 (Summary) is
// skipped in the app (see isStepApplicable); step 6 only applies to vendors who are not GST registered.

import { Landmark, Pencil, PenLine } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Vendor } from '@/api/vendor';
import {
  BUSINESS_TYPES,
  DIGIO_TERMS,
  DIGIO_TERMS_INTRO,
  DOC_LABEL,
  ENTITY_TYPES,
  GENERATED_DECLARATIONS,
  NON_GST_REASONS,
} from '@/features/vendor/constants';
import { DeclarationRow } from '@/features/vendor/declaration';
import { DocUploadRow } from '@/features/vendor/files';
import { maskTail, prettyPhone, ymdLabel } from '@/features/vendor/format';
import { DigioVerifyCard } from '@/features/vendor/kyc';
import type { RegContext, RegErrors, RegForm } from '@/features/vendor/register-form';
import { CheckRow, ChoiceButtons, Field, type InfoRow, InfoRows } from '@/features/vendor/ui';
import { font, palette, radius, space } from '@/theme/tokens';
import { Banner, Button, Card, DateField, FieldMessage, SelectField, Sheet, StatusPill, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
export type StepProps = {
  vendor: Vendor;
  f: RegForm;
  set: (k: keyof RegForm) => (v: string) => void;
  errs: RegErrors;
  ctx: RegContext;
};

const YES_NO: [string, string][] = [
  ['yes', 'Yes'],
  ['no', 'No'],
];
const opts = (list: [string, string][]) => list.map(([value, label]) => ({ value, label }));
const labelOf = (list: [string, string][], v: string) => list.find((x) => x[0] === v)?.[1] ?? '';
const yn = (v: string) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '');

/** Step title + at most one short line of help (keep it to 2 lines at 360 dp). */
function StepHead({ title, text }: { title: string; text?: string }) {
  return (
    <View style={{ gap: space.xxs }}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {text ? (
        <Text variant="body" muted>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function ErrorLine({ text }: { text?: string }) {
  return text ? <FieldMessage error={text} /> : null;
}

// ── 1. Contact details ─────────────────────────────────────────────────────────────
export function StepMobile({ vendor, f, set, errs }: StepProps) {
  const phone = prettyPhone(vendor.contactNumber);
  return (
    <>
      <StepHead title="Contact details" text={`${phone ? `Signed in as ${phone}. ` : ''}Each step is saved when you tap Continue.`} />
      <Field
        label="Your email"
        required
        value={f.email}
        onChangeText={set('email')}
        error={errs.email}
        hint="We'll send updates here."
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
      />
      <Field
        label="Your Tamada contact's email"
        required
        value={f.pocEmail}
        onChangeText={set('pocEmail')}
        error={errs.pocEmail}
        placeholder="name@tamadamedia.com"
        hint="The person at Tamada Media you work with."
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </>
  );
}

// ── 2. GST ─────────────────────────────────────────────────────────────────────
export function StepGst({ f, set, errs }: StepProps) {
  return (
    <>
      <StepHead title="GST" text="Is your business registered for GST?" />
      <ChoiceButtons
        options={[
          ['registered', 'Yes, registered'],
          ['not_registered', 'Not registered'],
        ]}
        value={f.gstStatus}
        onChange={set('gstStatus')}
        error={errs.gstStatus}
      />
      {f.gstStatus === 'not_registered' ? (
        <SelectField
          label="Why aren't you registered? *"
          value={f.nonGstReason || null}
          options={opts(NON_GST_REASONS)}
          onChange={set('nonGstReason')}
          placeholder="Choose a reason"
          error={errs.nonGstReason}
          hint="This goes in your non-GST declaration."
        />
      ) : null}
      {f.gstStatus === 'not_registered' && f.nonGstReason === 'other' ? (
        <Field label="Tell us more" required multiline value={f.nonGstReasonText} onChangeText={set('nonGstReasonText')} error={errs.nonGstReasonText} />
      ) : null}
    </>
  );
}

// ── 3. Verify ID and bank (Digio) ───────────────────────────────────────────────────
// The consent is one checkbox; the full terms open in a sheet ("Read the terms" → "I agree").
function TermsSheet({ visible, onClose, onAgree }: { visible: boolean; onClose: () => void; onAgree: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Verification terms" footer={<Button title="I agree" onPress={onAgree} />}>
      <Text variant="label" muted>
        {DIGIO_TERMS_INTRO}
      </Text>
      {DIGIO_TERMS.map(([head, body], i) => (
        <Text key={head} variant="label" muted>
          {i + 1}.{' '}
          <Text variant="label" color={palette.text} style={{ fontFamily: font.semibold }}>
            {head}
          </Text>{' '}
          {body}
        </Text>
      ))}
    </Sheet>
  );
}

export function StepVerify({
  vendor,
  f,
  set,
  errs,
  ctx,
  termsAccepted,
  onTermsAccepted,
  active,
  onRequireGstStatus,
}: StepProps & { termsAccepted: boolean; onTermsAccepted: (v: boolean) => void; active: boolean; onRequireGstStatus: () => void }) {
  const [termsOpen, setTermsOpen] = useState(false);
  const bv = ctx.bankVer;
  return (
    <>
      <StepHead
        title="Verify ID and bank"
        text={`Digio checks your ${f.gstStatus === 'not_registered' ? 'PAN' : 'GST'}, Aadhaar and bank in one go. Nothing to type.`}
      />

      {/* Consent for the FIRST launch only — once a request exists the vendor already agreed. */}
      {!ctx.identityStarted ? (
        <View>
          <CheckRow checked={termsAccepted} onChange={onTermsAccepted}>
            <Text variant="labelStrong">
              I agree to let Digio check my {f.gstStatus === 'not_registered' ? 'PAN' : 'GST/PAN'}, Aadhaar (DigiLocker) and bank account (₹1 test), and
              share the results with Tamada Media.
            </Text>
          </CheckRow>
          <Button title="Read the terms" variant="text" size="sm" onPress={() => setTermsOpen(true)} style={{ alignSelf: 'flex-start', marginLeft: 22 }} />
          <TermsSheet
            visible={termsOpen}
            onClose={() => setTermsOpen(false)}
            onAgree={() => {
              onTermsAccepted(true);
              setTermsOpen(false);
            }}
          />
        </View>
      ) : null}

      <DigioVerifyCard
        vendor={vendor}
        gstStatus={f.gstStatus}
        termsAccepted={termsAccepted}
        allowRestart={ctx.bankCorrectionAsked}
        active={active}
        onRequireGstStatus={onRequireGstStatus}
      />
      <ErrorLine text={errs.identityVerify} />
      <ErrorLine text={errs.gstStatus} />

      {/* What the ₹1 test payment returned — read-only; the bank confirmed this account. */}
      {ctx.bankVerified && bv ? (
        <View style={[styles.panel, { backgroundColor: palette.successSoft }]}>
          <View style={styles.inlineHead}>
            <Landmark size={18} color={palette.success} style={{ flexShrink: 0 }} />
            <Text variant="bodyStrong" color={palette.successInk} style={{ flexShrink: 1 }}>
              Bank account verified
            </Text>
          </View>
          <View style={styles.inner}>
            <InfoRows
              hideEmpty
              rows={[
                { label: 'Account holder', value: bv.accountName || bv.holderNameOnBank },
                { label: 'Bank', value: bv.bankName },
                { label: 'Account number', value: maskTail(bv.accountNumber), mono: true },
                { label: 'IFSC', value: bv.ifsc, mono: true },
                { label: 'Branch', value: bv.branchName },
              ]}
            />
          </View>
          <Text variant="label" muted>
            We&apos;ll pay into this account.
          </Text>
        </View>
      ) : null}

      {/* Fallback only: the check finished without giving us an account, or Accounts asked for a bank
          correction — the typed form and the cancelled-cheque upload come back. */}
      {ctx.identityStatus === 'completed' && !ctx.bankVerified ? (
        <>
          <Divider />
          <StepHead
            title="Bank details"
            text={
              ctx.bankCorrectionAsked
                ? 'Accounts asked you to fix this. Enter the right account and add a cancelled cheque.'
                : "We couldn't confirm your bank automatically. Enter it and add a cancelled cheque."
            }
          />
          <Field label="Account holder name" required value={f.bankAccountName} onChangeText={set('bankAccountName')} error={errs.bankAccountName} />
          <Field label="Bank name" required value={f.bankName} onChangeText={set('bankName')} error={errs.bankName} />
          <Field
            label="Account number"
            required
            value={f.accountNumber}
            onChangeText={set('accountNumber')}
            error={errs.accountNumber}
            keyboardType="number-pad"
            autoCorrect={false}
          />
          <Field
            label="Account number again"
            required
            value={f.confirmAccountNumber}
            onChangeText={set('confirmAccountNumber')}
            error={errs.confirmAccountNumber}
            keyboardType="number-pad"
            autoCorrect={false}
          />
          <Field
            label="IFSC code"
            required
            value={f.ifsc}
            onChangeText={(v) => set('ifsc')(v.toUpperCase())}
            error={errs.ifsc}
            placeholder="HDFC0001234"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Field label="Branch (optional)" value={f.branchName} onChangeText={set('branchName')} />
          <DocUploadRow docType="bank_proof" uploaded={ctx.uploaded.has('bank_proof')} status={ctx.docStatus.bank_proof} />
          <ErrorLine text={errs.bankProof} />
        </>
      ) : null}
    </>
  );
}

// ── 4. Business details ─────────────────────────────────────────────────────────
export function StepBusiness({
  f,
  set,
  errs,
  ctx,
  onAddressSource,
}: StepProps & { onAddressSource: (v: 'aadhaar' | 'manual') => void }) {
  return (
    <>
      <StepHead title="Business details" />
      <Field
        label="Legal entity name"
        required
        value={f.legalEntityName}
        onChangeText={set('legalEntityName')}
        error={errs.legalEntityName}
        hint="Exactly as on your PAN card."
      />
      <Field label="Trade name (optional)" value={f.tradeName} onChangeText={set('tradeName')} hint="Only if it's different from the legal name." />
      <SelectField
        label="Business type *"
        value={f.businessType || null}
        options={opts(BUSINESS_TYPES)}
        onChange={set('businessType')}
        placeholder="Choose a type"
        error={errs.businessType}
      />
      <Field label="Brand name (optional)" value={f.brandName} onChangeText={set('brandName')} />

      <View style={{ gap: space.xs }}>
        <Text variant="labelStrong" muted>
          Registered address
          <Text variant="labelStrong" color={palette.dangerInk}>
            {' *'}
          </Text>
        </Text>
        {ctx.kycAddress ? (
          <ChoiceButtons
            options={[
              ['aadhaar', `Use ${ctx.kycAddressLabel}`],
              ['manual', 'Type it myself'],
            ]}
            value={f.addressSource}
            onChange={(v) => onAddressSource(v as 'aadhaar' | 'manual')}
          />
        ) : null}
        {f.addressSource === 'aadhaar' ? (
          <View style={styles.addressBox}>
            <Text variant="body">{f.registeredAddress}</Text>
          </View>
        ) : (
          <Field
            label=""
            multiline
            value={f.registeredAddress}
            onChangeText={set('registeredAddress')}
            error={errs.registeredAddress}
            hint={ctx.kycAddress ? undefined : 'Filled in after you verify. Edit it if needed.'}
          />
        )}
      </View>

      <Field label="Contact person" required value={f.contactPerson} onChangeText={set('contactPerson')} error={errs.contactPerson} autoCapitalize="words" />
      <Field label="Designation (optional)" value={f.designation} onChangeText={set('designation')} autoCapitalize="words" />

      <Divider />
      <ChoiceButtons label="Registered as MSME (Udyam)?" required options={YES_NO} value={f.msmeRegistered} onChange={set('msmeRegistered')} error={errs.msmeRegistered} />
      {f.msmeRegistered === 'yes' ? (
        <>
          <Field
            label="Udyam number"
            required
            value={f.msmeNumber}
            onChangeText={(v) => set('msmeNumber')(v.toUpperCase())}
            error={errs.msmeNumber}
            placeholder="UDYAM-KA-03-0001234"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <DocUploadRow docType="msme_certificate" uploaded={ctx.uploaded.has('msme_certificate')} status={ctx.docStatus.msme_certificate} />
        </>
      ) : null}
    </>
  );
}

// ── Summary blocks (last step) ───────────────────────────────────────────────────
// `note` is a short muted line under the title (e.g. "Verified by your bank"), so the one heading
// beside the Edit link stays short enough for 360 dp at 1.3× text.
function SummaryBlock({ title, note, onEdit, rows }: { title: string; note?: string; onEdit: () => void; rows: InfoRow[] }) {
  return (
    <View style={{ gap: space.xxs }}>
      <View style={styles.summaryHead}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="heading" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {note ? (
            <Text variant="caption" color={palette.successInk} numberOfLines={1}>
              {note}
            </Text>
          ) : null}
        </View>
        <Button
          title="Edit"
          variant="text"
          size="sm"
          icon={<Pencil />}
          onPress={onEdit}
          accessibilityLabel={`Edit ${title}`}
          style={{ flexShrink: 0, marginRight: -space.sm }}
        />
      </View>
      <View style={styles.summary}>
        <InfoRows rows={rows} hideEmpty />
      </View>
    </View>
  );
}

function businessRows(vendor: Vendor, f: RegForm): InfoRow[] {
  return [
    { label: 'Legal entity name', value: f.legalEntityName },
    { label: 'Trade name', value: f.tradeName },
    { label: 'Business type', value: labelOf(BUSINESS_TYPES, f.businessType) || f.businessType },
    { label: 'Brand name', value: f.brandName },
    { label: 'Registered address', value: f.registeredAddress },
    { label: 'Contact person', value: f.contactPerson },
    { label: 'Designation', value: f.designation },
    { label: 'Email', value: f.email },
    { label: 'Tamada contact', value: f.pocEmail },
    { label: 'Phone', value: prettyPhone(vendor.contactNumber) },
    { label: 'MSME (Udyam)', value: f.msmeRegistered === 'yes' ? f.msmeNumber || 'Yes' : yn(f.msmeRegistered) },
  ];
}

function gstRows(f: RegForm): InfoRow[] {
  return [
    { label: 'GST', value: f.gstStatus === 'registered' ? 'Registered' : f.gstStatus === 'not_registered' ? 'Not registered' : '' },
    { label: 'PAN', value: f.pan, mono: true },
    { label: 'GSTIN', value: f.gstin, mono: true },
    { label: 'Why not registered', value: labelOf(NON_GST_REASONS, f.nonGstReason) },
    { label: 'More detail', value: f.nonGstReasonText },
  ];
}

function bankRows(f: RegForm): InfoRow[] {
  return [
    { label: 'Account holder', value: f.bankAccountName },
    { label: 'Bank', value: f.bankName },
    { label: 'Account number', value: maskTail(f.accountNumber), mono: true },
    { label: 'IFSC', value: f.ifsc, mono: true },
    { label: 'Branch', value: f.branchName },
  ];
}

// "Filed · ack no · 12 Jul 2025" or "Not filed — reason" for one financial year.
function returnText(f: RegForm, k: '2425' | '2324') {
  const filed = f[`itrFiled${k}`];
  if (filed === 'yes') return ['Filed', f[`itrAck${k}`], ymdLabel(f[`itrDate${k}`])].filter(Boolean).join(' · ');
  if (filed === 'no') return f[`itrReason${k}`] ? `Not filed — ${f[`itrReason${k}`]}` : 'Not filed';
  return '';
}

function taxRows(f: RegForm): InfoRow[] {
  return [
    { label: 'Type of entity', value: f.entityType },
    { label: 'Tax return 2024-25', value: returnText(f, '2425') },
    { label: 'Tax return 2023-24', value: returnText(f, '2324') },
    { label: 'Income tax (TDS) ₹50,000+ in both years', value: yn(f.tdsOver50k) },
    { label: 'Signed by', value: [f.declarantName, f.declarationPlace, ymdLabel(f.declarationDate)].filter(Boolean).join(' · ') },
  ];
}

// ── 6. Non-GST form ─────────────────────────────────────────────────────────────
export function StepNonGst({ vendor, f, goto, saveDraft }: StepProps & { goto: (n: number) => void; saveDraft: () => Promise<boolean> }) {
  return (
    <>
      <StepHead title="Non-GST form" text="We wrote it from your answers. Read it and sign." />
      {!f.nonGstReason ? (
        <Banner tone="warning" message="First choose why you aren't registered for GST." action={{ label: 'Go to the GST step', onPress: () => goto(2) }} />
      ) : (
        <DeclarationRow
          docType="non_gst_declaration"
          vendor={vendor}
          signed={docsOf(vendor).find((x) => x.docType === 'non_gst_declaration')}
          onBeforeLoad={saveDraft}
        />
      )}
    </>
  );
}

// ── 7. Tax declaration (Annexure 1, Section 206AB) ──────────────────────────────────
export function StepAnnexure({ vendor, f, set, errs, saveDraft }: StepProps & { saveDraft: () => Promise<boolean> }) {
  return (
    <>
      <StepHead title="Tax declaration" text="Income tax rules (Section 206AB) need this. Fill it in, then sign." />
      <SelectField
        label="Type of entity *"
        value={f.entityType || null}
        options={opts(ENTITY_TYPES)}
        onChange={set('entityType')}
        placeholder="Choose a type"
        error={errs.entityType}
      />
      {(
        [
          ['2425', '2024-25'],
          ['2324', '2023-24'],
        ] as const
      ).map(([k, fy]) => (
        <View key={k} style={styles.fyBox}>
          <Text variant="heading">Financial year {fy}</Text>
          <ChoiceButtons
            label="Did you file your income tax return?"
            required
            options={YES_NO}
            value={f[`itrFiled${k}`]}
            onChange={set(`itrFiled${k}`)}
            error={errs[`itrFiled${k}`]}
          />
          {f[`itrFiled${k}`] === 'yes' ? (
            <>
              <Field label="Acknowledgement number" required value={f[`itrAck${k}`]} onChangeText={set(`itrAck${k}`)} error={errs[`itrAck${k}`]} autoCorrect={false} />
              <DateField label="Date filed *" value={f[`itrDate${k}`] || null} onChange={set(`itrDate${k}`)} error={errs[`itrDate${k}`]} />
            </>
          ) : null}
          {f[`itrFiled${k}`] === 'no' ? (
            <Field label="Why wasn't it filed?" required multiline value={f[`itrReason${k}`]} onChangeText={set(`itrReason${k}`)} error={errs[`itrReason${k}`]} />
          ) : null}
        </View>
      ))}
      <ChoiceButtons
        label="Was ₹50,000 or more income tax (TDS/TCS) deducted from your payments in both 2023-24 and 2024-25?"
        required
        options={YES_NO}
        value={f.tdsOver50k}
        onChange={set('tdsOver50k')}
        error={errs.tdsOver50k}
      />
      <Divider />
      <Field label="Name of person signing" required value={f.declarantName} onChangeText={set('declarantName')} error={errs.declarantName} autoCapitalize="words" />
      <DateField label="Date *" value={f.declarationDate || null} onChange={set('declarationDate')} error={errs.declarationDate} />
      <Field label="Place" required value={f.declarationPlace} onChangeText={set('declarationPlace')} error={errs.declarationPlace} autoCapitalize="words" />
      <Divider />
      <DeclarationRow
        docType="declaration_206ab"
        vendor={vendor}
        signed={docsOf(vendor).find((x) => x.docType === 'declaration_206ab')}
        onBeforeLoad={saveDraft}
        defaultSignatoryName={f.declarantName}
      />
    </>
  );
}

// ── 8. Check and send ───────────────────────────────────────────────────────────
export function StepReview({ vendor, f, ctx, goto, submitErr }: StepProps & { goto: (n: number) => void; submitErr: string | null }) {
  // The web's own list, plus anything the server's checklist still requires — so a document the
  // server will insist on at submit always has a way to be provided right here.
  const checklist = Array.isArray(vendor.checklist) ? vendor.checklist : [];
  const docs = [...new Set([...ctx.needDocs, ...checklist.filter((c) => c && typeof c.docType === 'string').map((c) => c.docType)])];
  return (
    <>
      <StepHead title="Check and send" text="Tap Edit to fix anything, then send it for approval." />
      <SummaryBlock title="Business details" onEdit={() => goto(4)} rows={businessRows(vendor, f)} />
      <SummaryBlock title="GST and PAN" onEdit={() => goto(f.gstStatus === 'registered' ? 3 : 2)} rows={gstRows(f)} />
      <SummaryBlock title="Tax declaration" onEdit={() => goto(7)} rows={taxRows(f)} />
      <SummaryBlock title="Bank account" note={ctx.bankVerified ? 'Verified by your bank' : undefined} onEdit={() => goto(3)} rows={bankRows(f)} />

      <View style={{ gap: space.xs }}>
        <Text variant="heading" accessibilityRole="header">
          Documents
        </Text>
        <View style={styles.summary}>
          {docs.map((dt, i) => {
            const has = ctx.uploaded.has(dt);
            const generated = GENERATED_DECLARATIONS.includes(dt);
            return (
              <View key={dt} style={[{ paddingVertical: space.sm, gap: space.xs }, i > 0 && styles.sep]}>
                <View style={styles.docHead}>
                  <Text variant="bodyStrong" style={{ flex: 1, minWidth: 0 }}>
                    {DOC_LABEL[dt] ?? dt}
                  </Text>
                  <StatusPill label={has ? (generated ? 'Signed' : 'Uploaded') : 'Missing'} tone={has ? 'done' : 'failed'} />
                </View>
                {!has && generated ? (
                  <Button
                    title={dt === 'declaration_206ab' ? 'Go to tax declaration' : 'Go to non-GST form'}
                    variant="text"
                    size="sm"
                    icon={<PenLine />}
                    onPress={() => goto(dt === 'declaration_206ab' ? 7 : 6)}
                    style={{ marginLeft: -space.sm }}
                  />
                ) : null}
                {!has && !generated && dt !== 'aadhaar' ? <DocUploadRow docType={dt} uploaded={false} /> : null}
              </View>
            );
          })}
        </View>
      </View>
      {submitErr ? <Banner tone="danger" title="Couldn’t send" message={submitErr} /> : null}
    </>
  );
}

/** The card each step sits in (glass, compact padding on small phones, 16 between fields). */
export function StepCard({ children }: { children: ReactNode }) {
  return <Card style={{ gap: space.md }}>{children}</Card>;
}

const docsOf = (v: Vendor) => (Array.isArray(v.documents) ? v.documents : []).filter((d) => d && typeof d.docType === 'string');

const styles = themedStyles(() => ({
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.separator, marginVertical: space.xxs },
  panel: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
  inner: { backgroundColor: palette.surface, borderRadius: radius.sm, paddingHorizontal: space.sm },
  inlineHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  addressBox: { padding: space.md, borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  summary: { backgroundColor: palette.surfaceMuted, borderRadius: radius.md, paddingHorizontal: space.md },
  docHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator },
  fyBox: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
}));
