// The former "Claims to approve" list. Approvals now live in one place, the Inbox, which carries
// project claims for everyone this list used to serve (features/inbox/use-inbox), so an old link here
// goes straight to the Inbox on its project-claims filter. The Inbox is a tab, so it is reached with
// router.dismissTo (back to the tabs underneath, or in place of this screen when opened cold) rather
// than a push, which would stack a second tab bar.

import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { NavHeader, Screen } from '@/ui';

export default function ClaimApprovalsMoved() {
  const router = useRouter();
  useEffect(() => {
    router.dismissTo('/inbox?type=keka');
  }, [router]);
  return <Screen header={<NavHeader title="Inbox" />}>{null}</Screen>;
}
