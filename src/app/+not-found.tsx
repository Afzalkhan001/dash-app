// Unknown route (an old deep link or a link to a screen the app doesn't have). One neutral empty
// state, vertically centred, with a single way out (§10.5): back to the start.

import { useRouter } from 'expo-router';
import { Compass, House } from 'lucide-react-native';

import { palette } from '@/theme/tokens';
import { Button, EmptyState, Screen } from '@/ui';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <EmptyState
        icon={<Compass color={palette.textMuted} strokeWidth={1.8} />}
        title="Page not found"
        message="This link doesn’t open anything in DASH. Head back home to carry on."
        action={<Button title="Go home" variant="accent" size="md" icon={<House />} onPress={() => router.replace('/')} />}
      />
    </Screen>
  );
}
