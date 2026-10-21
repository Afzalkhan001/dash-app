// Shared plumbing for the demo API (see demo/server.ts): the route tuple every fixture file exports,
// response helpers, deterministic noise, ids, and IST date arithmetic. Fixture files import from here
// and from each other in one direction only (never from server.ts), so there are no import cycles.
//
// Everything that reaches the app is built from the app's own exported API types in the fixture
// files, so `tsc` checks that each response has the shape the screens read.

import { istParts, todayIst } from '@/lib/dates';

// ── Routing ──────────────────────────────────────────────────────────────────
// The request body exactly as the app sent it (each handler validates what it reads, like the server).
export type DemoBody = any;
// p[0] is the matched path, p[1..] the decoded captures of the route's pattern.
export type Handler = (p: string[], body: DemoBody, query: URLSearchParams) => unknown;
// PATCH: meets.js (conversations, meetings) and tv.js (TV devices) — the only PATCH routes on the server.
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Route = [method: Method, pattern: RegExp, handler: Handler];

// A refusal, in the shape apiFetch hands the app for a non-2xx response (`{ error, status }`).
export type DemoError = { error: string; status: number };
export const fail = (error: string, status = 400): DemoError => ({ error, status });
export const notFound = (what = 'Not found.') => fail(what, 404);

// Responses are always copies, so nothing the app does to a result can reach the demo's state.
export const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

// ── Noise and ids ────────────────────────────────────────────────────────────
// Deterministic 0..1 from a string, so the same day always shows the same hours.
export function rand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function hex6(seed: string) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 33) >>> 0;
  return (h & 0xffffff).toString(16).padStart(6, '0');
}

// 'rmb' + epoch ms + 6 hex — the server's id format, which the app turns into RMB-20261012-A1B2C3.
export const epochId = (prefix: string, iso: string, seed: string) => `${prefix}${Date.parse(iso)}${hex6(seed)}`;

let seq = 0;
export const newId = (prefix: string) => `${prefix}${Date.now()}${hex6(`${++seq}:${Math.random()}`)}`;

export const sixDigits = () => String(100000 + Math.floor(Math.random() * 900000));

// The demo account's one code for every confirmation step (login, task start/end, petty cash).
export const DEMO_CODE = '123456';
export const wrongCode = () => fail('Incorrect code. In the demo account every code is 123456.', 400);

// ── Dates (all India time; 'YYYY-MM-DD' strings are handled as UTC so no timezone shifts a day) ──
export const pad = (n: number) => String(n).padStart(2, '0');
export const today = () => todayIst();

export function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekdayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
export const mondayOf = (ymd: string) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export function eachDate(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const toMin = (hm: string | number) => (typeof hm === 'number' ? hm : Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)));
export const hm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
// An IST wall-clock time on a calendar day, as an ISO instant.
export const istIso = (ymd: string, at: string | number) => new Date(`${ymd}T${hm(toMin(at))}:00+05:30`).toISOString();
// An ISO instant as the IST wall clock 'HH:MM' (hr_timesheet.js istHhmm).
export const istHm = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(11, 16);
export const istDateOf = (iso: string) => istParts(new Date(iso)).date;
export const nowIso = () => new Date().toISOString();
export const minutesAgo = (min: number) => new Date(Date.now() - min * 60000).toISOString();
export const daysAgo = (n: number, at: string | number = '10:30') => istIso(addDays(today(), -n), at);
export function nowMinutesIst() {
  const p = istParts();
  return p.hour * 60 + p.minute;
}

// ── The company calendar ─────────────────────────────────────────────────────
// Saturdays and Sundays off (the General Shift, and the company policy).
export const WEEKLY_OFF = [0, 6];

// Hyderabad office holidays by month-day; optional ones are not days off for leave counting
// (hr_common.js holidaySet drops them), exactly as the server counts.
const HOLIDAYS: [string, string, boolean][] = [
  ['01-01', 'New Year’s Day', true],
  ['01-14', 'Makar Sankranti', false],
  ['01-26', 'Republic Day', false],
  ['03-04', 'Holi', false],
  ['03-19', 'Ugadi', false],
  ['04-03', 'Good Friday', true],
  ['05-01', 'May Day', true],
  ['06-02', 'Telangana Formation Day', false],
  ['08-15', 'Independence Day', false],
  ['09-14', 'Ganesh Chaturthi', false],
  ['10-02', 'Gandhi Jayanti', false],
  ['10-20', 'Dussehra', false],
  ['11-09', 'Diwali', false],
  ['12-25', 'Christmas', false],
];

export type DemoHoliday = { id: string; date: string; name: string; optional: boolean };
// One live list per year, built from the calendar above the first time a year is asked for. It is the
// SAME array every time: the HR setup fixture (fixtures/hrtime.ts) adds, edits and removes holidays in
// it in place, so leave-day counting, comp-off and Home's "Coming up" follow those changes.
const HOLIDAY_YEARS = new Map<string, DemoHoliday[]>();
/** The company holidays of a year (a live list: change it in place, never sort it in place). */
export const holidaysFor = (year: string): DemoHoliday[] => {
  let list = HOLIDAY_YEARS.get(year);
  if (!list) {
    list = HOLIDAYS.map(([md, name, optional]) => ({ id: `hh-${year}-${md}`, date: `${year}-${md}`, name, optional }));
    HOLIDAY_YEARS.set(year, list);
  }
  return list;
};
export const holidayOn = (ymd: string) => {
  const h = holidaysFor(ymd.slice(0, 4)).find((x) => x.date === ymd);
  return h ? { name: h.name, optional: !!h.optional } : null;
};
export const isMandatoryHoliday = (ymd: string) => {
  const h = holidayOn(ymd);
  return !!h && !h.optional;
};
export const isWeeklyOff = (ymd: string) => WEEKLY_OFF.includes(weekdayOf(ymd));
export const isWorkingDay = (ymd: string) => !isWeeklyOff(ymd) && !isMandatoryHoliday(ymd);

// hr_common.js countWorkingDays: calendar days − weekly offs − mandatory holidays; a half day is 0.5.
export function countWorkingDays(from: string, to: string, half: string = 'none') {
  let n = 0;
  for (const d of eachDate(from, to)) if (isWorkingDay(d)) n += 1;
  if (half !== 'none') n = n > 0 ? 0.5 : 0;
  return n;
}

// The n-th working day before (n > 0) or after (n < 0) a date.
export function workingDayFrom(ymd: string, n: number) {
  let d = ymd;
  let left = Math.abs(n);
  const step = n > 0 ? -1 : 1;
  while (left > 0) {
    d = addDays(d, step);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}

// ── Files ────────────────────────────────────────────────────────────────────
// A small "paper receipt" image (96×128 PNG), returned wherever the server hands back a stored bill
// as `{ fileData: data URL }`, so viewing a receipt works in the demo.
export const RECEIPT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAACACAIAAAB7vvvtAAABCElEQVR42u3dMQ5AMAAFUMcS5zL0RAZHMJgMbmMRKxcQEQnV9jX/APrCz99U27rIRSoEgAABApQU0F7wAQQIECBAgAABOjtNU2cTQIAAAQIECBAgQxEQIED5AY3jECWAABUCpIMAAQIECBAgQIAAAQJ0G2iepyi5vlLfdw8CCNAPgXQQIECAAAECZEkbioAA6SBAgAABAgQIkB0ECJAlraQBAQIECBAgO8hQBGRJK2lAgAABAgTIkjYUAVnSShoQIECAAAGypA1FQIB0ECBAgAABAgQIECBAgF4BCqHNJt4gnxggQNkBff+Xi/eeARAgQOkBKWlAgAABAgQIEKDCgQQQIECAACWSA+N+RG5KJ4G6AAAAAElFTkSuQmCC';
