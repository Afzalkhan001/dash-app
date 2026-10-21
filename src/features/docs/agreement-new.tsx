// /admin/accounts/agreements/new: draft a vendor agreement and send it for e-sign — the website's
// NewAgreementModal (dash.html:34211), phone-shaped:
//   vendor (approved vendors, /vendor-bills/vendors) · Keka Code (ProjectSearch over /projects) · the
//   project name the vendor sees · deadline (in the future) · optional internal countersigner (/users) ·
//   the draft PDF (8 MB, PDF only) · tap the page to mark one or more sign spots {page, x, y, signer} as
//   0..1 fractions (pdf.js in a WebView) · Send → POST /vendor-agreements.
// Same checks and messages as the website, and the same rule that naming or removing the countersigner
// turns their spots back into the vendor's. Sending emails the vendor and cannot be withdrawn (there is
// no delete or recall route), so it goes through ConfirmSheet + SwipeToConfirm and says so.

import * as DocumentPicker from 'expo-document-picker';
import { useMutation } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { FilePlus2, FileText, PenLine, Store, Trash2, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useBillVendors } from '@/api/accounts';
import { apiFetch, isApiError, isDemoSession } from '@/api/client';
import { type Project, useProjects } from '@/api/reimbursements';
import { useTodayIst } from '@/features/attendance/use-now';
import { useInvalidateAccounts } from '@/features/accounts/use-items';
import { canDraftAgreement } from '@/features/docs/access';
import { b64Of, type Marker, PagePager, PdfPageView } from '@/features/docs/pdf-viewer';
import { pdfStamp } from '@/features/docs/templates';
import { type PickPerson, PersonPicker, usePickablePeople } from '@/features/shared/person-picker';
import { ProjectPicker } from '@/features/shared/project-picker';
import { AGREEMENT_PDF } from '@/demo/vendor/files';
import { FileError, pickDocument } from '@/lib/files';
import { addDaysYmd, istIsoAt } from '@/lib/ist';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  AccountRow,
  ActionBar,
  Banner,
  Button,
  ConfirmSheet,
  DateField,
  FieldMessage,
  FieldPair,
  ListCard,
  ListRow,
  NavHeader,
  Screen,
  SelectField,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  TimeField,
  toast,
} from '@/ui';

const MAX_DRAFT = 8 * 1024 * 1024;
type Draft = { name: string; b64: string; size: number };

/** The web build reads the picked file in the browser (expo-file-system has no web File). */
async function pickPdfOnWeb(): Promise<Draft | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0]!;
  if (a.mimeType && a.mimeType !== 'application/pdf') throw new FileError('The draft document must be a PDF.');
  if (a.size && a.size > MAX_DRAFT) throw new FileError('That file is larger than 8 MB. Please choose a smaller file.');
  const blob = a.file ?? (await (await fetch(a.uri)).blob());
  const dataUrl = await new Promise<string>((ok, bad) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result || ''));
    fr.onerror = () => bad(new FileError('That file could not be read.'));
    fr.readAsDataURL(blob);
  });
  return { name: a.name || 'agreement.pdf', b64: b64Of(dataUrl), size: a.size ?? blob.size };
}

async function pickPdf(): Promise<Draft | null> {
  if (Platform.OS === 'web') return pickPdfOnWeb();
  const f = await pickDocument(['application/pdf']);
  if (!f) return null;
  if (f.type !== 'application/pdf') throw new FileError('The draft document must be a PDF.');
  return { name: f.name, b64: b64Of(f.dataUrl), size: f.size };
}

const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function NewAgreementScreen({ vendorId: initialVendor }: { vendorId?: string }) {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const allowed = canDraftAgreement(access);
  const vendorsQ = useBillVendors(allowed);
  const projectsQ = useProjects(allowed);
  const peopleQ = usePickablePeople({ enabled: allowed });
  const invalidate = useInvalidateAccounts();

  const [vendorId, setVendorId] = useState(initialVendor || '');
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState('');
  const [day, setDay] = useState(() => addDaysYmd(today, 7));
  const [time, setTime] = useState('18:00');
  const [signer, setSigner] = useState<PickPerson | null>(null);
  const [pickingSigner, setPickingSigner] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [spots, setSpots] = useState<Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      const r = await apiFetch<{ id: string }>('/vendor-agreements', {
        method: 'POST',
        timeoutMs: 120_000,
        body: {
          vendorId,
          projectId: project?.id,
          projectName: projectName.trim(),
          deadlineAt: new Date(istIsoAt(day, time)).toISOString(),
          signPositions: spots.map(({ page: p, x, y, signer: who }) => ({ page: p, x, y, signer: who === 'internal' && signer ? 'internal' : 'vendor' })),
          fileName: draft?.name || 'agreement.pdf',
          mimeType: 'application/pdf',
          fileData: `data:application/pdf;base64,${draft?.b64 ?? ''}`,
          ...(signer ? { signerId: signer.id } : {}),
        },
      });
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      setConfirm(false);
      setTimeout(() => setSent(r?.id || 'sent'), 400);
    },
    onError: (e) => {
      setConfirm(false);
      setError((e instanceof Error && e.message) || 'Couldn’t send the agreement.');
    },
    onSettled: () => void invalidate(),
  });

  if (!allowed) return <Redirect href="/" />;

  const vendors = vendorsQ.data ?? [];
  const vendor = vendors.find((v) => v.id === vendorId) ?? null;
  const deadlineIso = day && time ? istIsoAt(day, time) : '';
  const deadlineMs = deadlineIso ? Date.parse(deadlineIso) : NaN;

  const choose = async (sample = false) => {
    setError(null);
    setPicking(true);
    try {
      const f = sample ? { name: 'Sample-Agreement.pdf', b64: AGREEMENT_PDF, size: Math.round((AGREEMENT_PDF.length * 3) / 4) } : await pickPdf();
      if (!f) return;
      if (f.size > MAX_DRAFT) throw new FileError('That file is larger than 8 MB. Please choose a smaller file.');
      setDraft(f);
      setPage(1);
      setPages(0);
      setSpots([]);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'That file could not be read.', 'danger');
    } finally {
      setPicking(false);
    }
  };

  const pickSigner = (p: PickPerson | null) => {
    setSigner(p);
    // The website turns every spot back into the vendor's when the countersigner changes (:34262).
    setSpots((list) => list.map((s) => (s.signer === 'internal' ? { ...s, signer: 'vendor' } : s)));
  };

  // NewAgreementModal.submit (:34230), the same order and words.
  const problem = (): string | null => {
    if (!vendor) return 'Choose the vendor.';
    if (!project) return 'Keka Code is required.';
    if (!projectName.trim()) return 'Project name is required.';
    if (!day || !time) return 'Deadline is required.';
    if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) return 'The deadline must be in the future.';
    if (!draft) return 'The draft document (PDF) is required.';
    if (!spots.length) return 'Tap on the document to mark at least one spot where the vendor should sign.';
    return null;
  };
  const review = () => {
    const p = problem();
    setError(p);
    if (!p) setConfirm(true);
  };

  const label = (s: Marker) => (signer && s.signer === 'internal' ? signer.name : 'Vendor');
  const markers: Marker[] = spots.map((s) => ({ ...s, label: signer ? label(s) : 'Sign here' }));
  const who = signer ? `${vendor?.legalEntityName || 'The vendor'} is emailed now. Once they sign, ${signer.name} is asked to countersign.` : `${vendor?.legalEntityName || 'The vendor'} is emailed now.`;

  return (
    <>
      <Screen
        header={<NavHeader title="New agreement" />}
        footer={
          <ActionBar note={error}>
            <Button title="Send for signature" icon={<PenLine />} onPress={review} loading={send.isPending} />
          </ActionBar>
        }>
        <Text variant="label" muted>
          The vendor signs in their DASH vendor portal. The Keka Code is never shown to them, only the project name.
        </Text>

        <SelectField
          label="Vendor"
          value={vendorId}
          placeholder={vendorsQ.isPending ? 'Loading vendors…' : 'Choose an approved vendor'}
          options={vendors.map((v) => ({ value: v.id, label: v.tradeName && v.tradeName !== v.legalEntityName ? `${v.legalEntityName} (${v.tradeName})` : v.legalEntityName }))}
          onChange={setVendorId}
          error={vendorsQ.isError && !vendorsQ.data ? 'Couldn’t load the vendors.' : null}
        />
        <ProjectPicker label="Keka Code" value={project} onChange={setProject} projects={projectsQ.data} loading={projectsQ.isPending} module="vendor" />
        <TextField label="Project name" value={projectName} onChangeText={setProjectName} placeholder="What the vendor will see, e.g. Website redesign agreement" maxLength={200} />
        <FieldPair>
          <DateField label="Sign by" value={day} onChange={setDay} minimumDate={today} />
          <TimeField label="Time" value={time} onChange={setTime} />
        </FieldPair>

        <View style={styles.block}>
          <Text variant="labelStrong" muted>
            Internal signer (optional)
          </Text>
          {signer ? (
            <AccountRow icon={UserRound} module="vendor" title={signer.name} sub={[signer.jobTitle, signer.dept].filter(Boolean).join(' · ') || 'Countersigns after the vendor'} actionLabel="Change" onChange={() => setPickingSigner(true)} />
          ) : (
            <Button title="Add someone to countersign" variant="ghost" size="md" icon={<UserRound />} onPress={() => setPickingSigner(true)} />
          )}
          <Text variant="caption" muted>
            {signer
              ? `Once the vendor signs, ${signer.name} is notified and asked to countersign. Pick this before marking spots, so you can mark which spot is theirs.`
              : 'If someone on your side also needs to sign after the vendor does, name them first. Leave it empty if the vendor’s signature alone completes it.'}
          </Text>
          {signer ? <Button title="Remove the internal signer" variant="text" size="md" onPress={() => pickSigner(null)} /> : null}
        </View>

        <View style={styles.block}>
          <Text variant="labelStrong" muted>
            Draft document (PDF, up to 8 MB)
          </Text>
          {draft ? (
            <AccountRow icon={FileText} module="vendor" title={draft.name} sub={`${sizeLabel(draft.size)}${pages ? ` · ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''}`} actionLabel="Change" onChange={() => void choose()} />
          ) : (
            <Button title="Choose the PDF" variant="ghost" icon={<FilePlus2 />} loading={picking} onPress={() => void choose()} />
          )}
          {!draft && isDemoSession() ? <Button title="Use a sample agreement (demo)" variant="text" size="md" onPress={() => void choose(true)} /> : null}
        </View>

        {draft ? (
          <View style={styles.block}>
            <Text variant="heading">Where should {signer ? 'each person' : 'the vendor'} sign?</Text>
            <Text variant="label" muted>
              Tap the page to add a sign spot. Tap again for another, on this page or any other.{signer ? ` Each spot is the vendor’s; switch one to ${signer.name} below.` : ''}
            </Text>
            <PdfPageView key={draft.name + draft.size} b64={draft.b64} page={page} markers={markers} onPages={setPages} onTap={(p) => setSpots((list) => [...list, { ...p, signer: 'vendor' }])} />
            <PagePager page={page} pages={pages} onPage={setPage} />
            {spots.length ? (
              <ListCard title={`Marked spots (${spots.length})`}>
                {spots.map((s, i) => (
                  <ListRow
                    key={`${s.page}-${s.x}-${s.y}-${i}`}
                    title={`${i + 1}. Page ${s.page}`}
                    subtitle={signer ? `Signs here: ${label(s)}` : 'The vendor signs here'}
                    onPress={() => setPage(s.page)}
                    accessibilityHint="Shows this page"
                    right={
                      <View style={styles.spotActions}>
                        {signer ? (
                          <Button
                            title={s.signer === 'internal' ? 'Vendor' : signer.name.split(' ')[0] || 'Internal'}
                            accessibilityLabel={s.signer === 'internal' ? 'Make this the vendor’s spot' : `Make this ${signer.name}’s spot`}
                            variant="ghost"
                            size="sm"
                            onPress={() => setSpots((list) => list.map((x, k) => (k === i ? { ...x, signer: x.signer === 'internal' ? 'vendor' : 'internal' } : x)))}
                          />
                        ) : null}
                        <Button title="Remove" accessibilityLabel={`Remove spot ${i + 1}`} variant="text" size="sm" icon={<Trash2 color={palette.dangerInk} />} onPress={() => setSpots((list) => list.filter((_, k) => k !== i))} />
                      </View>
                    }
                  />
                ))}
              </ListCard>
            ) : (
              <FieldMessage hint="No spots marked yet." />
            )}
          </View>
        ) : null}
        {error ? <Banner tone="danger" title="Not sent" message={error} /> : null}
      </Screen>

      <PersonPicker
        visible={pickingSigner}
        onClose={() => setPickingSigner(false)}
        onPick={(p) => pickSigner(p)}
        people={peopleQ.data}
        loading={peopleQ.isPending}
        title="Who countersigns?"
        subtitle="They sign after the vendor."
        selectedId={signer?.id}
        allowOnLeave
        recentKey="docs.countersigner"
      />

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Send for signature?"
        from={{ title: 'You', subtitle: 'Drafted', avatar: { name: access.user?.name || 'You' } }}
        to={{ title: vendor?.legalEntityName || 'Vendor', subtitle: 'Signs', icon: Store, module: 'vendor' }}
        confirmLabel="Swipe to send"
        onConfirm={() => send.mutate()}
        loading={send.isPending}
        note={`${who} A sent agreement can’t be withdrawn.`}>
        <SummaryCard
          rows={[
            { key: 'p', label: 'Project name', value: projectName.trim() },
            { key: 'k', label: 'Keka Code', value: project?.kekaCode || '—', hint: 'Not shown to the vendor' },
            { key: 'd', label: 'Sign by', value: Number.isFinite(deadlineMs) ? pdfStamp(new Date(deadlineMs).toISOString()) : '—' },
            { key: 's', label: 'Countersigner', value: signer?.name || 'None — vendor only' },
            { key: 'f', label: 'Document', value: draft?.name || '—', hint: `${spots.length} ${spots.length === 1 ? 'spot' : 'spots'}` },
          ]}
        />
      </ConfirmSheet>

      <SuccessSheet
        visible={!!sent}
        onClose={() => setSent(null)}
        title="Sent for signature"
        subtitle={`${who.replace(' is emailed now', ' has been emailed')}`}
        secondaryLabel="New agreement"
        onSecondary={() => {
          setSent(null);
          setProject(null);
          setProjectName('');
          setDraft(null);
          setSpots([]);
          setSigner(null);
        }}
        primaryLabel="Done"
        onPrimary={() => {
          setSent(null);
          router.replace('/admin/accounts/agreements');
        }}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  block: { gap: space.xs },
  spotActions: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
}));
