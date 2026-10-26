// New post / Edit post — the website's AnnouncementForm (dash.html:18901-19213) on a phone screen.
//   Kind        Announcement or Pop-up (locked once saved; the server refuses a switch too).
//   Pop-up      title, how often it comes back, its picture (required, fits 1200 × 1200), an optional
//               link and its button.
//   Announcement type (text / link / image / video / spreadsheet / slides), description (required for
//               text), URL (required for link) or an optional link + button, the file (required for
//               image, video, spreadsheet, slides; ≤ 8 MB, under the server's 12 MB body), "full
//               screen" for image / video, and an optional Home banner (fits 1600 × 400).
//   Both        publish now or at an India date and time, branches ("All branches" or some), "only
//               for today" or an expiry date, and — announcements only — the TV priority.
// Review opens a ConfirmSheet that says who sees it and when; the post is swiped to publish.
//
// Edit sends only what changed (PUT merges). The list never carries `priority`, so an edit starts at
// "Leave unchanged" and sends a priority only when one is picked — unlike the website, which resets a
// high or emergency post to normal on every edit (spec §1.G).

import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { BellRing, CalendarClock, FileUp, ImagePlus, Megaphone, Send, Trash2, Undo2, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Announcement, safeLink } from '@/api/announcements';
import { type NewsKind, type NewsPayload, type NewsPriority, type NewsType, type PopupFrequency, useBranches, useCreatePost, useUpdatePost } from '@/api/newsroom';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import {
  branchesLabel,
  CTA_PRESETS,
  FILE_TYPES,
  NEWS_TYPES,
  newsTypeLabel,
  POPUP_FREQ,
  popupFreqLabel,
  PRIORITIES,
  priorityLabel,
} from '@/features/newsroom/format';
import { pickBannerImage, pickPopupImage } from '@/features/newsroom/images';
import { ToggleRow } from '@/features/newsroom/toggle-row';
import { dateLabel, istDateOf, stampLabel } from '@/lib/dates';
import { FileError, type PickedFile, pickDocument, pickImage } from '@/lib/files';
import { istHmOf, istIsoAt } from '@/lib/ist';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  DateField,
  FieldMessage,
  FieldPair,
  LabelledSection,
  ListCard,
  NavHeader,
  Screen,
  Segmented,
  SelectField,
  SelectTiles,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  TimeField,
  toast,
} from '@/ui';

type Mode = 'now' | 'schedule';
type Priority = NewsPriority | 'keep';

type Form = {
  kind: NewsKind;
  title: string;
  body: string;
  type: NewsType;
  linkUrl: string;
  ctaText: string;
  branches: string[];
  publishMode: Mode;
  scheduleDate: string;
  scheduleTime: string;
  expiresAt: string;
  fullBleed: boolean;
  popupFrequency: PopupFrequency;
  priority: Priority;
};

const TYPES: readonly string[] = NEWS_TYPES.map((t) => t.value);
const FREQS: readonly string[] = POPUP_FREQ.map((f) => f.value);
const CUSTOM = '__custom';

function formOf(a: Announcement | null): Form {
  if (!a) {
    return {
      kind: 'announcement',
      title: '',
      body: '',
      type: 'text',
      linkUrl: '',
      ctaText: 'Explore Now',
      branches: ['all'],
      publishMode: 'now',
      scheduleDate: '',
      scheduleTime: '',
      expiresAt: '',
      fullBleed: false,
      popupFrequency: 'once',
      priority: 'normal',
    };
  }
  return {
    kind: a.kind === 'popup' ? 'popup' : 'announcement',
    title: a.title || '',
    body: a.body || '',
    type: (TYPES.includes(String(a.type)) ? a.type : 'text') as NewsType,
    linkUrl: a.linkUrl || '',
    ctaText: a.ctaText || 'Explore Now',
    branches: a.branches && a.branches.length ? a.branches : ['all'],
    publishMode: a.scheduledAt ? 'schedule' : 'now',
    scheduleDate: istDateOf(a.scheduledAt),
    scheduleTime: istHmOf(a.scheduledAt),
    expiresAt: a.expiresAt || '',
    fullBleed: !!a.fullBleed,
    popupFrequency: (FREQS.includes(String(a.popupFrequency)) ? a.popupFrequency : 'once') as PopupFrequency,
    priority: 'keep',
  };
}

const scheduledIso = (f: Form) => (f.publishMode === 'schedule' && f.scheduleDate && f.scheduleTime ? istIsoAt(f.scheduleDate, f.scheduleTime) || null : null);

/** The website's save payload (dash.html:19044), without files and priority. */
function payloadOf(f: Form): NewsPayload {
  const branches = f.branches.length ? f.branches : ['all'];
  const link = f.linkUrl.trim();
  if (f.kind === 'popup') {
    return {
      kind: 'popup',
      popupFrequency: f.popupFrequency || 'once',
      title: f.title.trim(),
      type: 'image',
      body: '',
      linkUrl: link,
      ctaText: link ? f.ctaText || 'Explore Now' : '',
      branches,
      expiresAt: f.expiresAt || null,
      scheduledAt: scheduledIso(f),
    };
  }
  return {
    kind: 'announcement',
    title: f.title.trim(),
    body: f.body || '',
    type: f.type,
    linkUrl: f.linkUrl || '',
    ctaText: f.ctaText || 'Explore Now',
    branches,
    expiresAt: f.expiresAt || null,
    scheduledAt: scheduledIso(f),
    fullBleed: f.type === 'image' || f.type === 'video' ? !!f.fullBleed : false,
  };
}

function changedKeys(before: NewsPayload, after: NewsPayload): NewsPayload {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    if (k === 'kind') continue;
    if (JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k])) out[k] = v;
  }
  return out as NewsPayload;
}

export function ComposeForm({ initial }: { initial: Announcement | null }) {
  const router = useRouter();
  const today = useTodayIst();
  const me = useSession((s) => s.user);
  const editing = !!initial;
  const [f, setF] = useState<Form>(() => formOf(initial));
  const [base] = useState<Form>(() => formOf(initial));
  const [file, setFile] = useState<PickedFile | null>(null);
  const [banner, setBanner] = useState<PickedFile | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [done, setDone] = useState<{ id: string | null; title: string } | null>(null);
  const branchesQ = useBranches();
  const create = useCreatePost();
  const update = useUpdatePost();
  const saving = create.isPending || update.isPending;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const popup = f.kind === 'popup';
  const needsFile = !popup && (f.type === 'image' || f.type === 'video' || f.type === 'excel' || f.type === 'ppt');
  const schedule = f.publishMode === 'schedule';
  const sched = scheduledIso(f);
  const onlyToday = f.expiresAt === today;
  const hasImage = !!file || !!(initial && (initial.fileName || initial.hasMedia));
  const emergency = !popup && f.priority === 'emergency';
  const existingBanner = !!initial?.hasHomeBanner;

  // A typed link that can't open (spaces, no domain, another scheme) would give a dead button.
  const linkTyped = f.linkUrl.trim();
  const badLink = !!linkTyped && (!safeLink(linkTyped) || /\s/.test(linkTyped) || !/^(https?:\/\/)?[^/]+\.[^/]{2,}/i.test(linkTyped));

  // canSave (dash.html:19037)
  const missing = popup
    ? !f.title.trim()
      ? 'Add a title.'
      : badLink
        ? 'Check the link: it should look like https://example.com.'
        : !hasImage
        ? 'Choose the pop-up’s picture.'
        : schedule && !sched
          ? 'Pick the date and time to publish.'
          : null
    : !f.title.trim()
      ? 'Add a title.'
      : f.type === 'link' && !f.linkUrl.trim()
        ? 'Add the link.'
        : badLink
          ? 'Check the link: it should look like https://example.com.'
          : f.type === 'text' && !f.body.trim()
          ? 'Add a description.'
          : needsFile && !hasImage
            ? 'Choose the file.'
            : schedule && !sched
              ? 'Pick the date and time to publish.'
              : null;

  const fullPayload = (): NewsPayload => {
    const p: NewsPayload = { ...payloadOf(f) };
    if (!popup) p.priority = f.priority === 'keep' ? undefined : f.priority;
    if (file) {
      p.fileData = file.dataUrl;
      p.fileName = file.name;
    }
    if (!popup && banner) {
      p.homeBannerImage = banner.dataUrl;
      p.homeBannerImageName = banner.name;
    } else if (!popup && removeBanner) {
      p.homeBannerImage = '';
      p.homeBannerImageName = '';
    }
    if (p.priority === undefined) delete p.priority;
    return p;
  };

  const editPatch = (): NewsPayload => {
    const p = changedKeys(payloadOf(base), payloadOf(f));
    if (!popup && f.priority !== 'keep') p.priority = f.priority;
    if (file) {
      p.fileData = file.dataUrl;
      p.fileName = file.name;
    }
    if (!popup && banner) {
      p.homeBannerImage = banner.dataUrl;
      p.homeBannerImageName = banner.name;
    } else if (!popup && removeBanner) {
      p.homeBannerImage = '';
      p.homeBannerImageName = '';
    }
    return p;
  };

  const nothingChanged = editing && Object.keys(editPatch()).length === 0;
  const blocked = missing ?? (nothingChanged ? 'Nothing has changed yet.' : null);

  const choose = async (which: 'file' | 'banner') => {
    setFileErr(null);
    try {
      let picked: PickedFile | null = null;
      if (which === 'banner') picked = await pickBannerImage();
      else if (popup) picked = await pickPopupImage();
      else if (f.type === 'image') picked = await pickImage('library');
      else if (f.type === 'video' || f.type === 'excel' || f.type === 'ppt') picked = await pickDocument(FILE_TYPES[f.type]);
      if (!picked) return;
      if (which === 'banner') {
        setBanner(picked);
        setRemoveBanner(false);
      } else setFile(picked);
    } catch (e) {
      setFileErr(e instanceof FileError ? e.message : 'That file could not be read. Try another one.');
    }
  };

  const toggleBranch = (b: string) => {
    if (b === 'all') return set('branches', ['all']);
    const cur = f.branches.filter((x) => x !== 'all');
    const next = cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b];
    set('branches', next.length ? next : ['all']);
  };

  const submit = () => {
    if (blocked) return;
    if (editing && initial) {
      update.mutate(
        { id: initial.id, patch: editPatch() },
        {
          onSuccess: () => {
            setReviewing(false);
            setDone({ id: initial.id, title: f.title.trim() });
          },
          onError: (e) => toast.show(e.message || 'Couldn’t save the changes.', 'danger'),
        },
      );
      return;
    }
    const p = fullPayload();
    // The server stores the body as sent (server.js:9122 spreads req.body), so the poster's name and
    // role travel with it exactly as the website's save does (dash.html:19039) — "My posts" and the
    // Edit / Delete gate both match on createdBy.
    create.mutate(
      {
        ...p,
        fileData: p.fileData || '',
        fileName: p.fileName || '',
        homeBannerImage: p.homeBannerImage || '',
        homeBannerImageName: p.homeBannerImageName || '',
        createdBy: me?.name ?? '',
        createdByRole: me?.role ?? '',
        createdAt: new Date().toISOString(),
        tenantId: me?.tenantId ?? null,
      },
      {
        onSuccess: (r) => {
          setReviewing(false);
          setDone({ id: r?.announcement?.id ?? null, title: f.title.trim() });
        },
        onError: (e) => toast.show(e.message || 'Couldn’t publish the post.', 'danger'),
      },
    );
  };

  const branchOptions = branchesQ.data ?? [];
  const all = f.branches.includes('all');
  const ctaPreset = CTA_PRESETS.includes(f.ctaText) ? f.ctaText : CUSTOM;
  const showCta = popup ? !!f.linkUrl.trim() : f.type === 'link' || !!f.linkUrl;
  const where = branchesLabel(f.branches);
  const whereText = all ? 'all branches' : where; // inside a sentence
  const goesLive = schedule && sched ? stampLabel(sched, today) : 'Now';
  const priorityOptions = [
    ...(editing ? [{ value: 'keep' as Priority, label: 'Leave unchanged', hint: 'The list doesn’t show the current priority, so it stays as it is.' }] : []),
    ...PRIORITIES.map((p) => ({ value: p.value as Priority, label: p.label, hint: p.hint })),
  ];
  const priorityHint = priorityOptions.find((p) => p.value === f.priority)?.hint ?? null;

  // The button words, under the link they open (shared by posts and pop-ups).
  const ctaFields = (
    <>
      <SelectField<string>
        label="Button text"
        value={ctaPreset}
        onChange={(v) => set('ctaText', v === CUSTOM ? '' : v)}
        options={[...CTA_PRESETS.map((p) => ({ value: p, label: p })), { value: CUSTOM, label: 'Your own words…' }]}
      />
      {ctaPreset === CUSTOM ? <TextField label="Your button text" value={f.ctaText} onChangeText={(v) => set('ctaText', v)} placeholder="e.g. Book a seat" maxLength={40} /> : null}
    </>
  );

  const title = editing ? (popup ? 'Edit pop-up' : 'Edit post') : 'New post';
  const swipeLabel = editing ? 'Swipe to save changes' : schedule ? 'Swipe to schedule' : emergency ? 'Swipe to post the emergency' : 'Swipe to publish';
  const note = editing
    ? `Changes show for everyone in ${whereText} at once. No one is emailed or messaged.`
    : schedule
      ? `It goes live for everyone in ${whereText} on ${goesLive}. No one is emailed or messaged.`
      : popup
        ? `It opens over the Home page for everyone in ${whereText} at once. No one is emailed or messaged.`
        : `Everyone in ${whereText} sees it on Home and in Announcements at once, and the office TVs pick it up. No one is emailed or messaged.`;

  if (done) {
    const verb = editing ? 'Changes saved' : schedule ? 'Post scheduled' : 'Posted';
    return (
      <Screen header={<NavHeader title={title} />}>
        <SuccessSheet
          visible
          onClose={() => router.back()}
          onPrimary={() => router.back()}
          title={verb}
          subtitle={editing ? `“${done.title}” is updated.` : schedule ? `“${done.title}” goes live on ${goesLive}.` : `“${done.title}” is live for ${whereText}.`}
          secondaryLabel={!editing && done.id ? 'View post' : undefined}
          onSecondary={!editing && done.id ? () => router.replace(`/admin/news/${encodeURIComponent(done.id!)}`) : undefined}
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={<NavHeader title={title} />}
      keyboardShouldPersistTaps="handled"
      footer={
        <ActionBar note={blocked}>
          <Button title={editing ? 'Review changes' : 'Review and publish'} icon={<Send />} disabled={!!blocked} onPress={() => setReviewing(true)} />
        </ActionBar>
      }>
      <LabelledSection title="What are you posting?">
        <SelectTiles<NewsKind>
          accessibilityLabel="What are you posting?"
          value={f.kind}
          onChange={(k) => {
            if (editing) return;
            set('kind', k);
            setFile(null);
          }}
          options={[
            { value: 'announcement', label: 'Announcement', icon: Megaphone, sub: 'In Announcements', disabled: editing && f.kind !== 'announcement' },
            { value: 'popup', label: 'Pop-up', icon: BellRing, sub: 'Over Home', disabled: editing && f.kind !== 'popup' },
          ]}
        />
        {editing ? (
          <Text variant="caption" muted style={styles.under}>
            A saved post can’t switch between the two. Delete it and post the other kind instead.
          </Text>
        ) : null}
      </LabelledSection>

      {/* The words first, in one card; files and the banner each get their own card under it. */}
      <LabelledSection title={popup ? 'The pop-up' : 'The post'}>
        <Card style={styles.fields}>
          <TextField
            label="Title"
            value={f.title}
            onChangeText={(v) => set('title', v)}
            placeholder={popup ? 'e.g. Diwali party invite' : 'e.g. Office closed on Friday'}
            maxLength={200}
            hint={popup ? 'Used to find this pop-up in your list. It is never drawn over the picture.' : null}
          />
          {popup ? (
            <SelectField<PopupFrequency>
              label="How often should it appear?"
              value={f.popupFrequency}
              onChange={(v) => set('popupFrequency', v)}
              options={POPUP_FREQ.map((x) => ({ value: x.value, label: x.label }))}
              hint={POPUP_FREQ.find((x) => x.value === f.popupFrequency)?.hint ?? null}
            />
          ) : (
            <>
              <SelectField<NewsType>
                label="Type"
                value={f.type}
                onChange={(v) => {
                  if (v === f.type) return;
                  set('type', v);
                  setFile(null);
                  setFileErr(null);
                }}
                options={NEWS_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
              <TextField
                label={f.type === 'text' ? 'Description' : 'Description (optional)'}
                value={f.body}
                onChangeText={(v) => set('body', v)}
                placeholder="The details"
                multiline
                maxLength={5000}
              />
              <TextField
                label={f.type === 'link' ? 'Link' : 'Link (optional)'}
                value={f.linkUrl}
                onChangeText={(v) => set('linkUrl', v)}
                placeholder="https://…"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                hint={f.type === 'link' ? null : 'With a link, the post shows a button that opens it.'}
              />
              {showCta ? ctaFields : null}
            </>
          )}
        </Card>
      </LabelledSection>

      {popup ? (
        <>
          <FileCard
            label="Pop-up picture"
            hint="Shown on its own over the Home page, so put any words inside the artwork. Poster-shaped works best."
            picked={file}
            current={initial && (initial.fileName || initial.hasMedia) ? initial.fileName || 'The current picture' : null}
            preview="poster"
            onPick={() => void choose('file')}
            error={fileErr}
          />
          <LabelledSection title="Link (optional)">
            <Card style={styles.fields}>
              <TextField
                label="Link"
                value={f.linkUrl}
                onChangeText={(v) => set('linkUrl', v)}
                placeholder="https://…"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                hint="Leave blank for a picture-only pop-up. With a link, a button opens it."
              />
              {showCta ? ctaFields : null}
            </Card>
          </LabelledSection>
        </>
      ) : null}

      {needsFile ? (
        <FileCard
          label={f.type === 'image' ? 'Picture' : `${newsTypeLabel(f.type)} file`}
          hint={f.type === 'image' ? 'Resized to 1600 px so it loads fast for everyone.' : 'Up to 8 MB. Use a link for anything larger.'}
          picked={file}
          current={initial && (initial.fileName || initial.hasMedia) ? initial.fileName || 'The current file' : null}
          preview={f.type === 'image' ? 'photo' : null}
          onPick={() => void choose('file')}
          error={fileErr}
        />
      ) : null}

      {!popup && (f.type === 'image' || f.type === 'video') ? (
        <ListCard>
          <ToggleRow
            title="Show full screen"
            subtitle="For a finished poster or graphic: it fills the whole slide, with no title or frame."
            value={f.fullBleed}
            onChange={(v) => set('fullBleed', v)}
          />
        </ListCard>
      ) : null}

      {!popup ? (
        <LabelledSection title="Home banner (optional)">
          <Card>
            <Text variant="caption" muted>
              A slim strip at the top of everyone’s Home page. No words are drawn over it, so put them in the picture.
            </Text>
            {banner ? <Image source={{ uri: banner.dataUrl }} style={styles.banner} contentFit="cover" accessibilityLabel="Home banner preview" /> : null}
            {!banner && existingBanner ? (
              <Text variant="label" color={removeBanner ? palette.dangerInk : palette.textMuted} style={styles.under}>
                {removeBanner ? 'The banner will be removed when you save.' : 'This post has a Home banner. Choose a new picture to replace it.'}
              </Text>
            ) : null}
            <View style={styles.row}>
              <Button variant="ghost" size="sm" title={banner || existingBanner ? 'Choose another' : 'Choose a picture'} icon={<ImagePlus />} onPress={() => void choose('banner')} />
              {banner ? <Button variant="text" size="sm" title="Clear" onPress={() => setBanner(null)} /> : null}
              {!banner && existingBanner ? (
                removeBanner ? (
                  <Button variant="text" size="sm" title="Undo" icon={<Undo2 />} onPress={() => setRemoveBanner(false)} />
                ) : (
                  <Button variant="danger" size="sm" title="Remove banner" icon={<Trash2 />} onPress={() => setRemoveBanner(true)} />
                )
              ) : null}
            </View>
          </Card>
        </LabelledSection>
      ) : null}

      <LabelledSection title="Publish">
        <Segmented<Mode>
          options={[
            { key: 'now', label: 'Now' },
            { key: 'schedule', label: 'Schedule' },
          ]}
          value={f.publishMode}
          onChange={(v) => set('publishMode', v)}
        />
        {schedule ? (
          <Card style={styles.fields}>
            <FieldPair>
              <DateField label="Date" value={f.scheduleDate || null} onChange={(v) => set('scheduleDate', v)} minimumDate={today} />
              <TimeField label="Time (India)" value={f.scheduleTime || null} onChange={(v) => set('scheduleTime', v)} />
            </FieldPair>
            <FieldMessage hint={sched ? `It goes live on ${stampLabel(sched, today)}.` : 'Pick a date and a time.'} />
          </Card>
        ) : null}
      </LabelledSection>

      <LabelledSection title="Visible to">
        <ChipRow wrap>
          <Chip label="All branches" selected={all} onPress={() => toggleBranch('all')} />
          {branchOptions.map((b) => (
            <Chip key={b} label={b} selected={!all && f.branches.includes(b)} onPress={() => toggleBranch(b)} />
          ))}
          {f.branches
            .filter((b) => b !== 'all' && !branchOptions.includes(b))
            .map((b) => (
              <Chip key={b} label={b} selected onPress={() => toggleBranch(b)} />
            ))}
        </ChipRow>
        {branchesQ.isSuccess && !branchOptions.length ? (
          <FieldMessage hint="No branches yet. Set people’s location in the roster to aim a post at one branch." />
        ) : null}
      </LabelledSection>

      <LabelledSection title="How long">
        <ListCard>
          <ToggleRow
            title="Only for today"
            subtitle="It disappears when the day changes (India time)."
            value={onlyToday}
            onChange={(v) => set('expiresAt', v ? today : '')}
          />
        </ListCard>
        {!onlyToday ? (
          <Card style={styles.fields}>
            <DateField
              label="Visible until (optional)"
              value={f.expiresAt || null}
              onChange={(v) => set('expiresAt', v)}
              minimumDate={editing ? undefined : today}
              hint={f.expiresAt ? `Shown until the end of ${dateLabel(f.expiresAt, today)}.` : 'Leave empty to keep it until it is deleted.'}
            />
            {f.expiresAt ? <Button variant="text" size="sm" title="Clear the date" onPress={() => set('expiresAt', '')} /> : null}
          </Card>
        ) : null}
      </LabelledSection>

      {!popup ? (
        <LabelledSection title="Office TVs">
          <Card style={styles.fields}>
            <SelectField<Priority> label="TV priority" value={f.priority} onChange={(v) => set('priority', v)} options={priorityOptions.map((p) => ({ value: p.value, label: p.label }))} hint={emergency ? null : priorityHint} />
          </Card>
          {emergency ? (
            <Banner
              tone="danger"
              title="Emergency takes over every TV"
              message={`Every office TV in ${whereText} switches to this post at once and stays on it until it expires or is deleted. Use it only for a real emergency.`}
            />
          ) : null}
        </LabelledSection>
      ) : null}

      <ConfirmSheet
        visible={reviewing}
        onClose={() => setReviewing(false)}
        title={editing ? 'Save these changes?' : schedule ? 'Schedule this post?' : popup ? 'Publish this pop-up?' : 'Publish this post?'}
        from={{ title: f.title.trim() || 'Untitled post', subtitle: popup ? 'Pop-up' : newsTypeLabel(f.type), icon: popup ? BellRing : Megaphone, module: 'news' }}
        to={{ title: where, subtitle: schedule ? 'Scheduled' : 'Everyone, at once', icon: schedule ? CalendarClock : Users, module: 'people' }}
        confirmLabel={swipeLabel}
        loading={saving}
        onConfirm={submit}
        note={note}>
        {emergency ? <Banner tone="danger" title="Emergency on every TV" message={`Every office TV in ${whereText} switches to this post.`} /> : null}
        <SummaryCard
          rows={[
            { key: 'what', label: 'What', value: popup ? 'Pop-up over Home' : 'Announcement' },
            popup ? { key: 'freq', label: 'Shows', value: popupFreqLabel(f.popupFrequency) } : { key: 'type', label: 'Type', value: newsTypeLabel(f.type) },
            { key: 'live', label: 'Goes live', value: goesLive },
            { key: 'until', label: 'Visible until', value: f.expiresAt ? `End of ${dateLabel(f.expiresAt, today)}` : 'Until deleted' },
            ...(!popup ? [{ key: 'tv', label: 'TV priority', value: f.priority === 'keep' ? 'Unchanged' : priorityLabel(f.priority), status: emergency ? ('failed' as const) : null }] : []),
            ...(file ? [{ key: 'file', label: popup ? 'Picture' : 'File', value: file.name }] : []),
            ...(!popup && (banner || removeBanner) ? [{ key: 'banner', label: 'Home banner', value: banner ? 'New picture' : 'Removed' }] : []),
          ]}
        />
      </ConfirmSheet>
    </Screen>
  );
}

function FileCard({
  label,
  hint,
  picked,
  current,
  preview,
  onPick,
  error,
}: {
  label: string;
  hint: string;
  picked: PickedFile | null;
  current: string | null;
  preview: 'poster' | 'photo' | null;
  onPick: () => void;
  error: string | null;
}) {
  return (
    <LabelledSection title={label}>
      <Card>
        <Text variant="caption" muted>
          {hint}
        </Text>
        {picked && preview ? (
          <Image source={{ uri: picked.dataUrl }} style={preview === 'poster' ? styles.poster : styles.photo} contentFit="contain" accessibilityLabel={`${label} preview`} />
        ) : null}
        <Text variant="label" color={picked ? palette.successInk : palette.textMuted} numberOfLines={2} style={styles.under}>
          {picked ? `Chosen: ${picked.name}` : current ? `Current: ${current}. Choose a new one to replace it.` : 'Nothing chosen yet.'}
        </Text>
        <View style={styles.row}>
          <Button variant="ghost" size="sm" title={picked || current ? 'Choose another' : 'Choose'} icon={<FileUp />} onPress={onPick} />
        </View>
        <FieldMessage error={error} />
      </Card>
    </LabelledSection>
  );
}

const styles = themedStyles(() => ({
  under: { marginTop: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm, alignItems: 'center' },
  fields: { gap: space.md },
  banner: { width: '100%', aspectRatio: 4, borderRadius: radius.md, marginTop: space.sm, backgroundColor: palette.surfaceSunken },
  poster: { width: '100%', height: 260, borderRadius: radius.md, marginTop: space.sm, backgroundColor: palette.surfaceSunken },
  photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, marginTop: space.sm, backgroundColor: palette.surfaceSunken },
}));
