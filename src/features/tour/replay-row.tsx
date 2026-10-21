// "Show me around": the row that replays the role tour (docs/TOUR.md §2.2). Staff: More → Account,
// under Appearance. Vendors: Profile → Account, above Sign out. It is itself the tour's last target
// ("See this again"), so the tour can point at where to find it.

import { Compass, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';

import { replayRoleTour, type TourKind } from '@/features/tour/use-role-tour';
import { haptic, ListRow, ModuleBadge, toast, TourTarget } from '@/ui';

export function ShowMeAroundRow({ kind, left }: { kind: TourKind; left?: (icon: LucideIcon) => ReactNode }) {
  return (
    <TourTarget id={kind === 'vendor' ? 'vendor.showMeAround' : 'more.showMeAround'}>
      <ListRow
        left={left ? left(Compass) : <ModuleBadge module="profile" icon={Compass} />}
        title="Show me around"
        subtitle="A one-minute tour of the app"
        subtitleLines={2}
        chevron
        onPress={() => {
          haptic.select();
          if (!replayRoleTour(kind)) toast.show('The tour isn’t ready yet. Try again in a moment.', 'info');
        }}
        accessibilityHint="Starts a short tour that points out where everything is"
      />
    </TourTarget>
  );
}
