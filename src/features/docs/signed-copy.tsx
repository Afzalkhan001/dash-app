// /admin/docs/agreement/<id>: the signed copy of a vendor agreement as one PDF — the website's "View Signed
// Document" download (buildSignedAgreementPdf, dash.html:32516): every page of the draft with the vendor's
// (and the countersigner's) signature drawn on the spots marked for them, labelled with who signed and
// when, then a signature certificate page with the reference numbers. Made on the phone; nothing is sent.

import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { FileDown, FileSignature, Printer } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { fetchAgreementDraft, fetchAgreementSignature, useAgreements, useBillVendors, usePendingMySignature } from '@/api/accounts';
import { isApiError } from '@/api/client';
import { useNow } from '@/features/attendance/use-now';
import { agreementStatus } from '@/features/accounts/vendor-format';
import { canSignedCopy } from '@/features/docs/access';
import { shareLabel } from '@/features/docs/doc-screen';
import { b64Of, type Marker, PagePager, PdfPageView } from '@/features/docs/pdf-viewer';
import { pdfDate, signedAgreementHtml, type StampedPage } from '@/features/docs/templates';
import type { WebFrameHandle, WebFrameMessage } from '@/features/docs/web-frame';
import { MissingItem } from '@/features/inbox/detail';
import { FileError } from '@/lib/files';
import { printPdf, sharePdf } from '@/lib/pdf';
import { useAccess } from '@/lib/use-access';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActionBar, Banner, Button, ErrorState, NavHeader, Screen, Skeleton, SummaryCard, SummaryHero, Text, toast } from '@/ui';

type Files = { draft: string; vendorSig: string; internalSig: string };

export function SignedCopyScreen({ id }: { id: string }) {
  const access = useAccess();
  const now = useNow();
  const allowed = canSignedCopy(access);
  const listQ = useAgreements({}, allowed);
  const pendingQ = usePendingMySignature(allowed);
  const vendorsQ = useBillVendors(allowed);
  const a = [...(listQ.data?.agreements ?? []), ...(pendingQ.data ?? [])].find((x) => x.id === id) ?? null;
  const filesQ = useQuery({
    queryKey: ['docs', 'agreement-files', access.user?.id, id, a?.signed_at ?? '', a?.internal_signed_at ?? ''],
    enabled: allowed && !!a,
    meta: { persist: false },
    gcTime: 60_000,
    queryFn: async (): Promise<Files> => {
      const [d, v, i] = await Promise.all([
        fetchAgreementDraft(id),
        a?.signed_at ? fetchAgreementSignature(id) : Promise.resolve(null),
        a?.internal_signed_at ? fetchAgreementSignature(id, true) : Promise.resolve(null),
      ]);
      if (isApiError(d)) throw new Error(d.error);
      const sig = (r: typeof v) => (r && !isApiError(r) && r.fileData ? (r.fileData.startsWith('data:') ? r.fileData : `data:${r.mimeType || 'image/png'};base64,${r.fileData}`) : '');
      return { draft: b64Of(d.fileData), vendorSig: sig(v), internalSig: sig(i) };
    },
  });
  const frame = useRef<WebFrameHandle>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [building, setBuilding] = useState<null | { done: number; total: number; then: 'share' | 'print' }>(null);
  const got = useRef<StampedPage[]>([]);

  if (!allowed) return <Redirect href="/" />;
  if (!a) {
    if (listQ.isPending || pendingQ.isPending)
      return (
        <Screen header={<NavHeader title="Signed copy" />}>
          <Skeleton height={180} radius={28} />
        </Screen>
      );
    return <MissingItem title="Signed copy" />;
  }

  const vendor = (vendorsQ.data ?? []).find((v) => v.id === a.vendor_id)?.legalEntityName || 'Vendor';
  const st = agreementStatus(a, now);
  const positions = Array.isArray(a.sign_positions) ? a.sign_positions : [];
  const vendorLabel = a.signed_at ? `Vendor signed · ${pdfDate(a.signed_at)}` : '';
  const internalLabel = a.internal_signed_at ? `Countersigned by ${a.signer_name || 'authorized signatory'} · ${pdfDate(a.internal_signed_at)}` : '';
  const markers: Marker[] = positions.map((p) => ({ ...p, label: p.signer === 'internal' ? internalLabel || `${a.signer_name || 'Countersigner'} signs here` : vendorLabel || 'Vendor signs here' }));
  const fileName = `${a.project_name.replace(/\s+/g, '_')}_signed`;

  const finish = async (list: StampedPage[], then: 'share' | 'print') => {
    const html = signedAgreementHtml(a, list, vendor);
    try {
      if (then === 'share') await sharePdf({ html, fileName });
      else await printPdf({ html, fileName });
    } catch (e) {
      toast.show(e instanceof FileError ? e.message : 'The PDF could not be made. Try again.', 'danger');
    }
  };
  const start = (then: 'share' | 'print') => {
    if (!filesQ.data || building) return;
    if (pages && got.current.length === pages) {
      void finish(got.current, then);
      return;
    }
    got.current = [];
    setBuilding({ done: 0, total: pages || 1, then });
    frame.current?.send({ type: 'build', positions, vendorSig: filesQ.data.vendorSig, internalSig: filesQ.data.internalSig, vendorLabel, internalLabel });
  };
  const onFrame = (m: WebFrameMessage) => {
    if (m.type === 'built' && typeof m.data === 'string') {
      const p = { data: m.data, w: Number(m.w) || 1, h: Number(m.h) || 1 };
      got.current = [...got.current, p];
      setBuilding((b) => (b ? { ...b, done: Number(m.page) || b.done + 1, total: Number(m.pages) || b.total } : b));
    } else if (m.type === 'builtAll') {
      const then = building?.then ?? 'share';
      setBuilding(null);
      void finish(got.current, then);
    } else if (m.type === 'buildError') {
      setBuilding(null);
      toast.show(String(m.message || 'The signed copy could not be made.'), 'danger');
    }
  };

  const notSigned = !a.signed_at;
  return (
    <Screen
      header={<NavHeader title="Signed copy" />}
      onRefresh={() => Promise.all([listQ.refetch(), filesQ.refetch()])}
      footer={
        filesQ.data && !notSigned ? (
          <ActionBar note={building ? `Stamping page ${Math.min(building.done + 1, building.total)} of ${building.total}…` : 'Made on this phone. Nobody is emailed.'}>
            <Button title={shareLabel} icon={<FileDown />} loading={!!building && building.then === 'share'} disabled={!!building || !pages} onPress={() => start('share')} />
            {Platform.OS !== 'web' ? <Button title="Print" variant="ghost" icon={<Printer />} loading={!!building && building.then === 'print'} disabled={!!building || !pages} onPress={() => start('print')} /> : null}
          </ActionBar>
        ) : undefined
      }>
      <SummaryHero icon={FileSignature} module="vendor" label={st.label} figure={<Text variant="title" numberOfLines={3}>{a.project_name}</Text>} sub={vendor} />
      {notSigned ? <Banner tone="info" title="Not signed yet" message="The signed copy can be made once the vendor has signed." /> : null}
      {a.status === 'pending_internal_signature' ? <Banner tone="warning" title="Waiting for the countersignature" message={`This copy has the vendor’s signature only. ${a.signer_name || 'The countersigner'} hasn’t signed yet.`} /> : null}
      <SummaryCard
        hideEmpty
        rows={[
          { key: 'v', label: 'Vendor signed', value: a.signed_at ? pdfDate(a.signed_at) : null, hint: a.signature_reference ? `Ref ${a.signature_reference}` : null },
          { key: 'i', label: 'Countersigned', value: a.internal_signed_at ? pdfDate(a.internal_signed_at) : null, hint: a.signer_name || null },
          { key: 's', label: 'Sign spots', value: String(positions.length) },
        ]}
      />
      {filesQ.isError ? (
        <ErrorState message={filesQ.error?.message || 'Couldn’t load the agreement.'} onRetry={() => void filesQ.refetch()} />
      ) : !filesQ.data ? (
        <Skeleton height={420} radius={16} />
      ) : (
        <View style={styles.viewer}>
          <PdfPageView b64={filesQ.data.draft} page={page} markers={markers} onPages={setPages} frameRef={frame} onFrameMessage={onFrame} />
          <PagePager page={page} pages={pages} onPage={setPage} />
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  viewer: { gap: space.sm },
}));
