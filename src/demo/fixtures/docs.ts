// Demo routes for the docs domain (features/docs): drafting a vendor agreement.
//
//   POST /vendor-agreements   vendor_agreements.js:192 — same checks and messages: any staff role, an approved
//                             vendor of the company, a known Keka Code, a PDF of at most 8 MB, a deadline in
//                             the future, at least one sign spot (page ≥ 1, x / y in 0..1), an optional
//                             countersigner from the company; with no countersigner every spot is the vendor's.
//
// The new agreement is added to the approved vendor persona's record (demo/vendor/data `vendorRecord`), so
// Accounts' lists (features/accounts) and the Afzal Vendor portal both see it, waiting for the vendor's
// signature. Agreements for the made-up vendors of the Vendor master are accepted and kept here only.
// Every PDF screen reads routes other domains already answer (statements, ledger, audit export, assets,
// bookings, tasks, vendors), so nothing else is needed.

import { registerAgreementExtra } from '@/demo/fixtures/accounts';
import { DEMO_USER } from '@/demo/config';
import { personById, projectById } from '@/demo/fixtures/org';
import { currentPersona } from '@/demo/personas';
import { fail, newId, nowIso, type Route } from '@/demo/state';
import { vendorRecord } from '@/demo/vendor/data';

// vendor_agreements.js:56 EMPLOYEE_ROLES.
const STAFF = ['master_admin', 'super_admin', 'ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'employee', 'professional', 'accounts'];
const MAX_DRAFT = 8 * 1024 * 1024;
const bytesOf = (b64: string) => Math.floor((b64.replace(/=+$/, '').length * 3) / 4);

type Spot = { page: number; x: number; y: number; signer: 'vendor' | 'internal' };

function validSpots(v: unknown): Spot[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const out: Spot[] = [];
  for (const p of v as Record<string, unknown>[]) {
    const page = Number(p?.page);
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (!Number.isInteger(page) || page < 1 || !(x >= 0 && x <= 1) || !(y >= 0 && y <= 1)) return null;
    out.push({ page, x, y, signer: p?.signer === 'internal' ? 'internal' : 'vendor' });
  }
  return out;
}

/** Agreements for vendors other than the persona vendor (accepted, not listed anywhere). */
const OTHER_VENDOR_AGREEMENTS: { id: string; vendorId: string; projectName: string }[] = [];

function draftAgreement(body: Record<string, unknown>) {
  if (!STAFF.includes(currentPersona().role)) return fail('You do not have permission to draft a vendor agreement.', 403);
  const vendorId = String(body.vendorId || '');
  const projectName = String(body.projectName || '').trim().slice(0, 200);
  const deadline = Date.parse(String(body.deadlineAt || ''));
  // validateAgreementInput (vendor_agreements.js:131): same order and words.
  if (!vendorId) return fail('Vendor is required.');
  if (!body.projectId) return fail('Keka Code is required.');
  if (!projectName) return fail('Project name is required.');
  if (!Number.isFinite(deadline)) return fail('A valid deadline is required.');
  if (deadline <= Date.now()) return fail('The deadline must be in the future.');
  if (!body.fileData) return fail('The draft document is required.');
  let spots = validSpots(body.signPositions);
  if (!spots) return fail('Click on the document to mark at least one spot where the vendor should sign.');
  const project = projectById(String(body.projectId));
  if (!project) return fail('Keka Code could not be found.');
  const mime = String(body.mimeType || '').toLowerCase();
  if (mime !== 'application/pdf') return fail('The draft document must be a PDF.');
  const b64 = String(body.fileData || '').replace(/^data:[^;]+;base64,/, '');
  if (bytesOf(b64) > MAX_DRAFT) return fail('That file is larger than 8 MB. Please upload a smaller file.', 413);

  let signerName: string | null = null;
  if (body.signerId) {
    const p = personById(String(body.signerId));
    const isMe = String(body.signerId) === DEMO_USER.id;
    if (!p && !isMe) return fail('The selected employee could not be found.');
    signerName = p?.name ?? String(DEMO_USER.name);
  } else {
    spots = spots.map((s) => ({ ...s, signer: 'vendor' }));
  }

  const id = newId('vag');
  const at = nowIso();
  const v = vendorRecord('approved');
  if (vendorId !== v.id) {
    OTHER_VENDOR_AGREEMENTS.push({ id, vendorId, projectName });
    return { ok: true, id };
  }
  const fileName = String(body.fileName || '').slice(0, 180) || 'agreement.pdf';
  v.agreements.push({
    id,
    vendor_id: v.id,
    project_name: projectName,
    deadline_at: new Date(deadline).toISOString(),
    status: 'pending_signature',
    created_by_name: String(DEMO_USER.name),
    created_at: at,
    sign_positions: spots,
    draft_file_name: fileName,
    draft_mime_type: 'application/pdf',
    signature_type: null,
    signature_reference: null,
    signed_at: null,
    signer_name: signerName,
    internal_signature_reference: null,
    internal_signed_at: null,
    draft_file_data: b64,
    signature_file_data: null,
    signature_mime_type: null,
  } as (typeof v.agreements)[number]);
  registerAgreementExtra(id, { project_id: project.id, keka_code: project.kekaCode, created_by: DEMO_USER.id, signer_id: body.signerId ? String(body.signerId) : null });
  return { ok: true, id };
}

export const docsRoutes: Route[] = [['POST', /^\/vendor-agreements$/, (_p, body) => draftAgreement((body ?? {}) as Record<string, unknown>)]];
