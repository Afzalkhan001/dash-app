// One Public Careers application (PublicApplicationsDetail, dash.html:15406-15565). Who: job-opening
// creators (HR, Super Admin, CEO, COO) and the person HR forwarded it to (server.js:8633); anyone else
// is sent home.
//   CandidateHeader   name, "Applied for … · application ID", the status pill
//   Banner            who it was sent to, by whom and when
//   Candidate         contact and profile (only the answers they gave, :15496), profile link, résumé
//                     (a file from the server, opened in the share sheet)
//   Status            a status picker + an optional note THE CANDIDATE SEES on their status page →
//                     swipe (PUT …/status)
//   Send to a reviewer  HR only (canForward): person picker (defaults to the hiring manager) → swipe;
//                     the reviewer is emailed (POST …/forward)
//   What happened     the timeline, newest last, "Now" on the current one
//   Internal notes    never shown to the candidate; HR adds them (the server refuses anyone else,
//                     server.js:8781, so the box is HR-only here)

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, Forward, Inbox, Link2, NotebookPen, RefreshCcw } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import {
  addPublicAppNote,
  forwardPublicApp,
  PUBLIC_APP_STATUSES,
  publicAppResumePath,
  setPublicAppStatus,
  useInvalidateHiring,
  usePublicApplication,
} from '@/api/hiring';
import { useQueryClient } from '@tanstack/react-query';
import { useTodayIst } from '@/features/attendance/use-now';
import { canForwardApplication } from '@/features/hiring/access';
import { openableUrl, publicAppLabel, publicAppTone } from '@/features/hiring/model';
import { CandidateHeader } from '@/features/hiring/ui';
import { useHiring } from '@/features/hiring/use-hiring';
import { type PickPerson, PersonPicker, usePickablePeople } from '@/features/shared/person-picker';
import { dateLabel, stampLabel } from '@/lib/dates';
import { downloadAuthed, FileError, shareFile } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  Avatar,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  EventTimeline,
  NavHeader,
  Screen,
  SelectField,
  SkeletonList,
  SummaryCard,
  type SummaryItem,
  Text,
  TextField,
  type TimelineEvent,
  toast,
} from '@/ui';

const TITLE = 'Application';
const filled = (rows: SummaryItem[]) => rows.filter((r) => r.value != null && r.value !== '');

export default function ApplicationScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const router = useRouter();
  const today = useTodayIst();
  const h = useHiring();
  const allowed = h.canApplications;
  const q = usePublicApplication(id, allowed);
  const people = usePickablePeople({ enabled: allowed && h.creator });
  const invalidate = useInvalidateHiring();
  const qc = useQueryClient();

  const [statusPick, setStatusPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [newNote, setNewNote] = useState('');
  const [sheet, setSheet] = useState<'status' | 'forward' | null>(null);
  const [picker, setPicker] = useState(false);
  const [target, setTarget] = useState<PickPerson | null>(null);
  const [busy, setBusy] = useState<'status' | 'forward' | 'note' | 'resume' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!h.ready) {
    return (
      <Screen header={<NavHeader title={TITLE} />}>
        <SkeletonList key="s" rows={5} tone="surface" />
      </Screen>
    );
  }
  if (!allowed) return <Redirect href="/" />;

  const a = q.data;
  if (!a) {
    return (
      <Screen header={<NavHeader title={TITLE} />} onRefresh={() => q.refetch()}>
        {q.isPending ? (
          <SkeletonList key="s" rows={5} tone="surface" />
        ) : q.isError && q.error && !/not found|not authorized/i.test(q.error.message) ? (
          <ErrorState key="err" message={q.error.message} onRetry={() => void q.refetch()} />
        ) : (
          <EmptyState
            key="none"
            icon={<Inbox color={palette.textMuted} strokeWidth={1.8} />}
            title="Application not found"
            message="It may no longer be shared with you."
            action={<Button title="Back" variant="accent" size="md" onPress={() => router.back()} />}
          />
        )}
      </Screen>
    );
  }

  const pick = statusPick ?? a.status;
  const job = (h.jobs.data ?? []).find((j) => j.id === a.jobId) ?? null;
  const hm = job?.hiringManagerId ? (people.data ?? []).find((p) => p.id === job.hiringManagerId) ?? null : null;
  const canForward = canForwardApplication(a);

  const refreshAll = () => Promise.all([q.refetch(), qc.invalidateQueries({ queryKey: ['hiring', 'apps'] })]);

  const changeStatus = async () => {
    setBusy('status');
    setError(null);
    try {
      await setPublicAppStatus(a.id, pick, note.trim());
      setSheet(null);
      setNote('');
      setStatusPick(null);
      toast.show(`Status changed to ${publicAppLabel(pick)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
      void refreshAll();
    }
  };
  const forward = async () => {
    if (!target) return;
    setBusy('forward');
    setError(null);
    try {
      await forwardPublicApp(a.id, target.id);
      setSheet(null);
      toast.show(`Sent to ${target.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
      void refreshAll();
      void invalidate();
    }
  };
  const addNote = async () => {
    if (!newNote.trim()) return;
    setBusy('note');
    try {
      await addPublicAppNote(a.id, newNote.trim());
      setNewNote('');
      toast.show('Note added');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not add the note.', 'danger');
    } finally {
      setBusy(null);
      void q.refetch();
    }
  };
  const openResume = () => {
    if (busy) return;
    setBusy('resume');
    downloadAuthed(publicAppResumePath(a.id), a.resumeFileName || `${a.candidateName}-resume.pdf`)
      .then((uri) => shareFile(uri, undefined, 'Résumé'))
      .catch((e: unknown) => toast.show(e instanceof FileError || e instanceof Error ? e.message : 'Could not open the résumé.', 'danger'))
      .finally(() => setBusy(null));
  };
  const startForward = () => {
    setError(null);
    setTarget(hm);
    if (hm) setSheet('forward');
    else setPicker(true);
  };

  const yrs = a.yearsExperience;
  const rows = filled([
    { key: 'ref', label: 'Application ID', value: a.applicationRef },
    { key: 'email', label: 'Email', value: a.candidateEmail },
    { key: 'phone', label: 'Mobile', value: a.candidatePhone ? `+${String(a.candidatePhone).replace(/^\+/, '')}` : null },
    { key: 'on', label: 'Applied', value: a.appliedAt ? stampLabel(a.appliedAt, today) : null },
    { key: 'qual', label: 'Qualification', value: a.qualification },
    { key: 'yrs', label: 'Experience', value: yrs !== null && yrs !== undefined && yrs !== '' ? `${yrs} year${Number(yrs) === 1 ? '' : 's'}` : null },
    { key: 'cur', label: 'Current salary', value: a.currentSalary },
    { key: 'exp', label: 'Expected salary', value: a.expectedSalary },
    { key: 'notice', label: 'Notice period', value: a.noticePeriod },
  ]);

  const last = a.timeline.length - 1;
  const events: TimelineEvent[] = a.timeline.map((t, i) => ({
    key: `${i}`,
    label: `${publicAppLabel(t.status)}${i === last ? ' · now' : ''}`,
    at: t.at ? stampLabel(t.at, today) : null,
    by: t.changedBy || null,
    note: t.note || null,
    tone: i === last ? 'info' : 'neutral',
  }));

  return (
    <>
      <Screen header={<NavHeader title={TITLE} />} onRefresh={refreshAll}>
        <CandidateHeader
          key="head"
          name={a.candidateName}
          sub={[`Applied for ${a.jobTitle || 'a position'}`, a.applicationRef].filter(Boolean).join(' · ')}
          status={{ label: publicAppLabel(a.status), tone: publicAppTone(a.status) }}
        />
        {a.forwardedToName ? (
          <Banner
            key="fwd"
            tone="info"
            title={`Sent to ${a.forwardedToName}`}
            message={[a.forwardedBy ? `by ${a.forwardedBy}` : '', a.forwardedAt ? `on ${dateLabel(a.forwardedAt, today)}` : ''].filter(Boolean).join(' ') || null}
          />
        ) : null}

        <SummaryCard key="cand" title="Candidate" rows={rows} />
        {a.profileLink ? (
          <AccountRow
            key="link"
            icon={Link2}
            module="people"
            title="Portfolio or profile"
            sub={a.profileLink}
            actionLabel="Open"
            onPress={() => void Linking.openURL(openableUrl(a.profileLink))}
            accessibilityLabel={`Open portfolio, ${a.profileLink}`}
          />
        ) : null}
        {a.hasResume ? (
          <AccountRow
            key="resume"
            icon={FileText}
            module="people"
            title="Résumé"
            sub={busy === 'resume' ? 'Opening…' : a.resumeFileName || 'Résumé'}
            actionLabel="Open"
            onPress={openResume}
            accessibilityLabel={`Open résumé${a.resumeFileName ? `, ${a.resumeFileName}` : ''}`}
            hint="Opens the share sheet to save or view it"
          />
        ) : null}

        <Card key="status" tone="frostStrong" style={styles.card}>
          <CardHeader title="Status" />
          <SelectField label="Move to" value={pick} options={PUBLIC_APP_STATUSES.map((s) => ({ value: s, label: publicAppLabel(s) }))} onChange={(v) => setStatusPick(v)} />
          <TextField
            label="Note for the candidate (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            placeholder="e.g. Interview on Monday at 11 AM"
            hint="Sent with a new status. The candidate sees it on their application status page."
          />
          <Button
            title="Update status"
            icon={<RefreshCcw />}
            disabled={pick === a.status}
            onPress={() => {
              setError(null);
              setSheet('status');
            }}
          />
        </Card>

        {canForward ? (
          <AccountRow
            key="forward"
            icon={Forward}
            module="people"
            title={a.forwardedToName ? 'Send to someone else' : 'Send to a reviewer'}
            sub={a.forwardedToName ? `Now with ${a.forwardedToName}` : job?.hiringManagerName ? `The hiring manager is ${job.hiringManagerName}` : 'Anyone in the company'}
            actionLabel="Choose"
            onPress={startForward}
            accessibilityLabel={a.forwardedToName ? 'Send this application to someone else' : 'Send this application to a reviewer'}
          />
        ) : null}

        <Card key="timeline" tone="frostStrong" style={styles.card}>
          <CardHeader title="What happened" />
          <EventTimeline events={events} />
        </Card>

        <Card key="notes" tone="frostStrong" style={styles.card}>
          <CardHeader title="Internal notes" />
          <Text variant="caption" muted>
            Never shown to the candidate.
          </Text>
          {canForward ? (
            <View style={styles.inline}>
              <View style={styles.fill}>
                <TextField value={newNote} onChangeText={setNewNote} placeholder="Add a note for the team" accessibilityLabel="New internal note" multiline maxLength={1000} />
              </View>
              <Button title="Add" variant="ghost" size="sm" icon={<NotebookPen />} loading={busy === 'note'} disabled={!newNote.trim()} onPress={() => void addNote()} />
            </View>
          ) : null}
          {a.internalNotes.length ? (
            a.internalNotes.map((n) => (
              <View key={n.id} style={styles.note}>
                <Avatar name={n.authorName || '?'} size={32} ring={false} />
                <View style={styles.fill}>
                  <Text variant="body">{n.note}</Text>
                  <Text variant="caption" muted>
                    {[n.authorName, n.at ? stampLabel(n.at, today) : ''].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text variant="label" muted>
              No notes yet.
            </Text>
          )}
        </Card>
      </Screen>

      <PersonPicker
        visible={picker}
        onClose={() => setPicker(false)}
        title="Send to"
        subtitle={job?.hiringManagerName ? `The hiring manager is ${job.hiringManagerName}. You can pick anyone.` : 'Anyone in the company'}
        people={people.data}
        loading={people.isPending}
        allowOnLeave
        recentKey="hiring.forward"
        selectedId={target?.id}
        onPick={(p) => {
          setTarget(p);
          setPicker(false);
          setTimeout(() => setSheet('forward'), 400);
        }}
      />

      <ConfirmSheet
        visible={sheet === 'status'}
        onClose={() => busy !== 'status' && setSheet(null)}
        title="Update status"
        subtitle={a.candidateName}
        from={{ title: publicAppLabel(a.status), subtitle: 'Now' }}
        to={{ title: publicAppLabel(pick), subtitle: 'New status' }}
        confirmLabel="Swipe to update"
        loading={busy === 'status'}
        onConfirm={() => void changeStatus()}
        note={`${a.candidateName} sees the new status${note.trim() ? ' and your note' : ''} on their status page. No one is emailed.`}>
        {note.trim() ? <SummaryCard rows={[{ key: 'note', label: 'Note they see', value: note.trim() }]} /> : null}
        {error ? <Banner tone="danger" title="Couldn’t update" message={error} /> : null}
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'forward'}
        onClose={() => busy !== 'forward' && setSheet(null)}
        title="Send to a reviewer"
        from={{ title: a.candidateName, subtitle: a.jobTitle || 'Application', avatar: { name: a.candidateName } }}
        to={{ title: target?.name || 'Choose someone', subtitle: target?.jobTitle || 'Reviewer', avatar: { name: target?.name || '?' } }}
        confirmLabel="Swipe to send"
        disabled={!target}
        loading={busy === 'forward'}
        onConfirm={() => void forward()}
        note={target ? `${target.name} gets an email and can see this application.` : undefined}>
        <AccountRow
          left={<Avatar name={target?.name || '?'} size={36} ring={false} />}
          title={target?.name || 'No one chosen'}
          sub={target && hm && target.id === hm.id ? 'The hiring manager' : 'Reviewer'}
          actionLabel="Change"
          onChange={() => {
            setSheet(null);
            setTimeout(() => setPicker(true), 400);
          }}
          actionAccessibilityLabel="Change who reviews this application"
        />
        {error ? <Banner tone="danger" title="Couldn’t send it" message={error} /> : null}
      </ConfirmSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.sm },
  inline: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  fill: { flex: 1, minWidth: 0, gap: 2 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.xxs },
}));
