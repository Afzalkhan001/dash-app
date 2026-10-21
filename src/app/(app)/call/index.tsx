// Calls — where to start a call on the phone and try what a ring looks like.
// The website starts calls from a chat's "Start call" button (dash.html:10245) and has a "Test call
// alert" (dash.html:10131); this screen offers both in one place:
//   - Start a call: my chats (current member only, the website's canPost) or anyone in the directory
//     (their direct chat is opened, the same as the website's New chat → Start call);
//   - Test call alert: the ring, so people know what it looks like (in the demo: a real demo call
//     from Priya Sharma that can be answered);
//   - what calls can do here: the limits from GET /meets/calls/config.
// In Expo Go: "Available in the installed app" — starting is explained, never attempted.

import { Redirect, useLocalSearchParams } from 'expo-router';
import { BellRing, Phone, UserRound } from 'lucide-react-native';
import { useState } from 'react';

import { useCallsConfig } from '@/api/calls';
import { type ConversationRow, type MeetsPerson, useConversations, useDirectory } from '@/api/chat';
import { isDemoSession } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { callSupport, canSeeCalls } from '@/features/calls/access';
import { IncomingCallWatcher, testCallAlert } from '@/features/calls/incoming-call';
import { type CallTarget, StartCallSheet } from '@/features/calls/start-call';
import { UnavailableCard } from '@/features/calls/unavailable';
import { PeopleList } from '@/features/chat/people-list';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import { Avatar, Banner, EmptyState, IconBadge, LabelledSection, ListCard, ListRow, NavHeader, Screen, Sheet, SkeletonList, SummaryCard, Text } from '@/ui';

const RECENT = 6;

function titleOf(c: ConversationRow) {
  if (c.type === 'group') return c.name || 'Group';
  return c.others?.[0]?.name || c.name || 'Colleague';
}

export default function CallsScreen() {
  const params = useLocalSearchParams<{ start?: string }>();
  const user = useSession((s) => s.user);
  const tenant = useMyTenant().data;
  const on = canSeeCalls(user, tenant);
  const support = callSupport(isDemoSession());
  const convs = useConversations(on);
  const cfg = useCallsConfig(on);
  const [picking, setPicking] = useState(() => params.start === '1');
  const dir = useDirectory(on && picking);
  const [target, setTarget] = useState<CallTarget | null>(null);

  if (user && !on) return <Redirect href="/" />;

  const rows = (convs.data ?? []).filter((c) => !c.leftAt).slice(0, RECENT);
  const max = cfg.data?.maxParticipants ?? 8;

  return (
    <Screen header={<NavHeader title="Calls" />} onRefresh={() => Promise.all([convs.refetch(), cfg.refetch()])}>
      {support === 'unavailable' ? <UnavailableCard /> : null}
      {support === 'demo' ? (
        <Banner tone="info" title="Demo calls" message="Colleagues answer on their own. No sound or video leaves this phone." />
      ) : null}

      <LabelledSection title="Start a call">
        {convs.isPending ? (
          <SkeletonList rows={3} avatar />
        ) : (
          <ListCard tone="surface">
            {rows.map((c) => {
              const title = titleOf(c);
              const group = c.type === 'group';
              return (
                <ListRow
                  key={c.id}
                  left={<Avatar name={title} size={40} ring={false} />}
                  title={title}
                  subtitle={group ? plural(c.memberCount, 'member') : c.others?.[0]?.dept || 'Direct message'}
                  right={<Phone size={20} color={palette.primaryText} strokeWidth={1.8} />}
                  accessibilityLabel={`Call ${title}`}
                  onPress={() => setTarget({ kind: 'conversation', conversationId: c.id, title, memberCount: c.memberCount, group })}
                />
              );
            })}
            <ListRow
              left={
                <IconBadge bg={palette.primarySoft}>
                  <UserRound size={20} color={palette.primaryText} strokeWidth={1.8} />
                </IconBadge>
              }
              title="Someone else"
              subtitle="Anyone in the company directory"
              chevron
              onPress={() => setPicking(true)}
            />
          </ListCard>
        )}
        {!convs.isPending && rows.length === 0 ? (
          <EmptyState title="No chats yet" message="Pick someone above. Calls start from a chat, so DASH opens one with them." />
        ) : null}
      </LabelledSection>

      <LabelledSection title="Ringing">
        <ListCard tone="surface">
          <ListRow
            left={
              <IconBadge bg={palette.successSoft}>
                <BellRing size={20} color={palette.successInk} strokeWidth={1.8} />
              </IconBadge>
            }
            title="Test call alert"
            subtitle={support === 'demo' ? 'Priya Sharma calls you. Answer or decline it.' : 'See what an incoming call looks like. Nobody is told.'}
            subtitleLines={2}
            chevron
            onPress={() => testCallAlert(user?.name as string | undefined)}
          />
        </ListCard>
      </LabelledSection>

      <LabelledSection title="How calls work">
        <SummaryCard
          rows={[
            { label: 'People in a call', value: `Up to ${max}` },
            { label: 'Starts with', value: 'Sound only. Camera when you want it.' },
            { label: 'Rings for', value: '45 seconds, while DASH is open' },
            { label: 'Screen sharing', value: 'Watch here. Share from a computer.' },
          ]}
        />
      </LabelledSection>

      <Text variant="caption" muted align="center">
        Calls go straight between phones and browsers. DASH sets them up and never carries the sound or picture.
      </Text>

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Call someone" subtitle="Their phone and their DASH website ring.">
        <PeopleList
          people={dir.data ?? []}
          loading={dir.isLoading}
          error={dir.isError ? dir.error?.message ?? 'Couldn’t load people.' : null}
          onRetry={() => void dir.refetch()}
          selected={[]}
          multi={false}
          onPick={(p: MeetsPerson) => {
            setPicking(false);
            setTarget({ kind: 'person', personId: p.id, title: p.name || p.email || 'Colleague' });
          }}
          emptyText="Nobody to call."
        />
      </Sheet>

      <StartCallSheet target={target} onClose={() => setTarget(null)} />
      <IncomingCallWatcher />
    </Screen>
  );
}

