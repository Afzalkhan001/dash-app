// Hiring: job openings, the employee referral pipeline and Public Careers applications (the website's
// Referral Program, ReferralHub dash.html:15263-16280). Existing endpoints only (server.js:7595-8800):
//
//   GET    /job_openings                        every posting in my company (lite: no image). The server
//                                               may close a full posting on the fly (its own self-heal)
//   GET    /job_openings/:id/image              { image } data URL, lazy (never persisted)
//   POST   /job_openings                        creators only (hr, super_admin, ceo, coo); isPublic puts it
//                                               on tamadamedia.com/careers
//   PUT    /job_openings/:id                    plain fields; status, referralBonus and createdBy are dropped
//   POST   /job_openings/:id/close | /reopen    creators
//   DELETE /job_openings/:id                    creators; permanent (referral rows keep their title)
//   GET    /referrals[?referredById=]           HR-tier + app_manager: every referral; anyone else: the
//                                               ones they referred or that HR forwarded to them
//   GET    /referrals/:id/resume                { resumeFileData, resumeFileName }; the first open by
//                                               anyone but app_manager stamps resumeViewedAt
//   POST   /referrals                           anyone, open posting only (résumé PDF/DOC/DOCX required)
//   POST   /referrals/:id/hr-accept             HR-tier, { forwardToId } — emails the reviewer
//   POST   /referrals/:id/shortlist             HR-tier or the forwarded reviewer
//   POST   /referrals/:id/select                HR-tier; closes the posting once it is full
//   POST   /referrals/:id/reject                HR-tier or the forwarded reviewer, { reason }
//   POST   /referrals/:id/map-employee          HR-tier, { employeeId } (needs a joining date)
//   POST   /referrals/:id/approve-bonus         HR-tier; moves Referral Coins from the poster to the
//                                               referrer (402 when the poster is short)
//   GET    /admin/public-applications[?jobId&status&search]   HR-tier: all; anyone else: forwarded to them
//   GET    /admin/public-applications/:id       detail + timeline + internal notes + canForward
//   GET    /admin/public-applications/:id/resume   binary (downloadAuthed)
//   PUT    /admin/public-applications/:id/status   { status, note } — the note is shown to the candidate
//   POST   /admin/public-applications/:id/forward  { forwardToId } — emails the forwardee
//   POST   /admin/public-applications/:id/notes    { note } — internal only
//
// Candidate details (names, emails, phones, salaries) are other people's personal data: the referral and
// application lists stay in memory only (meta persist:false). The job list is safe to keep on disk.

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

// ── Types ────────────────────────────────────────────────────────────────────
export type JobStatus = 'open' | 'closed';

/** JOB_OPENING_LIST_FIELDS (server.js:7633). */
export type JobOpening = {
  id: string;
  position: string;
  experienceRequired?: string;
  package?: string;
  description?: string;
  referralBonus?: number | null;
  positions?: number;
  status: JobStatus | string;
  tenantId?: string | null;
  createdBy?: string;
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
  hasImage?: boolean;
  location?: string;
  department?: string;
  hiringManagerId?: string;
  hiringManagerName?: string;
  employmentType?: string;
  applicationDeadline?: string;
  isPublic?: boolean;
};

export type ReferralStatus =
  | 'submitted'
  | 'hr_accepted'
  | 'shortlisted'
  | 'selected'
  | 'mapped'
  | 'eligible'
  | 'approved'
  | 'not_eligible'
  | 'rejected';

/** REFERRAL_LIST_FIELDS (server.js:7845), plus the candidate profile the website reads when present. */
export type Referral = {
  id: string;
  jobOpeningId: string;
  jobOpeningTitle?: string;
  candidateName: string;
  candidateEmail?: string;
  candidatePhone?: string;
  profileLink?: string;
  qualification?: string;
  yearsExperience?: number | string | null;
  currentSalary?: string;
  expectedSalary?: string;
  noticePeriod?: string;
  resumeFileName?: string;
  hasResume?: boolean;
  referredBy?: string;
  referredById?: string;
  tenantId?: string | null;
  status: ReferralStatus | string;
  bonusPaid?: boolean;
  bonusAmount?: number | null;
  bonusTxnId?: string | null;
  createdAt?: string;
  forwardedToId?: string;
  forwardedToName?: string;
  forwardedBy?: string;
  forwardedById?: string;
  forwardedAt?: string;
  shortlistedBy?: string;
  shortlistedAt?: string;
  selectedBy?: string;
  selectedAt?: string;
  rejectReason?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  mappedEmployeeId?: string;
  mappedEmployeeName?: string;
  mappedEmployeeNumber?: string;
  joiningDate?: string;
  eligibilityDate?: string;
  mappedBy?: string;
  mappedById?: string;
  mappedAt?: string;
  eligibleAt?: string;
  notEligibleAt?: string;
  notEligibleReason?: string;
  approvedBy?: string;
  approvedById?: string;
  approvedAt?: string;
  resumeViewedAt?: string;
  resumeViewedBy?: string;
  resumeViewedByName?: string;
};

/** PUBLIC_APP_STATUSES (server.js:8630). */
export const PUBLIC_APP_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'SELECTED',
  'REJECTED',
  'ON_HOLD',
  'WITHDRAWN',
] as const;
export type PublicAppStatus = (typeof PUBLIC_APP_STATUSES)[number];

/** One row of GET /admin/public-applications (server.js:8669). */
export type PublicApplication = {
  id: string;
  applicationRef?: string;
  jobId?: string;
  jobTitle?: string;
  candidateName: string;
  candidateEmail?: string;
  candidatePhone?: string;
  status: PublicAppStatus | string;
  appliedAt?: string;
  forwardedToId?: string;
  forwardedToName?: string;
};

export type PublicAppEvent = { status: string; note?: string; changedBy?: string; at: string };
export type PublicAppNote = { id: string; note: string; authorName?: string; at: string };

/** GET /admin/public-applications/:id (server.js:8683). */
export type PublicApplicationDetail = PublicApplication & {
  profileLink?: string;
  hasResume?: boolean;
  resumeFileName?: string;
  qualification?: string;
  yearsExperience?: number | string | null;
  currentSalary?: string;
  expectedSalary?: string;
  noticePeriod?: string;
  forwardedBy?: string;
  forwardedAt?: string;
  canForward?: boolean;
  timeline: PublicAppEvent[];
  internalNotes: PublicAppNote[];
};

// ── Keys ─────────────────────────────────────────────────────────────────────
// The full referral list is the Inbox queue's own query (features/hiring/inbox), so it sits under
// ['inbox', 'referral', …] where the Inbox's focus refresh and pull to refresh reach it.
export const hiringKeys = {
  jobs: (userId: string) => ['hiring', 'jobs', userId] as const,
  image: (jobId: string) => ['hiring', 'image', jobId] as const,
  referrals: (userId: string) => ['inbox', 'referral', userId] as const,
  mine: (userId: string) => ['hiring', 'mine', userId] as const,
  apps: (userId: string, jobId = '', status = '', search = '') => ['hiring', 'apps', userId, jobId, status, search] as const,
  app: (id: string) => ['hiring', 'app', id] as const,
};

const arr = <T>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : []);
const str = (v: unknown) => (v == null ? '' : String(v));
const byNewest = <T extends { createdAt?: string; appliedAt?: string }>(a: T, b: T) =>
  str(b.createdAt ?? b.appliedAt).localeCompare(str(a.createdAt ?? a.appliedAt));

function useMe() {
  return useSession((s) => s.user?.id ?? '');
}

// ── Reads ────────────────────────────────────────────────────────────────────
/** Every posting in my company, newest first (the website loads the same list at boot: JOB_OPENINGS). */
export function useJobOpenings(enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: hiringKeys.jobs(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr<JobOpening>(await unwrap(api.get('/job_openings', signal)))
        .filter((j) => !!j && j.id != null)
        .map((j) => ({ ...j, id: str(j.id), position: str(j.position) || 'Untitled position', hasImage: !!j.hasImage }))
        .sort(byNewest),
    staleTime: 5 * 60_000,
  });
}

/** A posting's picture (data URL), only when it has one. Kept in memory only. */
export function useJobImage(job: Pick<JobOpening, 'id' | 'hasImage'> | null | undefined) {
  const userId = useMe();
  const id = job?.id ?? '';
  return useQuery({
    queryKey: hiringKeys.image(id),
    enabled: !!userId && !!id && !!job?.hasImage,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ image?: string }>(`/job_openings/${encodeURIComponent(id)}/image`, signal));
      const img = typeof r?.image === 'string' ? r.image : '';
      return img.startsWith('data:image/') ? img : '';
    },
    staleTime: 30 * 60_000,
  });
}

/**
 * GET /referrals: what the server lets me see (HR-tier and app_manager: all; anyone else: my own and the
 * ones forwarded to me), newest first. Also the Inbox queue.
 */
export function useReferrals(enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: hiringKeys.referrals(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => arr<Referral>(await unwrap(api.get('/referrals', signal))).filter((r) => !!r && r.id != null).sort(byNewest),
    staleTime: 60_000,
  });
}

/** My Referrals (MyReferralsBoard :16227): GET /referrals?referredById=<me>. */
export function useMyReferrals(enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: hiringKeys.mine(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) =>
      arr<Referral>(await unwrap(api.get(`/referrals?referredById=${encodeURIComponent(userId)}`, signal)))
        .filter((r) => !!r && r.id != null)
        .sort(byNewest),
    staleTime: 60_000,
  });
}

/** Public Careers applications I can see, with the website's three filters (server-side). */
export function usePublicApplications(filters: { jobId?: string; status?: string; search?: string } = {}, enabled = true) {
  const userId = useMe();
  const jobId = filters.jobId ?? '';
  const status = filters.status ?? '';
  const search = (filters.search ?? '').trim();
  return useQuery({
    queryKey: hiringKeys.apps(userId, jobId, status, search),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const p = new URLSearchParams();
      if (jobId) p.set('jobId', jobId);
      if (status) p.set('status', status);
      if (search) p.set('search', search);
      const qs = p.toString();
      return arr<PublicApplication>(await unwrap(api.get(`/admin/public-applications${qs ? `?${qs}` : ''}`, signal)))
        .filter((a) => !!a && a.id != null)
        .map((a) => ({ ...a, id: str(a.id) }));
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function usePublicApplication(id: string, enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: hiringKeys.app(id),
    enabled: enabled && !!userId && !!id,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<PublicApplicationDetail>(`/admin/public-applications/${encodeURIComponent(id)}`, signal));
      return { ...r, id: str(r.id || id), timeline: arr<PublicAppEvent>(r.timeline), internalNotes: arr<PublicAppNote>(r.internalNotes) };
    },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────
export type JobForm = {
  position: string;
  experienceRequired: string;
  package: string;
  description: string;
  positions: number;
  location: string;
  department: string;
  hiringManagerName: string;
  hiringManagerId: string;
  employmentType: string;
  applicationDeadline: string;
  isPublic: boolean;
};

/** POST /job_openings (save() :15851). The bonus is set only here; the image only when picked. */
export const createJobOpening = (form: JobForm & { referralBonus: number | null; image: string }) =>
  unwrap(api.post<{ ok: true; jobOpening: JobOpening }>('/job_openings', form));

/** PUT /job_openings/:id — `image` only when a new one was picked ('' removes it). */
export const updateJobOpening = (id: string, form: JobForm & { image?: string }) =>
  unwrap(api.put<{ ok: true }>(`/job_openings/${encodeURIComponent(id)}`, form));

export const closeJobOpening = (id: string) => unwrap(api.post<JobOpening>(`/job_openings/${encodeURIComponent(id)}/close`, {}));
export const reopenJobOpening = (id: string) => unwrap(api.post<JobOpening>(`/job_openings/${encodeURIComponent(id)}/reopen`, {}));
export const deleteJobOpening = (id: string) => unwrap(api.del<{ ok: true }>(`/job_openings/${encodeURIComponent(id)}`));

export type ReferralForm = {
  jobOpeningId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  profileLink: string;
  qualification: string;
  yearsExperience: string;
  currentSalary: string;
  expectedSalary: string;
  noticePeriod: string;
  resumeFileData: string;
  resumeFileName: string;
};

export const submitReferral = (form: ReferralForm) => unwrap(api.post<{ ok: true; referral: Referral }>('/referrals', form));

const refPost = <T = Referral>(id: string, action: string, body: Record<string, unknown> = {}) =>
  unwrap(api.post<T>(`/referrals/${encodeURIComponent(id)}/${action}`, body));

export const forwardReferral = (id: string, forwardToId: string) => refPost(id, 'hr-accept', { forwardToId });
export const shortlistReferral = (id: string) => refPost(id, 'shortlist');
export const selectReferral = (id: string) => refPost<{ ok: true; referral: Referral }>(id, 'select');
export const rejectReferral = (id: string, reason: string) => refPost(id, 'reject', { reason });
export const mapReferralEmployee = (id: string, employeeId: string) => refPost<{ ok: true; referral: Referral }>(id, 'map-employee', { employeeId });
export const approveReferralBonus = (id: string) => refPost<{ ok: true; referral: Referral }>(id, 'approve-bonus');

/** The résumé as a data URL (first open stamps "viewed" for anyone but app_manager). Never cached. */
export const fetchReferralResume = (id: string) =>
  unwrap(api.get<{ resumeFileData?: string; resumeFileName?: string }>(`/referrals/${encodeURIComponent(id)}/resume`));

const appPath = (id: string, tail = '') => `/admin/public-applications/${encodeURIComponent(id)}${tail}`;
export const setPublicAppStatus = (id: string, status: string, note: string) => unwrap(api.put<{ ok: true }>(appPath(id, '/status'), { status, note }));
export const forwardPublicApp = (id: string, forwardToId: string) => unwrap(api.post<{ ok: true }>(appPath(id, '/forward'), { forwardToId }));
export const addPublicAppNote = (id: string, note: string) => unwrap(api.post<{ ok: true }>(appPath(id, '/notes'), { note }));
export const publicAppResumePath = (id: string) => appPath(id, '/resume');

/** Refresh everything hiring shows (and the coins a bonus moved). */
export function useInvalidateHiring() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['hiring'] }),
      qc.invalidateQueries({ queryKey: ['inbox', 'referral'] }),
      qc.invalidateQueries({ queryKey: ['bounty'] }),
    ]);
}
