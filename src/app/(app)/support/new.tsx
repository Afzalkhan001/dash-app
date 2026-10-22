// Raise a Support request (web: SupportView's Raise Ticket / Request Asset / Admin Requests tabs).
// Pick what it is about with SelectTiles (IT help, Equipment, Office, Complaint), fill the short form,
// then "Review request" in the sticky bar (its note says what is still missing, then where it goes) →
// a ConfirmSheet (You → who handles it, what will be sent, "Swipe to send request") → a SuccessSheet
// with the reference and [View request] [Done]. The request is then on top of "My help requests".
// ?kind=ticket|asset|admin_request|complaint preselects the form.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { Ticket } from '@/api/support';
import { useSession } from '@/auth/session';
import { CATEGORY, refNo, subjectLabel, ticketStatus } from '@/features/support/format';
import { HANDLER, RequestFields, type RequestKind, requestSummary, useRequestForm, WHERE } from '@/features/support/request-forms';
import { space } from '@/theme/tokens';
import { ActionBar, Button, ConfirmSheet, NavHeader, Screen, SectionHeader, SelectTiles, SuccessSheet, SummaryCard } from '@/ui';

import { themedStyles } from '@/theme/themed';
import { webNav } from '@/lib/access';
import { RouteGate } from '@/features/shared/route-gate';

const KINDS: RequestKind[] = ['ticket', 'asset', 'admin_request', 'complaint'];

const SENT: Record<RequestKind, string> = {
  ticket: 'IT Admin will pick it up. Follow it in My help requests.',
  asset: 'Admin will look at it for approval. Follow it in My help requests.',
  admin_request: 'Admin will arrange it. Follow it in My help requests.',
  complaint: 'Admin will look into it. Follow it in My help requests.',
};

/** Wait for the confirm sheet to close before the success sheet opens (iOS presents one Modal at a time). */
const SHEET_SWAP_MS = 380;

// Help & support is for the roles whose web menu has it (not the platform owner or the office TV).
export default function NewSupportRequest() {
  const user = useSession((s) => s.user);
  return (
    <RouteGate allow={webNav(user, 'support', null)}>
      <NewSupportRequestBody />
    </RouteGate>
  );
}

function NewSupportRequestBody() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const me = useSession((s) => s.user?.name) || '';
  const [kind, setKind] = useState<RequestKind>(KINDS.includes(params.kind as RequestKind) ? (params.kind as RequestKind) : 'ticket');
  const [sent, setSent] = useState<{ kind: RequestKind; record: Ticket } | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const form = useRequestForm(kind, (k, record) => {
    setSent({ kind: k, record });
    setTimeout(() => setDoneOpen(true), SHEET_SWAP_MS);
  });
  const leave = () => {
    setDoneOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace('/support');
  };

  const pending = form.pending;
  const handler = HANDLER[kind];
  const Icon = CATEGORY[kind]!.icon;
  const st = sent ? ticketStatus(sent.record.status) : null;

  return (
    <Screen
      header={<NavHeader title="Raise a request" />}
      footer={
        <ActionBar note={form.note}>
          <Button title="Review request" icon={<Send />} disabled={!form.ready} loading={form.busy} onPress={form.review} />
        </ActionBar>
      }>
      {/* Which form. Locked while a request is being sent, so switching can't clear the form in flight. */}
      <View style={styles.kinds}>
        <SectionHeader title="What do you need?" />
        <SelectTiles<RequestKind>
          accessibilityLabel="Kind of request"
          value={kind}
          onChange={(k) => {
            if (form.busy) return;
            setKind(k);
            form.reset();
          }}
          options={KINDS.map((k) => ({ value: k, label: CATEGORY[k]!.short, icon: CATEGORY[k]!.icon, disabled: form.busy && k !== kind }))}
        />
      </View>
      <RequestFields kind={kind} form={form} />

      <ConfirmSheet
        visible={form.confirmOpen}
        onClose={form.closeConfirm}
        title={kind === 'complaint' ? 'Send this complaint?' : 'Send this request?'}
        from={{ title: 'You', subtitle: me || CATEGORY[kind]!.label, avatar: { name: me || 'You' } }}
        to={{ title: handler.title, subtitle: handler.subtitle, icon: Icon, module: 'support' }}
        detailsTitle={CATEGORY[kind]!.label}
        confirmLabel={kind === 'complaint' ? 'Swipe to send complaint' : 'Swipe to send request'}
        onConfirm={form.send}
        loading={form.busy}
        note={WHERE[kind]}>
        {pending ? <SummaryCard rows={requestSummary(pending)} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={doneOpen && !!sent}
        onClose={() => setDoneOpen(false)}
        title={sent?.kind === 'complaint' ? 'Complaint sent' : 'Request sent'}
        subtitle={sent ? SENT[sent.kind] : undefined}
        secondaryLabel="View request"
        onSecondary={() => {
          if (!sent) return;
          setDoneOpen(false);
          router.replace(`/support/${encodeURIComponent(sent.record.id)}`);
        }}
        primaryLabel="Done"
        onPrimary={leave}>
        {sent && st ? (
          <SummaryCard
            rows={[
              { key: 'ref', label: 'Reference', value: refNo(sent.record.id, sent.kind) },
              { key: 'what', label: 'Request', value: subjectLabel(sent.record) },
              { key: 'status', label: 'Status', value: st.label, status: st.tone },
            ]}
          />
        ) : null}
      </SuccessSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  kinds: { gap: space.sm },
}));
