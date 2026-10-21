// Dev-only gallery of the revamp kit (docs/REFERENCE-COMPONENTS.md): open /kit after signing in with the
// demo account. Renders nothing in production builds.
import { KitSectionA } from '@/features/dev/kit-a';
import { KitSectionB } from '@/features/dev/kit-b';
import { KitSectionC } from '@/features/dev/kit-c';
import { KitSectionD } from '@/features/dev/kit-d';
import { KitSectionE } from '@/features/dev/kit-e';
import { Screen } from '@/ui';

export default function KitGallery() {
  if (!__DEV__) return null;
  return (
    <Screen>
      <KitSectionE />
      <KitSectionA />
      <KitSectionB />
      <KitSectionC />
      <KitSectionD />
    </Screen>
  );
}
