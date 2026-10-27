// Start a call (website MeetsHub startCall, dash.html:10096): POST /meets/meetings {conversationId},
// then open the call screen. The server rings every other current member of the chat (SSE `meeting`)
// for 45 s, on the website and in the app. It is a call to people, so it goes through ConfirmSheet +
// SwipeToConfirm and says who rings. Nobody is emailed or WhatsApped.
//
// For the chat thread's phone button (chat domain): <StartCallSheet visible conversationId title
// memberCount onClose />. In Expo Go it explains instead: "Available in the installed app".
// From the Calls screen a person can be picked instead of a chat: on confirm their direct chat is
// opened (POST /meets/conversations {type:'direct'} returns the existing one) and the call starts there.
// The call goes in the phone's call log (call-log.ts), so the chat shows it once it is over.

import { useRouter } from 'expo-router';
import { Phone } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { callsApi } from '@/api/calls';
import { chatApi } from '@/api/chat';
import { isApiError, isDemoSession } from '@/api/client';
import { useSession } from '@/auth/session';
import { callSupport } from '@/features/calls/access';
import { logStart } from '@/features/calls/call-log';
import { UnavailableCard } from '@/features/calls/unavailable';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { Banner, Button, ConfirmSheet, haptic, Sheet, SummaryCard } from '@/ui';

export type CallTarget =
  | { kind: 'conversation'; conversationId: string; title: string; memberCount: number; group: boolean }
  | { kind: 'person'; personId: string; title: string };

export function StartCallSheet({ target, onClose }: { target: CallTarget | null; onClose: () => void }) {
  const router = useRouter();
  const me = useSession((s) => s.user);
  const support = callSupport(isDemoSession());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  if (target && support === 'unavailable') {
    return (
      <Sheet visible onClose={close} title={`Call ${target.title}`}>
        <UnavailableCard />
        <Button title="Close" variant="ghost" onPress={close} />
      </Sheet>
    );
  }

  const others = target?.kind === 'conversation' ? Math.max(0, target.memberCount - 1) : 1;
  const group = target?.kind === 'conversation' && target.group;
  const whoRings = group ? `${plural(others, 'person', 'people')} in ${target?.title}` : target?.title ?? '';

  const start = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    let conversationId = target.kind === 'conversation' ? target.conversationId : '';
    if (target.kind === 'person') {
      const c = await chatApi.createDirect(target.personId);
      if (isApiError(c) || !c?.conversation?.id) {
        setBusy(false);
        setError(isApiError(c) ? c.error : 'Couldn’t open the chat for this call.');
        return;
      }
      conversationId = c.conversation.id;
    }
    const r = await callsApi.start(conversationId);
    setBusy(false);
    if (isApiError(r) || !r?.meeting?.id) {
      setError(isApiError(r) ? r.error : 'Couldn’t start the call.');
      return;
    }
    haptic.success();
    logStart(r.meeting.id, conversationId, r.meeting.title ?? null);
    onClose();
    router.push({ pathname: '/call/[meetingId]', params: { meetingId: r.meeting.id, title: target.title } });
  };

  return (
    <ConfirmSheet
      visible={!!target}
      onClose={close}
      title={`Call ${target?.title ?? ''}?`}
      subtitle={support === 'demo' ? 'Demo call: colleagues answer on their own and no sound or video is sent.' : 'Audio first. You can turn your camera on in the call.'}
      from={{ title: me?.name || 'You', subtitle: 'Calling', avatar: { name: me?.name || 'You' } }}
      to={{ title: target?.title ?? '', subtitle: group ? plural(others, 'person', 'people') : 'Direct', avatar: { name: target?.title ?? '' } }}
      confirmLabel="Swipe to call"
      onConfirm={start}
      loading={busy}
      note={`Rings ${whoRings} in DASH, on the website and in the app, for 45 seconds. No email or WhatsApp is sent.`}>
      <View style={styles.gap}>
        {error ? <Banner tone="danger" title="Couldn’t start the call" message={error} /> : null}
        <SummaryCard
          rows={[
            { label: 'Who rings', value: whoRings },
            { label: 'Camera', value: 'Off until you turn it on' },
          ]}
        />
      </View>
    </ConfirmSheet>
  );
}

/** The phone icon for a header (chat thread): shows the sheet above. */
export const CALL_ICON = Phone;

const styles = themedStyles(() => ({
  gap: { gap: space.sm },
}));
