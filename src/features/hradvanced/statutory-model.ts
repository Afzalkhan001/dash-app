// The Statutory & TDS editor's form, ported from dash.html:5239 StatutorySettings: the values are kept
// as typed text, turned into the website's PUT /hr/statutory body (`num`: blank → null), and checked
// with the server's own rules first (hr_payroll_calc.js normaliseRegime / normaliseStatutory ~L90–150)
// so a mistake is shown on the field. What a switched-on section still lacks is listed the same way
// the server does (statutoryMissing), because payroll refuses to run until it is filled in.

import type { PtSlab, Statutory, TaxRegime, TdsRegime } from '@/api/payroll';

export type Rounding = 'nearest' | 'up' | null;
export type DraftPf = { enabled: boolean; employeeRatePct: string; employerRatePct: string; wageCeiling: string; capAtCeiling: boolean; rounding: Rounding };
export type DraftEsi = { enabled: boolean; employeeRatePct: string; employerRatePct: string; grossLimit: string; rounding: Rounding };
export type DraftPtSlab = { key: string; state: string; minGross: string; maxGross: string; amount: string; monthOverrides?: Record<string, number> };
export type DraftTdsSlab = { key: string; upto: string; ratePct: string };
/** `present: false` = the server has no regime yet and nobody has typed one in: it is sent as null, as on the website. */
export type DraftRegime = { present: boolean; standardDeduction: string; rebateLimit: string; rebateMax: string; cessPct: string; slabs: DraftTdsSlab[] };
export type DraftStatutory = {
  pf: DraftPf;
  esi: DraftEsi;
  pt: { enabled: boolean; slabs: DraftPtSlab[] };
  tds: { mode: 'off' | 'manual' | 'slab'; defaultRegime: TaxRegime | null; regimes: { new: DraftRegime; old: DraftRegime } };
};

let seq = 0;
export const rowKey = () => `s${Date.now().toString(36)}${(++seq).toString(36)}`;
const t = (v: number | null | undefined) => (v == null ? '' : String(v));

const emptyRegime = (): DraftRegime => ({ present: false, standardDeduction: '', rebateLimit: '', rebateMax: '', cessPct: '', slabs: [{ key: rowKey(), upto: '', ratePct: '' }] });
const regimeDraft = (r: TdsRegime | null): DraftRegime =>
  r
    ? {
        present: true,
        standardDeduction: t(r.standardDeduction),
        rebateLimit: t(r.rebateLimit),
        rebateMax: t(r.rebateMax),
        cessPct: t(r.cessPct),
        slabs: (r.slabs.length ? r.slabs : [{ upto: null, ratePct: 0 }]).map((x) => ({ key: rowKey(), upto: t(x.upto), ratePct: t(x.ratePct) })),
      }
    : emptyRegime();

export function draftOfStatutory(s: Statutory): DraftStatutory {
  return {
    pf: { enabled: !!s.pf.enabled, employeeRatePct: t(s.pf.employeeRatePct), employerRatePct: t(s.pf.employerRatePct), wageCeiling: t(s.pf.wageCeiling), capAtCeiling: s.pf.capAtCeiling !== false, rounding: s.pf.rounding ?? null },
    esi: { enabled: !!s.esi.enabled, employeeRatePct: t(s.esi.employeeRatePct), employerRatePct: t(s.esi.employerRatePct), grossLimit: t(s.esi.grossLimit), rounding: s.esi.rounding ?? null },
    pt: { enabled: !!s.pt.enabled, slabs: s.pt.slabs.map((x) => ({ key: rowKey(), state: x.state, minGross: t(x.minGross), maxGross: t(x.maxGross), amount: t(x.amount), ...(x.monthOverrides ? { monthOverrides: x.monthOverrides } : {}) })) },
    tds: { mode: s.tds.mode, defaultRegime: s.tds.defaultRegime ?? null, regimes: { new: regimeDraft(s.tds.regimes.new), old: regimeDraft(s.tds.regimes.old) } },
  };
}

export const newPtSlab = (): DraftPtSlab => ({ key: rowKey(), state: '', minGross: '', maxGross: '', amount: '' });
/** The website adds a TDS slab at the top (dash.html:5283), so "above that" stays the last one. */
export const addTdsSlab = (r: DraftRegime): DraftRegime => ({ ...r, present: true, slabs: [{ key: rowKey(), upto: '', ratePct: '' }, ...r.slabs] });

// ── Numbers (the website's `num`: blank → null) ──────────────────────────────
const num = (v: string): number | null => (v.trim() === '' ? null : Number(v.trim()));
const isMoney = (v: string) => v.trim() === '' || /^\d+(\.\d{1,2})?$/.test(v.trim());
const isPct = (v: string) => v.trim() === '' || (/^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) <= 100);

/** Only digits and one dot, at most 2 decimals, as it is typed. */
export function decimalTyping(s: string, maxInt = 10) {
  const x = s.replace(/[^\d.]/g, '');
  const [a, ...rest] = x.split('.');
  return rest.length ? `${(a ?? '').slice(0, maxInt)}.${rest.join('').slice(0, 2)}` : (a ?? '').slice(0, maxInt);
}

// ── Field errors, keyed by a path ("pf.employeeRatePct", "pt.2.state", "tds.new.slab.1.upto") ──
export type FieldErrors = Record<string, string>;

// Every section is checked, switched on or not: the whole body is sent (as on the website) and the
// server's normaliseStatutory validates a switched-off section's values too, so a bad value left in a
// hidden section would otherwise come back as a server error with no field to point at.
export function fieldErrors(d: DraftStatutory): FieldErrors {
  const e: FieldErrors = {};
  for (const k of ['employeeRatePct', 'employerRatePct'] as const) if (!isPct(d.pf[k])) e[`pf.${k}`] = 'A percentage from 0 to 100';
  if (!isMoney(d.pf.wageCeiling)) e['pf.wageCeiling'] = 'Rupees, up to 2 decimals';
  for (const k of ['employeeRatePct', 'employerRatePct'] as const) if (!isPct(d.esi[k])) e[`esi.${k}`] = 'A percentage from 0 to 100';
  if (!isMoney(d.esi.grossLimit)) e['esi.grossLimit'] = 'Rupees, up to 2 decimals';
  if (d.pt.slabs.length > 100) e.pt = 'At most 100 professional tax slabs.';
  d.pt.slabs.forEach((s, i) => {
    if (!/^[A-Za-z][A-Za-z .-]{1,29}$/.test(s.state.trim())) e[`pt.${i}.state`] = 'A state name or code (letters)';
    if (s.minGross.trim() === '' || !isMoney(s.minGross)) e[`pt.${i}.minGross`] = 'Rupees';
    if (!isMoney(s.maxGross)) e[`pt.${i}.maxGross`] = 'Rupees, or blank for no limit';
    else if (s.maxGross.trim() !== '' && isMoney(s.minGross) && Number(s.maxGross) < Number(s.minGross)) e[`pt.${i}.maxGross`] = 'Not below “from”';
    if (s.amount.trim() === '' || !isMoney(s.amount)) e[`pt.${i}.amount`] = 'Rupees';
  });
  {
    for (const k of ['new', 'old'] as const) {
      const r = d.tds.regimes[k];
      if (!r.present) continue;
      for (const f of ['standardDeduction', 'rebateLimit', 'rebateMax'] as const) if (!isMoney(r[f])) e[`tds.${k}.${f}`] = 'Rupees, up to 2 decimals';
      if (!isPct(r.cessPct)) e[`tds.${k}.cessPct`] = 'A percentage from 0 to 100';
      if (r.slabs.length > 15) e[`tds.${k}`] = 'At most 15 slabs.';
      let prev = -1;
      r.slabs.forEach((s, i) => {
        if (s.ratePct.trim() === '' || !isPct(s.ratePct)) e[`tds.${k}.slab.${i}.ratePct`] = 'A rate from 0 to 100';
        if (i === r.slabs.length - 1) return; // "above that": no upper limit
        const up = s.upto.trim() === '' ? NaN : Number(s.upto);
        if (!isMoney(s.upto) || !Number.isFinite(up)) e[`tds.${k}.slab.${i}.upto`] = 'Rupees';
        else if (!(up > prev)) e[`tds.${k}.slab.${i}.upto`] = 'Each limit must be above the one before';
        else prev = up;
      });
    }
  }
  return e;
}

/** Sections that are switched off (so their fields are hidden) but hold a value the server would refuse. */
export function hiddenErrorSections(d: DraftStatutory, e: FieldErrors): string[] {
  const has = (p: string) => Object.keys(e).some((k) => k === p || k.startsWith(`${p}.`));
  const out: string[] = [];
  if (!d.pf.enabled && has('pf')) out.push('Provident Fund');
  if (!d.esi.enabled && has('esi')) out.push('ESI');
  if (!d.pt.enabled && has('pt')) out.push('Professional tax');
  if (d.tds.mode !== 'slab' && (has('tds.new') || has('tds.old'))) out.push('Income tax slabs');
  return out;
}

/** The website's PUT body (dash.html:5245 save). */
export function bodyOfStatutory(s: DraftStatutory): Statutory {
  const regime = (r: DraftRegime): TdsRegime | null => (!r.present ? null : {
    standardDeduction: num(r.standardDeduction),
    rebateLimit: num(r.rebateLimit),
    rebateMax: num(r.rebateMax),
    cessPct: num(r.cessPct),
    slabs: r.slabs.map((x, i, a) => ({ upto: i === a.length - 1 ? null : num(x.upto), ratePct: num(x.ratePct) ?? 0 })),
  });
  return {
    pf: { enabled: s.pf.enabled, employeeRatePct: num(s.pf.employeeRatePct), employerRatePct: num(s.pf.employerRatePct), wageCeiling: num(s.pf.wageCeiling), capAtCeiling: s.pf.capAtCeiling, rounding: s.pf.rounding },
    esi: { enabled: s.esi.enabled, employeeRatePct: num(s.esi.employeeRatePct), employerRatePct: num(s.esi.employerRatePct), grossLimit: num(s.esi.grossLimit), rounding: s.esi.rounding },
    pt: {
      enabled: s.pt.enabled,
      slabs: s.pt.slabs.map(
        (x): PtSlab => ({ state: x.state.trim().toUpperCase(), minGross: num(x.minGross), maxGross: num(x.maxGross), amount: num(x.amount), ...(x.monthOverrides ? { monthOverrides: x.monthOverrides } : {}) }),
      ),
    },
    tds: { mode: s.tds.mode, defaultRegime: s.tds.defaultRegime || null, regimes: { new: regime(s.tds.regimes.new), old: regime(s.tds.regimes.old) } },
  };
}

// The server names a missing value by its key ("PF employeeRatePct"): the words people see instead.
const MISSING_WORDS: Record<string, string> = {
  employeeRatePct: 'employee share',
  employerRatePct: 'company share',
  rounding: 'rounding',
  wageCeiling: 'wage ceiling',
  grossLimit: 'gross limit',
  slabs: 'slabs',
  defaultRegime: 'default regime',
  standardDeduction: 'standard deduction',
  rebateLimit: 'rebate limit',
  rebateMax: 'rebate amount',
  cessPct: 'cess',
};
/** "PF employeeRatePct" → "PF employee share", "TDS new cessPct" → "TDS new regime cess". */
export function missingLabel(m: string): string {
  const parts = String(m).split(' ');
  const last = parts[parts.length - 1] ?? '';
  const word = MISSING_WORDS[last];
  if (!word) return m;
  const head = parts.slice(0, -1);
  if (head[0] === 'TDS' && (head[1] === 'new' || head[1] === 'old')) head[1] = `${head[1]} regime`;
  return [...head, word].join(' ');
}

/** statutoryMissing (hr_payroll_calc.js ~L152), in the server's own words. */
export function missingOf(cfg: Statutory): string[] {
  const miss: string[] = [];
  if (cfg.pf.enabled) for (const k of ['employeeRatePct', 'employerRatePct', 'rounding'] as const) if (cfg.pf[k] == null) miss.push(`PF ${k}`);
  if (cfg.pf.enabled && cfg.pf.capAtCeiling && cfg.pf.wageCeiling == null) miss.push('PF wageCeiling');
  if (cfg.esi.enabled) for (const k of ['employeeRatePct', 'employerRatePct', 'grossLimit', 'rounding'] as const) if (cfg.esi[k] == null) miss.push(`ESI ${k}`);
  if (cfg.pt.enabled && !cfg.pt.slabs.length) miss.push('PT slabs');
  if (cfg.tds.mode === 'slab') {
    if (!cfg.tds.defaultRegime) miss.push('TDS defaultRegime');
    for (const k of ['new', 'old'] as const) {
      const r = cfg.tds.regimes[k];
      if (!r) {
        miss.push(`TDS ${k} regime`);
        continue;
      }
      for (const f of ['standardDeduction', 'rebateLimit', 'rebateMax', 'cessPct'] as const) if (r[f] == null) miss.push(`TDS ${k} ${f}`);
      if (!r.slabs.length) miss.push(`TDS ${k} slabs`);
    }
  }
  return miss;
}

// ── What changed, in plain words, for the confirm sheet ──────────────────────
const show = (v: unknown, unit: '₹' | '%' | '') => (v == null || v === '' ? 'blank' : unit === '₹' ? `₹${Number(v).toLocaleString('en-IN')}` : unit === '%' ? `${v}%` : String(v));
const ROUND: Record<string, string> = { nearest: 'nearest rupee', up: 'up to the next rupee' };

/**
 * Only the parts the server keeps: an "off" section's values are still saved but are not used, and
 * the TDS regimes are only read in slab mode, so those are left out of the list (but still sent).
 */
export function statutoryChanges(before: Statutory, after: Statutory): string[] {
  const out: string[] = [];
  const cmp = (label: string, a: unknown, b: unknown, unit: '₹' | '%' | '' = '') => {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push(`${label}: ${show(a, unit)} → ${show(b, unit)}`);
  };
  const onOff = (label: string, a: boolean, b: boolean) => {
    if (a !== b) out.push(`${label}: ${a ? 'on' : 'off'} → ${b ? 'on' : 'off'}`);
  };
  onOff('Provident Fund', before.pf.enabled, after.pf.enabled);
  if (after.pf.enabled) {
    cmp('PF employee share', before.pf.employeeRatePct, after.pf.employeeRatePct, '%');
    cmp('PF company share', before.pf.employerRatePct, after.pf.employerRatePct, '%');
    if (before.pf.capAtCeiling !== after.pf.capAtCeiling) out.push(`PF wage cap: ${before.pf.capAtCeiling ? 'on' : 'off'} → ${after.pf.capAtCeiling ? 'on' : 'off'}`);
    cmp('PF wage ceiling', before.pf.wageCeiling, after.pf.wageCeiling, '₹');
    if (before.pf.rounding !== after.pf.rounding) out.push(`PF rounding: ${ROUND[before.pf.rounding ?? ''] ?? 'not set'} → ${ROUND[after.pf.rounding ?? ''] ?? 'not set'}`);
  }
  onOff('ESI', before.esi.enabled, after.esi.enabled);
  if (after.esi.enabled) {
    cmp('ESI employee share', before.esi.employeeRatePct, after.esi.employeeRatePct, '%');
    cmp('ESI company share', before.esi.employerRatePct, after.esi.employerRatePct, '%');
    cmp('ESI applies up to a monthly gross of', before.esi.grossLimit, after.esi.grossLimit, '₹');
    if (before.esi.rounding !== after.esi.rounding) out.push(`ESI rounding: ${ROUND[before.esi.rounding ?? ''] ?? 'not set'} → ${ROUND[after.esi.rounding ?? ''] ?? 'not set'}`);
  }
  onOff('Professional tax', before.pt.enabled, after.pt.enabled);
  if (JSON.stringify(before.pt.slabs) !== JSON.stringify(after.pt.slabs)) out.push(`Professional tax slabs: ${before.pt.slabs.length} → ${after.pt.slabs.length} rows (amounts or limits changed)`);
  const MODE: Record<string, string> = { off: 'off', manual: 'a set amount per person', slab: 'calculated from slabs' };
  if (before.tds.mode !== after.tds.mode) out.push(`Income tax: ${MODE[before.tds.mode]} → ${MODE[after.tds.mode]}`);
  if (after.tds.mode === 'slab') {
    if (before.tds.defaultRegime !== after.tds.defaultRegime) out.push(`Default regime: ${before.tds.defaultRegime ?? 'not set'} → ${after.tds.defaultRegime ?? 'not set'}`);
    for (const k of ['new', 'old'] as const) {
      const a = before.tds.regimes[k];
      const b = after.tds.regimes[k];
      const name = k === 'new' ? 'New regime' : 'Old regime';
      cmp(`${name} standard deduction`, a?.standardDeduction, b?.standardDeduction, '₹');
      cmp(`${name} rebate if taxable up to`, a?.rebateLimit, b?.rebateLimit, '₹');
      cmp(`${name} rebate up to`, a?.rebateMax, b?.rebateMax, '₹');
      cmp(`${name} cess`, a?.cessPct, b?.cessPct, '%');
      if (JSON.stringify(a?.slabs ?? []) !== JSON.stringify(b?.slabs ?? [])) out.push(`${name} slabs: ${(a?.slabs ?? []).length} → ${(b?.slabs ?? []).length} rows (limits or rates changed)`);
    }
  }
  return out;
}

/** The phrase to type before the swipe unlocks. */
export const STATUTORY_PHRASE = 'CHANGE TAX';
