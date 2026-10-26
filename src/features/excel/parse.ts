// Excel domain — reading the website's bulk-upload sheets, line for line. Pure: no hooks, no clock
// (callers pass `now` where a timestamp is written), no network.
//
//   Employees, upload   BulkUpload parseFile + findRosterMatch (dash.html:6036–6105)
//   Employees, update   parseUpdateFile + applyBulkUpdate's patch rules (dash.html:6336–6402)
//   Projects            parseProjFile (dash.html:22683–22699)
//   Clients             ClientsView bulkUpload (dash.html:23373–23389), any .csv/.xlsx header row
//   Assets              AssetCatalog parseFile (dash.html:20250–20292)
//   Subscriptions       parseSubscriptionWorkbook (dash.html:11347–11407)
//
// On top of the website's own rules the phone adds a validation pass (bad email, a duplicate inside
// the sheet, an unknown department that will be created, a date that can't be read…). A row with an
// `error` is left out of the import; a `warning` is shown and still imported, as the website would.

import { cellText, sheetMatrix, sheetObjects, type Workbook } from '@/lib/xlsx';

export type RowIssue = { level: 'error' | 'warning' | 'info'; text: string };
export const hasError = (issues: readonly RowIssue[]) => issues.some((i) => i.level === 'error');

const low = (v: unknown) => String(v ?? '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The website's `col()`: a header match ignoring case and spaces, then (employees only) a partial
 * match ("Reporting Manager (if any)").
 */
export function pick(r: Record<string, string>, keys: readonly string[], partial = false): string {
  const lk: Record<string, string> = {};
  for (const k of Object.keys(r)) lk[k.toLowerCase().trim()] = r[k] ?? '';
  for (const k of keys) {
    const v = lk[k.toLowerCase()];
    if (v !== undefined && v !== '') return String(v).trim();
  }
  if (partial) {
    for (const k of keys) {
      const match = Object.keys(lk).find((h) => h.includes(k.toLowerCase()) && lk[h] !== undefined && lk[h] !== '');
      if (match) return String(lk[match]).trim();
    }
  }
  return '';
}

/** fmtExcelDate (dash.html:20255): cells are already text (lib/xlsx), so only an Excel serial needs converting. */
export function excelDate(v: string): string {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
  }
  return s;
}

/** A date someone typed that a person (or Excel) would read: YYYY-MM-DD, 17-Feb-2012, 17/02/2012… */
const looksLikeDate = (s: string) =>
  !s || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}[\s\-/.][A-Za-z]{3,9}[\s\-/.]\d{2,4}$/.test(s) || /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(s) || !Number.isNaN(Date.parse(s));

// ── Roster (for the employee sheets) ─────────────────────────────────────────
export type RosterPerson = { id: string; email?: string; employeeNumber?: string; kekaCode?: string; name?: string; source?: string; [k: string]: unknown };
export type DeptLite = { id: string; name: string };

// ── Employees: Bulk Upload ───────────────────────────────────────────────────
export const KEKA_COLS = ['EMP NO.', 'NAME', 'WORK EMAIL', 'GENDER', 'MOBILE', 'LOCATION', 'DEPARTMENT', 'JOB TITLE', 'REPORTING MANAGER', 'DATE JOINED', 'DOB', 'BLOOD GROUP'];

export type EmpRow = {
  key: string;
  line: number;
  employeeNumber: string;
  name: string;
  email: string;
  gender: string;
  mobile: string;
  location: string;
  /** Department id when it matched one, else the name typed (created on import). */
  dept: string;
  deptName: string;
  newDept: boolean;
  jobTitle: string;
  reportingManager: string;
  dateJoined: string;
  dob: string;
  bloodGroup: string;
  /** findRosterMatch: who this row is already on the roster as. */
  match: { id: string; source: 'user' | 'whitelist'; by: 'id' | 'email' | 'id+email'; name: string } | null;
  action: 'create' | 'update' | 'skip';
  issues: RowIssue[];
};

/** findRosterMatch (dash.html:6047): Employee ID first, then email; accounts before invitations. */
export function findRosterMatch(emp: { employeeNumber: string; email: string }, users: readonly RosterPerson[], wl: readonly RosterPerson[]): EmpRow['match'] {
  const idLc = low(emp.employeeNumber);
  const emailLc = low(emp.email);
  const byId = (u: RosterPerson) => !!idLc && (low(u.employeeNumber) === idLc || low(u.kekaCode) === idLc);
  const byEmail = (u: RosterPerson) => !!emailLc && low(u.email) === emailLc;
  for (const [arr, source] of [
    [users, 'user'],
    [wl, 'whitelist'],
  ] as const) {
    const idHit = arr.find(byId);
    if (idHit) return { id: String(idHit.id), source, by: byEmail(idHit) ? 'id+email' : 'id', name: String(idHit.name || '') };
    const emailHit = arr.find(byEmail);
    if (emailHit) return { id: String(emailHit.id), source, by: 'email', name: String(emailHit.name || '') };
  }
  return null;
}

export function parseEmployees(book: Workbook, depts: readonly DeptLite[], users: readonly RosterPerson[], wl: readonly RosterPerson[]): EmpRow[] {
  const raw = sheetObjects(book, 0);
  const out: EmpRow[] = [];
  const seenEmail = new Map<string, number>();
  const seenId = new Map<string, number>();
  raw.forEach((r, i) => {
    const c = (keys: string[]) => pick(r, keys, true);
    const empNo = c(['emp no.', 'emp no', 'employee number', 'employee no', 'empno', 'employee id', 'empid']);
    const firstName = c(['first name', 'firstname']);
    const lastName = c(['last name', 'lastname']);
    const combined = firstName ? firstName + (lastName ? ` ${lastName}` : '') : lastName;
    const name = c(['name', 'full name', 'fullname']) || combined;
    const email = c(['work email', 'email', 'workemail', 'mail id', 'mail', 'e-mail', 'email id']).toLowerCase();
    // The website drops rows without a name or email, and the template's "(…)" hint rows.
    if (!name || name.startsWith('(') || !email || email.startsWith('(')) return;
    const deptRaw = c(['department', 'dept', 'department code']);
    const deptObj = depts.find((d) => low(d.name) === low(deptRaw) || d.id === deptRaw);
    const jobTitle = c(['job title', 'jobtitle', 'designation', 'role', 'job role']);
    const row: EmpRow = {
      key: `e${i}`,
      line: i + 2,
      employeeNumber: empNo,
      name,
      email,
      gender: c(['gender']),
      mobile: c(['mobile', 'phone', 'mobile no', 'contact']),
      location: c(['location', 'city']),
      dept: deptObj?.id || deptRaw,
      deptName: deptObj?.name || deptRaw,
      newDept: !!deptRaw && !deptObj,
      jobTitle,
      reportingManager: c(['reporting manager', 'reporting manager name', 'reports to manager', 'report to', 'reports to', 'rm name', 'rm']),
      dateJoined: c(['date joined', 'date of joining', 'doj', 'joining date']),
      dob: c(['dob', 'date of birth', 'birth date', 'birthdate']),
      bloodGroup: c(['blood group', 'bloodgroup', 'blood grp']),
      match: null,
      action: 'create',
      issues: [],
    };
    if (!EMAIL_RE.test(email)) row.issues.push({ level: 'error', text: 'The work email is not a valid address.' });
    const dupE = seenEmail.get(email);
    if (dupE) row.issues.push({ level: 'error', text: `Same email as row ${dupE} of this sheet.` });
    else seenEmail.set(email, row.line);
    if (empNo) {
      const dupI = seenId.get(low(empNo));
      if (dupI) row.issues.push({ level: 'warning', text: `Same employee ID as row ${dupI} of this sheet.` });
      else seenId.set(low(empNo), row.line);
    } else row.issues.push({ level: 'warning', text: 'No employee ID. Matching uses the email only.' });
    if (row.newDept && deptRaw.length > 1) row.issues.push({ level: 'info', text: `New department “${deptRaw}” will be created.` });
    if (!looksLikeDate(row.dateJoined)) row.issues.push({ level: 'warning', text: `Date joined “${row.dateJoined}” may not read as a date.` });
    if (!looksLikeDate(row.dob)) row.issues.push({ level: 'warning', text: `Date of birth “${row.dob}” may not read as a date.` });
    row.match = findRosterMatch(row, users, wl);
    row.action = hasError(row.issues) ? 'skip' : row.match ? 'update' : 'create';
    out.push(row);
  });
  return out;
}

/** The new departments a sheet needs (saveRoster step 2: names longer than one letter, not ids). */
export function newDepartmentNames(rows: readonly EmpRow[], depts: readonly DeptLite[]): string[] {
  const names = new Set<string>();
  for (const r of rows) {
    if (r.action === 'skip') continue;
    const n = (r.deptName || r.dept || '').trim();
    if (n && n.length > 1 && !/^(wl|dept|d)\d/.test(n) && !depts.some((d) => low(d.name) === low(n))) names.add(n);
  }
  return [...names];
}

// ── Employees: Bulk Update ───────────────────────────────────────────────────
export const UPD_COLS = ['EMP NO.', 'NAME (reference only)', 'GENDER', 'MOBILE', 'LOCATION', 'DEPARTMENT', 'JOB TITLE', 'REPORTING MANAGER', 'DATE JOINED', 'DOB', 'BLOOD GROUP'];

export type UpdRow = {
  key: string;
  line: number;
  empNo: string;
  name: string;
  /** Only the fields with a value in the sheet (a blank cell leaves the field as it is). */
  patch: Record<string, string>;
  userId: string | null;
  whitelistId: string | null;
  matchedName: string;
  issues: RowIssue[];
};

const UPD_FIELD_LABEL: Record<string, string> = {
  gender: 'Gender',
  mobile: 'Mobile',
  location: 'Location',
  dept: 'Department',
  jobTitle: 'Job title',
  reportingManager: 'Reporting manager',
  dateJoined: 'Date joined',
  dob: 'Date of birth',
  bloodGroup: 'Blood group',
};
export const updFieldLabel = (k: string) => UPD_FIELD_LABEL[k] ?? k;

export function parseUpdates(book: Workbook, depts: readonly DeptLite[], users: readonly RosterPerson[], wl: readonly RosterPerson[]): UpdRow[] {
  const raw = sheetObjects(book, 0);
  const byEmpNo = (arr: readonly RosterPerson[], n: string) => arr.find((x) => String(x.employeeNumber || x.kekaCode || '').trim() === n);
  const out: UpdRow[] = [];
  const seen = new Map<string, number>();
  raw.forEach((r, i) => {
    const c = (keys: string[]) => pick(r, keys, true);
    const empNo = c(['emp no.', 'emp no', 'employee number', 'employee no', 'empno', 'employee id', 'empid']);
    if (!empNo) return; // the match key: a row without one can't be applied (website rule)
    const patch: Record<string, string> = {};
    const gender = c(['gender']);
    const mobile = c(['mobile', 'phone', 'mobile no', 'contact']);
    const location = c(['location', 'city']);
    const deptRaw = c(['department', 'dept']);
    const jobTitle = c(['job title', 'jobtitle', 'designation']);
    const rm = c(['reporting manager', 'reporting manager name', 'reports to']);
    const doj = c(['date joined', 'date of joining', 'doj']);
    const dob = c(['dob', 'date of birth', 'birth date', 'birthdate']);
    const bg = c(['blood group', 'bloodgroup', 'blood grp']);
    if (gender) patch.gender = gender;
    if (mobile) patch.mobile = mobile;
    if (location) patch.location = location;
    if (deptRaw) {
      const d = depts.find((x) => low(x.name) === low(deptRaw)) || depts.find((x) => x.id === deptRaw);
      patch.dept = d ? d.id : deptRaw;
    }
    if (jobTitle) patch.jobTitle = jobTitle;
    if (rm) patch.reportingManager = rm;
    if (doj) patch.dateJoined = doj;
    if (dob) patch.dob = dob;
    if (bg) patch.bloodGroup = bg;
    const u = byEmpNo(users, empNo);
    const w = u ? wl.find((x) => low(x.email) === low(u.email)) : byEmpNo(wl, empNo);
    const row: UpdRow = {
      key: `u${i}`,
      line: i + 2,
      empNo,
      name: c(['name', 'full name']),
      patch,
      userId: u ? String(u.id) : null,
      whitelistId: w ? String(w.id) : null,
      matchedName: String(u?.name || w?.name || ''),
      issues: [],
    };
    if (!u && !w) row.issues.push({ level: 'error', text: 'No one on the roster has this employee ID.' });
    if (!Object.keys(patch).length) row.issues.push({ level: 'error', text: 'Nothing to change: every cell after the name is blank.' });
    const dup = seen.get(empNo);
    if (dup) row.issues.push({ level: 'warning', text: `Same employee ID as row ${dup}; both are applied in order.` });
    else seen.set(empNo, row.line);
    if (row.name && row.matchedName && low(row.name) !== low(row.matchedName)) row.issues.push({ level: 'warning', text: `The sheet says “${row.name}”, the roster says “${row.matchedName}”.` });
    if (deptRaw && !depts.some((x) => low(x.name) === low(deptRaw) || x.id === deptRaw)) row.issues.push({ level: 'warning', text: `No department called “${deptRaw}”. It is saved as typed.` });
    if (!looksLikeDate(doj) || !looksLikeDate(dob)) row.issues.push({ level: 'warning', text: 'A date may not read as a date.' });
    out.push(row);
  });
  return out;
}

/** The website's update payload: mobile also goes to `phone`, job title also to `jobRole`. */
export function updPayload(patch: Record<string, string>): Record<string, string> {
  const p: Record<string, string> = { ...patch };
  if (patch.mobile) p.phone = patch.mobile;
  if (patch.jobTitle) p.jobRole = patch.jobTitle;
  return p;
}

// ── Projects ─────────────────────────────────────────────────────────────────
export const PROJ_COLS = ['Metadata 1', 'Metadata 2', 'Metadata 3', 'Keka Code', 'Cost Code Owner', 'Date', 'Employee Number'];

export type ProjRow = {
  key: string;
  line: number;
  name: string;
  meta1: string;
  meta2: string;
  meta3: string;
  kekaCode: string;
  costCodeOwner: string;
  empNo: string;
  date: string;
  issues: RowIssue[];
};

export function parseProjects(book: Workbook, existing: readonly { kekaCode?: string; name?: string }[], people: readonly RosterPerson[]): ProjRow[] {
  const raw = sheetObjects(book, 0);
  const out: ProjRow[] = [];
  const codes = new Set(existing.map((p) => low(p.kekaCode)).filter(Boolean));
  const seen = new Map<string, number>();
  raw.forEach((r, i) => {
    const c = (keys: string[]) => pick(r, keys);
    const meta1 = c(['metadata 1', 'meta 1', 'meta1']);
    const meta2 = c(['metadata 2', 'meta 2', 'meta2']);
    const meta3 = c(['metadata 3', 'meta 3', 'meta3']);
    if (!meta1 && !meta2 && !meta3) return;
    const joined = [meta1, meta2, meta3].filter(Boolean).join('_');
    const row: ProjRow = {
      key: `p${i}`,
      line: i + 2,
      name: meta3 || joined,
      meta1,
      meta2,
      meta3,
      kekaCode: c(['keka code', 'keka', 'kekacode']) || joined,
      costCodeOwner: c(['cost code owner', 'owner']),
      empNo: c(['employee number', 'emp no.', 'emp no', 'empno', 'employee no']),
      date: excelDate(c(['date'])),
      issues: [],
    };
    const k = low(row.kekaCode);
    if (codes.has(k)) row.issues.push({ level: 'warning', text: 'This project code is already in the list. Importing adds a second copy.' });
    const dup = seen.get(k);
    if (dup) row.issues.push({ level: 'warning', text: `Same project code as row ${dup} of this sheet.` });
    else seen.set(k, row.line);
    if (row.empNo && !people.some((p) => String(p.employeeNumber || p.kekaCode || '').trim() === row.empNo)) {
      row.issues.push({ level: 'warning', text: `No one on the roster has employee number ${row.empNo}.` });
    }
    if (!row.costCodeOwner) row.issues.push({ level: 'info', text: 'No cost code owner.' });
    out.push(row);
  });
  return out;
}

/** The body the website posts for one project row (saveBulkProjects). */
export const projectBody = (p: ProjRow, idSeed: string, today: string) => ({
  id: `p${idSeed}`,
  name: p.name,
  meta1: p.meta1,
  meta2: p.meta2,
  meta3: p.meta3,
  kekaCode: p.kekaCode,
  costCodeOwner: p.costCodeOwner,
  empNo: p.empNo,
  date: p.date,
  status: 'active',
  createdAt: today,
});

// ── Clients ──────────────────────────────────────────────────────────────────
export type ClientRow = { key: string; line: number; name: string; channelName: string; email: string; phone: string; issues: RowIssue[] };

/** ClientsView bulkUpload: header names lower-cased with everything but letters removed. */
export function parseClients(book: Workbook, existing: readonly { name?: string }[]): ClientRow[] {
  const raw = sheetObjects(book, 0);
  const have = new Set(existing.map((c) => low(c.name)));
  const seen = new Set<string>();
  const out: ClientRow[] = [];
  raw.forEach((r, i) => {
    const m: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) m[k.toLowerCase().replace(/[^a-z]/g, '')] = String(v ?? '').trim();
    if (!m.name || m.name.startsWith('#')) return;
    const row: ClientRow = { key: `c${i}`, line: i + 2, name: m.name, channelName: m.channelname || m.channel || '', email: m.email || '', phone: m.phone || m.contact || '', issues: [] };
    if (row.email && !EMAIL_RE.test(row.email)) row.issues.push({ level: 'warning', text: 'The email does not look right.' });
    if (have.has(low(row.name))) row.issues.push({ level: 'warning', text: 'You already have a client with this name.' });
    if (seen.has(low(row.name))) row.issues.push({ level: 'warning', text: 'This name is in the sheet twice.' });
    seen.add(low(row.name));
    out.push(row);
  });
  return out;
}

// ── Assets ───────────────────────────────────────────────────────────────────
export const ASSET_COLS = [
  'Asset Id',
  'Asset Name',
  'Asset Description',
  'Asset Location',
  'Asset Category',
  'Asset Type',
  'Purchased On',
  'Warranty expiry status',
  'Warranty expires on',
  'Asset Condition',
  'Assigned To Employee Number',
  'Date of Asset Assignment',
  'Serial Number',
  'ASSET VALUE',
];
export const ASSET_COL_WIDTHS = [22, 20, 40, 14, 14, 14, 14, 18, 18, 14, 24, 22, 16, 12];

export type AssetRow = {
  key: string;
  line: number;
  body: {
    id: string;
    assetId: string;
    name: string;
    description: string;
    location: string;
    category: string;
    assetType: string;
    purchaseDate: string;
    warrantyStatus: string;
    warrantyExpiry: string;
    condition: string;
    serial: string;
    price: number;
    assignedToEmpNo: string;
    assignedTo: string | null;
    assignedToEmail: string;
    assignmentDate: string;
    status: 'assigned' | 'available';
    acknowledged: false;
    acknowledgedAt: null;
    history: { action: string; to: string; at: string }[];
  };
  issues: RowIssue[];
};

export function parseAssets(book: Workbook, people: readonly RosterPerson[], existing: readonly { serial?: string; assetId?: string; name?: string }[], now: string, idSeed: number): AssetRow[] {
  const raw = sheetObjects(book, 0);
  const serials = new Set(existing.map((a) => low(a.serial)).filter(Boolean));
  // Asset ID → who uses it: an asset already in DASH (its name) or an earlier row of this sheet. The server
  // refuses a used Asset ID (routes/assets.js:33, 409), so such a row is an error, not a warning.
  const ids = new Map<string, { name: string } | { line: number }>();
  existing.forEach((a) => {
    const k = low(a.assetId);
    if (k && !ids.has(k)) ids.set(k, { name: String(a.name || a.serial || 'another asset') });
  });
  const out: AssetRow[] = [];
  raw.forEach((r, i) => {
    const c = (keys: string[]) => pick(r, keys);
    const name = c(['asset name', 'name', 'asset', 'item name', 'item']);
    if (!name || name.startsWith('(')) return;
    const empNo = c(['assigned to employee number', 'employee number', 'emp no', 'empno', 'assigned to']);
    const who = empNo ? people.find((u) => String(u.kekaCode ?? '') === empNo || String(u.employeeNumber ?? '') === empNo) : undefined;
    const priceText = c(['asset value', 'price (inr)', 'price', 'cost', 'amount', 'value']);
    const price = Number(priceText.replace(/[^0-9.]/g, '')) || 0;
    const body: AssetRow['body'] = {
      id: `a${idSeed}${i}`,
      assetId: c(['asset id', 'assetid']),
      name,
      description: c(['asset description', 'description', 'desc']),
      location: c(['asset location', 'location', 'city']) || 'Hyderabad',
      category: c(['asset category', 'category']) || 'Electronics',
      assetType: c(['asset type', 'type']),
      purchaseDate: excelDate(c(['purchased on', 'date of purchase', 'purchase date', 'purchasedate'])),
      warrantyStatus: c(['warranty expiry status', 'warranty status', 'warrantystatus']) || 'Active',
      warrantyExpiry: excelDate(c(['warranty expires on', 'warranty expiry', 'warrantyexpiry'])),
      condition: c(['asset condition', 'condition']) || 'Fair',
      serial: c(['serial number', 'serial', 'sn', 'serial no', 'serialno']),
      price,
      assignedToEmpNo: empNo,
      assignedTo: who ? String(who.name || '') : null,
      assignedToEmail: who ? String(who.email || '') : '',
      assignmentDate: excelDate(c(['date of asset assignment', 'assignment date', 'assignmentdate'])),
      status: empNo ? 'assigned' : 'available',
      acknowledged: false,
      acknowledgedAt: null,
      history: empNo ? [{ action: 'assigned', to: who ? String(who.name || '') : empNo, at: now }] : [],
    };
    const issues: RowIssue[] = [];
    if (empNo && !who) issues.push({ level: 'warning', text: `No one on the roster has employee number ${empNo}. The asset is saved as assigned to that number.` });
    if (body.serial && serials.has(low(body.serial))) issues.push({ level: 'warning', text: 'An asset with this serial number already exists.' });
    const usedBy = body.assetId ? ids.get(low(body.assetId)) : undefined;
    if (usedBy) {
      issues.push({
        level: 'error',
        text: 'line' in usedBy ? `Same Asset ID as row ${usedBy.line} of this sheet. The second one will be refused.` : `Asset ID "${body.assetId.trim()}" is already used by "${usedBy.name}". This row will be refused.`,
      });
    }
    if (priceText && !price) issues.push({ level: 'warning', text: `The value “${priceText}” is not a number; saved as ₹0.` });
    if (body.warrantyExpiry && !looksLikeDate(body.warrantyExpiry)) issues.push({ level: 'warning', text: 'The warranty date may not read as a date.' });
    if (body.serial) serials.add(low(body.serial));
    if (body.assetId && !usedBy) ids.set(low(body.assetId), { line: i + 2 });
    out.push({ key: `a${i}`, line: i + 2, body, issues });
  });
  return out;
}

// ── Subscriptions ("Upload past data") ───────────────────────────────────────
const SUB_HEADER_MAP: Record<string, string> = {
  name: 'name',
  software: 'name',
  subscription: 'name',
  tool: 'name',
  product: 'name',
  department: 'department',
  team: 'department',
  'email id': 'accountEmail',
  email: 'accountEmail',
  'account email': 'accountEmail',
  // 'password' is deliberately absent: DASH does not store subscription account passwords.
  'for login': 'loginUrl',
  login: 'loginUrl',
  url: 'loginUrl',
  link: 'loginUrl',
  period: 'period',
  'billing period': 'period',
  frequency: 'period',
  plan: 'plan',
  inr: 'amountInr',
  amount: 'amountInr',
  'amount (inr)': 'amountInr',
  cost: 'amountInr',
  usd: 'amountUsd',
  'amount (usd)': 'amountUsd',
  'renewal date': 'renewalDate',
  'next renewal': 'renewalDate',
  'transaction date': 'paidOn',
  'payment date': 'paidOn',
  date: 'paidOn',
  comments: 'comments',
  comment: 'comments',
  remarks: 'comments',
  payee: 'payee',
  'payment mode': 'paymentMode',
  mode: 'paymentMode',
  'keka codes': 'kekaCode',
  'keka code': 'kekaCode',
  keka: 'kekaCode',
  status: 'status',
  owner: 'owner',
};
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const subNum = (v: unknown) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const subTxt = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? cellText(v) : String(v).trim());
function subCellDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400 * 1000));
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/); // the team writes day-first
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
const subIso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
function subMonthHeading(row: unknown[]): number {
  const cells = (row || []).filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
  if (cells.length !== 1) return -1;
  const m = String(cells[0]).trim().toLowerCase().match(/^([a-z]{3,9})[\s\-.]*(\d{4})$/);
  if (!m) return -1;
  return MONTH_NAMES.indexOf(m[1]!.slice(0, 3));
}

export type SubImportSub = {
  name: string;
  department: string;
  accountEmail: string;
  loginUrl: string;
  period: string;
  plan: string;
  amountInr: number;
  amountUsd: number;
  renewalDate: string;
  comments: string;
  payee: string;
  paymentMode: string;
  kekaCode: string;
  status: string;
  owner: string;
};
export type SubImportPayment = {
  name: string;
  paidOn: string;
  accountEmail: string;
  plan: string;
  period: string;
  amountInr: number;
  amountUsd: number;
  kekaCode: string;
  comments: string;
  department: string;
};
export type SubImport = { subscriptions: SubImportSub[]; payments: SubImportPayment[]; notes: string[]; dateCorrections: number };

export function parseSubscriptionWorkbook(book: Workbook): SubImport {
  const out: SubImport = { subscriptions: [], payments: [], notes: [], dateCorrections: 0 };
  for (const sheetName of book.sheetNames) {
    const rows = sheetMatrix(book, sheetName);
    let hIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const cand = (rows[i] || []).map((c) => String(c === null || c === undefined ? '' : c).trim().toLowerCase());
      if (cand.some((c) => c === 'name' || c === 'software' || c === 'transaction date')) {
        hIdx = i;
        headers = cand;
        break;
      }
    }
    if (hIdx < 0) {
      out.notes.push(`Sheet “${sheetName}” was skipped: no header row it recognises.`);
      continue;
    }
    const isLedger = headers.some((h) => h === 'transaction date');
    const fields = headers.map((h) => SUB_HEADER_MAP[h] || null);
    let monthCtx = -1;
    let yearCtx: number | null = null;
    for (let i = hIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const heading = subMonthHeading(row);
      if (heading >= 0) {
        monthCtx = heading;
        const ym = String(row.find((c) => c)).match(/(\d{4})/);
        yearCtx = ym ? Number(ym[1]) : null;
        continue;
      }
      const rec: Record<string, unknown> = {};
      fields.forEach((f, c) => {
        if (f && row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '') rec[f] = row[c];
      });
      if (!rec.name) continue;
      if (isLedger) {
        let d = subCellDate(rec.paidOn);
        // Month heading wins over a month-first cell when swapping day/month reconciles them (website rule).
        if (d && monthCtx >= 0 && d.getMonth() !== monthCtx) {
          const swapped = new Date(d.getFullYear(), d.getDate() - 1, d.getMonth() + 1);
          if (swapped.getMonth() === monthCtx && !Number.isNaN(swapped.getTime())) {
            d = swapped;
            out.dateCorrections++;
          }
        }
        if (!d && monthCtx >= 0 && yearCtx) d = new Date(yearCtx, monthCtx, 1);
        if (!d) continue;
        out.payments.push({
          name: subTxt(rec.name),
          paidOn: subIso(d),
          accountEmail: subTxt(rec.accountEmail),
          plan: subTxt(rec.plan),
          period: subTxt(rec.period),
          amountInr: subNum(rec.amountInr),
          amountUsd: subNum(rec.amountUsd),
          kekaCode: subTxt(rec.kekaCode),
          comments: subTxt(rec.comments),
          department: subTxt(rec.department),
        });
      } else {
        out.subscriptions.push({
          name: subTxt(rec.name),
          department: subTxt(rec.department),
          accountEmail: subTxt(rec.accountEmail),
          loginUrl: subTxt(rec.loginUrl),
          period: subTxt(rec.period) || 'monthly',
          plan: subTxt(rec.plan),
          amountInr: subNum(rec.amountInr),
          amountUsd: subNum(rec.amountUsd),
          renewalDate: subIso(subCellDate(rec.renewalDate)),
          comments: subTxt(rec.comments),
          payee: subTxt(rec.payee),
          paymentMode: subTxt(rec.paymentMode),
          kekaCode: subTxt(rec.kekaCode),
          status: subTxt(rec.status) || 'active',
          owner: subTxt(rec.owner),
        });
      }
    }
  }
  return out;
}
