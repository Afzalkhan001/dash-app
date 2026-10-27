// Calls — where to start a call on the phone and try what a ring looks like.
// The website starts calls from a chat's "Start call" button (dash.html:10245) and has a "Test call
// alert" (dash.html:10131); this screen offers both in one place:
//   - Start a call: my chats (current member only, the website's canPost) or anyone in the directory
//     (their direct chat is opened, the same as the website's New chat → Start call);
//   - Test call alert: the ring, so people know what it looks like (in the demo: a real demo call
//     from Priya Sharma that can be answered);
//   - what calls can do here: the limits from GET /meets/calls/config, whether a relay (TURN) is on,
//     and for IT / super admins which website setting the relay still needs (docs/CALLS-TURN.md).
//   - Recent calls: the phone's call log (features/calls/call-log.ts; the server and the website keep
//     none): missed in red, how long, when; Join while a call I was rung for is still going, otherwise
//     a tap calls back (asks first).
// In Expo Go: "Available in the installed app" — starting is explained, never attempted.

import { Redirect, useLocalSearchParams } from 'expo-router';
import { BellRing, Phone, UserRound } from 'lucide-react-native';
import { useState } from 'react';

import { useCallsConfig } from '@/api/calls';
import { type ConversationRow, type MeetsPerson, useConversations, useDirectory } from '@/api/chat';
import { isDemoSession } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { callSupport, canSeeCalls } from '@/features/calls/access';
import { JoinPill, useJoinCall } from '@/features/calls/call-bar';
import { type CallLogEntry, callHeadline, callLength, useCallHistory } from '@/features/calls/call-log';
import { IncomingCallWatcher, testCallAlert } from '@/features/calls/incoming-call';
import { type CallTarget, StartCallSheet } from '@/features/calls/start-call';
import { UnavailableCard } from '@/features/calls/unavailable';
import { rowTime } from '@/features/chat/format';
import { PeopleList } from '@/features/chat/people-list';
import { isWeb } from '@/lib/capabilities';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import { Avatar, Banner, EmptyState, IconBadge, LabelledSection, ListCard, ListRow, NavHeader, Screen, Sheet, SkeletonList, SummaryCard, Text } from '@/ui';

const RECENT = 6;
const RECENT_CALLS = 8;

// Who is told which website setting the relay still needs (the people who run DASH).
const RELAY_ADMINS = ['master_admin', 'super_admin', 'it_admin'];

function relayAdvice(state: string | undefined) {
  if (state === 'missing-secret') return 'MEETS_TURN_URLS is set but MEETS_TURN_SECRET is empty on the website host. The relay is used only when both are set.';
  if (state === 'missing-urls') return 'MEETS_TURN_SECRET is set but MEETS_TURN_URLS is empty on the website host. The relay is used only when both are set.';
  return 'Some mobile data and office networks only connect through a relay (TURN). Set MEETS_TURN_URLS and MEETS_TURN_SECRET on the website host. The steps are in docs/CALLS-TURN.md.';
}

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
  const history = useCallHistory();
  const joinCall = useJoinCall();
  const today = useTodayIst();

  if (user && !on) return <Redirect href="/" />;

  const convById = new Map((convs.data ?? []).map((c) => [c.id, c]));
  const recent = history.filter((e) => e.outcome !== 'in-call').slice(0, RECENT_CALLS);
  const callRow = (e: CallLogEntry) => {
    const c = e.conversationId ? convById.get(e.conversationId) : undefined;
    const name = c ? titleOf(c) : e.by?.name || e.title || 'Call';
    const live = e.outcome === 'ringing';
    const bad = e.outcome === 'missed' || e.outcome === 'declined';
    const back = c && !c.leftAt ? () => setTarget({ kind: 'conversation', conversationId: c.id, title: name, memberCount: c.memberCount, group: c.type === 'group' }) : undefined;
    const what = [callHeadline(e), e.outcome === 'answered' && e.seconds ? callLength(e.seconds) : null].filter(Boolean).join(' · ');
    const when = rowTime(e.at, today);
    return (
      <ListRow
        key={e.meetingId}
        left={<Avatar name={name} size={40} ring={false} />}
        title={name}
        titleColor={bad ? palette.dangerInk : undefined}
        subtitle={what}
        meta={when}
        right={live ? <JoinPill /> : back ? <Phone size={20} color={palette.primaryText} strokeWidth={1.8} /> : undefined}
        onPress={live ? () => joinCall(e, name) : back}
        accessibilityLabel={`${name}, ${what}, ${when}`}
        accessibilityHint={live ? 'Joins the call' : back ? 'Calls back. Asks first.' : undefined}
      />
    );
  };

  const rows = (convs.data ?? []).filter((c) => !c.leftAt).slice(0, RECENT);
  const max = cfg.data?.maxParticipants ?? 8;
  const relayOn = !!cfg.data?.hasTurn;
  const showRelayAdvice = support !== 'demo' && !!cfg.data && !relayOn && !!user && RELAY_ADMINS.includes(user.role);

  return (
    <Screen header={<NavHeader title="Calls" />} onRefresh={() => Promise.all([convs.refetch(), cfg.refetch()])}>
      {support === 'unavailable' ? <UnavailableCard /> : null}
      {showRelayAdvice ? <Banner tone="warning" title="Calls on some networks can’t connect yet" message={relayAdvice(cfg.data?.turnState)} /> : null}
      {support === 'demo' ? (
        <Banner tone="info" title="Demo calls" message="Colleagues answer on their own. No sound or video leaves this phone." />
      ) : null}

      {recent.length ? (
        <LabelledSection title="Recent calls">
          <ListCard tone="surface">{recent.map(callRow)}</ListCard>
          <Text variant="caption" muted>
            Calls this phone rang for or made. DASH doesn’t keep a call list.
          </Text>
        </LabelledSection>
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
            ...(support === 'live' && !isWeb() ? [{ label: 'Leaving the app', value: 'The call keeps going. Tap “DASH call in progress” to come back.' }] : []),
            ...(cfg.data && support !== 'demo' ? [{ label: 'Other networks', value: relayOn ? 'Relay on: calls connect on any network' : 'Direct only: some networks need a relay' }] : []),
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

