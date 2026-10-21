// Delete a service request (IT Admin, Super Admin) — DELETE /tickets/:id (routes/tickets.js:346). The
// website has the route but no button; the owner asked for every website capability on the phone, so it
// is here behind the roles that run the whole desk (features/adminadvanced/access.ts).
//
//   ?id=<ticket id>  opens straight on that request (the service-desk screen can link here).
//
// The request disappears for the person who raised it and for the desk; a task already made from it
// stays (the server only deletes the ticket row) and the audit log keeps a copy. Its reference typed,
// then a swipe. Nobody is emailed or messaged.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Search, Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { type DeskTicket, useDeskTickets } from '@/api/servicedesk';
import { canDeleteTickets } from '@/features/adminadvanced/access';
import { useDeleteTicket } from '@/features/adminadvanced/api';
import { GateFallback, TypeToConfirm, typedMatches, useGate } from '@/features/adminadvanced/ui';
import { categoryLabelFor, kindIcon, kindLabel, matchesSearch, raiserOf, refOf, statusWords, whatOf, whenOf } from '@/features/servicedesk/format';
import { dateLabel } from '@/lib/dates';
import type { StatusTone } from '@/theme/tokens';
import {
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  ModuleBadge,
  NavHeader,
  PillField,
  Screen,
  SkeletonList,
  StatusPill,
  SuccessSheet,
  SummaryCard,
  Text,
} from '@/ui';

const OPEN = ['open', 'pending', 'pending_approval', 'in_progress', 'accepted', 'assigned'];
const toneOf = (st: string): StatusTone => (OPEN.includes(st) ? 'pending' : st === 'resolved' || st === 'closed' ? 'done' : st === 'rejected' || st === 'cancelled' ? 'failed' : 'neutral');
const PAGE = 40;

export default function DeleteTicketScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { access, pending } = useGate();
  const allowed = canDeleteTickets(access);
  const q = useDeskTickets(allowed);
  const del = useDeleteTicket();
  const [picked, setPicked] = useState<string | null>(typeof params.id === 'string' ? params.id : null);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleted, setDeleted] = useState<string | null>(null);

  const header = <NavHeader title="Delete a service request" />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const all = (q.data ?? []).slice().sort((a, b) => whenOf(b).localeCompare(whenOf(a)));
  const t: DeskTicket | null = picked ? (all.find((x) => x.id === picked) ?? null) : null;

  const done = (
    <SuccessSheet
      visible={!!deleted}
      onClose={() => setDeleted(null)}
      title="Request deleted"
      subtitle={deleted ? `${deleted} is gone from the desk and from the raiser’s list.` : undefined}
      secondaryLabel="Service desk"
      onSecondary={() => router.replace('/admin/service-desk')}
      onPrimary={() => setDeleted(null)}
    />
  );

  if (!t) {
    const list = all.filter((x) => matchesSearch(x, search));
    return (
      <Screen header={header} onRefresh={() => q.refetch()}>
        {picked && q.data && !deleted ? <Banner tone="warning" message="That request is no longer there. Pick another one." /> : null}
        <PillField icon={Search} placeholder="Reference, subject or person" value={search} onChangeText={(v) => {
            setSearch(v);
            setShown(PAGE);
          }} accessibilityLabel="Search requests" />
        {q.isError && !q.data ? (
          <ErrorState message={q.error?.message ?? 'The requests could not be loaded.'} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <SkeletonList rows={5} avatar />
        ) : !list.length ? (
          <EmptyState title={search.trim() ? 'No request matches' : 'No requests'} message={search.trim() ? 'Try a reference like TKT-1234.' : undefined} />
        ) : (
          <>
            <ListCard>
              {list.slice(0, shown).map((x) => (
                <ListRow
                  key={x.id}
                  left={<ModuleBadge module="support" icon={kindIcon(x)} />}
                  title={whatOf(x)}
                  subtitle={`${refOf(x)} · ${raiserOf(x)} · ${dateLabel(whenOf(x))}`}
                  subtitleLines={2}
                  right={<StatusPill label={statusWords(x.status)} tone={toneOf(x.status)} />}
                  onPress={() => {
                    setPicked(x.id);
                    setTyped('');
                  }}
                />
              ))}
            </ListCard>
            {list.length > shown ? <Button title={`Show more (${list.length - shown} left)`} variant="accent" size="md" onPress={() => setShown(shown + PAGE)} /> : null}
          </>
        )}
        {done}
      </Screen>
    );
  }

  const ref = refOf(t);
  const open = OPEN.includes(t.status);
  const run = () =>
    del.mutate(t.id, {
      onSuccess: () => {
        setConfirming(false);
        setTyped('');
        setPicked(null);
        setDeleted(ref);
      },
    });

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      <SummaryCard
        title={whatOf(t)}
        right={<StatusPill label={statusWords(t.status)} tone={toneOf(t.status)} />}
        rows={[
          { key: 'ref', label: 'Reference', value: ref },
          { key: 'kind', label: 'Kind', value: `${kindLabel(t)} · ${categoryLabelFor(t)}` },
          { key: 'who', label: 'Raised by', value: raiserOf(t) },
          { key: 'when', label: 'Raised on', value: dateLabel(whenOf(t)) },
          { key: 'to', label: 'Handled by', value: t.assignedTo || '—' },
        ]}
      />
      {open ? <Banner tone="warning" message="This request is still open. Deleting it stops it for everyone, and the raiser isn’t told." /> : null}
      <Banner tone="danger" message="The request is deleted for good. Any task already made from it stays. The activity log keeps a record." />
      <Button
        title="Delete this request"
        variant="destructive"
        icon={<Trash2 />}
        onPress={() => {
          del.reset();
          setTyped('');
          setConfirming(true);
        }}
      />
      <Button title="Pick another request" variant="accent" size="md" onPress={() => setPicked(null)} />

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this request?"
        subtitle="This can’t be undone"
        from={{ title: ref, subtitle: raiserOf(t), icon: kindIcon(t), module: 'support' }}
        to={{ title: 'Deleted for good', subtitle: 'No undo', icon: Trash2, module: 'expenses' }}
        confirmLabel="Swipe to delete the request"
        onConfirm={run}
        loading={del.isPending}
        disabled={!typedMatches(typed, ref)}
        note={`Nobody is emailed or messaged, ${raiserOf(t)} included.`}>
        <TypeToConfirm word={ref} value={typed} onChangeText={setTyped} what="reference" />
        {del.error ? <Banner tone="danger" title="Couldn’t delete" message={del.error.message} /> : null}
        <Text variant="caption" muted>
          {whatOf(t)}
        </Text>
      </ConfirmSheet>
      {done}
    </Screen>
  );
}
