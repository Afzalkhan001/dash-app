// Delete all assets (IT Admin) — the website's asset catalogue ⋮ → "Delete all assets…"
// (dash.html:20600 → deleteAllAssets :20415): one DELETE /assets/:id per asset. The server checks no
// role and keeps no copy, so every asset and its assignment history is gone, including the ones people
// hold right now. The app re-reads the list just before deleting, asks for the count typed out and a
// swipe, and lists any asset the server refused. Nobody is emailed.

import { useRouter } from 'expo-router';
import { Boxes, Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { useAssets } from '@/api/itdesk';
import { canDeleteAllAssets } from '@/features/adminadvanced/access';
import { useDeleteAllAssets } from '@/features/adminadvanced/api';
import { GateFallback, plural, TypeToConfirm, typedMatches, useGate } from '@/features/adminadvanced/ui';
import { palette } from '@/theme/tokens';
import {
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  NavHeader,
  Screen,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  Text,
} from '@/ui';

export default function DeleteAssetsScreen() {
  const router = useRouter();
  const { access, pending } = useGate();
  const allowed = canDeleteAllAssets(access);
  const q = useAssets(allowed);
  const del = useDeleteAllAssets();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<{ deleted: number; failed: { id: string; name: string }[] } | null>(null);

  const header = <NavHeader title="Delete all assets" />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const list = q.data ?? [];
  const n = list.length;
  const held = list.filter((a) => a.assignedTo || a.assignedToEmpNo).length;
  const word = `delete ${n} assets`;

  const run = () => {
    setDone(0);
    del.mutate(
      { expected: n, onProgress: (d) => setDone(d) },
      {
        onError: () => void q.refetch(),
        onSuccess: (r) => {
          setConfirming(false);
          setTyped('');
          setResult({ deleted: r.deleted, failed: r.failed });
        },
      },
    );
  };

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {q.isError && !q.data ? (
        <ErrorState message={q.error?.message ?? 'The assets could not be loaded.'} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <SkeletonList rows={3} />
      ) : !n ? (
        <EmptyState icon={<Boxes color={palette.textMuted} />} title="No assets" message="The catalogue is already empty." />
      ) : (
        <>
          <SummaryHero label="Assets in the catalogue" icon={Boxes} module="support" value={n} />
          <Banner
            tone="danger"
            title="Every asset goes, for good"
            message="Each asset and its whole assignment history is deleted. People holding one lose it from their profile. There is no undo, on the website either."
          />
          <SummaryCard
            rows={[
              { key: 'all', label: 'Assets', value: plural(n, 'asset') },
              { key: 'held', label: 'With someone now', value: plural(held, 'asset'), valueColor: held ? palette.warningInk : undefined },
              { key: 'free', label: 'In stock', value: plural(n - held, 'asset') },
            ]}
          />
          <Button
            title={`Delete all ${n} assets`}
            variant="destructive"
            icon={<Trash2 />}
            onPress={() => {
              del.reset();
              setTyped('');
              setConfirming(true);
            }}
          />
          <Text variant="caption" muted align="center">
            To delete one asset, open it in Assets instead.
          </Text>
        </>
      )}

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete all ${n} assets?`}
        subtitle="This can’t be undone"
        from={{ title: plural(n, 'asset'), subtitle: held ? `${held} with someone` : 'All in stock', icon: Boxes, module: 'support' }}
        to={{ title: 'Deleted for good', subtitle: 'History too', icon: Trash2, module: 'expenses' }}
        confirmLabel="Swipe to delete every asset"
        onConfirm={run}
        loading={del.isPending}
        disabled={!typedMatches(typed, word)}
        note="Nobody is emailed or messaged.">
        <TypeToConfirm word={word} value={typed} onChangeText={setTyped} what="words" />
        {del.isPending ? (
          <Text variant="caption" muted align="center">
            Deleting… {done} of {n}
          </Text>
        ) : null}
        {del.error ? <Banner tone="danger" title="Couldn’t delete" message={del.error.message} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={!!result}
        onClose={() => setResult(null)}
        title={result?.failed.length ? 'Some assets are left' : 'All assets deleted'}
        subtitle={result ? `${plural(result.deleted, 'asset')} deleted.` : undefined}
        secondaryLabel="Open Assets"
        onSecondary={() => router.replace('/admin/it-desk/assets')}
        onPrimary={() => setResult(null)}>
        {result?.failed.length ? (
          <ListCard title={`The server kept ${result.failed.length}`}>
            {result.failed.slice(0, 20).map((a) => (
              <ListRow key={a.id} title={a.name || a.id} subtitle="Couldn’t be deleted. Try again." />
            ))}
          </ListCard>
        ) : null}
      </SuccessSheet>
    </Screen>
  );
}
