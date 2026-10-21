// Pieces every payroll screen shares: the gate wrapper (a skeleton while /hr/me loads, then home for
// anyone without the gate — PLAN §2.1.6), plain-words helpers for months, days and money, and the
// header's eye button (the Pay screens' "Hide amounts" choice, shared so salary is masked everywhere).

import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useHrMe } from '@/api/me';
import type { PayLine, PayrollRun, RunStatus } from '@/api/payroll';
import { payrollGates, type PayrollGates } from '@/features/payroll/access';
import { usePayMoney, usePrivacyAction } from '@/features/pay/privacy';
import { MONTHS, MONTHS_LONG } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import type { StatusTone } from '@/theme/tokens';
import { type NavAction, Screen, SkeletonList } from '@/ui';

// ── Gate ─────────────────────────────────────────────────────────────────────
export function usePayrollGate(which: keyof PayrollGates) {
  const access = useAccess();
  const hrQ = useHrMe();
  const gates = payrollGates(access.hr, access.user);
  return { access, gates, pending: hrQ.isPending, allowed: gates[which] };
}

export function GateFallback({ pending, header }: { pending: boolean; header: ReactNode }) {
  if (!pending) return <Redirect href="/" />;
  return (
    <Screen header={header}>
      <SkeletonList rows={5} avatar tone="surface" />
    </Screen>
  );
}

/** The eye in the header, plus money that respects it. */
export function usePayView(): { money: ReturnType<typeof usePayMoney>; eye: NavAction } {
  return { money: usePayMoney(), eye: usePrivacyAction() };
}

// ── Words ────────────────────────────────────────────────────────────────────
export const errorText = (e: unknown, fallback = 'Something went wrong. Try again.') => (e instanceof Error && e.message ? e.message : fallback);

/** 'YYYY-MM' → "September 2026" (or "Sep 2026"). */
export function monthName(ym: string | null | undefined, short = false) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ''));
  if (!m) return String(ym ?? '');
  const i = Number(m[2]) - 1;
  return `${(short ? MONTHS : MONTHS_LONG)[i] ?? m[2]} ${m[1]}`;
}

/** The last `n` months up to and including `thisMonth` (IST), newest first. */
export function recentMonths(thisMonth: string, n = 12) {
  const [y, mo] = thisMonth.split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export const RUN_STATUS: Record<RunStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'pending' },
  locked: { label: 'Locked', tone: 'done' },
};
export const runStatus = (r: Pick<PayrollRun, 'status'> | null | undefined) => (r && RUN_STATUS[r.status]) || { label: String(r?.status ?? ''), tone: 'neutral' as StatusTone };

export const fmtDays = (n: number | null | undefined) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
/** Paise on a hero figure only while it still fits beside the eye (under ₹1,00,000, regular phones). */
export const heroDecimals = (n: number | null | undefined, compact: boolean) => (!compact && Math.abs(Number(n) || 0) < 100000 ? 2 : 0);

export const noun = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Rupees from a field ("1,20,000.50" → 120000.5), or null when it isn't money with ≤ 2 decimals. */
export function rupeesOf(s: string) {
  const t = String(s).replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
/** Only digits and one dot, at most 2 decimals, for a money field as it is typed. */
export function moneyTyping(s: string) {
  const t = s.replace(/[^\d.]/g, '');
  const [a, ...rest] = t.split('.');
  return rest.length ? `${(a ?? '').slice(0, 10)}.${rest.join('').slice(0, 2)}` : (a ?? '').slice(0, 10);
}

/** Sum of a list of pay lines. */
export const sumLines = (lines: PayLine[] | null | undefined) => (Array.isArray(lines) ? lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) : 0);

/** Paid days "29.5 of 31", plus what was not paid. */
export function daysLine(i: { payable_days: number; days_in_month: number; lop_days: number; pre_start_days: number; lop_override: number | null }) {
  const parts = [`${fmtDays(i.payable_days)} of ${i.days_in_month} days paid`];
  if (i.lop_days > 0) parts.push(`${fmtDays(i.lop_days)} unpaid${i.lop_override != null ? ' (set by HR)' : ''}`);
  if (i.pre_start_days > 0) parts.push(`${fmtDays(i.pre_start_days)} before joining`);
  return parts.join(' · ');
}

/** "earning"/"employer" calc in words: "40% of CTC", "₹1,600 a month", "50% of Basic", "What's left". */
export function calcWords(c: { calc: string; value: number }, inr: (n: number) => string) {
  switch (c.calc) {
    case 'fixed':
      return `${inr(c.value)} a month`;
    case 'pct_ctc':
      return `${c.value}% of CTC`;
    case 'pct_basic':
      return `${c.value}% of Basic`;
    case 'balance':
      return 'What’s left of the CTC';
    default:
      return c.calc;
  }
}
