// One haptic helper for the whole app (docs/DESIGN.md §7.24). At most one haptic per user action:
//   select   tab / segment / chip / picker value change
//   impact   clock in or out committed (button press)
//   success  clock-in recorded, approve succeeded, request submitted, payslip downloaded
//   warning  reject succeeded; submit blocked by validation
//   error    request failed
// Every call is fire-and-forget and never throws (devices without a haptic engine just do nothing).

import * as Haptics from 'expo-haptics';

export const haptic = {
  select: () => void Haptics.selectionAsync().catch(() => {}),
  impact: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};
