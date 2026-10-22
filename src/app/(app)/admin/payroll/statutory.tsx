// Statutory and TDS — the website's StatutorySettings (dash.html :5239), READ-ONLY on the phone:
// GET /hr/statutory (hr_payroll.js ~L62, the 'tax' module). Editing stays on the website (spec §4.3):
// about 40 values and slab tables that must be confirmed with the company's CA, where a typo silently
// changes everyone's tax. What a switched-on section still lacks is listed in red, because payroll
// refuses to run until it is filled in (hr_payroll.js buildItems).

import { router } from 'expo-router';

import { useStatutory } from '@/api/payroll';
import { missingLabel } from '@/features/hradvanced/statutory-model';
import { errorText, GateFallback, usePayrollGate } from '@/features/payroll/ui';
import { inr } from '@/lib/format';
import { Banner, ErrorState, NavHeader, Screen, SkeletonList, SummaryCard, type SummaryItem, Text } from '@/ui';

const money = (v: number | null | undefined) => (v == null ? 'Not set' : inr(v, { decimals: !Number.isInteger(v) }));
const pct = (v: number | null | undefined) => (v == null ? 'Not set' : `${v}%`);
/** Monthly gross range of a professional-tax slab: "Up to ₹15,000", "₹15,000.01 to ₹20,000", "₹20,000.01 and above". */
const slabRange = (min: number | null | undefined, max: number | null | undefined) =>
  max == null ? `${money(min)} and above` : !min ? `Up to ${money(max)}` : `${money(min)} to ${money(max)}`;
const rounding = (v: string | null | undefined) => (v === 'nearest' ? 'Nearest rupee' : v === 'up' ? 'Up to the next rupee' : 'Not set');

export default function StatutoryScreen() {
  const { pending, allowed } = usePayrollGate('statutory');
  const q = useStatutory(allowed);
  const header = <NavHeader title="Statutory and TDS" />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;
  if (q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={5} tone="surface" />
      </Screen>
    );
  }
  if (q.error || !q.data) {
    return (
      <Screen header={header}>
        <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  const { statutory: s, missing } = q.data;
  const ptStates = [...new Set(s.pt.slabs.map((x) => x.state))];
  const off: SummaryItem[] = [{ label: 'Status', value: 'Off', status: 'neutral' }];
  const regimeRows = (k: 'new' | 'old'): SummaryItem[] => {
    const r = s.tds.regimes[k];
    if (!r) return [{ label: 'Status', value: 'Not filled in' }];
    return [
      { label: 'Standard deduction', value: money(r.standardDeduction) },
      { label: 'Rebate if taxable up to', value: money(r.rebateLimit) },
      { label: 'Rebate up to', value: money(r.rebateMax) },
      { label: 'Cess', value: pct(r.cessPct) },
      ...r.slabs.map((x, i, a) => ({
        key: `${k}-${i}`,
        label: i === a.length - 1 ? `Above ${money(a[i - 1]?.upto ?? 0)}` : `Up to ${money(x.upto)}`,
        value: `${x.ratePct}%`,
      })),
    ];
  };

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {/* One notice: whether payroll can run, with the way to change the values. */}
      <Banner
        tone={missing.length ? 'danger' : 'success'}
        title={missing.length ? 'Payroll can’t run until these are filled in' : 'Ready for payroll'}
        message={missing.length ? missing.map(missingLabel).join(', ') : 'Every switched-on section has its values.'}
        action={{ label: 'Edit values', onPress: () => router.push('/admin/hr-advanced/statutory') }}
      />

      <SummaryCard
        title="Provident Fund"
        rows={
          s.pf.enabled
            ? [
                { label: 'Status', value: 'On', status: 'done' },
                { label: 'Employee', value: pct(s.pf.employeeRatePct) },
                { label: 'Employer', value: pct(s.pf.employerRatePct) },
                { label: 'PF wage capped at', value: s.pf.capAtCeiling ? money(s.pf.wageCeiling) : 'No cap' },
                { label: 'Rounding', value: rounding(s.pf.rounding) },
              ]
            : off
        }
      />
      <SummaryCard
        title="ESI"
        rows={
          s.esi.enabled
            ? [
                { label: 'Status', value: 'On', status: 'done' },
                { label: 'Employee', value: pct(s.esi.employeeRatePct) },
                { label: 'Employer', value: pct(s.esi.employerRatePct) },
                { label: 'When monthly gross is up to', value: money(s.esi.grossLimit) },
                { label: 'Rounding', value: rounding(s.esi.rounding) },
              ]
            : off
        }
      />
      <SummaryCard
        title="Professional tax"
        rows={
          s.pt.enabled
            ? [
                { label: 'Status', value: 'On', status: 'done' },
                // One state (the usual case) gets its own row, so each slab label is just the gross range.
                ...(ptStates.length === 1 ? [{ label: 'State', value: ptStates[0] }] : []),
                ...s.pt.slabs.map((x, i) => ({
                  key: `pt-${i}`,
                  label: `${ptStates.length === 1 ? '' : `${x.state} · `}${slabRange(x.minGross, x.maxGross)}`,
                  value: money(x.amount),
                })),
              ]
            : off
        }
      />
      <SummaryCard
        title="Income tax (TDS)"
        rows={[
          { label: 'Mode', value: s.tds.mode === 'slab' ? 'Calculated from slabs' : s.tds.mode === 'manual' ? 'A set amount per person' : 'Off' },
          ...(s.tds.mode === 'slab' ? [{ label: 'Default regime', value: s.tds.defaultRegime === 'old' ? 'Old' : s.tds.defaultRegime === 'new' ? 'New' : 'Not set' }] : []),
        ]}
      />
      {s.tds.mode === 'slab' ? <SummaryCard title="New regime (a year)" rows={regimeRows('new')} /> : null}
      {s.tds.mode === 'slab' ? <SummaryCard title="Old regime (a year)" rows={regimeRows('old')} /> : null}
      <Text variant="caption" muted align="center">
        No rates or slabs are built in: these are your company’s own values. Confirm them with your CA. Surcharge and marginal relief are not calculated, so check high earners by hand.
      </Text>
    </Screen>
  );
}
