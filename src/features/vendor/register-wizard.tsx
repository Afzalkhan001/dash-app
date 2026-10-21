// The registration wizard (web VendorRegistrationFlow): step state, draft saving
// (PUT /vendor/registration), per-step validation, Digio data copied into the form once verified,
// submit (POST /vendor/registration/submit) and the corrections / not-approved notice.
//
// Layout (docs/DESIGN.md §11 Vendor portal): the NavHeader (round frosted back, centred "Registration",
// "Save draft" as its one round action), then "Step 3 of 7" progress + the step's frosted card scroll;
// Back / Continue live in a sticky ActionBar that rides above the keyboard. A registration still being filled in opens on the first step that isn't finished (resumeStep —
// Home names the same step), so a returning vendor is one Continue away from where they stopped.
// At most one notice shows at a time: an error from Continue / Send replaces the corrections notice.

import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { Save } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/client';
import { saveVendorRegistration, submitVendorRegistration, type Vendor, VENDOR_ME_KEY } from '@/api/vendor';
import { fixItemsText, STEP_COUNT } from '@/features/vendor/constants';
import {
  draftBody,
  initForm,
  nextApplicableStep,
  prevApplicableStep,
  type RegErrors,
  type RegForm,
  regContext,
  resumeStep,
  stepsFor,
  validateStep,
} from '@/features/vendor/register-form';
import {
  StepAnnexure,
  StepBusiness,
  StepCard,
  StepGst,
  StepMobile,
  StepNonGst,
  type StepProps,
  StepReview,
  StepVerify,
} from '@/features/vendor/register-steps';
import { StepProgress } from '@/features/vendor/ui';
import { palette, space } from '@/theme/tokens';
import { ActionBar, ActionRow, Backdrop, Banner, Button, haptic, IconButton, NavHeader, Reveal, Text, toast, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';
export function RegistrationWizard({ vendor }: { vendor: Vendor }) {
  const router = useRouter();
  const qc = useQueryClient();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { gutter, gap, compact } = useLayout();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const [f, setF] = useState<RegForm>(() => initForm(vendor));
  const [step, setStep] = useState(() => resumeStep(vendor, initForm(vendor)));
  const [errs, setErrs] = useState<RegErrors>({});
  const [busy, setBusy] = useState<'next' | 'submit' | 'draft' | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [stepErr, setStepErr] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [applied, setApplied] = useState({ identity: false, bank: false });

  const ctx = regContext(vendor, f);
  const isCorrection = vendor.status === 'correction_required';
  const isRejected = vendor.status === 'rejected';
  const toFix = fixItemsText(vendor.correction?.items);

  // Once Digio has confirmed something, copy it into the form so nothing verified is retyped
  // (web effect ~31373). Adjusted during render, guarded so each part is applied once.
  if (ctx.identityStatus === 'completed' && !applied.identity) {
    const kyc = vendor.kyc;
    const addr = ctx.kycAddress;
    setApplied((a) => ({ ...a, identity: true }));
    setF((x) => ({
      ...x,
      pan: kyc?.panVerification?.pan || x.pan,
      gstin: kyc?.gstVerification?.gstin || x.gstin,
      legalEntityName: x.legalEntityName || kyc?.gstVerification?.legalName || kyc?.panVerification?.holderName || '',
      businessType: x.businessType || kyc?.gstVerification?.businessType || '',
      registeredAddress: x.registeredAddress || addr,
      addressSource: x.addressSource || (addr ? 'aadhaar' : ''),
    }));
  }
  if (ctx.bankVerified && ctx.bankVer && !applied.bank) {
    const b = ctx.bankVer;
    setApplied((a) => ({ ...a, bank: true }));
    setF((x) => ({
      ...x,
      bankAccountName: b.accountName || x.bankAccountName || '',
      bankName: b.bankName || x.bankName || '',
      accountNumber: b.accountNumber || x.accountNumber || '',
      confirmAccountNumber: b.accountNumber || x.confirmAccountNumber || '',
      ifsc: b.ifsc || x.ifsc || '',
      branchName: b.branchName || x.branchName || '',
    }));
  }

  const set = (k: keyof RegForm) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrs((e) => ({ ...e, [k]: '' }));
    setSubmitErr(null);
    setStepErr(null);
  };

  const reload = () => qc.invalidateQueries({ queryKey: VENDOR_ME_KEY });

  function goto(n: number) {
    setStep(n);
    setStepErr(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function saveDraft(silent: boolean): Promise<boolean> {
    const r = await saveVendorRegistration(draftBody(f, ctx.bankVerified));
    if (isApiError(r)) {
      const fe = 'fieldErrors' in r ? r.fieldErrors : undefined;
      if (fe) {
        setErrs((e) => ({ ...e, ...fe }));
        // A Tamada contact email the server refused is shown under its field, on its step.
        if (fe.pocEmail && step !== 1) goto(1);
      }
      setSubmitErr(r.error);
      haptic.error();
      return false;
    }
    if (!silent) {
      toast.show('Saved. Sign in with your number any time to carry on.', 'success');
      haptic.success();
    }
    return true;
  }

  async function saveDraftNow() {
    if (busy) return;
    setBusy('draft');
    await saveDraft(false);
    setBusy(null);
  }

  async function next() {
    if (busy) return;
    const e = validateStep(step, f, ctx);
    setErrs(e);
    if (Object.keys(e).length) {
      setStepErr('Please fix the highlighted answers.');
      haptic.warning();
      return;
    }
    setBusy('next');
    const saved = await saveDraft(true);
    if (!saved) return setBusy(null);
    await reload();
    setBusy(null);
    goto(nextApplicableStep(step, f, STEP_COUNT));
  }

  async function submit() {
    if (busy) return;
    setBusy('submit');
    setSubmitErr(null);
    if (!(await saveDraft(true))) return setBusy(null);
    const r = await submitVendorRegistration();
    if (isApiError(r)) {
      setBusy(null);
      const fe = 'fieldErrors' in r ? r.fieldErrors : undefined;
      const missing = 'missingDocuments' in r ? r.missingDocuments : undefined;
      const missingList = (Array.isArray(missing) ? missing : []).map((d) => d?.label).filter(Boolean);
      setSubmitErr(r.error + (fe ? ' — ' + Object.values(fe).join(' ') : '') + (missingList.length ? ' Missing: ' + missingList.join(', ') : ''));
      haptic.error();
      return;
    }
    haptic.success();
    // Leave first: once the status flips to "waiting for approval" this screen has nothing to edit.
    if (router.canGoBack()) router.back();
    else router.replace('/portal');
    void reload();
  }

  const steps = stepsFor(f);
  const props: StepProps = { vendor, f, set, errs, ctx };
  const last = step >= STEP_COUNT;
  // On the Verify step nothing can move on until Digio has finished — say so instead of letting
  // Continue fail; the Digio button is the one thing to press.
  const waitingForDigio = step === 3 && ctx.identityStatus !== 'completed';
  const primary = last ? (
    <Button title={isCorrection || isRejected ? 'Send again' : 'Send for approval'} onPress={submit} loading={busy === 'submit'} disabled={!!busy} />
  ) : (
    // While Digio is running its button is the one primary on screen; Continue steps back to a pill.
    <Button title="Continue" variant={waitingForDigio ? 'accent' : 'primary'} onPress={next} loading={busy === 'next'} disabled={!!busy || waitingForDigio} />
  );
  const note = waitingForDigio ? 'Finish the Digio check to continue.' : last ? 'Our Accounts team checks it and emails you.' : undefined;
  const errorShown = !!stepErr || !!submitErr;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Backdrop />
      <NavHeader
        title="Registration"
        right={
          <IconButton
            accessibilityLabel={busy === 'draft' ? 'Saving' : 'Save and finish later'}
            size={compact ? 40 : 44}
            onPress={saveDraftNow}
            disabled={!!busy && busy !== 'draft'}>
            {busy === 'draft' ? <ActivityIndicator size="small" color={palette.primaryText} /> : <Save size={20} color={palette.text} strokeWidth={1.8} />}
          </IconButton>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: space.xxs, paddingBottom: space.xl, gap }}>
          {/* Tap a finished step's segment to go back to it. */}
          <StepProgress steps={steps} current={step} onGoTo={goto} disabled={!!busy} />

          {/* What Accounts asked for, on every step — unless an error is showing (one notice at a time). */}
          {isCorrection && vendor.correction && !errorShown ? (
            <Banner tone="warning" title={toFix ? `Please fix: ${toFix}` : 'Please fix a few details'}>
              {vendor.correction.comments ? (
                <Text variant="label" muted style={{ fontStyle: 'italic' }}>
                  “{vendor.correction.comments}”
                </Text>
              ) : null}
            </Banner>
          ) : null}

          {isRejected && !errorShown ? (
            <Banner tone="danger" title="Not approved. Update your details and send again.">
              {vendor.rejection?.reason ? (
                <Text variant="label" style={{ fontStyle: 'italic' }}>
                  “{vendor.rejection.reason}”
                </Text>
              ) : null}
            </Banner>
          ) : null}

          <Reveal key={step}>
            <StepCard>
              {step === 1 ? <StepMobile {...props} /> : null}
              {step === 2 ? <StepGst {...props} /> : null}
              {step === 3 ? (
                <StepVerify
                  {...props}
                  termsAccepted={termsAccepted}
                  onTermsAccepted={setTermsAccepted}
                  active={focused && step === 3}
                  onRequireGstStatus={() => setErrs((e) => ({ ...e, gstStatus: 'Go back one step and tell us about GST first.' }))}
                />
              ) : null}
              {step === 4 ? (
                <StepBusiness
                  {...props}
                  onAddressSource={(v) => {
                    setF((x) => ({ ...x, addressSource: v, registeredAddress: v === 'aadhaar' ? ctx.kycAddress : x.registeredAddress }));
                    setErrs((e) => ({ ...e, registeredAddress: '' }));
                  }}
                />
              ) : null}
              {step === 6 ? <StepNonGst {...props} goto={goto} saveDraft={() => saveDraft(true)} /> : null}
              {step === 7 ? <StepAnnexure {...props} saveDraft={() => saveDraft(true)} /> : null}
              {step === 8 ? <StepReview {...props} goto={goto} submitErr={submitErr} /> : null}
            </StepCard>
          </Reveal>

          {stepErr ? <Banner tone="danger" message={stepErr} /> : null}
          {submitErr && !last && !stepErr ? <Banner tone="danger" title="Couldn’t save" message={submitErr} /> : null}
        </ScrollView>

        <ActionBar note={note}>
          {step > 1 ? (
            <ActionRow context="bar">
              <Button title="Back" variant="accent" onPress={() => goto(prevApplicableStep(step, f))} disabled={!!busy} />
              {primary}
            </ActionRow>
          ) : (
            primary
          )}
        </ActionBar>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: palette.canvas },
}));
