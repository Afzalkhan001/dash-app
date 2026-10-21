// "Hide amounts" — the eye button on the pay screens, always in the header (the Me header while Pay
// is open, a round header action on the pay detail screens). Salary is the one thing people don't
// want readable over their shoulder, so the choice is remembered on the device and applies to every
// pay screen. Only the display is masked; nothing is re-fetched. Amounts stay masked for the moment it
// takes to read the saved choice, so someone who hid them never sees a flash of salary.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Eye, EyeOff } from 'lucide-react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { inr, inrCompact } from '@/lib/format';
import { palette } from '@/theme/tokens';
import { haptic, IconButton, type NavAction } from '@/ui';

type PayPrivacy = { hidden: boolean; ready: boolean; toggle: () => void; markReady: () => void };

export const usePayPrivacy = create<PayPrivacy>()(
  persist(
    (set) => ({
      hidden: false,
      ready: false, // the saved choice has been read (or reading it failed)
      toggle: () => set((s) => ({ hidden: !s.hidden })),
      markReady: () => set({ ready: true }),
    }),
    {
      name: 'dash.pay.privacy',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ hidden: s.hidden }),
      // Runs after hydration, on success and on failure alike.
      onRehydrateStorage: (initial) => () => initial.markReady(),
    },
  ),
);

// No storage at all would mean nothing to wait for (and no hydration callback): don't mask forever.
if (!usePayPrivacy.persist.getOptions().storage) usePayPrivacy.getState().markReady();

const selectHidden = (s: PayPrivacy) => s.hidden || !s.ready;

export const MASK = '₹ ••••••';

// Money formatters that respect the eye button.
export function usePayMoney() {
  const hidden = usePayPrivacy(selectHidden);
  return {
    hidden,
    inr: (n: number | null | undefined, opts?: { decimals?: boolean }) => (hidden ? MASK : inr(n, opts)),
    compact: (n: number | null | undefined) => (hidden ? '₹ ••••' : inrCompact(n)),
  };
}

/** The eye as a round NavHeader action (the pay detail screens' header). */
export function usePrivacyAction(): NavAction {
  const hidden = usePayPrivacy(selectHidden);
  const toggle = usePayPrivacy((s) => s.toggle);
  return {
    key: 'privacy',
    icon: hidden ? EyeOff : Eye,
    label: hidden ? 'Show amounts' : 'Hide amounts',
    onPress: () => {
      haptic.select();
      toggle();
    },
  };
}

/** The eye IconButton (40, 48 dp target) for a tab header (Me while Pay is open). */
export function PrivacyToggle({ onDark }: { onDark?: boolean }) {
  const hidden = usePayPrivacy(selectHidden);
  const toggle = usePayPrivacy((s) => s.toggle);
  const color = onDark ? palette.onPrimary : palette.text;
  return (
    <IconButton
      tone={onDark ? 'onPrimary' : 'muted'}
      accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
      onPress={() => {
        haptic.select();
        toggle();
      }}>
      {hidden ? <EyeOff size={20} color={color} strokeWidth={1.8} /> : <Eye size={20} color={color} strokeWidth={1.8} />}
    </IconButton>
  );
}
