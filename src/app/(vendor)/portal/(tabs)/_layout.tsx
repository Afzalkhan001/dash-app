// Vendor bottom tabs (custom bar — see ui/tab-bar.tsx; motion and icons: docs/NAVBAR-MOTION.md): Home ·
// Bills · Agreements · Profile.
// Agreements carries a badge while something is waiting for the vendor's signature.
// Bills and Agreements only open after approval, so until then the bar shows Home · Profile: their
// triggers stay registered (hidden) so the routes and any links to them keep working.
// Each tab is a first-sign-in tour target (vtabs.*, docs/TOUR.md); VendorTourHost starts that tour.
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';

import { useVendorAgreements, useVendorMe } from '@/api/vendor';
import { useNow } from '@/features/attendance/use-now';
import { VendorTourHost } from '@/features/tour/hosts';
import { agreementExpired, agreementPending } from '@/features/vendor/constants';
import { TabBarFrame, TabButton } from '@/ui/tab-bar';

const HIDDEN = { display: 'none' } as const;

function useVendorTabs() {
  const now = useNow();
  const me = useVendorMe();
  const approved = me.data?.status === 'approved';
  const agreements = useVendorAgreements(approved);
  if (!approved) return { approved, badge: 0 };
  const list = Array.isArray(agreements.data) ? agreements.data : [];
  return { approved, badge: list.filter((a) => !!a && agreementPending(a) && !agreementExpired(a, now)).length };
}

export default function VendorTabsLayout() {
  const { approved, badge } = useVendorTabs();
  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <TabBarFrame>
          <TabTrigger name="index" href="/portal" asChild>
            <TabButton glyph="home" label="Home" tourId="vtabs.home" />
          </TabTrigger>
          {approved ? (
            <TabTrigger name="bills" href="/portal/bills" asChild>
              <TabButton glyph="bills" label="Bills" tourId="vtabs.bills" />
            </TabTrigger>
          ) : (
            <TabTrigger name="bills" href="/portal/bills" style={HIDDEN} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          )}
          {approved ? (
            <TabTrigger name="agreements" href="/portal/agreements" asChild>
              <TabButton glyph="agreements" label="Agreements" badge={badge} tourId="vtabs.agreements" />
            </TabTrigger>
          ) : (
            <TabTrigger
              name="agreements"
              href="/portal/agreements"
              style={HIDDEN}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          )}
          <TabTrigger name="profile" href="/portal/profile" asChild>
            <TabButton glyph="profile" label="Profile" tourId="vtabs.profile" />
          </TabTrigger>
        </TabBarFrame>
      </TabList>
      <VendorTourHost />
    </Tabs>
  );
}
