// The salary-structure editor's rules, the same as the server's, so a mistake is shown on the row
// before anything is sent (hr_payroll_calc.js validateComponents ~L26, hr_payroll.js readStructure
// ~L98). The server still decides: its own words are shown if it refuses.
//
// Values are rupees a month for `fixed`, a percentage (0–100, 2 decimals) otherwise; `balance` takes
// what is left of the monthly CTC.

import type { CompCalc, CompKind, SalaryComponent, SalaryStructure } from '@/api/payroll';

/** One editable row: the value is kept as typed text until it is sent. */
export type DraftComp = { key: string; code: string; name: string; kind: CompKind; calc: CompCalc; value: string; taxable: boolean; pf_wage: boolean };
export type DraftStructure = { name: string; description: string; components: DraftComp[] };

export const MAX_COMPONENTS = 20;
const CODE_RE = /^[A-Z][A-Z0-9_]{1,11}$/;

let seq = 0;
const rowKey = () => `c${Date.now().toString(36)}${(++seq).toString(36)}`;

export const CALC_OPTIONS: { value: CompCalc; label: string; hint: string }[] = [
  { value: 'fixed', label: 'Fixed amount', hint: 'Rupees a month' },
  { value: 'pct_ctc', label: '% of CTC', hint: 'Part of the monthly CTC' },
  { value: 'pct_basic', label: '% of Basic', hint: 'Part of the Basic line' },
  { value: 'balance', label: 'What’s left', hint: 'The rest of the monthly CTC' },
];
export const KIND_OPTIONS: { key: CompKind; label: string }[] = [
  { key: 'earning', label: 'Paid to the person' },
  { key: 'employer', label: 'Paid by the company' },
];

/** dash.html HR_COMP_BLANK (:5166). */
export const blankComp = (): DraftComp => ({ key: rowKey(), code: '', name: '', kind: 'earning', calc: 'fixed', value: '', taxable: true, pf_wage: false });

/** "New structure" starts with BASIC 40% of CTC, HRA 50% of Basic and SPECIAL the balance (dash.html:5177). */
export function newStructureDraft(): DraftStructure {
  return {
    name: '',
    description: '',
    components: [
      { ...blankComp(), code: 'BASIC', name: 'Basic', calc: 'pct_ctc', value: '40', pf_wage: true },
      { ...blankComp(), code: 'HRA', name: 'House Rent Allowance', calc: 'pct_basic', value: '50' },
      { ...blankComp(), code: 'SPECIAL', name: 'Special Allowance', calc: 'balance', value: '0' },
    ],
  };
}

export function draftOf(s: SalaryStructure): DraftStructure {
  return {
    name: s.name,
    description: s.description || '',
    components: s.components.map((c) => ({ key: rowKey(), code: c.code, name: c.name, kind: c.kind, calc: c.calc, value: c.calc === 'balance' ? '0' : String(c.value), taxable: c.taxable !== false, pf_wage: !!c.pf_wage })),
  };
}

const twoDecimals = (t: string) => /^\d+(\.\d{1,2})?$/.test(t.trim());

/** What the server would say about one row (null when it is fine). */
export function rowError(c: DraftComp, all: DraftComp[]): string | null {
  const code = c.code.trim().toUpperCase();
  if (!CODE_RE.test(code)) return 'Code: 2–12 capital letters or digits, starting with a letter (e.g. HRA).';
  if (all.filter((x) => x.code.trim().toUpperCase() === code).length > 1) return `${code} appears twice.`;
  if (c.name.trim().length < 2) return 'Give it a name.';
  if (c.calc === 'fixed' && !twoDecimals(c.value)) return 'Rupees a month, up to 2 decimals.';
  if ((c.calc === 'pct_ctc' || c.calc === 'pct_basic') && (!twoDecimals(c.value) || Number(c.value) > 100)) return 'A percentage from 0 to 100, up to 2 decimals.';
  if (c.calc === 'balance' && c.kind !== 'earning') return 'Only a line paid to the person can take what’s left.';
  if (code === 'BASIC' && !['fixed', 'pct_ctc'].includes(c.calc)) return 'Basic must be a fixed amount or a % of CTC.';
  if (code === 'BASIC' && c.kind !== 'earning') return 'Basic must be paid to the person.';
  return null;
}

/** The structure-level problems (null when it can be sent). */
export function structureError(d: DraftStructure): string | null {
  if (d.name.trim().length < 2) return 'Give the structure a name (2 to 60 characters).';
  if (d.components.length < 1 || d.components.length > MAX_COMPONENTS) return `A structure needs 1 to ${MAX_COMPONENTS} parts.`;
  for (const c of d.components) {
    const e = rowError(c, d.components);
    if (e) return `${c.code.trim().toUpperCase() || 'A part'}: ${e}`;
  }
  if (!d.components.some((c) => c.code.trim().toUpperCase() === 'BASIC')) return 'A structure must have a BASIC part.';
  if (d.components.filter((c) => c.calc === 'balance').length > 1) return 'Only one part can take what’s left.';
  return null;
}

/** The body the website sends (dash.html:5170 comps). */
export function componentsOf(d: DraftStructure): SalaryComponent[] {
  return d.components.map((c) => ({
    code: c.code.trim().toUpperCase(),
    name: c.name.trim(),
    kind: c.kind,
    calc: c.calc,
    value: c.calc === 'balance' ? 0 : Number(c.value),
    taxable: c.taxable !== false,
    pf_wage: !!c.pf_wage,
  }));
}

export const bodyOf = (d: DraftStructure) => ({ name: d.name.trim().slice(0, 60), description: d.description.trim().slice(0, 300), components: componentsOf(d) });

/** What changed, in plain words, for the confirm sheet. */
export function changesOf(before: SalaryStructure | null, d: DraftStructure, words: (c: SalaryComponent) => string): string[] {
  const after = componentsOf(d);
  if (!before) return after.map((c) => `Adds ${c.name} (${c.code}) · ${words(c)}`);
  const out: string[] = [];
  if (before.name !== d.name.trim()) out.push(`Name: “${before.name}” → “${d.name.trim()}”`);
  if ((before.description || '') !== d.description.trim()) out.push('Description changed');
  const was = new Map(before.components.map((c) => [c.code, c]));
  const now = new Map(after.map((c) => [c.code, c]));
  for (const c of after) {
    const b = was.get(c.code);
    if (!b) out.push(`Adds ${c.name} (${c.code}) · ${words(c)}`);
    else if (b.name !== c.name || b.kind !== c.kind || b.calc !== c.calc || Number(b.value) !== Number(c.value) || b.taxable !== c.taxable || b.pf_wage !== c.pf_wage)
      out.push(`${c.code}: ${words(b)} → ${words(c)}${b.taxable !== c.taxable ? (c.taxable ? ' · now taxable' : ' · now not taxable') : ''}${b.pf_wage !== c.pf_wage ? (c.pf_wage ? ' · now counts for PF' : ' · no longer counts for PF') : ''}`);
  }
  for (const b of before.components) if (!now.has(b.code)) out.push(`Removes ${b.name} (${b.code})`);
  return out;
}
