// Number/money/text formatting shared by every screen. Indian grouping (₹1,23,456.00), as on the web
// (dash.html hrInr).

export function inr(n: number | string | null | undefined, opts: { decimals?: boolean } = {}) {
  const v = Number(n);
  if (n == null || n === '' || !Number.isFinite(v)) return '—';
  const d = opts.decimals === false ? 0 : 2;
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ₹1.2L / ₹3.4Cr style for big headline numbers.
export function inrCompact(n: number | null | undefined) {
  const v = Number(n);
  if (n == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function firstName(name?: string | null) {
  return (name || '').trim().split(/\s+/)[0] || '';
}

export function titleCase(s?: string | null) {
  return (s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Days" values come back as numbers like 0.5, 1, 2.5.
export function days(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${v === 1 ? 'day' : 'days'}`;
}
