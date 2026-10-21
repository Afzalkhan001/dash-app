// Each Inbox kind wears its module's colour (theme/tokens moduleTone), so a mixed list reads at a
// glance: attendance fixes in the attendance teal, leave / WFH / comp-off in the leave green, salary
// claims and advances in the pay gold, project claims in the expenses coral, petty cash in amber and
// visitors in their own teal. A domain plug-in's kind brings its own module and icon (itemLook). Rows lead with the kind's badge (ActivityRow module + icon, via
// kindLook), chips carry a dot, and the detail hero's icon circle wears the kind's colour.

import {
  Banknote,
  CalendarDays,
  CalendarPlus,
  DoorOpen,
  Fingerprint,
  HandCoins,
  House,
  type LucideIcon,
  Receipt,
  ReceiptIndianRupee,
} from 'lucide-react-native';
import { View } from 'react-native';

import type { InboxItem, InboxKind } from '@/features/inbox/format';
import { type ModuleKey, moduleTone, palette } from '@/theme/tokens';

export const KIND_LOOK: Record<InboxKind, { module: ModuleKey; icon: LucideIcon }> = {
  visitors: { module: 'visitors', icon: DoorOpen },
  leave: { module: 'leave', icon: CalendarDays },
  wfh: { module: 'leave', icon: House },
  comp_off: { module: 'leave', icon: CalendarPlus },
  regularization: { module: 'attendance', icon: Fingerprint },
  reimbursements: { module: 'pay', icon: ReceiptIndianRupee },
  loans: { module: 'pay', icon: HandCoins },
  keka: { module: 'expenses', icon: Receipt },
  petty: { module: 'pettyCash', icon: Banknote },
};

const lookOf = (kind: InboxKind) => KIND_LOOK[kind] ?? KIND_LOOK.leave;

/** The kind's module and icon (for an ActivityRow's `module` + `icon`), leave's when the kind is unknown. */
export const kindLook = lookOf;

/** An item's module and icon: a plug-in item brings its own (features/plugin-types InboxKindPlugin). */
export const itemLook = (item: InboxItem): { module: ModuleKey; icon: LucideIcon } => (item.kind === 'plugin' ? item.look : lookOf(item.kind));

/**
 * An 8 dp dot in the kind's colour for its filter chip. The Chip re-colours its icon (color/size),
 * so the dot takes its colour from `kind` and ignores those; on the selected (filled) chip it gets
 * a white ring so it still reads.
 */
export function KindDot({ kind, module, on }: { kind?: InboxKind; module?: ModuleKey; on?: boolean; color?: string; size?: number }) {
  // A plug-in's chip passes its module; a built-in kind's comes from KIND_LOOK.
  const tone = moduleTone[module ?? lookOf(kind ?? 'leave').module] ?? moduleTone.attendance;
  return (
    <View
      style={{
        width: on ? 10 : 8,
        height: on ? 10 : 8,
        borderRadius: 5,
        backgroundColor: tone.fg,
        borderWidth: on ? 1.5 : 0,
        borderColor: palette.onPrimary,
      }}
    />
  );
}
