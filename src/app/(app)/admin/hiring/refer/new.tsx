// Refer someone for an open position (OpenPositionsBoard's "Refer a Candidate" modal, dash.html:15763).
// `?job=<posting id>`; the posting must still be open. Who: the Refer & earn audience; anyone else is
// sent home.
//   Who they are   name (required), email, phone, profile link
//   Experience     qualification, years, current and expected salary, notice period — optional on a
//                  referral (a colleague often doesn't know them, :15781)
//   Résumé         PDF, DOC or DOCX, required (the server checks the extension, server.js:7920),
//                  under 8 MB (features/hiring/pick-resume)
// Sending is swiped: a referral can't be taken back. HR looks at it first; no one is emailed. Then a
// SuccessSheet says what happens next (the website's alert, :15796) and offers My referrals.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, Link2, Mail, Phone, Send, UserRound } from 'lucide-react-native';
import { useState } from 'react';

import { type ReferralForm, submitReferral, useInvalidateHiring } from '@/api/hiring';
import { bonusOf, coins, isOpen, RESUME_RE } from '@/features/hiring/model';
import { pickResume } from '@/features/hiring/pick-resume';
import { useHiring } from '@/features/hiring/use-hiring';
import { FileError } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmSheet,
  FieldPair,
  NavHeader,
  Screen,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  TextField,
} from '@/ui';

type Fields = Omit<ReferralForm, 'jobOpeningId' | 'resumeFileData' | 'resumeFileName'>;

const EMPTY: Fields = {
  candidateName: '',
  candidateEmail: '',
  candidatePhone: '',
  profileLink: '',
  qualification: '',
  yearsExperience: '',
  currentSalary: '',
  expectedSalary: '',
  noticePeriod: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ReferNewScreen() {
  const params = useLocalSearchParams<{ job?: string }>();
  const jobId = String(Array.isArray(params.job) ? params.job[0] : params.job || '');
  const router = useRouter();
  const h = useHiring();
  const invalidate = useInvalidateHiring();
  const [f, setF] = useState<Fields>(EMPTY);
  const [file, setFile] = useState<{ name: string; dataUrl: string; size: number } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!h.ready) {
    return (
      <Screen header={<NavHeader title="Refer someone" />}>
        <SkeletonList key="s" rows={6} tone="surface" />
      </Screen>
    );
  }
  if (!h.canRefer) return <Redirect href="/" />;
  const job = (h.jobs.data ?? []).find((j) => j.id === jobId) ?? null;
  if (!job || (!isOpen(job) && !done)) return <Redirect href="/admin/hiring/refer" />;

  const set = (k: keyof Fields, v: string) => setF({ ...f, [k]: v });
  const bonus = bonusOf(job);
  const yrs = f.yearsExperience.trim();
  const errors = {
    name: f.candidateName.trim() ? null : 'Their name is needed.',
    email: !f.candidateEmail.trim() || EMAIL_RE.test(f.candidateEmail.trim()) ? null : 'That doesn’t look like an email address.',
    years: !yrs || (Number.isFinite(Number(yrs)) && Number(yrs) >= 0 && Number(yrs) <= 70) ? null : 'A number of years, 0 to 70.',
    resume: file ? null : 'Add their résumé.',
  };
  const invalid = Object.values(errors).some(Boolean);

  const chooseFile = async () => {
    setFileErr(null);
    try {
      const picked = await pickResume();
      if (!picked) return;
      if (!RESUME_RE.test(picked.name)) {
        setFileErr('The résumé must be a PDF, DOC or DOCX file.');
        return;
      }
      setFile({ name: picked.name, dataUrl: picked.dataUrl, size: picked.size });
    } catch (e) {
      setFileErr(e instanceof FileError ? e.message : 'That file could not be read.');
    }
  };

  const submit = () => {
    setTried(true);
    if (invalid) return;
    setError(null);
    setConfirm(true);
  };

  const send = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await submitReferral({
        jobOpeningId: job.id,
        candidateName: f.candidateName.trim(),
        candidateEmail: f.candidateEmail.trim(),
        candidatePhone: f.candidatePhone.trim(),
        profileLink: f.profileLink.trim(),
        qualification: f.qualification.trim(),
        yearsExperience: yrs,
        currentSalary: f.currentSalary.trim(),
        expectedSalary: f.expectedSalary.trim(),
        noticePeriod: f.noticePeriod.trim(),
        resumeFileData: file.dataUrl,
        resumeFileName: file.name,
      });
      setConfirm(false);
      setTimeout(() => setDone(true), 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
      void invalidate();
    }
  };

  const kb = Math.max(1, Math.round((file?.size ?? 0) / 1024));

  return (
    <>
      <Screen
        header={<NavHeader title="Refer someone" />}
        footer={
          <ActionBar note={tried && invalid ? 'Fix the fields marked in red.' : bonus ? `For ${job.position}. Earn ${coins(bonus)} if they join and stay 3 months.` : `For ${job.position}.`}>
            <Button title="Send referral" icon={<Send />} onPress={submit} />
          </ActionBar>
        }>
        <Card key="who" tone="surface" style={styles.card}>
          <CardHeader title="Who are you referring?" />
          <TextField label="Full name" value={f.candidateName} onChangeText={(v) => set('candidateName', v)} autoCapitalize="words" left={<UserRound size={18} color={palette.textMuted} />} error={tried ? errors.name : null} />
          <TextField
            label="Email (optional)"
            value={f.candidateEmail}
            onChangeText={(v) => set('candidateEmail', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            left={<Mail size={18} color={palette.textMuted} />}
            error={tried ? errors.email : null}
          />
          <TextField label="Phone (optional)" value={f.candidatePhone} onChangeText={(v) => set('candidatePhone', v)} keyboardType="phone-pad" placeholder="+91 …" left={<Phone size={18} color={palette.textMuted} />} />
          <TextField
            label="Profile link (optional)"
            value={f.profileLink}
            onChangeText={(v) => set('profileLink', v)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="LinkedIn or portfolio"
            left={<Link2 size={18} color={palette.textMuted} />}
          />
        </Card>

        <Card key="exp" tone="surface" style={styles.card}>
          <CardHeader title="Experience (optional)" />
          <FieldPair>
            <TextField label="Qualification" value={f.qualification} onChangeText={(v) => set('qualification', v)} placeholder="B.Tech, MBA…" />
            <TextField label="Years" value={f.yearsExperience} onChangeText={(v) => set('yearsExperience', v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" error={tried ? errors.years : null} />
          </FieldPair>
          <FieldPair>
            <TextField label="Current salary" value={f.currentSalary} onChangeText={(v) => set('currentSalary', v)} placeholder="e.g. 5.5 LPA" />
            <TextField label="Expected salary" value={f.expectedSalary} onChangeText={(v) => set('expectedSalary', v)} placeholder="e.g. 7 LPA" />
          </FieldPair>
          <TextField label="Notice period" value={f.noticePeriod} onChangeText={(v) => set('noticePeriod', v)} placeholder="Immediate, 30 days, 2 months…" />
        </Card>

        <AccountRow
          key="resume"
          icon={FileText}
          module="people"
          title={file ? file.name : 'Résumé'}
          sub={file ? `${kb.toLocaleString('en-IN')} KB` : 'PDF, DOC or DOCX, under 8 MB'}
          actionLabel={file ? 'Change' : 'Add'}
          onPress={() => void chooseFile()}
          accessibilityLabel={file ? `Résumé ${file.name}. Change it` : 'Add their résumé'}
        />
        {fileErr || (tried && errors.resume) ? <Banner key="fileErr" tone="danger" message={fileErr || errors.resume} /> : null}
        {error && !confirm ? <Banner key="err" tone="danger" title="Couldn’t send it" message={error} /> : null}
      </Screen>

      <ConfirmSheet
        visible={confirm}
        onClose={() => !busy && setConfirm(false)}
        title="Send this referral"
        from={{ title: f.candidateName.trim() || 'Candidate', subtitle: file?.name || 'Résumé attached', avatar: { name: f.candidateName.trim() || '?' } }}
        to={{ title: job.position, subtitle: bonus ? `${coins(bonus)} bonus` : 'No bonus', icon: Send, module: 'people' }}
        confirmLabel="Swipe to send"
        loading={busy}
        onConfirm={() => void send()}
        note="HR looks at it first. No one is emailed now. You can’t take a referral back.">
        <SummaryCard
          rows={[
            { key: 'name', label: 'Candidate', value: f.candidateName.trim() },
            ...(f.candidateEmail.trim() ? [{ key: 'email', label: 'Email', value: f.candidateEmail.trim() }] : []),
            ...(f.candidatePhone.trim() ? [{ key: 'phone', label: 'Phone', value: f.candidatePhone.trim() }] : []),
            { key: 'bonus', label: 'Your bonus', value: bonus ? coins(bonus) : 'None', hint: bonus ? 'After they join, complete 3 months and HR approves it.' : null },
          ]}
        />
        {error ? <Banner tone="danger" title="Couldn’t send it" message={error} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={done}
        onClose={() => {
          setDone(false);
          router.back();
        }}
        title="Referral sent"
        subtitle={
          bonus
            ? `If ${f.candidateName.trim() || 'they'} is hired, you earn ${coins(bonus)} once they complete 3 months and HR approves it.`
            : 'HR will look at it. Track it in My referrals.'
        }
        secondaryLabel="My referrals"
        onSecondary={() => {
          setDone(false);
          router.replace('/admin/hiring/refer/mine');
        }}
        onPrimary={() => {
          setDone(false);
          router.back();
        }}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.md },
}));
