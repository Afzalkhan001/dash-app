// Demo data for the excel domain (Import & export). Two parts:
//
// 1. Sample sheets — the demo has no files on the phone, so each import screen offers "Use the demo
//    sample sheet" (demo session only). Each sample is realistic and exercises the preview: a new
//    person, people already on the roster (matched by employee ID and by email), a bad email, a new
//    department, an unknown employee number, a Keka code that already exists, month-first dates…
//    Names, employee numbers and departments are the demo company's own (fixtures/org.ts).
//
// 2. Routes the other fixtures don't answer (routes/upload_batches.js, subscriptions.js import).
//    POST /whitelist, /departments, /projects, /clients, /assets and PUT /users, /whitelist are already
//    answered by people.ts, work.ts and itdesk.ts, so imported rows show up in Roster, Projects,
//    Clients and Assets. The integrator should list excelRoutes LAST in the barrel so it never
//    shadows those (see features/excel/HANDOFF.md).

import { DEMO_TENANT_ID } from '@/demo/config';
import { addDays, daysAgo, fail, nowIso, today, type Route } from '@/demo/state';
import type { SheetSpec } from '@/lib/xlsx';

const T0 = today();
const ago = (n: number) => addDays(T0, -n);

// ── Sample sheets ────────────────────────────────────────────────────────────
export const DEMO_SAMPLE_SHEETS: Record<'employees' | 'updates' | 'projects' | 'clients' | 'assets' | 'subscriptions', { fileName: string; sheets: SheetSpec[] }> = {
  employees: {
    fileName: 'New_joiners_October.xlsx',
    sheets: [
      {
        name: 'Employees',
        rows: [
          ['EMP NO.', 'NAME', 'WORK EMAIL', 'GENDER', 'MOBILE', 'LOCATION', 'DEPARTMENT', 'JOB TITLE', 'REPORTING MANAGER', 'DATE JOINED', 'DOB', 'BLOOD GROUP'],
          ['TM-1091', 'Aditi Kulkarni', 'aditi.kulkarni.demo@tamadamedia.com', 'Female', '+91 98480 11223', 'Hyderabad', 'Creative', 'Video Editor', 'Priya Sharma', '13-Oct-2026', '14-Feb-1999', 'B+'],
          ['TM-1092', 'Rohan Das', 'rohan.das.demo@tamadamedia.com', 'Male', '+91 99590 22334', 'Hyderabad', 'Production', 'Camera Assistant', 'Deepa Menon', '13-Oct-2026', '02-Aug-2000', 'O+'],
          ['TM-1093', 'Shreya Pillai', 'shreya.pillai.demo@tamadamedia.com', 'Female', '+91 90000 33445', 'Bengaluru', 'Podcasts', 'Podcast Producer', 'Vikram Singh', '20-Oct-2026', '30-Mar-1997', 'A+'],
          // Already on the roster: matched by employee ID (fills the blanks, never clears a field).
          ['TM-1066', 'Farhan Ali', 'farhan.ali.demo@tamadamedia.com', 'Male', '+91 90001 01066', 'Hyderabad', 'Production', 'Senior Camera Operator', 'Deepa Menon', '11-Sep-2023', '15-Mar-1995', 'O+'],
          // Already on the roster by email only (no ID in the sheet).
          ['', 'Meera Nair', 'meera.nair.demo@tamadamedia.com', 'Female', '', 'Hyderabad', 'Marketing', 'Content Strategist', 'Vikram Singh', '', '', ''],
          // A typo: the email has no domain, so this row is left out.
          ['TM-1094', 'Karthik Rao', 'karthik.rao@', 'Male', '+91 91234 55667', 'Hyderabad', 'IT & Admin', 'Network Engineer', 'Naveen Kumar', '27-Oct-2026', '', 'AB+'],
        ],
      },
    ],
  },
  updates: {
    fileName: 'Roster_corrections.xlsx',
    sheets: [
      {
        name: 'Employee Updates',
        rows: [
          ['EMP NO.', 'NAME (reference only)', 'GENDER', 'MOBILE', 'LOCATION', 'DEPARTMENT', 'JOB TITLE', 'REPORTING MANAGER', 'DATE JOINED', 'DOB', 'BLOOD GROUP'],
          ['TM-1066', 'Farhan Ali', '', '+91 90001 77661', '', '', 'Senior Camera Operator', '', '', '', ''],
          ['TM-1069', 'Meera Nair', '', '', 'Bengaluru', '', '', '', '', '', 'O-'],
          ['TM-1080', 'Zoya K.', '', '', '', 'Marketing', 'Social Media Lead', '', '', '', ''],
          ['TM-1088', 'Ravi Teja', '', '', '', '', '', '', '', '', ''],
          ['TM-9999', 'Someone Old', '', '+91 90000 00000', '', '', '', '', '', '', ''],
        ],
      },
    ],
  },
  projects: {
    fileName: 'Q3_new_channels.xlsx',
    sheets: [
      {
        name: 'Projects',
        rows: [
          ['Metadata 1', 'Metadata 2', 'Metadata 3', 'Keka Code', 'Cost Code Owner', 'Date', 'Employee Number'],
          ['YT-NW-C', 'SVC2', 'Telugu Talkies', 'YT-NW-C_SVC2_TeluguTalkies', 'Priya Sharma', ago(10), 'TM-1007'],
          ['YT-NW-TM', 'SVC3', 'Kids Rhymes Hindi', 'YT-NW-TM_SVC3_KidsRhymesHindi', 'Vikram Singh', ago(10), 'TM-1011'],
          ['YT-O&O', 'SVC1', 'Tamada Shorts', '', 'Deepa Menon', ago(3), 'TM-1003'],
          ['YT-NW-C', 'SVC4', 'Fitness With Anu', 'YT-NW-C_SVC4_FitnessWithAnu', 'Old Owner', ago(3), 'TM-7777'],
        ],
      },
    ],
  },
  clients: {
    fileName: 'clients_bulk_upload.xlsx',
    sheets: [
      {
        name: 'Clients',
        rows: [
          ['name', 'channelName', 'email', 'phone'],
          ['Sunrise Foods', 'SunriseKitchen', 'brand@sunrisefoods.in', '+91 98765 43210'],
          ['Pixel Toys', 'PixelToysIndia', 'marketing@pixeltoys.in', '+91 91234 56789'],
          ['Greenleaf Ayurveda', 'GreenleafTV', 'hello@greenleaf', '+91 99887 76655'],
        ],
      },
    ],
  },
  assets: {
    fileName: 'Asset_purchase_Oct.xlsx',
    sheets: [
      {
        name: 'Assets',
        rows: [
          ['Asset Id', 'Asset Name', 'Asset Description', 'Asset Location', 'Asset Category', 'Asset Type', 'Purchased On', 'Warranty expiry status', 'Warranty expires on', 'Asset Condition', 'Assigned To Employee Number', 'Date of Asset Assignment', 'Serial Number', 'ASSET VALUE'],
          ['ASSET/TM/2627/0141', 'MacBook Pro 14', 'Apple MacBook Pro M4 Pro 24GB 512GB', 'Hyderabad', 'Electronics', 'MacBook', ago(12), 'Active', addDays(T0, 353), 'Good', 'TM-1035', ago(9), 'C02MBP14-2641', '214900'],
          ['ASSET/TM/2627/0142', 'Sony FX3', 'Full-frame cinema camera body', 'Hyderabad', 'Electronics', 'Camera', ago(30), 'Active', addDays(T0, 700), 'Good', '', '', 'SNYFX3-88120', '389990'],
          ['ASSET/TM/2627/0143', 'Rode Wireless PRO', 'Dual-channel wireless mic kit', 'Hyderabad', 'Electronics', 'Microphone', ago(30), 'Active', addDays(T0, 335), 'Good', 'TM-1066', ago(28), 'RWP-55102', '₹32,900'],
          ['ASSET/TM/2627/0144', 'Herman Miller Aeron', 'Ergonomic chair, size B', 'Bengaluru', 'Furniture', 'Chair', ago(60), 'Active', addDays(T0, 3600), 'Good', 'TM-4040', ago(55), 'HMA-B-7781', '145000'],
        ],
      },
    ],
  },
  subscriptions: {
    fileName: 'Subscriptions Sample Sheet.xlsx',
    sheets: [
      {
        name: 'Master',
        rows: [
          ['Name', 'Department', 'Email ID', 'Password', 'For Login', 'Period', 'Plan', 'INR', 'USD', 'Renewal Date', 'Payee', 'Payment Mode', 'Keka Codes', 'Status', 'Owner', 'Comments'],
          ['Frame.io', 'Creative', 'post@tamadamedia.com', '(not imported)', 'https://frame.io', 'yearly', 'Team', 45000, 540, '15/01/2027', 'Adobe', 'Card', 'YT-NW-C_SVC2_HaiTV', 'active', 'Priya Sharma', 'Review links for clients'],
          ['Epidemic Sound', 'Creative', 'music@tamadamedia.com', '(not imported)', 'https://epidemicsound.com', 'monthly', 'Business', 2999, '', '05/11/2026', 'Epidemic', 'Card', '', 'active', 'Sanjay Kumar', ''],
          ['Hootsuite', 'Marketing', 'social@tamadamedia.com', '(not imported)', 'https://hootsuite.com', 'monthly', 'Team', 8200, 99, '28/10/2026', 'Hootsuite', 'Card', '', 'not_using', 'Vikram Singh', 'Moving to Meta Business Suite'],
        ],
      },
      {
        name: 'Ledger',
        rows: [
          ['Transaction Date', 'Software', 'Department', 'Plan', 'INR', 'USD', 'Keka Codes', 'Comments'],
          ['Aug- 2026', null, null, null, null, null, null, null],
          ['05/08/2026', 'Epidemic Sound', 'Creative', 'Business', 2999, '', '', ''],
          ['28/08/2026', 'Hootsuite', 'Marketing', 'Team', 8200, 99, '', ''],
          ['Sep- 2026', null, null, null, null, null, null, null],
          // Typed month-first: the "Sep- 2026" heading wins (the website's rule), so this reads 5 September.
          ['09/05/2026', 'Epidemic Sound', 'Creative', 'Business', 2999, '', '', ''],
          ['28/09/2026', 'Hootsuite', 'Marketing', 'Team', 8200, 99, '', 'Last month before cancelling'],
        ],
      },
    ],
  },
};

// ── Upload history (routes/upload_batches.js) ────────────────────────────────
type Batch = { id: string; type: string; fileName: string; uploadedAt: string; count: number; rows: Record<string, unknown>[]; tenantId: string };

export const uploadBatchStore: Batch[] = [
  {
    id: 'ub-demo-emp-1',
    type: 'employees',
    fileName: 'Joiners_September.xlsx',
    uploadedAt: daysAgo(34, '11:20'),
    count: 2,
    tenantId: DEMO_TENANT_ID,
    rows: [
      { employeeNumber: 'TM-1086', name: 'Nikhil Jain', email: 'nikhil.jain.demo@tamadamedia.com', gender: 'Male', mobile: '+91 90001 01086', location: 'Hyderabad', deptName: 'Creative', jobTitle: 'Assistant Editor', reportingManager: 'Sanjay Kumar', dateJoined: '2025-09-15', dob: '2000-04-04', bloodGroup: 'A+' },
      { employeeNumber: 'TM-1089', name: 'Pooja Rao', email: 'pooja.rao.demo@tamadamedia.com', gender: 'Female', mobile: '+91 90001 01089', location: 'Hyderabad', deptName: 'IT & Admin', jobTitle: 'Office Administrator', reportingManager: 'Naveen Kumar', dateJoined: '2025-02-10', dob: '1997-07-07', bloodGroup: 'B+' },
    ],
  },
  {
    id: 'ub-demo-ast-1',
    type: 'assets',
    fileName: 'Laptops_batch_July.xlsx',
    uploadedAt: daysAgo(80, '16:05'),
    count: 2,
    tenantId: DEMO_TENANT_ID,
    rows: [
      { assetId: 'ASSET/TM/2526/0098', name: 'Dell Latitude 5440', description: 'i7, 16GB, 512GB', location: 'Hyderabad', category: 'Electronics', assetType: 'Laptop', purchaseDate: ago(95), warrantyStatus: 'Active', warrantyExpiry: addDays(T0, 270), condition: 'Good', assignedToEmpNo: 'TM-1088', assignmentDate: ago(80), serial: 'DL5440-1122', price: 78000 },
      { assetId: 'ASSET/TM/2526/0099', name: 'Dell Latitude 5440', description: 'i7, 16GB, 512GB', location: 'Hyderabad', category: 'Electronics', assetType: 'Laptop', purchaseDate: ago(95), warrantyStatus: 'Active', warrantyExpiry: addDays(T0, 270), condition: 'Good', assignedToEmpNo: '', assignmentDate: '', serial: 'DL5440-1123', price: 78000 },
    ],
  },
];

function postBatch(body: Record<string, unknown>) {
  const type = String(body?.type || '');
  if (type !== 'employees' && type !== 'assets') return fail('Unknown upload type.', 400);
  const b: Batch = {
    id: String(body.id || `ub${Date.now()}`),
    type,
    fileName: String(body.fileName || 'upload.xlsx'),
    uploadedAt: String(body.uploadedAt || nowIso()),
    count: Number(body.count) || 0,
    rows: Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]).slice(0, 2000) : [],
    tenantId: DEMO_TENANT_ID,
  };
  uploadBatchStore.unshift(b);
  return { ok: true, batch: b };
}

// subscriptions.js import: re-importing the same name + account email updates; payments always add.
const importedSubKeys = new Set<string>(['frame.io|post@tamadamedia.com']);
function importSubs(body: { subscriptions?: { name?: string; accountEmail?: string }[]; payments?: unknown[] }) {
  const subs = Array.isArray(body?.subscriptions) ? body.subscriptions : [];
  const pays = Array.isArray(body?.payments) ? body.payments : [];
  if (!subs.length && !pays.length) return fail('Nothing to import — the file had no usable rows.', 400);
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];
  for (const s of subs) {
    const name = String(s?.name || '').trim();
    if (!name) {
      skipped.push('A row without a name was skipped.');
      continue;
    }
    const k = `${name.toLowerCase()}|${String(s?.accountEmail || '').toLowerCase()}`;
    if (importedSubKeys.has(k)) updated++;
    else {
      importedSubKeys.add(k);
      created++;
    }
  }
  return { ok: true, subscriptionsCreated: created, subscriptionsUpdated: updated, paymentsCreated: pays.length, skipped };
}

export const excelRoutes: Route[] = [
  ['GET', /^\/upload_batches$/, () => uploadBatchStore],
  ['POST', /^\/upload_batches$/, (_p, body) => postBatch(body ?? {})],
  ['POST', /^\/subscriptions\/import$/, (_p, body) => importSubs(body ?? {})],
];
