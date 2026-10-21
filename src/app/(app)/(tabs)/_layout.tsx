// Bottom tabs (custom bar — see ui/tab-bar.tsx; motion and icons: docs/NAVBAR-MOTION.md). Four fixed tabs,
// Keka-style: Home · Me · (+) · Inbox · More. Me holds my attendance, leave and pay (src/features/me);
// Inbox is everything waiting for my action and carries the waiting count. The raised centre "+" (TabFab,
// not a tab) opens the CreateSheet (features/create/create-sheet.tsx): what this person can start —
// leave, a claim, a ticket, … — and turns into × while the sheet is open (the same `creating` state).
// The old /attendance, /leave and /pay links redirect into Me.
// Each tab and the + are first-sign-in tour targets (tabs.*, docs/TOUR.md); StaffTourHost starts that
// tour once Home is calm (never while the + sheet is open).
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { useEffect, useState } from 'react';

import { CreateSheet } from '@/features/create/create-sheet';
import { useInboxCount } from '@/features/inbox/use-inbox-count';
import { StaffTourHost } from '@/features/tour/hosts';
import { setAppBadge } from '@/lib/push';
import { TabBarFrame, TabButton, TabFab } from '@/ui/tab-bar';

export default function TabsLayout() {
  const inboxCount = useInboxCount();
  // The app icon's number follows the Inbox badge (features/push; a no-op in Expo Go and on the web).
  useEffect(() => setAppBadge(inboxCount), [inboxCount]);
  const [creating, setCreating] = useState(false);
  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <TabBarFrame>
          <TabTrigger name="index" href="/" asChild>
            <TabButton glyph="home" label="Home" tourId="tabs.home" />
          </TabTrigger>
          <TabTrigger name="me" href="/me" asChild>
            <TabButton glyph="me" label="Me" tourId="tabs.me" />
          </TabTrigger>
          <TabFab open={creating} onPress={() => setCreating(true)} tourId="tabs.create" />
          <TabTrigger name="inbox" href="/inbox" asChild>
            <TabButton glyph="inbox" label="Inbox" badge={inboxCount} tourId="tabs.inbox" />
          </TabTrigger>
          <TabTrigger name="more" href="/more" asChild>
            <TabButton glyph="more" label="More" tourId="tabs.more" />
          </TabTrigger>
        </TabBarFrame>
      </TabList>
      <CreateSheet visible={creating} onClose={() => setCreating(false)} />
      <StaffTourHost creating={creating} />
    </Tabs>
  );
}
