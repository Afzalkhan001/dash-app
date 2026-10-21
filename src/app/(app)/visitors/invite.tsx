// Invite a guest: one single-column form with "Review invite" in the sticky bar → a ConfirmSheet
// (You → the guest, the visit, "Swipe to send invite") → a SuccessSheet with the guest's code and
// [Share pass] [Done]. Same request as the web (POST /visitors/invites); see
// features/visitors/invite-form.tsx.

import { useRouter } from 'expo-router';
import { Send } from 'lucide-react-native';

import { InviteConfirmSheet, InviteDoneSheet, InviteFields, useInviteForm } from '@/features/visitors/invite-form';
import { useSharePass } from '@/features/visitors/invites';
import { ActionBar, Button, NavHeader, Screen } from '@/ui';

export default function InviteGuestScreen() {
  const router = useRouter();
  const state = useInviteForm();
  const made = state.made;
  const pass = useSharePass(made ? { id: made.id, guestName: made.guestName } : null);
  const done = () => {
    state.closeDone();
    if (router.canGoBack()) router.back();
    else router.replace('/visitors');
  };

  return (
    <Screen
      header={<NavHeader title="Invite a guest" />}
      footer={
        <ActionBar>
          <Button title="Review invite" icon={<Send />} loading={state.busy} onPress={state.submit} />
        </ActionBar>
      }>
      <InviteFields key={state.round} state={state} />
      <InviteConfirmSheet state={state} />
      <InviteDoneSheet state={state} sharing={pass.busy} onShare={pass.share} onDone={done} />
    </Screen>
  );
}
