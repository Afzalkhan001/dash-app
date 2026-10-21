// Hiring — the website's Referral Program for the people who run it (ReferralHub, dash.html:15263): one
// screen, segments by who you are (features/hiring/access):
//   Jobs           job-opening creators (HR, Super Admin, CEO, COO): a light SummaryHero (open
//                  positions, the Referral Coins you can still give, "Post a job"), then every posting
//                  with its filled count (Manage Positions :15813).
//   Candidates     creators, the Application Manager (read only) and anyone HR forwarded a referral to:
//                  status chips (HR starts on "Waiting for HR", :16017) and a position picker, then the
//                  referrals (Referred Candidates :16009).
//   Applicants     creators, or anyone forwarded a public application: search (name, email, phone,
//                  application ID), job and status pickers (PublicApplicationsBoard :15569).
// Anyone else is sent home. Refer & earn (open positions, my referrals) is its own screen.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { BriefcaseBusiness, Check, CircleDot, Gift, Inbox, Plus, Search, SearchX, UserSearch, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useBountyWallet } from '@/api/bounty';
import { type JobOpening, PUBLIC_APP_STATUSES, usePublicApplications } from '@/api/hiring';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { isFilledFor } from '@/features/hiring/access';
import {
  coins,
  filledCount,
  isOpen,
  positionsOf,
  publicAppLabel,
  publicAppTone,
  REFERRAL_FILTERS,
  referralStatusLabel,
  referralStatusTone,
  whereLine,
} from '@/features/hiring/model';
import { JobRow } from '@/features/hiring/ui';
import { useHiring } from '@/features/hiring/use-hiring';
import { ago } from '@/features/inbox/format';
import { dateLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  Avatar,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  hitSlopFor,
  ListCard,
  ListRow,
  NavHeader,
  PillField,
  PillSelector,
  Screen,
  Segmented,
  Sheet,
  Skeleton,
  SkeletonList,
  StatusPill,
  SummaryHero,
  Text,
} from '@/ui';

type Tab = 'positions' | 'candidates' | 'applications';

type Option = { value: string; label: string };

function PickSheet({ visible, onClose, title, options, value, onChange }: { visible: boolean; onClose: () => void; title: string; options: Option[]; value: string; onChange: (v: string) => void }) {
  const tick = <Check size={20} color={palette.primaryText} strokeWidth={2} />;
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ListCard>
        {options.map((o) => (
          <ListRow
            key={o.value || 'all'}
            title={o.label}
            numberOfLines={2}
            right={value === o.value ? tick : undefined}
            accessibilityHint={value === o.value ? 'Selected' : undefined}
            onPress={() => {
              onChange(o.value);
              onClose();
            }}
          />
        ))}
      </ListCard>
    </Sheet>
  );
}

export default function HiringScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const today = useTodayIst();
  const now = useNow();
  const h = useHiring();
  const wallet = useBountyWallet(h.creator);

  const tabs: { key: Tab; label: string }[] = [
    ...(h.canManage ? [{ key: 'positions' as const, label: 'Jobs' }] : []),
    ...(h.canCandidates ? [{ key: 'candidates' as const, label: 'Candidates' }] : []),
    ...(h.canApplications ? [{ key: 'applications' as const, label: 'Applicants' }] : []),
  ];
  const asked = tabs.find((t) => t.key === params.tab)?.key;
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab: Tab | undefined = (picked && tabs.some((t) => t.key === picked) ? picked : null) ?? asked ?? tabs[0]?.key;

  // Candidates
  const [status, setStatus] = useState<string | null>(null);
  const refStatus = status ?? (h.creator ? 'submitted' : '');
  const [jobFilter, setJobFilter] = useState('');
  const [jobSheet, setJobSheet] = useState(false);
  // Applications
  const [appJob, setAppJob] = useState('');
  const [appStatus, setAppStatus] = useState('');
  const [q, setQ] = useState('');
  const [appJobSheet, setAppJobSheet] = useState(false);
  const [appStatusSheet, setAppStatusSheet] = useState(false);
  const apps = usePublicApplications({ jobId: appJob, status: appStatus }, tab === 'applications' && h.canApplications);

  if (!h.ready) {
    return (
      <Screen header={<NavHeader title="Hiring" />}>
        <SkeletonList key="s" rows={6} tone="surface" />
      </Screen>
    );
  }
  if (!tab) return <Redirect href="/" />;

  const jobs = h.jobs.data ?? [];
  const refs = h.refs.data ?? [];
  const jobById = (id: string) => jobs.find((j) => j.id === id) ?? null;

  const refresh = () => Promise.all([h.jobs.refetch(), h.refs.refetch(), ...(tab === 'applications' ? [apps.refetch()] : []), ...(h.creator ? [wallet.refetch()] : [])]);

  // ── Positions ──
  const openCount = jobs.filter(isOpen).length;
  const w = wallet.data;
  const available = Math.max(0, Number(w?.referralAllocated || 0) - Number(w?.referralReserved || 0) - Number(w?.referralSpent || 0));

  // ── Candidates ──
  const refJobIds = new Set(refs.map((r) => r.jobOpeningId));
  // :16039 — HR and the overseer pick any position; a reviewer only the ones they were sent.
  const scopedJobs = h.creator || h.overseer ? jobs : jobs.filter((j) => refJobIds.has(j.id));
  const shownRefs = refs.filter((r) => (!jobFilter || r.jobOpeningId === jobFilter) && (!refStatus || r.status === refStatus));
  const countBy = (s: string) => refs.filter((r) => (!jobFilter || r.jobOpeningId === jobFilter) && r.status === s).length;

  // ── Applications ──
  const needle = q.trim().toLowerCase();
  const appRows = (apps.data ?? []).filter(
    (a) => !needle || [a.candidateName, a.candidateEmail, a.candidatePhone, a.applicationRef].some((v) => String(v || '').toLowerCase().includes(needle)),
  );
  const publicJobs = jobs.filter((j) => j.isPublic || (apps.data ?? []).some((a) => a.jobId === j.id));

  const jobName = (id: string, all: string) => (id ? jobById(id)?.position || 'Position' : all);

  const positions = (
    <View key="positions" style={styles.section}>
      {h.jobs.isPending ? (
        <Skeleton height={228} radius={radius.xxl} />
      ) : (
        <SummaryHero
          icon={BriefcaseBusiness}
          module="people"
          label="Open positions"
          value={openCount}
          sub={wallet.isPending ? undefined : `You can give ${coins(available)} as referral bonuses`}
          action={{ title: 'Post a job', icon: <Plus />, onPress: () => router.push('/admin/hiring/edit') }}
        />
      )}
      {h.jobs.isPending ? (
        <SkeletonList rows={4} avatar tone="surface" />
      ) : h.jobs.isError && !h.jobs.data ? (
        <ErrorState message={h.jobs.error?.message ?? 'The job openings could not be loaded.'} onRetry={() => void h.jobs.refetch()} />
      ) : jobs.length ? (
        <ListCard tone="surface">
          {jobs.map((j: JobOpening) => {
            const f = filledCount(j.id, refs);
            return (
              <JobRow
                key={j.id}
                job={j}
                sub={[whereLine(j), `${f} of ${positionsOf(j)} filled`].filter(Boolean).join(' · ')}
                onPress={() => router.push(`/admin/hiring/position/${encodeURIComponent(j.id)}`)}
              />
            );
          })}
        </ListCard>
      ) : (
        <EmptyState
          icon={<BriefcaseBusiness color={palette.textMuted} strokeWidth={1.8} />}
          title="No job openings yet"
          message="Post the first one with Post a job above. Everyone in the company can then refer people for it."
        />
      )}
    </View>
  );

  const candidates = (
    <View key="candidates" style={styles.section}>
      <ChipRow>
        <Chip label="All" selected={!refStatus} onPress={() => setStatus('')} />
        {REFERRAL_FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} count={countBy(f.key) || undefined} selected={refStatus === f.key} onPress={() => setStatus(f.key)} />
        ))}
      </ChipRow>
      {scopedJobs.length > 1 ? (
        <View style={styles.filters}>
          <PillSelector icon={BriefcaseBusiness} label={jobName(jobFilter, 'All positions')} onPress={() => setJobSheet(true)} accessibilityHint="Choose a position" />
          {jobFilter ? <Button title="All positions" variant="text" size="sm" onPress={() => setJobFilter('')} /> : null}
        </View>
      ) : null}
      {h.overseer ? (
        <Text variant="caption" muted>
          You can see every referral and whether its résumé was opened. HR and the reviewers make the decisions.
        </Text>
      ) : null}
      {h.refs.isPending ? (
        <SkeletonList rows={4} avatar tone="surface" />
      ) : h.refs.isError && !h.refs.data ? (
        <ErrorState message={h.refs.error?.message ?? 'The candidates could not be loaded.'} onRetry={() => void h.refs.refetch()} />
      ) : shownRefs.length ? (
        <ListCard tone="surface">
          {shownRefs.map((r) => {
            const job = jobById(r.jobOpeningId);
            const filledUp = ['submitted', 'hr_accepted', 'shortlisted'].includes(r.status) && isFilledFor(job);
            return (
              <ListRow
                key={r.id}
                size="lg"
                titleWeight="medium"
                left={<Avatar name={r.candidateName} size={40} ring={false} />}
                title={r.candidateName}
                subtitle={[r.jobOpeningTitle || job?.position, r.referredBy ? `by ${r.referredBy}` : ''].filter(Boolean).join(' · ')}
                meta={
                  h.overseer || h.creator
                    ? r.resumeViewedAt
                      ? `Résumé opened${r.resumeViewedByName ? ` by ${r.resumeViewedByName}` : ''}`
                      : 'Résumé not opened yet'
                    : r.status === 'hr_accepted' && r.forwardedToId === h.user?.id
                      ? 'Sent to you to review'
                      : null
                }
                numberOfLines={2}
                subtitleLines={2}
                below={<StatusPill label={filledUp ? 'Position filled' : referralStatusLabel(r)} tone={filledUp ? 'neutral' : referralStatusTone(r.status)} />}
                valueMeta={ago(r.createdAt, now)}
                onPress={() => router.push(`/admin/hiring/candidate/${encodeURIComponent(r.id)}`)}
                chevron
              />
            );
          })}
        </ListCard>
      ) : (
        <EmptyState
          icon={<UserSearch color={palette.textMuted} strokeWidth={1.8} />}
          title={refs.length ? 'No one here' : 'No referred candidates yet'}
          message={refs.length ? 'Try another status or position.' : 'Referrals people send appear here.'}
          action={refs.length && (refStatus || jobFilter) ? <Button title="Show everyone" variant="accent" size="md" onPress={() => { setStatus(''); setJobFilter(''); }} /> : undefined}
        />
      )}
    </View>
  );

  const applications = (
    <View key="applications" style={styles.section}>
      <PillField
        icon={Search}
        value={q}
        onChangeText={setQ}
        placeholder="Name, email, phone or ID"
        accessibilityLabel="Search applications"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        trailing={
          q ? (
            <Pressable onPress={() => setQ('')} hitSlop={hitSlopFor(32)} style={styles.clear} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={18} color={palette.textMuted} />
            </Pressable>
          ) : null
        }
      />
      <View style={styles.filters}>
        {publicJobs.length > 1 ? <PillSelector icon={BriefcaseBusiness} label={jobName(appJob, 'All jobs')} onPress={() => setAppJobSheet(true)} accessibilityHint="Choose a job" /> : null}
        <PillSelector icon={CircleDot} label={appStatus ? publicAppLabel(appStatus) : 'Any status'} onPress={() => setAppStatusSheet(true)} accessibilityHint="Choose a status" />
      </View>
      <Text variant="caption" muted>
        People who applied on tamadamedia.com/careers.
      </Text>
      {apps.isPending ? (
        <SkeletonList rows={4} tone="surface" />
      ) : apps.isError && !apps.data ? (
        <ErrorState message={apps.error?.message ?? 'The applications could not be loaded.'} onRetry={() => void apps.refetch()} />
      ) : appRows.length ? (
        <ListCard tone="surface">
          {appRows.map((a) => (
            <ListRow
              key={a.id}
              size="lg"
              titleWeight="medium"
              left={<Avatar name={a.candidateName} size={40} ring={false} />}
              title={a.candidateName}
              subtitle={[a.jobTitle, a.appliedAt ? `Applied ${dateLabel(a.appliedAt, today)}` : ''].filter(Boolean).join(' · ')}
              meta={a.forwardedToName ? `Sent to ${a.forwardedToName}` : null}
              numberOfLines={2}
              subtitleLines={2}
              below={<StatusPill label={publicAppLabel(a.status)} tone={publicAppTone(a.status)} />}
              onPress={() => router.push(`/admin/hiring/application/${encodeURIComponent(a.id)}`)}
              chevron
            />
          ))}
        </ListCard>
      ) : (
        <EmptyState
          icon={needle ? <SearchX color={palette.textMuted} strokeWidth={1.8} /> : <Inbox color={palette.textMuted} strokeWidth={1.8} />}
          title={needle || appJob || appStatus ? 'Nothing matches' : 'No applications yet'}
          message={needle || appJob || appStatus ? 'Try another search or filter.' : 'Turn on “Public application” on a posting to take applications from the careers page.'}
        />
      )}
    </View>
  );

  return (
    <>
      <Screen
        header={
          <NavHeader
            title="Hiring"
            actions={h.canRefer ? [{ key: 'refer', icon: Gift, label: 'Refer and earn', onPress: () => router.push('/admin/hiring/refer') }] : []}
          />
        }
        onRefresh={refresh}>
        {tabs.length > 1 ? <Segmented key="seg" options={tabs} value={tab} onChange={setPicked} /> : null}
        {tab === 'positions' ? positions : tab === 'candidates' ? candidates : applications}
      </Screen>

      <PickSheet
        visible={jobSheet}
        onClose={() => setJobSheet(false)}
        title="Show a position"
        options={[{ value: '', label: 'All positions' }, ...scopedJobs.map((j) => ({ value: j.id, label: j.position }))]}
        value={jobFilter}
        onChange={setJobFilter}
      />
      <PickSheet
        visible={appJobSheet}
        onClose={() => setAppJobSheet(false)}
        title="Show a job"
        options={[{ value: '', label: 'All jobs' }, ...publicJobs.map((j) => ({ value: j.id, label: j.position }))]}
        value={appJob}
        onChange={setAppJob}
      />
      <PickSheet
        visible={appStatusSheet}
        onClose={() => setAppStatusSheet(false)}
        title="Show a status"
        options={[{ value: '', label: 'Any status' }, ...PUBLIC_APP_STATUSES.map((s) => ({ value: s, label: publicAppLabel(s) }))]}
        value={appStatus}
        onChange={setAppStatus}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
}));
