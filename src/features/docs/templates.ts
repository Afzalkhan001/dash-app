// The documents themselves: pure builders from the server's own rows to a PdfDoc (src/lib/pdf.ts), one
// per website export. Each cites the website function it copies; the columns and titles are the
// website's, the dates are India time and written the app's way.
//
//   pettyStatementHtml   pettyCashStatementHtml + PCS_CSS (dash.html:16369–16420), the Accounts sheet, kept as is
//   reviewsDoc           downloadReviewPdf (dash.html:25957)
//   scheduleDoc          ManagerHome dlPdf "Tomorrow Schedule" (:22950) / AdminHome "Next Day Schedule" (:22064)
//   bountyDoc            BountyReportsView exportPdf (:13423)
//   auditDoc             ActivityAudit doExport('pdf') (:15108)
//   assetDoc             downloadPDF "Asset Report" (:20388)
//   timesheetDoc         TimesheetCard exportPdf (:28733)
//   vendorMasterDoc      exportVendorMaster(rows,'pdf') (:25802)
//   vendorSummaryDoc     printVendorSummary (:25093), without the attached documents (opened one by one)
//   signedAgreementHtml  buildSignedAgreementPdf (:32516): the stamped pages, then the signature certificate

import type { AccountsAgreement, AccountsVendor, AccountsVendorRow } from '@/api/accounts';
import type { AuditRow } from '@/api/company';
import type { Asset } from '@/api/itdesk';
import type { PettyCashStatement } from '@/api/petty-cash';
import type { LedgerTxn } from '@/api/bountyadmin';
import { dayLabel, istDateOf, timeOf } from '@/lib/dates';
import { esc, type PdfDoc, type PdfLetterhead, printedLine } from '@/lib/pdf';

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** '19 Oct 2026' (India date) or '' when missing. */
export function pdfDate(v?: string | null) {
  const ymd = istDateOf(v);
  return ymd ? dayLabel(ymd, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
/** '19 Oct 2026, 9:42 AM' (India time) or ''. */
export function pdfStamp(iso?: string | null) {
  const d = pdfDate(iso);
  return d ? `${d}, ${timeOf(iso)}` : '';
}
const stamp = (today: string) => today.replace(/[^\d-]/g, '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Petty cash: Statement of Expenses ────────────────────────────────────────
const PCS_CSS =
  '.pcs{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff;padding:14px;max-width:820px;margin:0 auto}' +
  '.pcs table{width:100%;border-collapse:collapse;table-layout:auto}.pcs td,.pcs th{border:1px solid #000;padding:2px 5px;vertical-align:middle;line-height:1.35}' +
  '.pcs .c{text-align:center}.pcs .r{text-align:right}.pcs .b{font-weight:700}.pcs .g{background:#c8c8c8;font-weight:700}.pcs .red{color:#d9261c;font-weight:700}' +
  '.pcs .sec{color:#d9261c;font-weight:700;margin:14px 0 2px;font-size:11px}.pcs .two{display:flex;gap:28px;align-items:flex-start}.pcs .two>div:first-child{flex:0 0 52%}.pcs .two>div:last-child{flex:0 0 36%}' +
  '.pcs .sign td{height:42px}.pcs .gap{height:14px}.pcs .tot td{font-weight:700;border-top:2px solid #000}.pcs .sheet{page-break-after:always;margin-bottom:26px}.pcs .sheet:last-child{page-break-after:auto}';
const PCS_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pcsNum = (n: unknown) => {
  const v = Number(n || 0);
  return v ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '-';
};
const pcsMoney2 = (n: unknown) => Number(n || 0).toFixed(2);
const pcsDate = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(iso));
  return m ? `${+m[3]!}-${PCS_MON[+m[2]! - 1]}-${m[1]!.slice(2)}` : '';
};
const pcsDateNum = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(iso));
  return m ? `${+m[3]!}/${+m[2]!}/${m[1]}` : '';
};

/** The Statement of Expenses exactly as the website prints it (one sheet per project code). */
export function pettyStatementHtml(d: PettyCashStatement, lh: PdfLetterhead) {
  const e = d.employee ?? { name: '', employeeNumber: '', designation: '', location: '' };
  const sheets = (d.statements ?? [])
    .map((st) => {
      const submitted = istDateOf(st.submittedAt) || s(st.submittedAt).slice(0, 10);
      const head = `<table>
      <tr><td colspan="4" class="c b" style="font-size:13px">${esc(lh.name)}</td></tr>
      <tr><td colspan="4" class="c b">${esc(lh.address)}</td></tr>
      <tr><td colspan="4" class="c b">STATEMENT OF EXPENSES SUMMARY</td></tr>
      <tr><td class="b" style="width:19%">Name of the Employee :</td><td style="width:32%">${esc(e.name)}</td><td class="b" style="width:30%">Starting Date &amp; Time</td><td class="c b" style="width:19%">${pcsDateNum(st.startDate)}</td></tr>
      <tr><td class="b">Employee ID:</td><td class="r">${esc(e.employeeNumber)}</td><td class="b">Date &amp; Time of Submission</td><td class="c b">${pcsDateNum(submitted)}</td></tr>
      <tr><td class="b">Designation :</td><td>${esc(e.designation)}</td><td class="b">Number of Days</td><td class="c b">Day ${st.days || 1}</td></tr>
      <tr><td class="b">Location :</td><td>${esc(e.location)}</td><td class="g">Imprest</td><td class="g c">PC/Shoot day ${st.days || 1}</td></tr>
      <tr><td class="b">Purpose /Project Name :</td><td colspan="3" class="c">${esc(st.projectName || st.kekaCode)}</td></tr>
      <tr><td class="b">other Remarks :</td><td colspan="3">&nbsp;</td></tr>
      <tr><td colspan="3" class="g c">Particulars</td><td class="g c">Amount</td></tr>
      <tr><td colspan="2" style="border-right:0">&nbsp;</td><td class="r b" style="border-left:0">Advance</td><td class="red c">${pcsMoney2(st.advance)}</td></tr>
      <tr><td colspan="2" style="border-right:0">&nbsp;</td><td class="r b" style="border-left:0">Total&nbsp; Expenses</td><td class="red c">${pcsMoney2(st.total)}</td></tr>
      <tr><td colspan="2" style="border-right:0">&nbsp;</td><td class="r b" style="border-left:0">Balance Payable to Employee</td><td class="red c">${pcsMoney2(st.balance)}</td></tr>
      <tr><td colspan="4" class="c b">Note : Kindly Check with account dept and Collect your Excess Amount</td></tr>
      <tr><td colspan="4" class="gap">&nbsp;</td></tr>
    </table>
    <table class="sign"><tr class="b c"><td style="width:24%">Employee</td><td style="width:16%">Manager</td><td style="width:26%">GM-Accounts</td><td style="width:17%">CEO</td><td style="width:17%">Director</td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr></table>`;
      const outflow = `<div class="sec">1).Outflow</div><table><tr class="b"><td>Expenses Head</td><td>Total Amount</td></tr>
      ${(st.heads ?? []).map((h) => `<tr><td>${esc(h.name)}</td><td class="r">${pcsNum(h.total)}</td></tr>`).join('')}
      <tr class="tot"><td>&nbsp;Total</td><td class="r">${pcsNum(st.total)}</td></tr></table>`;
      const inflowRows = st.inflow ?? [];
      const inflow = `<div class="sec">2).Inflow</div><table><tr class="b"><td>Date</td><td>Amount</td></tr>
      ${inflowRows.length ? inflowRows.map((i) => `<tr><td class="r">${pcsDate(i.date)}</td><td class="r">${pcsNum(i.amount)}</td></tr>`).join('') : '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>'}
      <tr class="tot"><td>&nbsp;Total</td><td class="r">${pcsNum(st.advance)}</td></tr></table>`;
      const lines = st.lines ?? [];
      const annex = `<div class="sec" style="color:#000">3).Annexure-A</div><table>
      <tr class="b c"><td>Expenses Head</td><td>Amount</td><td>Date</td><td>Project</td><td>No Persons</td><td>Particular/Name</td><td>No Egs</td><td>No Persons</td><td>No Days</td></tr>
      ${lines
        .filter((l) => l.status !== 'rejected')
        .map((l) => `<tr><td>${esc(l.head)}</td><td class="r">${pcsNum(l.amount)}</td><td class="r" style="white-space:nowrap">${pcsDate(l.date)}</td><td>${esc(l.project)}</td><td></td><td>${esc(l.description)}${l.paidTo ? ` — ${esc(l.paidTo)}` : ''}</td><td></td><td></td><td></td></tr>`)
        .join('')}
    </table>`;
      const rejected = lines.filter((l) => l.status === 'rejected');
      const rejectedHtml = rejected.length
        ? `<div class="sec" style="color:#000">Rejected by Accounts - not counted above</div><table>
      <tr class="b c"><td>Expenses Head</td><td>Amount</td><td>Date</td><td>Particular/Name</td><td>Rejected by</td><td>Reason</td></tr>
      ${rejected.map((l) => `<tr><td>${esc(l.head)}</td><td class="r">${pcsNum(l.amount)}</td><td class="r" style="white-space:nowrap">${pcsDate(l.date)}</td><td>${esc(l.description)}${l.paidTo ? ` — ${esc(l.paidTo)}` : ''}</td><td>${esc(l.rejectedByName)}</td><td>${esc(l.rejectionReason)}</td></tr>`).join('')}
    </table>`
        : '';
      return `<div class="sheet">${head}<div class="two"><div>${outflow}</div><div>${inflow}</div></div>${annex}${rejectedHtml}</div>`;
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Statement of Expenses</title><style>@page{size:A4;margin:10mm}body{margin:0;background:#fff}${PCS_CSS}</style></head><body><div class="pcs">${sheets}</div></body></html>`;
}

// ── Pending reviews ──────────────────────────────────────────────────────────
export type ReviewPdfGroup = { name: string; profession: string; items: { project?: string; kekaCode?: string; date?: string; kind: 'approval' | 'rating'; since?: string }[] };

export function reviewsDoc(o: { employeeName: string; employeePhone?: string; groups: ReviewPdfGroup[]; letterhead: PdfLetterhead; today: string; now: number; by?: string }): PdfDoc {
  const total = o.groups.reduce((n, g) => n + g.items.length, 0);
  const since = (iso?: string) => {
    const t = Date.parse(s(iso));
    if (!Number.isFinite(t)) return '—';
    const d = Math.floor((o.now - t) / 86_400_000);
    return d <= 0 ? 'Today' : plural(d, 'day');
  };
  const rows = o.groups.flatMap((g) =>
    [...g.items].sort((a, b) => s(a.date).localeCompare(s(b.date))).map((b) => [g.name, g.profession || '—', b.project || b.kekaCode || 'Booking', pdfDate(b.date) || '—', b.kind === 'rating' ? 'Awaiting rating' : 'Awaiting approval', since(b.since)]),
  );
  return {
    fileName: `Pending_Reviews_${o.employeeName.replace(/\s+/g, '_')}_${stamp(o.today)}`,
    title: `Pending reviews — ${o.employeeName}`,
    subtitle: `${plural(total, 'pending review')} across ${plural(o.groups.length, 'professional')}${o.employeePhone ? ` · ${o.employeePhone}` : ''}`,
    letterhead: o.letterhead,
    sections: [{ table: { head: ['Professional', 'Profession', 'Project / Keka Code', 'Date', 'Needs', 'Pending since'], rows, empty: 'No pending reviews.' } }],
    footer: printedLine(o.by),
  };
}

// ── Tomorrow / next day schedule ─────────────────────────────────────────────
export type ScheduleItem = { channel: string; who: string; time: string; booked: boolean; desc?: string };

export function scheduleDoc(o: { title: string; dayLabel: string; ymd: string; deptName: string; items: ScheduleItem[]; withDescription?: boolean; letterhead: PdfLetterhead; by?: string }): PdfDoc {
  const head = o.withDescription ? ['Project', 'Employee', 'Time', 'Description'] : ['Channel', 'Employee', 'Time'];
  return {
    fileName: `schedule-${o.ymd}`,
    title: `${o.title} — ${o.dayLabel}`,
    subtitle: `Department: ${o.deptName || '—'} · ${plural(o.items.length, 'item')}`,
    letterhead: o.letterhead,
    landscape: !o.withDescription,
    sections: [
      {
        table: {
          head,
          rows: o.items.map((i) => (o.withDescription ? [i.channel, i.who, i.time || '—', i.desc || '—'] : [i.channel, i.booked ? `${i.who} [Booked]` : i.who, i.time || '—'])),
          tones: o.items.map((i) => (i.booked ? 'good' : null)),
          empty: `No schedule for ${o.dayLabel}`,
        },
      },
    ],
    footer: printedLine(o.by),
  };
}

// ── Bounty coins report ──────────────────────────────────────────────────────
export function bountySummary(txns: LedgerTxn[]) {
  const sum = (type: string) => txns.filter((t) => t.type === type).reduce((n, t) => n + (Number(t.amount) || 0), 0);
  return { added: sum('COMPANY_CREDIT'), distributed: sum('COIN_DISTRIBUTION'), reserved: sum('BOUNTY_RESERVE'), released: sum('BOUNTY_RELEASE'), rewards: sum('BOUNTY_REWARD_TRANSFER') };
}

export function bountyDoc(o: { txns: LedgerTxn[]; typeLabel: (t: string) => string; fromLabel: (t: LedgerTxn) => string; letterhead: PdfLetterhead; today: string; range?: string; by?: string }): PdfDoc {
  const list = [...o.txns].sort((a, b) => s(a.createdAt).localeCompare(s(b.createdAt)));
  const x = bountySummary(list);
  return {
    fileName: `Bounty_Report_${stamp(o.today)}`,
    title: 'Bounty coins report',
    subtitle: `Added: ${x.added}   Distributed: ${x.distributed}   Reserved: ${x.reserved}   Released: ${x.released}   Rewards paid: ${x.rewards}${o.range ? `   ·   ${o.range}` : ''}`,
    letterhead: o.letterhead,
    landscape: true,
    sections: [
      {
        table: {
          head: ['Txn ID', 'Date', 'Type', 'From', 'To', 'Task', 'Amount', 'Performed by'],
          rows: list.map((t) => [t.id, pdfStamp(t.createdAt), o.typeLabel(t.type), o.fromLabel(t), t.toWalletName || '—', t.taskName || '—', t.amount, t.performedBy || '—']),
          align: [undefined, undefined, undefined, undefined, undefined, undefined, 'right'],
          empty: 'No transactions in this range.',
        },
      },
    ],
    footer: printedLine(o.by),
  };
}

// ── User activity audit ──────────────────────────────────────────────────────
export function auditDoc(o: { rows: AuditRow[]; roleLabel: (r?: string) => string; letterhead: PdfLetterhead; today: string; by?: string }): PdfDoc {
  const val = (v: unknown) => (v && typeof v === 'object' ? JSON.stringify(v) : s(v));
  const short = (v: unknown) => {
    const t = val(v);
    return t.length > 160 ? `${t.slice(0, 157)}…` : t;
  };
  return {
    fileName: `User_Activity_Audit_${stamp(o.today)}`,
    title: 'User activity audit report',
    subtitle: plural(o.rows.length, 'activity', 'activities'),
    letterhead: o.letterhead,
    landscape: true,
    sections: [
      {
        table: {
          dense: true,
          head: ['Date', 'Time', 'Actor name', 'Actor role', 'Affected user', 'Employee ID', 'Module', 'Action', 'Description', 'Entity type', 'Entity ID', 'Previous value', 'New value', 'Status', 'IP address', 'User agent'],
          rows: o.rows.map((r) => [
            pdfDate(r.createdAt),
            r.createdAt ? timeOf(r.createdAt) : '',
            r.actorName,
            o.roleLabel(r.actorRole),
            r.affectedUserName,
            r.affectedUserEmpId,
            r.module,
            r.action,
            r.description,
            r.entityType,
            r.entityId,
            short(r.previousData),
            short(r.newData),
            r.status,
            r.ipAddress,
            short(r.userAgent),
          ]),
          empty: 'No activity in this range.',
        },
      },
    ],
    footer: printedLine(o.by),
  };
}

// ── Asset report ─────────────────────────────────────────────────────────────
export function assetDoc(a: Asset, o: { letterhead: PdfLetterhead; today: string; now: Date; by?: string }): PdfDoc {
  const hist = Array.isArray(a.history) ? a.history : [];
  return {
    fileName: `Asset_Report_${a.name.replace(/\s+/g, '_')}_${stamp(o.today)}`,
    title: 'Asset report',
    subtitle: `Generated: ${pdfStamp(o.now.toISOString())}`,
    letterhead: o.letterhead,
    sections: [
      {
        heading: a.name,
        meta: [
          ['Serial number', a.serial || '—'],
          ['Purchase date', pdfDate(a.purchaseDate) || a.purchaseDate || '—'],
          ['Price', `Rs. ${(Number(a.price) || 0).toLocaleString('en-IN')}`],
          ['Status', (a.status || 'available').toUpperCase()],
          ['Assigned to', a.assignedTo || 'Unassigned'],
          ...(a.assetId ? ([['Asset ID', a.assetId]] as [string, string][]) : []),
        ],
      },
      {
        heading: 'Assignment timeline',
        table: {
          head: ['Action', 'Employee', 'Date & time', 'Remarks'],
          widths: ['18%', '26%', '26%'],
          rows: hist.map((h) => (h.action === 'assigned' ? ['ASSIGNED', h.to, pdfStamp(h.at), ''] : ['RETURNED', h.from, pdfStamp(h.at), h.note || ''])),
          empty: 'No assignment history yet.',
        },
      },
    ],
    footer: printedLine(o.by),
  };
}

// ── Timesheet ────────────────────────────────────────────────────────────────
export type TimesheetRow = { id: string; date: string; type: string; project: string; title: string; by: string; start: string; end: string; hours: number; status: string };
/** fmtHrs: 7.5 → '7h 30m'. */
export const hoursLabel = (h: number) => {
  const m = Math.round((Number(h) || 0) * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

export function timesheetDoc(o: { name: string; from: string; to: string; meta: [string, string][]; rows: TimesheetRow[]; letterhead: PdfLetterhead; by?: string }): PdfDoc {
  const total = o.rows.reduce((n, r) => n + r.hours, 0);
  return {
    fileName: `Timesheet_${o.name.replace(/\s+/g, '_')}_${o.from}_to_${o.to}`,
    title: 'Timesheet',
    subtitle: `Period: ${pdfDate(o.from)} to ${pdfDate(o.to)}   ·   Total hours: ${hoursLabel(total)}`,
    letterhead: o.letterhead,
    meta: o.meta,
    landscape: true,
    sections: [
      {
        table: {
          head: ['Ref ID', 'Date', 'Type', 'Project / Keka Code', 'Task / Booking', 'Assigned by / Booked by', 'Start', 'End', 'Hours', 'Status'],
          rows: o.rows.map((r) => [r.id, pdfDate(r.date), r.type, r.project, r.title, r.by, r.start, r.end, hoursLabel(r.hours), r.status]),
          align: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'right'],
          total: o.rows.length ? ['', '', '', '', '', '', '', 'Total', hoursLabel(total), ''] : undefined,
          empty: 'Nothing logged in this period.',
        },
      },
    ],
    footer: printedLine(o.by),
  };
}

// ── Vendor master ────────────────────────────────────────────────────────────
const PAN_AADHAAR_LABEL: Record<string, string> = { linked: 'Linked', not_linked: 'Not linked', not_applicable: 'Not needed', unchecked: 'Not checked' };
const gstLabel = (g: string) => (g === 'registered' ? 'Active' : g === 'not_registered' ? 'Inactive' : '—');

export function vendorMasterDoc(o: { rows: AccountsVendorRow[]; filterText?: string; letterhead: PdfLetterhead; today: string; now: Date; by?: string }): PdfDoc {
  return {
    fileName: `Vendor_Master_${stamp(o.today)}`,
    title: 'Vendor master',
    subtitle: `Generated: ${pdfStamp(o.now.toISOString())}   ·   ${plural(o.rows.length, 'vendor')}${o.filterText ? `   ·   Filter: ${o.filterText}` : ''}`,
    letterhead: o.letterhead,
    landscape: true,
    sections: [
      {
        table: {
          dense: true,
          head: ['Vendor ID', 'Vendor', 'Trade name', 'Contact person', 'Contact number', 'Email', 'Tamada POC', 'PAN', 'Aadhaar PAN', 'GST', 'GSTIN', 'MSME', 'Approved on'],
          rows: o.rows.map((v) => [
            v.vendorCode,
            v.legalEntityName,
            v.tradeName && v.tradeName !== v.legalEntityName ? v.tradeName : '',
            v.contactPerson,
            v.contactNumber,
            v.email,
            v.pocEmail,
            v.pan,
            PAN_AADHAAR_LABEL[s(v.panAadhaar)] || '',
            gstLabel(v.gstStatus),
            v.gstStatus === 'registered' ? v.gstin : '',
            v.msmeRegistered ? 'Yes' : 'No',
            pdfDate(v.approvedAt),
          ]),
          empty: 'No vendors match.',
        },
      },
    ],
    footer: `Confidential — vendor register. ${printedLine(o.by)}`,
  };
}

// ── One vendor's summary ─────────────────────────────────────────────────────
const maskAcct = (n: string) => (n ? `${'•'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : '');

export function vendorSummaryDoc(v: AccountsVendor, o: { letterhead: PdfLetterhead; showAccount: boolean; by?: string; checkLabel: (k: string) => string }): PdfDoc {
  const b = v.business;
  const yes = (x: boolean | null | undefined) => (x === null || x === undefined ? '—' : x ? 'Yes' : 'No');
  const live = (v.documents ?? []).filter((d) => !d.superseded);
  const checks = (v.applicableChecks ?? []).map((k) => [o.checkLabel(k), v.verification?.[k]?.verified ? 'Done' : 'Not done', v.verification?.[k]?.by || '', pdfStamp(v.verification?.[k]?.at)]);
  return {
    fileName: `Vendor_${(b.legalEntityName || v.vendorCode || v.id).replace(/\s+/g, '_')}`,
    title: b.legalEntityName || 'Vendor',
    subtitle: [v.vendorCode ? `Vendor ID ${v.vendorCode}` : '', `Status: ${v.status.replace(/_/g, ' ')}`].filter(Boolean).join('   ·   '),
    letterhead: o.letterhead,
    sections: [
      {
        heading: 'Business',
        meta: [
          ['Legal name', b.legalEntityName],
          ['Trade name', b.tradeName],
          ['Business type', b.businessType],
          ['Brand', b.brandName],
          ['Contact person', b.contactPerson],
          ['Designation', b.designation],
          ['Phone', v.contactNumber],
          ['Email', v.email],
          ['Tamada POC', b.pocEmail],
          ['Registered address', b.registeredAddress],
        ],
      },
      {
        heading: 'Tax and GST',
        meta: [
          ['PAN', v.tax.pan],
          ['PAN holder', v.tax.panHolderType],
          ['PAN linked to Aadhaar', yes(v.tax.panLinkedToAadhaar)],
          ['GST', gstLabel(v.gst.status)],
          ['GSTIN', v.gst.gstin],
          ['GSTIN matches PAN', v.gst.gstin ? yes(v.gst.gstinMatchesPan) : '—'],
          ['MSME', v.msme.registered ? `Yes${v.msme.number ? ` · ${v.msme.number}` : ''}` : 'No'],
        ],
      },
      {
        heading: 'Bank',
        meta: [
          ['Account name', v.bank.accountName],
          ['Bank', v.bank.bankName],
          ['Account number', o.showAccount ? v.bank.accountNumber : maskAcct(v.bank.accountNumber)],
          ['IFSC', v.bank.ifsc],
          ['Branch', v.bank.branchName],
          ['Verified', v.bank.verified ? `Yes${v.bank.verifiedAt ? ` · ${pdfDate(v.bank.verifiedAt)}` : ''}` : 'No'],
        ],
      },
      { heading: 'Checks', table: { head: ['Check', 'Result', 'By', 'When'], rows: checks, empty: 'No checks for this vendor.' } },
      {
        heading: 'Documents',
        table: {
          head: ['Document', 'File', 'Version', 'Uploaded', 'Status'],
          rows: live.map((d) => [d.label || d.doc_type, d.file_name, `v${d.version}`, pdfDate(d.uploaded_at), d.signature ? 'E-signed' : d.status]),
          empty: 'No documents.',
        },
        text: ['Each document is opened on its own from the vendor’s screen.'],
      },
      ...(v.approval?.at ? [{ meta: [['Approved by', v.approval.by], ['Approved on', pdfStamp(v.approval.at)]] as [string, string][] }] : []),
    ],
    footer: `${printedLine(o.by)} · Confidential — contains vendor tax and banking details.`,
  };
}

// ── Signed agreement copy ────────────────────────────────────────────────────
export type StampedPage = { data: string; w: number; h: number };

/** The stamped pages (JPEG data URLs from the PDF viewer) + the signature certificate, as one printable page. */
export function signedAgreementHtml(a: AccountsAgreement, pages: StampedPage[], vendorName: string) {
  const img = pages
    .map((p) => {
      const landscape = p.w > p.h;
      // Only the JPEG data URLs the viewer frame made; anything else is dropped.
      if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.data)) return '';
      return `<div class="pg${landscape ? ' ls' : ''}"><img src="${p.data}" alt=""></div>`;
    })
    .join('');
  const cert = [
    ['Agreement', a.project_name],
    ['Vendor', vendorName],
    // No Keka Code: the copy is often passed on to the vendor, who must never see it (vendor_agreements.js:250).
    ['Vendor signed', pdfStamp(a.signed_at)],
    ['Vendor certificate no', a.signature_reference || ''],
    ...(a.internal_signed_at
      ? [
          ['Countersigned by', a.signer_name || ''],
          ['Countersigned', pdfStamp(a.internal_signed_at)],
          ['Countersign certificate no', a.internal_signature_reference || ''],
        ]
      : []),
  ]
    .filter(([, v]) => !!v)
    .map(([l, v]) => `<tr><td class="l">${esc(l)}</td><td>${esc(v)}</td></tr>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(a.project_name)}</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
.pg{width:210mm;height:296mm;display:flex;align-items:center;justify-content:center;page-break-after:always;overflow:hidden}
.pg img{max-width:100%;max-height:100%;display:block}
.cert{padding:22mm 18mm}.cert h1{font-size:20px;margin:0 0 18px}.cert table{border-collapse:collapse;width:100%;font-size:12px}
.cert td{padding:7px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.cert td.l{color:#64748b;width:38%}
.cert p{color:#64748b;font-size:10.5px;margin-top:18px}
</style></head><body>${img}<div class="cert"><h1>Signature certificate</h1><table>${cert}</table><p>Signatures were captured in DASH and placed on the spots marked by the person who drafted this agreement. All times are India time.</p></div></body></html>`;
}
