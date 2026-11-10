// Excel domain — the blank sheets the website hands out before a bulk upload, with the same columns,
// sample rows, tab names and file names (so a sheet made on the phone uploads on the website too).
//   Employees        dlSampleHR       dash.html:6023  DASH_Keka_Employee_Template.xlsx
//   Employee update  dlSampleUpdate   dash.html:6324  DASH_Employee_Bulk_Update_Template.xlsx
//   Projects         dlProjTemplate   dash.html:22668 DASH_Projects_Template.xlsx
//   Assets           dlSample         dash.html:20239 DASH_Asset_Template.xlsx
//   Clients          downloadSample   dash.html:23420 clients_bulk_upload_sample (CSV there; .xlsx here, same columns)
//   Subscriptions    (none on the website: the import reads the team's own workbook) — the phone offers
//                    a two-tab example built from SUB headers, so the shape is clear.

import { ASSET_COL_WIDTHS, ASSET_COLS, KEKA_COLS, PROJ_COLS, UPD_COLS } from '@/features/excel/parse';
import type { SheetSpec } from '@/lib/xlsx';

export type Template = { fileName: string; sheets: SheetSpec[]; columns: string[] };

export const TEMPLATES = {
  employees: {
    fileName: 'DASH_Keka_Employee_Template',
    columns: KEKA_COLS,
    sheets: [
      {
        name: 'Employees',
        cols: [10, 22, 26, 10, 18, 14, 16, 32, 24, 14, 14, 12],
        rows: [
          KEKA_COLS,
          ['10001', 'Sample Employee One', 'sample1@company.com', 'Male', '91-9000000001', 'Hyderabad', 'Publishing', 'Senior Executive', 'Sample Manager', '17-Feb-2020', '12-Jan-1990', 'O+'],
          ['10002', 'Sample Employee Two', 'sample2@company.com', 'Female', '91-9000000002', 'Hyderabad', 'Short Format', 'Content Manager', 'Sample Manager', '01-May-2021', '23-Jun-1992', 'B+'],
          ['10003', 'Sample Employee Three', 'sample3@company.com', 'Male', '91-9000000003', 'Hyderabad', 'IT & Admin', 'Manager', 'Sample Manager', '19-Sep-2019', '05-Nov-1988', 'A+'],
        ],
      },
    ],
  },
  updates: {
    fileName: 'DASH_Employee_Bulk_Update_Template',
    columns: UPD_COLS,
    sheets: [
      {
        name: 'Employee Updates',
        cols: [10, 26, 10, 18, 14, 16, 32, 24, 14, 14, 12],
        rows: [UPD_COLS, ['10001', 'Sample Employee One', '', '', '', '', '', '', '', 'O+'], ['10002', 'Sample Employee Two', '', '9000000012', '', '', '', '', '23-Jun-1992', '']],
      },
    ],
  },
  projects: {
    fileName: 'DASH_Projects_Template',
    columns: PROJ_COLS,
    sheets: [
      {
        name: 'Projects',
        cols: PROJ_COLS.map(() => 26),
        rows: [
          PROJ_COLS,
          ['YT-NW-TM', 'SVC3', 'Sample Channel A', 'YT-NW-TM_SVC3_SampleChannelA', 'Sample Manager', '1-Apr-2026', '10001'],
          ['YT-NW-C', 'SVC4', 'Sample Channel B', 'YT-NW-C_SVC4_SampleChannelB', 'Sample Lead', '1-Apr-2026', '10002'],
          ['YT-NW-C', 'SVC2', 'Sample Channel C', 'YT-NW-C_SVC2_SampleChannelC', 'Sample Lead', '1-Apr-2026', '10002'],
          ['YT-NW-C', 'SVC2', 'Sample Channel D', 'YT-NW-C_SVC2_SampleChannelD', 'Sample Manager', '1-Apr-2026', '10001'],
          ['YT-O&O', 'SVC3', 'Sample Channel E', 'YT-O&O_SVC3_SampleChannelE', 'Sample Manager', '1-Apr-2026', '10001'],
        ],
      },
    ],
  },
  assets: {
    fileName: 'DASH_Asset_Template',
    columns: ASSET_COLS,
    sheets: [
      {
        name: 'Assets',
        cols: ASSET_COL_WIDTHS,
        rows: [
          ASSET_COLS,
          ['ASSET/TM/2526/0001', 'MacBook Air', 'Apple MacBook Air M4 16GB 256GB', 'Hyderabad', 'Electronics', 'MacBook', '2025-01-15', 'Active', '2026-01-14', 'Fair', '10001', '2025-01-20', 'SN-2025-001', '76000'],
        ],
      },
    ],
  },
  clients: {
    fileName: 'clients_bulk_upload_sample',
    columns: ['name', 'channelName', 'email', 'phone'],
    sheets: [
      {
        name: 'Clients',
        cols: [24, 20, 26, 18],
        rows: [
          ['name', 'channelName', 'email', 'phone'],
          ['Acme Corp', 'AcmeYouTube', 'contact@acme.com', '+91 9876543210'],
          ['Bright Ideas Studio', 'BrightIdeas', 'hello@brightideas.in', '+91 9123456789'],
        ],
      },
    ],
  },
  subscriptions: {
    fileName: 'DASH_Subscriptions_Import_Example',
    columns: ['Name', 'Department', 'Email ID', 'For Login', 'Period', 'Plan', 'INR', 'USD', 'Renewal Date', 'Payee', 'Payment Mode', 'Keka Code', 'Status', 'Owner', 'Comments'],
    sheets: [
      {
        name: 'Subscriptions',
        cols: [18, 16, 24, 26, 10, 12, 10, 8, 14, 14, 14, 30, 10, 16, 24],
        rows: [
          ['Name', 'Department', 'Email ID', 'For Login', 'Period', 'Plan', 'INR', 'USD', 'Renewal Date', 'Payee', 'Payment Mode', 'Keka Code', 'Status', 'Owner', 'Comments'],
          ['Adobe Creative Cloud', 'Short Format', 'design@company.com', 'https://account.adobe.com', 'yearly', 'Teams', 64000, '', '15/03/2027', 'Adobe', 'Card', 'YT-NW-C_SVC2_SampleChannelD', 'active', 'Sample Employee Two', ''],
          ['Canva Pro', 'Publishing', 'social@company.com', 'https://canva.com', 'monthly', 'Pro', 499, '', '01/11/2026', 'Canva', 'UPI', '', 'active', 'Sample Employee One', ''],
        ],
      },
      {
        name: 'Payments',
        cols: [16, 20, 16, 12, 10, 8, 30, 24],
        rows: [
          ['Transaction Date', 'Software', 'Department', 'Plan', 'INR', 'USD', 'Keka Code', 'Comments'],
          ['Sep- 2026', null, null, null, null, null, null, null],
          ['01/09/2026', 'Canva Pro', 'Publishing', 'Pro', 499, '', '', 'Monthly renewal'],
          ['Oct- 2026', null, null, null, null, null, null, null],
          ['01/10/2026', 'Canva Pro', 'Publishing', 'Pro', 499, '', '', 'Monthly renewal'],
        ],
      },
    ],
  },
} satisfies Record<string, Template>;

export type TemplateKey = keyof typeof TEMPLATES;
