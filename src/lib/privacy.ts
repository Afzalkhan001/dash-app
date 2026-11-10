// Screen privacy, mounted once from the root layout (src/app/_layout.tsx) so no screen has to opt in.
//
// - useSensitiveScreenGuard(): no screenshots or screen recording while a private screen is on show
//   (sign-in codes and passwords, pay, payroll, bank details, people records…). Android also shows a
//   blank card for DASH in the recent apps while one is open (FLAG_SECURE). The list below is matched
//   against expo-router's pathname, which leaves out groups such as (app), (tabs) and (vendor).
// - useAppSwitcherProtection(): iOS blurs DASH in the app switcher for every signed-in session (Android
//   has no such switch; FLAG_SECURE above covers its private screens).
//
// expo-screen-capture is native: every call is wrapped and simply does nothing on the web or when the
// module is missing.

import { usePathname } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useSession } from '@/auth/session';

const GUARD_KEY = 'dash-sensitive';

// Route files these match (src/app/…):
//   (auth)/otp, vendor-otp, vendor-password, forgot · (app)/profile/index, profile/password
//   (app)/pay/payslips, payslip/[id], salary, fy, loans, advance, claims · (app)/admin/payroll/**
//   (app)/admin/grids/salaries, payroll, petty-ledger · (app)/admin/hr-advanced/payroll-setup, statutory,
//   structures/index, structures/[id] · (app)/admin/accounts/vendors/[id] · (vendor)/portal/(tabs)/profile
//   (KYC and bank), (vendor)/portal/register · (app)/petty-cash/statement/** · (app)/reimbursements/**
//   (app)/admin/people/[id], people/edit · (app)/admin/insights/devices/[email] · (app)/admin/it-desk/support
//   (app)/admin/company/subscriptions/[id] · (app)/admin/hiring/application/[id]
const SENSITIVE_PATHS: RegExp[] = [
  /^\/(otp|vendor-otp|vendor-password|forgot)$/,
  /^\/profile(\/password)?$/,
  /^\/pay\/(payslips|payslip\/[^/]+|salary|fy|loans|advance|claims)$/,
  /^\/admin\/payroll(\/.*)?$/,
  /^\/admin\/grids\/(salaries|payroll|petty-ledger)$/,
  /^\/admin\/hr-advanced\/(payroll-setup|statutory|structures(\/[^/]+)?)$/,
  /^\/admin\/accounts\/vendors\/[^/]+$/,
  /^\/portal\/(profile|register)$/,
  /^\/petty-cash\/statement(\/.*)?$/,
  /^\/reimbursements(\/.*)?$/,
  /^\/admin\/people\/(?!departments(\/|$))[^/]+$/,
  /^\/admin\/insights\/devices\/[^/]+$/,
  /^\/admin\/it-desk\/support$/,
  /^\/admin\/company\/subscriptions\/[^/]+$/,
  /^\/admin\/hiring\/application\/[^/]+$/,
];

/** True when screenshots are blocked on this path (as usePathname() gives it). */
export function isSensitivePath(pathname: string | null | undefined): boolean {
  const path = String(pathname || '').split('?')[0]!.replace(/\/+$/, '') || '/';
  return SENSITIVE_PATHS.some((re) => re.test(path));
}

// Whether this module currently blocks capture (so leaving a private screen only lifts our own block).
let blocking = false;

/** Blocks screenshots while a private screen is showing, and lifts the block when it is left. */
export function useSensitiveScreenGuard() {
  const sensitive = isSensitivePath(usePathname());
  useEffect(() => {
    if (Platform.OS === 'web' || sensitive === blocking) return;
    blocking = sensitive;
    try {
      const done = sensitive ? ScreenCapture.preventScreenCaptureAsync(GUARD_KEY) : ScreenCapture.allowScreenCaptureAsync(GUARD_KEY);
      void done.catch(() => {});
    } catch {
      // Not in this build: screenshots stay as they are.
    }
  }, [sensitive]);
}

/** iOS: blurs DASH in the app switcher while someone is signed in. Does nothing elsewhere. */
export function useAppSwitcherProtection() {
  const signedIn = useSession((s) => !!s.kind);
  useEffect(() => {
    if (Platform.OS !== 'ios' || !signedIn) return;
    try {
      void ScreenCapture.enableAppSwitcherProtectionAsync(1).catch(() => {});
    } catch {
      return;
    }
    return () => {
      try {
        void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
      } catch {
        // nothing to undo
      }
    };
  }, [signedIn]);
}
