// Config page pieces the app now edits: professional categories (dash.html:3428
// ProfessionalCategoriesCard) and the two logos (Branding :3540, Report Logo :3556). The save rules
// are the website's, line for line: a blank row is skipped, the id is derived from the label ONCE and
// never changes (bookings, tasks and ratings store it), no two ids alike, the day must end after it
// starts, the gap is a whole number 0–480 minutes, and at least one category stays.

import type { ProfType } from '@/api/me';

export type DraftCategory = { key: string; id: string; label: string; dayStart: string; dayEnd: string; gapMinutes: string; active: boolean; isNew: boolean };

let seq = 0;
const rowKey = () => `p${Date.now().toString(36)}${(++seq).toString(36)}`;

export const categoryDrafts = (types: ProfType[]): DraftCategory[] =>
  types.map((t) => ({ key: rowKey(), id: t.id, label: t.label, dayStart: t.dayStart || '07:00', dayEnd: t.dayEnd || '22:00', gapMinutes: String(t.gapMinutes ?? 0), active: t.active !== false, isNew: false }));

/** dash.html:3434 addRow. */
export const newCategory = (): DraftCategory => ({ key: rowKey(), id: '', label: '', dayStart: '07:00', dayEnd: '22:00', gapMinutes: '0', active: true, isNew: true });

/** dash.html:3438 idFor: kept once set; otherwise from the label. */
export const idFor = (r: Pick<DraftCategory, 'id' | 'label'>) =>
  r.id ||
  String(r.label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHm = (s: string) => HM.test(s.trim());

/** "7:5" / "0700" → "07:00"-style as it is typed (digits and one colon). */
export function hmTyping(s: string) {
  const x = s.replace(/[^\d:]/g, '');
  if (!x.includes(':') && x.length > 2) return `${x.slice(0, 2)}:${x.slice(2, 4)}`;
  return x.slice(0, 5);
}

/** dash.html:3439 save → `{ list }` to send, or the website's message. */
export function cleanCategories(rows: DraftCategory[]): { list: ProfType[] } | { error: string } {
  const clean: ProfType[] = [];
  for (const r of rows) {
    const label = String(r.label || '').trim();
    if (!label) continue;
    const id = idFor(r);
    if (!id) return { error: `“${label}” needs at least one letter or number in its name.` };
    if (clean.some((c) => c.id === id)) return { error: `Two categories would share the id “${id}”. Give them clearly different names.` };
    if (!isHm(r.dayStart) || !isHm(r.dayEnd)) return { error: `${label}: times are 24-hour HH:MM, like 07:00.` };
    if (String(r.dayEnd || '') <= String(r.dayStart || '')) return { error: `${label}: the end of the day has to be after the start.` };
    const gap = Math.max(0, Math.min(480, Math.floor(Number(r.gapMinutes)) || 0));
    clean.push({ id, label, dayStart: r.dayStart || '07:00', dayEnd: r.dayEnd || '22:00', gapMinutes: gap, active: r.active !== false });
  }
  if (!clean.length) return { error: 'Keep at least one category.' };
  return { list: clean };
}

/** What a save changes, in plain words. */
export function categoryChanges(before: ProfType[], after: ProfType[]): string[] {
  const out: string[] = [];
  const was = new Map(before.map((t) => [t.id, t]));
  for (const t of after) {
    const b = was.get(t.id);
    if (!b) {
      out.push(`Adds “${t.label}” (${t.dayStart}–${t.dayEnd}, ${t.gapMinutes} min gap)`);
      continue;
    }
    if (b.label !== t.label) out.push(`Renames “${b.label}” to “${t.label}”`);
    if ((b.dayStart || '07:00') !== t.dayStart || (b.dayEnd || '22:00') !== t.dayEnd) out.push(`${t.label}: hours ${b.dayStart || '07:00'}–${b.dayEnd || '22:00'} → ${t.dayStart}–${t.dayEnd}`);
    if ((b.gapMinutes ?? 0) !== t.gapMinutes) out.push(`${t.label}: gap ${b.gapMinutes ?? 0} → ${t.gapMinutes} min`);
    if ((b.active !== false) !== t.active) out.push(t.active ? `Offers “${t.label}” again` : `Stops offering “${t.label}” (past bookings stay)`);
  }
  for (const b of before) if (!after.some((t) => t.id === b.id)) out.push(`Drops “${b.label}” from the list (its id stays on past bookings)`);
  return out;
}

// ── Logos (data URLs inside the company record, like the website) ────────────
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // dash.html:3508 "File too large. Max 2MB."
export const LOGO_TYPES = ['image/png', 'image/jpeg'];
export const isImageDataUrl = (v: unknown): v is string => typeof v === 'string' && /^data:image\/[a-z+.-]+;base64,/i.test(v);
/** A logo the app can show: a data URL, or an https link. */
export const logoSource = (v: unknown) => (isImageDataUrl(v) || (typeof v === 'string' && /^https:\/\//.test(v)) ? v : null);
