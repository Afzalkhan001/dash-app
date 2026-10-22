// Post a job opening, or edit one (ManagePositionsBoard's Post / Edit modal, dash.html:15905-15990) — a
// pushed form: The role · Where and who · Description · Careers page and picture · Referral bonus, and
// one sticky button. `?id=<posting id>` edits; without it the form posts. Creators only (HR, Super
// Admin, CEO, COO); anyone else is sent home.
//
// Rules copied from the website and the server:
//   - position, description and a whole number of positions (> 0) are required (:15851, server.js:7697);
//   - cities are separate chips, saved as one comma-joined string (CityTagInput :15379);
//   - the hiring manager can be any active employee (:15898);
//   - the referral bonus is set only when posting (a positive whole number of coins) and is fixed after
//     (PUT drops it, server.js:7753) — the edit form says so;
//   - editing never re-sends the picture unless a new one was picked or it was removed (:15838).
// Posting is swiped (everyone in the company can then refer for it; a public one also goes on the
// careers page). An edit that makes a posting public is swiped too; any other edit saves directly.

import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ImagePlus, MapPin, Plus, Save, Send, Trash2, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useBountyWallet } from '@/api/bounty';
import { createJobOpening, type JobForm, type JobOpening, updateJobOpening, useInvalidateHiring } from '@/api/hiring';
import { useDepartments } from '@/api/people';
import { useTodayIst } from '@/features/attendance/use-now';
import { citiesOf, coins, DESCRIPTION_MAX, EMPLOYMENT_TYPES, employmentTypeLabel } from '@/features/hiring/model';
import { SwitchRow } from '@/features/hiring/ui';
import { useHiring } from '@/features/hiring/use-hiring';
import { PersonPicker, usePickablePeople } from '@/features/shared/person-picker';
import { dateLabel } from '@/lib/dates';
import { FileError, pickImage } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  Avatar,
  Banner,
  Button,
  Card,
  CardHeader,
  Chip,
  ChipRow,
  ConfirmSheet,
  DateField,
  FieldPair,
  NavHeader,
  Screen,
  SelectField,
  SkeletonList,
  SummaryCard,
  Text,
  TextField,
  toast,
} from '@/ui';

type Form = {
  position: string;
  experienceRequired: string;
  package: string;
  description: string;
  positions: string;
  cities: string[];
  department: string;
  hiringManagerName: string;
  hiringManagerId: string;
  employmentType: string;
  applicationDeadline: string;
  isPublic: boolean;
  referralBonus: string;
};

const EMPTY: Form = {
  position: '',
  experienceRequired: '',
  package: '',
  description: '',
  positions: '1',
  cities: [],
  department: '',
  hiringManagerName: '',
  hiringManagerId: '',
  employmentType: 'Full Time',
  applicationDeadline: '',
  isPublic: false,
  referralBonus: '',
};

const fromJob = (j: JobOpening): Form => ({
  position: j.position || '',
  experienceRequired: j.experienceRequired || '',
  package: j.package || '',
  description: j.description || '',
  positions: String(j.positions || 1),
  cities: citiesOf(j.location),
  department: j.department || '',
  hiringManagerName: j.hiringManagerName || '',
  hiringManagerId: j.hiringManagerId || '',
  employmentType: j.employmentType || 'Full Time',
  applicationDeadline: j.applicationDeadline || '',
  isPublic: !!j.isPublic,
  referralBonus: j.referralBonus != null ? String(j.referralBonus) : '',
});

export default function JobEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const editing = !!id;
  const router = useRouter();
  const today = useTodayIst();
  const h = useHiring();
  const job = editing ? (h.jobs.data ?? []).find((j) => j.id === id) ?? null : null;
  const people = usePickablePeople({ enabled: h.creator, keep: ['location'] });
  const depts = useDepartments(h.creator);
  const wallet = useBountyWallet(h.creator && !editing);
  const invalidate = useInvalidateHiring();

  const [draft, setDraft] = useState<Form | null>(null);
  const [cityText, setCityText] = useState('');
  const [image, setImage] = useState<string | null>(null); // a newly picked picture (data URL)
  const [removeImage, setRemoveImage] = useState(false);
  const [picker, setPicker] = useState(false);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!h.ready || (editing && h.jobs.isPending)) {
    return (
      <Screen header={<NavHeader title={editing ? 'Edit position' : 'Post a job'} />}>
        <SkeletonList key="s" rows={6} tone="surface" />
      </Screen>
    );
  }
  if (!h.canManage) return <Redirect href="/" />;
  if (editing && !job) return <Redirect href="/admin/hiring" />;

  const form = draft ?? (job ? fromJob(job) : EMPTY);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setDraft({ ...form, [k]: v });

  const w = wallet.data;
  const available = Math.max(0, Number(w?.referralAllocated || 0) - Number(w?.referralReserved || 0) - Number(w?.referralSpent || 0));

  // Validation (:15851) — shown after the first try.
  const numPositions = Math.round(Number(form.positions));
  const bonusNum = form.referralBonus.trim() === '' ? null : Math.round(Number(form.referralBonus));
  const errors = {
    position: form.position.trim() ? null : 'Add the job title.',
    description: form.description.trim() ? null : 'Describe the role.',
    positions: numPositions > 0 && Number.isFinite(numPositions) ? null : 'A whole number, 1 or more.',
    bonus: editing || bonusNum === null || (Number.isFinite(bonusNum) && bonusNum > 0) ? null : 'A whole number of coins, more than 0 — or leave it empty.',
  };
  const invalid = Object.values(errors).some(Boolean);

  const addCity = (raw: string) => {
    const c = raw.trim().replace(/,+$/, '').trim();
    if (!c || form.cities.some((x) => x.toLowerCase() === c.toLowerCase())) {
      setCityText('');
      return;
    }
    setDraft({ ...form, cities: [...form.cities, c] });
    setCityText('');
  };
  const knownCities = [...new Set((people.data ?? []).map((p) => String(p.extra?.location || '').trim()).filter(Boolean))]
    .sort()
    .filter((c) => !form.cities.some((x) => x.toLowerCase() === c.toLowerCase()));
  const deptNames = (depts.data ?? []).map((d) => d.name).filter((n) => !!n && n !== form.department);

  const choosePicture = async () => {
    try {
      const f = await pickImage('library');
      if (f) {
        setImage(f.dataUrl);
        setRemoveImage(false);
      }
    } catch (e) {
      toast.show(e instanceof FileError ? e.message : 'Could not use that picture.', 'danger');
    }
  };

  const body = (): JobForm => ({
    position: form.position.trim(),
    experienceRequired: form.experienceRequired.trim(),
    package: form.package.trim(),
    description: form.description.trim(),
    positions: numPositions,
    location: form.cities.join(', '),
    department: form.department.trim(),
    hiringManagerName: form.hiringManagerName,
    hiringManagerId: form.hiringManagerId,
    employmentType: form.employmentType,
    applicationDeadline: form.applicationDeadline,
    isPublic: form.isPublic,
  });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (job) {
        await updateJobOpening(job.id, { ...body(), ...(image ? { image } : removeImage ? { image: '' } : null) });
        await invalidate();
        toast.show('Position saved');
        setConfirm(false);
        router.back();
      } else {
        const r = await createJobOpening({ ...body(), referralBonus: bonusNum, image: image ?? '' });
        await invalidate();
        toast.show('Job posted');
        setConfirm(false);
        const newId = r?.jobOpening?.id;
        if (newId) router.replace(`/admin/hiring/position/${encodeURIComponent(String(newId))}`);
        else router.back();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
      void invalidate();
    }
  };

  const goingPublic = form.isPublic && !job?.isPublic;
  const submit = () => {
    setTried(true);
    if (invalid) return;
    setError(null);
    if (!editing || goingPublic) setConfirm(true);
    else void save();
  };

  const shownImage = image;
  const keepsOld = editing && !!job?.hasImage && !image && !removeImage;

  const summary = [
    { key: 'pos', label: 'Position', value: form.position.trim() },
    { key: 'n', label: 'Openings', value: String(numPositions || 1) },
    { key: 'where', label: 'Where', value: form.cities.join(', ') || '—' },
    ...(editing ? [] : [{ key: 'bonus', label: 'Referral bonus', value: bonusNum ? coins(bonusNum) : 'None', hint: bonusNum ? 'Fixed once posted.' : null }]),
    { key: 'public', label: 'Careers page', value: form.isPublic ? 'Anyone can apply' : 'Referrals only' },
  ];

  return (
    <>
      <Screen
        header={<NavHeader title={editing ? 'Edit position' : 'Post a job'} />}
        footer={
          <ActionBar note={tried && invalid ? 'Fix the fields marked in red.' : null}>
            <Button title={editing ? 'Save changes' : 'Post job'} icon={editing ? <Save /> : <Send />} loading={busy && !confirm} onPress={submit} />
          </ActionBar>
        }>
        <Card key="role" tone="surface" style={styles.card}>
          <CardHeader title="The role" />
          <TextField label="Job title" value={form.position} onChangeText={(v) => set('position', v)} autoCapitalize="words" placeholder="e.g. Motion Designer" error={tried ? errors.position : null} />
          <FieldPair>
            <TextField label="Experience" value={form.experienceRequired} onChangeText={(v) => set('experienceRequired', v)} placeholder="e.g. 2-4 years" />
            <TextField label="Package" value={form.package} onChangeText={(v) => set('package', v)} placeholder="e.g. 6-9 LPA" />
          </FieldPair>
          <FieldPair>
            <TextField
              label="Openings"
              value={form.positions}
              onChangeText={(v) => set('positions', v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              error={tried ? errors.positions : null}
            />
            <SelectField label="Type" value={form.employmentType} options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: employmentTypeLabel(t) }))} onChange={(v) => set('employmentType', v)} />
          </FieldPair>
          <Text variant="caption" muted>
            When this many people are selected, the position closes by itself.
          </Text>
          <DateField
            label="Apply by (optional)"
            value={form.applicationDeadline || null}
            onChange={(v) => set('applicationDeadline', v)}
            minimumDate={today}
            hint={form.applicationDeadline ? `Shown on the careers page as ${dateLabel(form.applicationDeadline, today)}` : null}
          />
          {form.applicationDeadline ? <Button title="No deadline" variant="text" size="sm" icon={<X />} onPress={() => set('applicationDeadline', '')} style={styles.left} /> : null}
        </Card>

        <Card key="where" tone="surface" style={styles.card}>
          <CardHeader title="Where and who" />
          <Text variant="label" muted>
            Cities
          </Text>
          {form.cities.length ? (
            <ChipRow wrap>
              {form.cities.map((c) => (
                <Chip key={c} label={c} selected icon={<X />} onPress={() => setDraft({ ...form, cities: form.cities.filter((x) => x !== c) })} />
              ))}
            </ChipRow>
          ) : null}
          {/* The field takes the full width; "Add" shows inside it once something is typed. */}
          <TextField
            value={cityText}
            onChangeText={(v) => (v.endsWith(',') ? addCity(v) : setCityText(v))}
            onSubmitEditing={() => addCity(cityText)}
            placeholder={form.cities.length ? 'Add another city' : 'e.g. Hyderabad'}
            accessibilityLabel="Add a city"
            autoCapitalize="words"
            returnKeyType="done"
            left={<MapPin size={18} color={palette.textMuted} />}
            right={cityText.trim() ? <Button title="Add" variant="text" size="sm" icon={<Plus />} onPress={() => addCity(cityText)} /> : undefined}
          />
          {knownCities.length ? (
            <ChipRow wrap>
              {knownCities.slice(0, 6).map((c) => (
                <Chip key={c} label={c} icon={<Plus />} onPress={() => addCity(c)} />
              ))}
            </ChipRow>
          ) : null}
          <TextField label="Department (optional)" value={form.department} onChangeText={(v) => set('department', v)} autoCapitalize="words" placeholder="Pick one below or type a new one" />
          {deptNames.length ? (
            <ChipRow wrap>
              {deptNames.slice(0, 8).map((d) => (
                <Chip key={d} label={d} onPress={() => set('department', d)} />
              ))}
            </ChipRow>
          ) : null}
          <Text variant="label" muted>
            Hiring manager (optional)
          </Text>
          <AccountRow
            left={form.hiringManagerName ? <Avatar name={form.hiringManagerName} size={44} ring={false} /> : undefined}
            icon={form.hiringManagerName ? undefined : UserRound}
            module="people"
            title={form.hiringManagerName || 'No one'}
            sub={form.hiringManagerName ? 'HR sends candidates to them first' : 'Anyone in the company'}
            actionLabel={form.hiringManagerName ? 'Change' : 'Choose'}
            onChange={() => setPicker(true)}
            actionAccessibilityLabel={`${form.hiringManagerName ? 'Change' : 'Choose'} the hiring manager`}
          />
          {form.hiringManagerName ? (
            <Button title="Clear" variant="text" size="sm" icon={<X />} onPress={() => setDraft({ ...form, hiringManagerName: '', hiringManagerId: '' })} style={styles.left} />
          ) : null}
        </Card>

        <Card key="desc" tone="surface" style={styles.card}>
          <CardHeader title="Description" />
          <TextField
            value={form.description}
            onChangeText={(v) => set('description', v.slice(0, DESCRIPTION_MAX))}
            accessibilityLabel="Job description"
            placeholder="The role, what they’ll do, the skills you need…"
            multiline
            maxLength={DESCRIPTION_MAX}
            counter
            error={tried ? errors.description : null}
          />
        </Card>

        <Card key="public" tone="surface" style={styles.card}>
          <CardHeader title="Careers page and picture" />
          <SwitchRow
            title="Public application"
            subtitle="Shows this posting on the Tamada careers page, where anyone can apply. Separate from referrals."
            flush
            value={form.isPublic}
            onChange={(v) => set('isPublic', v)}
          />
          {shownImage ? <Image source={{ uri: shownImage }} style={styles.preview} contentFit="cover" accessibilityLabel="New picture" /> : null}
          <Text variant="caption" muted>
            {image ? 'New picture, saved with the rest.' : keepsOld ? 'Keeping the current picture.' : removeImage ? 'The picture will be removed when you save.' : 'A picture is optional.'}
          </Text>
          <View style={styles.inline}>
            <Button title={image || keepsOld ? 'Change picture' : 'Add picture'} variant="ghost" size="sm" icon={<ImagePlus />} onPress={() => void choosePicture()} />
            {image || keepsOld ? (
              <Button
                title="Remove"
                variant="text"
                size="sm"
                icon={<Trash2 />}
                onPress={() => {
                  setImage(null);
                  setRemoveImage(!!job?.hasImage);
                }}
              />
            ) : null}
          </View>
        </Card>

        {editing ? (
          <SummaryCard
            key="bonus"
            title="Referral bonus"
            rows={[
              {
                key: 'b',
                label: 'Per hire',
                value: job?.referralBonus ? coins(Number(job.referralBonus)) : 'None',
                hint: 'Fixed once posted. To change it, close this position and post a new one.',
              },
            ]}
          />
        ) : (
          <Card key="bonus" tone="surface" style={styles.card}>
            <CardHeader title="Referral bonus (optional)" />
            <TextField
              label="Coins per hire"
              value={form.referralBonus}
              onChangeText={(v) => set('referralBonus', v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="e.g. 500"
              error={tried ? errors.bonus : null}
              hint={
                bonusNum && bonusNum > available
                  ? `More than the ${coins(available)} you have now. Approving it will fail unless Super Admin gives you more referral coins first.`
                  : `Paid from your referral coins when you approve it, after the hire completes 3 months. You have ${coins(available)} now.`
              }
            />
          </Card>
        )}

        {error && !confirm ? <Banner key="err" tone="danger" title="Couldn’t save" message={error} /> : null}
      </Screen>

      <PersonPicker
        visible={picker}
        onClose={() => setPicker(false)}
        title="Hiring manager"
        subtitle="Anyone in the company"
        people={people.data}
        loading={people.isPending}
        allowOnLeave
        recentKey="hiring.manager"
        selectedId={form.hiringManagerId || undefined}
        onPick={(p) => setDraft({ ...form, hiringManagerName: p.name, hiringManagerId: p.id })}
      />

      <ConfirmSheet
        visible={confirm}
        onClose={() => !busy && setConfirm(false)}
        title={editing ? 'Make it public' : 'Post this job'}
        subtitle={form.position.trim()}
        detailsTitle="The posting"
        confirmLabel={editing ? 'Swipe to save' : 'Swipe to post'}
        loading={busy}
        onConfirm={() => void save()}
        note={
          form.isPublic
            ? 'Everyone in the company can refer for it, and anyone can apply on tamadamedia.com/careers. No one is emailed.'
            : 'Everyone in the company can refer people for it. No one is emailed.'
        }>
        <SummaryCard rows={summary} />
        {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
      </ConfirmSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  fill: { flex: 1, minWidth: 160 },
  left: { alignSelf: 'flex-start' },
  preview: { width: 96, height: 96, borderRadius: radius.md },
}));
