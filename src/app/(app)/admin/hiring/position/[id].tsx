// One job opening, for the people who post them (JobOpeningCard + ManagePositionsBoard, dash.html:15624
// and :15813). Who: job-opening creators (HR, Super Admin, CEO, COO); anyone else is sent home.
//   NavHeader "Position" with Edit and, for a public posting, Share (the careers page link, through the
//   phone's share sheet — :15636; there is no per-job page);
//   a light SummaryHero: hires so far against the number of positions, where and the facts line, the
//   bonus chip; the picture when it has one;
//   the description; Details (hiring manager, type, deadline, public, posted by and when);
//   its referred candidates (→ the candidate screen);
//   ActionBar: open → Close position (swipe: employees can't refer any more); closed → Reopen and
//   Delete for good (swipe: permanent; past referrals and applications keep the title, :15874).

import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { BriefcaseBusiness, Lock, LockOpen, Pencil, Share2, Trash2, UserSearch } from 'lucide-react-native';
import { useState } from 'react';
import { Share } from 'react-native';

import { closeJobOpening, deleteJobOpening, reopenJobOpening, useInvalidateHiring, useJobImage } from '@/api/hiring';
import { useTodayIst } from '@/features/attendance/use-now';
import {
  bonusOf,
  CAREERS_URL,
  citiesOf,
  coins,
  factsLine,
  filledCount,
  isOpen,
  jobRef,
  positionsOf,
  referralStatusLabel,
  referralStatusTone,
} from '@/features/hiring/model';
import { useHiring } from '@/features/hiring/use-hiring';
import { dateLabel, stampLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  ActionRow,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmSheet,
  EmptyState,
  NavHeader,
  Screen,
  SkeletonList,
  SummaryCard,
  SummaryHero,
  Text,
  toast,
} from '@/ui';

const filled = <T extends { value?: unknown }>(rows: T[]) => rows.filter((r) => r.value != null && r.value !== '');

export default function PositionScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const router = useRouter();
  const today = useTodayIst();
  const h = useHiring();
  const job = (h.jobs.data ?? []).find((j) => j.id === id) ?? null;
  const img = useJobImage(job);
  const invalidate = useInvalidateHiring();
  const [sheet, setSheet] = useState<'close' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!h.ready || (!job && h.jobs.isFetching)) {
    return (
      <Screen header={<NavHeader title="Position" />}>
        <SkeletonList key="s" rows={5} tone="surface" />
      </Screen>
    );
  }
  if (!h.canManage) return <Redirect href="/" />;
  if (!job) {
    return (
      <Screen header={<NavHeader title="Position" />} onRefresh={() => h.jobs.refetch()}>
        <EmptyState
          key="none"
          icon={<BriefcaseBusiness color={palette.textMuted} strokeWidth={1.8} />}
          title="Position not found"
          message="It may have been deleted."
          action={<Button title="Back to Hiring" variant="accent" size="md" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  const open = isOpen(job);
  const total = positionsOf(job);
  const refs = (h.refs.data ?? []).filter((r) => r.jobOpeningId === job.id);
  const f = filledCount(job.id, h.refs.data);
  const bonus = bonusOf(job);

  const run = async (what: 'close' | 'reopen' | 'delete') => {
    setBusy(true);
    setError(null);
    try {
      if (what === 'close') await closeJobOpening(job.id);
      else if (what === 'reopen') await reopenJobOpening(job.id);
      else await deleteJobOpening(job.id);
      setSheet(null);
      toast.show(what === 'close' ? 'Position closed' : what === 'reopen' ? 'Position reopened' : 'Position deleted');
      if (what === 'delete') router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Please try again.';
      if (what === 'reopen') toast.show(msg, 'danger');
      else setError(msg);
    } finally {
      setBusy(false);
      void invalidate();
    }
  };

  const share = () => {
    void Share.share({ title: `${job.position} — Tamada Media`, message: CAREERS_URL, url: CAREERS_URL }).catch(() => {});
  };

  const details = filled([
    { key: 'hm', label: 'Hiring manager', value: job.hiringManagerName },
    { key: 'type', label: 'Employment type', value: job.employmentType },
    { key: 'exp', label: 'Experience', value: job.experienceRequired },
    { key: 'pkg', label: 'Package', value: job.package },
    { key: 'where', label: 'Location', value: citiesOf(job.location).join(', ') },
    { key: 'dept', label: 'Department', value: job.department },
    { key: 'deadline', label: 'Apply by', value: job.applicationDeadline ? dateLabel(job.applicationDeadline, today) : null },
    { key: 'public', label: 'Careers page', value: job.isPublic ? 'Anyone can apply' : 'Referrals only', hint: job.isPublic ? 'tamadamedia.com/careers' : null },
    { key: 'bonus', label: 'Referral bonus', value: bonus ? `${coins(bonus)} per hire` : 'None', hint: bonus ? 'Fixed once posted. Paid from the poster’s referral coins.' : null },
    { key: 'by', label: 'Posted by', value: job.createdBy },
    { key: 'when', label: 'Posted', value: job.createdAt ? stampLabel(job.createdAt, today) : null },
    { key: 'ref', label: 'Job ID', value: jobRef(job.id) },
  ]);

  const footer = (
    <ActionBar note={open ? null : 'Closed. No one can refer for it.'}>
      {open ? (
        <Button title="Close position" variant="danger" icon={<Lock />} onPress={() => setSheet('close')} />
      ) : (
        <ActionRow context="bar">
          <Button title="Reopen" icon={<LockOpen />} loading={busy && !sheet} onPress={() => void run('reopen')} />
          <Button title="Delete" variant="danger" icon={<Trash2 />} onPress={() => setSheet('delete')} />
        </ActionRow>
      )}
    </ActionBar>
  );

  return (
    <>
      <Screen
        header={
          <NavHeader
            title="Position"
            actions={[
              { key: 'edit', icon: Pencil, label: 'Edit position', onPress: () => router.push(`/admin/hiring/edit?id=${encodeURIComponent(job.id)}`) },
              ...(job.isPublic ? [{ key: 'share', icon: Share2, label: 'Share the careers page link', onPress: share }] : []),
            ]}
          />
        }
        footer={footer}
        onRefresh={() => Promise.all([h.jobs.refetch(), h.refs.refetch()])}>
        <SummaryHero
          key="hero"
          icon={BriefcaseBusiness}
          module="people"
          label={job.position}
          value={f}
          unit={`of ${total} hired`}
          sub={[open ? 'Open' : 'Closed', factsLine(job)].filter(Boolean).join(' · ')}
          info={bonus ? { label: 'Referral bonus', value: coins(bonus) } : undefined}
        />
        {img.data ? <Image key="img" source={{ uri: img.data }} style={styles.image} contentFit="cover" cachePolicy="none" accessibilityLabel={`${job.position} picture`} /> : null}
        {job.description ? (
          <Card key="desc" tone="frostStrong" style={styles.card}>
            <CardHeader title="About the role" />
            <Text variant="body">{job.description}</Text>
          </Card>
        ) : null}
        <SummaryCard key="details" title="Details" rows={details} />
        {refs.length ? (
          <ActivityList key="refs" title={`Referred candidates (${refs.length})`}>
            {refs.map((r) => (
              <ActivityRow
                key={r.id}
                person={{ name: r.candidateName }}
                title={r.candidateName}
                subtitle={r.referredBy ? `Referred by ${r.referredBy}` : null}
                status={{ label: referralStatusLabel(r), tone: referralStatusTone(r.status) }}
                onPress={() => router.push(`/admin/hiring/candidate/${encodeURIComponent(r.id)}`)}
                chevron
              />
            ))}
          </ActivityList>
        ) : (
          <EmptyState key="refs" icon={<UserSearch color={palette.textMuted} strokeWidth={1.8} />} title="No referrals yet" message={open ? 'Referrals for this position appear here.' : undefined} />
        )}
      </Screen>

      <ConfirmSheet
        visible={sheet === 'close'}
        onClose={() => !busy && setSheet(null)}
        title="Close this position"
        subtitle={job.position}
        confirmLabel="Swipe to close"
        loading={busy}
        onConfirm={() => void run('close')}
        note="No one is emailed. You can reopen it later.">
        <SummaryCard
          rows={[
            { key: 'refer', label: 'Referrals', value: 'Stop', hint: 'Employees can no longer refer anyone for it.' },
            ...(job.isPublic ? [{ key: 'careers', label: 'Careers page', value: 'Hidden', hint: 'It stops taking applications.' }] : []),
          ]}
        />
        {error ? <Banner tone="danger" title="Couldn’t close it" message={error} /> : null}
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'delete'}
        onClose={() => !busy && setSheet(null)}
        title="Delete for good"
        subtitle={job.position}
        confirmLabel="Swipe to delete"
        loading={busy}
        onConfirm={() => void run('delete')}
        note="This can’t be undone. No one is emailed.">
        <Banner tone="warning" message="Past referrals and applications for it are kept, with its title. Only the posting goes." />
        {error ? <Banner tone="danger" title="Couldn’t delete it" message={error} /> : null}
      </ConfirmSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.sm },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.xl },
}));
