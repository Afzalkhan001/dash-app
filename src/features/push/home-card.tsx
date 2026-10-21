// Home's one-time soft ask (spec §4.3): explain first, and only show the phone's own prompt after
// "Turn on". Shown once, until it is answered or dismissed (AsyncStorage dash.push.softAsk), and only
// where notifications can actually arrive (the installed app, or the demo on a phone).
//
// It also starts the push bridge (taps → screens, registering after sign-in), so push works even
// before the integrator mounts <PushBridge/> in the app layout.
//
// Renders null once the ask is answered: Home lays its sections out with flex gap, so an empty card
// leaves no hole (noted in HANDOFF.md, since EXTENSION-POINTS §6 prefers a card that always renders).

import { BellRing } from 'lucide-react-native';
import { View } from 'react-native';

import { usePushBridge } from '@/features/push/bridge';
import { hideSoftAsk, pushSupport, requestPushPermission, usePushState } from '@/lib/push';
import { ActionRow, Banner, Button, haptic, toast } from '@/ui';

export function PushAskCard() {
  usePushBridge();
  const softAsk = usePushState((s) => s.softAsk);
  const permission = usePushState((s) => s.permission);
  const busy = usePushState((s) => s.busy);
  const support = pushSupport();
  const canArrive = support === 'remote' || support === 'demo';
  if (!canArrive || softAsk !== 'show' || permission !== 'undetermined') return null;

  const turnOn = async () => {
    const p = await requestPushPermission();
    if (p === 'granted') {
      haptic.success();
      toast.show('Notifications are on');
    } else if (p === 'denied') {
      toast.show('Notifications are off. You can turn them on in More › Notifications.', 'info');
    }
  };

  return (
    <View accessibilityLabel="Turn on notifications">
      <Banner
        tone="info"
        icon={BellRing}
        title="Know the moment something needs you"
        message="Get a notification when a visitor is at reception or a task, ticket or approval is waiting. Sign-in codes are never sent this way."
        action={
          <ActionRow context="card">
            <Button
              variant="ghost"
              size="sm"
              title="Not now"
              onPress={() => {
                void hideSoftAsk();
                toast.show('You can turn them on any time in More › Notifications.', 'info');
              }}
            />
            <Button size="sm" title="Turn on" loading={busy} onPress={() => void turnOn()} />
          </ActionRow>
        }
      />
    </View>
  );
}
