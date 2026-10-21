// Add bills — the website's PettyCashBillSubmissionTab (dash.html ~L16504): one or more bills in one
// go, each with an expense type*, amount*, bill date (not in the future), paid to*, what it was for*,
// project code* and an optional photo / PDF of the bill. Photos are taken with the camera (compressed
// on the phone) so a bill can be captured on the spot. Body is exactly the website's
// POST /petty_cash_bill_submissions { bills: [...] }; the bill number (voucherNumber) and time are
// stamped by the server.
// Layout (Payno): per bill — the photo first, the expense type as SelectTiles, the amount as a giant
// AmountEntry typed on the NumericKeypad (on its deep wash while an amount is being typed), the date,
// who was paid and what for, and the project code as an AccountRow ("Change"). "Review" opens the
// ConfirmSheet (every bill and the total, Swipe to send); once sent, a SuccessSheet offers the expense
// report made from these bills (it carries the notice about bills over the petty cash). A new bill
// starts with the previous bill's project code, since bills sent together are usually for one project.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowRight, BriefcaseBusiness, Camera, FileText, Images, Paperclip, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import { type NewPettyCashBill, type PettyCashExcess, submitPettyCashBills, useExpenseHeads, useKekaProjects } from '@/api/petty-cash';
import { useTodayIst } from '@/features/attendance/use-now';
import { fileSizeLabel, MAX_PAYLOAD_CHARS } from '@/features/bounty/files';
import { type PickerItem, SearchPickerField } from '@/features/petty-cash/components';
import { list, localToday, money, shortDate } from '@/features/petty-cash/logic';
import { KeypadReadout } from '@/features/petty-cash/keypad-readout';
import { ExpenseTypeTiles } from '@/features/petty-cash/type-tiles';
import { plural } from '@/lib/format';
import { type PickedFile, pickDocument, pickImage } from '@/lib/files';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  AmountEntry,
  amountValue,
  Banner,
  Button,
  ConfirmSheet,
  DateField,
  haptic,
  IconAction,
  IconButton,
  isDarkScheme,
  KeypadWash,
  NavHeader,
  NumericKeypad,
  PressableScale,
  Screen,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  useAmountKeypad,
  withAlpha,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
type BillRow = {
  key: number;
  project: PickerItem | null;
  billDate: string;
  departmentId: string;
  amount: string;
  paidTo: string;
  description: string;
  file: PickedFile | null;
};
// `day` is today's IST date, passed in so the date is read from the useTodayIst() hook (render) or in
// an event handler — never from the clock during render.
const blank = (key: number, day: string, project: PickerItem | null = null): BillRow => ({
  key,
  project,
  billDate: day,
  departmentId: '',
  amount: '',
  paidTo: '',
  description: '',
  file: null,
});

type BillErrors = Partial<Record<'project' | 'head' | 'description' | 'paidTo' | 'amount' | 'billDate', string>>;
type Sent = { batchId: string; excess: PettyCashExcess[]; count: number; total: number };

export default function SubmitBillsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const projectsQ = useKekaProjects();
  const headsQ = useExpenseHeads();
  const today = useTodayIst();
  const [rows, setRows] = useState<BillRow[]>(() => [blank(1, today)]);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<number, BillErrors>>({});
  const [picking, setPicking] = useState<number | null>(null);
  const [keypadFor, setKeypadFor] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  const projects = list(projectsQ.data).filter((p) => !!p && !!p.id);
  const heads = list(headsQ.data).filter((h) => !!h && !!h.id);
  const projectItems: PickerItem[] = projects
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((p) => ({ id: p.id, title: p.kekaCode ? `${p.kekaCode} — ${p.name || ''}` : p.name || p.id, keywords: `${p.kekaCode || ''} ${p.name || ''}` }));
  // The chosen project in its AccountRow: the code, with the project's name under it.
  const projectDisplay = (item: PickerItem) => {
    const p = projects.find((x) => x.id === item.id);
    return p ? { title: p.kekaCode || p.name || item.title, sub: p.kekaCode ? p.name || null : null } : { title: item.title };
  };
  const total = rows.reduce((s, r) => s + amountValue(r.amount), 0);

  const setRow = (key: number, patch: Partial<BillRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const clearError = (key: number, field: keyof BillErrors) =>
    setFieldErrors((all) => (all[key]?.[field] ? { ...all, [key]: { ...all[key], [field]: undefined } } : all));
  const addRow = () => {
    setKeypadFor(null);
    setRows((rs) => [...rs, blank(Math.max(0, ...rs.map((r) => r.key)) + 1, localToday(), rs[rs.length - 1]?.project ?? null)]);
  };
  // Project codes or expense types that failed to load make the form unusable — say so, with a retry.
  const listsFailed = (!!projectsQ.error && !projects.length) || (!!headsQ.error && !heads.length);
  const retryLists = () => {
    if (projectsQ.error) void projectsQ.refetch();
    if (headsQ.error) void headsQ.refetch();
  };

  const typing = rows.find((r) => r.key === keypadFor) ?? null;
  const typingAt = typing ? rows.indexOf(typing) : -1;
  const typingType = typing ? heads.find((h) => h.id === typing.departmentId)?.name : '';
  const typingLabel = [rows.length > 1 ? `Bill ${typingAt + 1}` : '', typingType || 'Amount'].filter(Boolean).join(' · ');
  const pad = useAmountKeypad(typing?.amount ?? '', (v) => {
    if (keypadFor == null) return;
    setRow(keypadFor, { amount: v });
    clearError(keypadFor, 'amount');
  });

  const attach = async (key: number, how: 'camera' | 'library' | 'pdf') => {
    setPicking(key);
    setErr(null);
    try {
      const f = how === 'camera' ? await pickImage('camera') : how === 'library' ? await pickImage('library') : await pickDocument(['application/pdf', 'image/jpeg', 'image/png']);
      if (f) setRow(key, { file: f });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not attach that file.');
    } finally {
      setPicking(null);
    }
  };

  const send = useMutation({
    mutationFn: async (bills: NewPettyCashBill[]) => {
      const r = await submitPettyCashBills(bills);
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onSuccess: (r, bills) => {
      haptic.success();
      void qc.invalidateQueries({ queryKey: ['petty'] });
      setConfirming(false);
      const done: Sent = { batchId: r?.batchId || '', excess: list(r?.excess), count: bills.length, total: bills.reduce((s, b) => s + b.amount, 0) };
      // The success sheet rises once the confirm sheet has gone.
      setTimeout(() => setSent(done), 380);
    },
    onError: (e: Error) => {
      haptic.error();
      setErr(e.message);
    },
  });

  // Same rules as the website; every problem shows under its own field, on every bill at once.
  const review = () => {
    setErr(null);
    const todayNow = localToday(); // read fresh at submit time (the screen may have stayed open past midnight)
    const next: Record<number, BillErrors> = {};
    for (const r of rows) {
      const e: BillErrors = {};
      if (!r.project) e.project = 'Choose a project code.';
      if (!r.departmentId) e.head = 'Choose an expense type.';
      if (!r.description.trim()) e.description = 'Say what it was for.';
      if (!r.paidTo.trim()) e.paidTo = 'Enter who you paid.';
      if (!(amountValue(r.amount) > 0)) e.amount = 'Enter an amount.';
      if (r.billDate && r.billDate > todayNow) e.billDate = 'The date can’t be in the future.';
      if (Object.keys(e).length) next[r.key] = e;
    }
    setFieldErrors(next);
    // The bottom bar's note says which bill(s) still have fields marked in red (see `note` below).
    if (Object.keys(next).length) {
      haptic.warning();
      return;
    }
    const chars = rows.reduce((s, r) => s + (r.file?.dataUrl.length || 0), 0);
    if (chars > MAX_PAYLOAD_CHARS) {
      haptic.warning();
      return setErr('The photos are too big to send together. Send fewer bills at a time, or use smaller files.');
    }
    setKeypadFor(null);
    setConfirming(true);
  };

  const submit = () => {
    if (send.isPending) return;
    setErr(null);
    send.mutate(
      rows.map((r) => {
        const p = projects.find((x) => x.id === r.project!.id);
        return {
          projectId: r.project!.id,
          kekaCode: p?.kekaCode || p?.name || '',
          projectName: p?.name || '',
          departmentId: r.departmentId,
          billDate: r.billDate || '',
          description: r.description.trim(),
          paidTo: r.paidTo.trim(),
          amount: amountValue(r.amount),
          fileName: r.file?.name || '',
          mimeType: r.file?.type || '',
          fileData: r.file?.dataUrl || '',
        };
      }),
    );
  };

  const openReport = () => {
    if (!sent?.batchId) return router.back();
    const notice = sent.excess.length ? `?notice=${encodeURIComponent(JSON.stringify(sent.excess))}` : '';
    router.replace(`/petty-cash/statement/${encodeURIComponent(sent.batchId)}${notice}`);
  };

  const many = rows.length > 1;
  // Bills (1-based) that still have a field marked in red. The inline errors can sit far above the
  // sticky bar on a small phone, so the bar's note says why the submit didn't go through.
  const badBills = rows.map((r, i) => (Object.values(fieldErrors[r.key] ?? {}).some(Boolean) ? i + 1 : 0)).filter((n) => n > 0);
  const badList = badBills.length > 1 ? `${badBills.slice(0, -1).join(', ')} and ${badBills[badBills.length - 1]}` : String(badBills[0] ?? '');
  const note =
    picking !== null
      ? 'Adding the photo…'
      : badBills.length
        ? many
          ? `Fix the fields marked in red in bill${badBills.length > 1 ? 's' : ''} ${badList}.`
          : 'Fix the fields marked in red.'
        : `${plural(rows.length, 'bill')} · ${money(total)}`;
  const headName = (id: string) => heads.find((h) => h.id === id)?.name || '';
  const extra = sent ? sent.excess.reduce((s, x) => s + (Number(x?.amount) || 0), 0) : 0;

  const footer =
    typing && keypadFor != null ? (
      <KeypadWash fade={56}>
        <View style={{ gap: space.sm }}>
          <KeypadReadout label={typingLabel} value={typing.amount} />
          <NumericKeypad onKey={pad.onKey} decimal={pad.decimal} />
          <Button title="Done" variant="accent" onPress={() => setKeypadFor(null)} />
        </View>
      </KeypadWash>
    ) : (
      <ActionBar note={note}>
        <Button title={many ? `Review ${rows.length} bills` : 'Review bill'} icon={<ArrowRight />} disabled={picking !== null} onPress={review} />
      </ActionBar>
    );

  return (
    <>
      <Screen header={<NavHeader title="Add bills" />} footer={footer}>
        {listsFailed ? (
          <Banner
            tone="danger"
            title="Couldn’t load the form"
            message="Project codes or expense types didn’t load."
            action={{ label: 'Try again', onPress: retryLists, loading: projectsQ.isFetching || headsQ.isFetching }}
          />
        ) : null}

        {rows.map((r, i) => {
          const e = fieldErrors[r.key] ?? {};
          const busy = picking === r.key;
          const editing = keypadFor === r.key;
          const value = amountValue(r.amount);
          return (
            <View key={r.key} style={styles.bill}>
              {many ? (
                <View style={[styles.billHead, i > 0 && styles.billHeadSep]}>
                  <Text variant="heading" numberOfLines={1} accessibilityRole="header" style={styles.flex}>
                    Bill {i + 1}
                  </Text>
                  <IconButton
                    tone="muted"
                    accessibilityLabel={`Remove bill ${i + 1}`}
                    onPress={() => {
                      if (keypadFor === r.key) setKeypadFor(null);
                      setRows((rs) => rs.filter((x) => x.key !== r.key));
                      setFieldErrors((all) => {
                        const rest = { ...all };
                        delete rest[r.key];
                        return rest;
                      });
                    }}>
                    <X size={20} color={palette.text} strokeWidth={1.8} />
                  </IconButton>
                </View>
              ) : null}

              {/* The photo first — on a phone the bill is usually in your hand. */}
              {r.file ? (
                <View style={styles.fileRow}>
                  {r.file.type.startsWith('image/') ? (
                    <Image source={{ uri: r.file.uri }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbDoc]}>
                      <FileText size={24} color={moduleTone.pettyCash.fg} strokeWidth={1.8} />
                    </View>
                  )}
                  <View style={styles.flexText}>
                    <Text variant="labelStrong" numberOfLines={1}>
                      {r.file.name}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {fileSizeLabel(r.file.size)}
                    </Text>
                  </View>
                  <IconButton tone="surface" accessibilityLabel="Remove photo" onPress={() => setRow(r.key, { file: null })}>
                    <X size={18} color={palette.text} strokeWidth={1.8} />
                  </IconButton>
                </View>
              ) : (
                <View style={styles.attach}>
                  <View style={styles.attachHead}>
                    <Text variant="labelStrong" muted numberOfLines={1} style={styles.flex}>
                      Photo of the bill (optional)
                    </Text>
                    {busy ? <ActivityIndicator size="small" color={palette.primaryText} /> : null}
                  </View>
                  <View style={styles.attachActions}>
                    <IconAction icon={Camera} label="Camera" tone="primary" disabled={picking !== null} onPress={() => void attach(r.key, 'camera')} />
                    <IconAction icon={Images} label="Photos" disabled={picking !== null} onPress={() => void attach(r.key, 'library')} />
                    <IconAction icon={Paperclip} label="PDF" disabled={picking !== null} onPress={() => void attach(r.key, 'pdf')} />
                  </View>
                </View>
              )}

              <ExpenseTypeTiles
                heads={heads}
                value={r.departmentId || null}
                loading={headsQ.isLoading}
                failed={!!headsQ.error}
                error={e.head}
                onChange={(id) => {
                  setRow(r.key, { departmentId: id });
                  clearError(r.key, 'head');
                  if (!value) setKeypadFor(r.key);
                }}
              />
              <PressableScale
                onPress={() => setKeypadFor(r.key)}
                disabled={editing}
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityLabel={`Amount${many ? ` of bill ${i + 1}` : ''}: ${value > 0 ? money(value) : 'not entered'}`}
                accessibilityHint={editing ? undefined : 'Opens the keypad'}>
                <AmountEntry label="Amount" value={r.amount} caret={editing} helper={editing ? undefined : value > 0 ? 'Tap to change' : 'Tap to enter'} error={e.amount} />
              </PressableScale>
              <DateField
                label="Bill date"
                value={r.billDate || null}
                maximumDate={today}
                error={e.billDate}
                onChange={(d) => {
                  setRow(r.key, { billDate: d });
                  clearError(r.key, 'billDate');
                }}
              />
              <TextField
                label="Paid to"
                value={r.paidTo}
                onChangeText={(v) => {
                  setRow(r.key, { paidTo: v });
                  clearError(r.key, 'paidTo');
                }}
                onFocus={() => setKeypadFor(null)}
                placeholder="Shop or person"
                error={e.paidTo}
              />
              <TextField
                label="What was it for?"
                value={r.description}
                onChangeText={(v) => {
                  setRow(r.key, { description: v });
                  clearError(r.key, 'description');
                }}
                onFocus={() => setKeypadFor(null)}
                placeholder="e.g. Tea and snacks for the shoot"
                multiline
                error={e.description}
              />
              <SearchPickerField
                variant="row"
                icon={BriefcaseBusiness}
                label="Project code"
                placeholder={projectsQ.isLoading ? 'Loading project codes…' : 'Choose a project code'}
                display={projectDisplay}
                rowSub="Search by code or project name"
                value={r.project}
                items={projectItems}
                requireQuery={projectItems.length > 40}
                error={e.project}
                emptyHint={projectsQ.error ? 'Project codes couldn’t be loaded. Use Try again at the top.' : undefined}
                onPick={(p) => {
                  setRow(r.key, { project: p });
                  clearError(r.key, 'project');
                }}
              />
            </View>
          );
        })}

        {/* A quiet text action, as "Add another expense" on Request money: the one prominent button is in the bar. */}
        <Button title="Add another bill" variant="text" icon={<Plus />} onPress={addRow} style={styles.addRow} />

        {err && !confirming ? <Banner tone="danger" title="Couldn’t send yet" message={err} /> : null}
      </Screen>

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={many ? `Send these ${rows.length} bills?` : 'Send this bill?'}
        detailsTitle={many ? 'Bills' : 'Bill'}
        confirmLabel={many ? 'Swipe to send bills' : 'Swipe to send bill'}
        onConfirm={submit}
        loading={send.isPending}
        note="An expense report is made from them.">
        <SummaryCard
          rows={rows.map((r, i) => ({
            key: String(r.key),
            label: r.description.trim() || headName(r.departmentId) || `Bill ${i + 1}`,
            value: money(amountValue(r.amount)),
            hint: [r.paidTo.trim() ? `Paid to ${r.paidTo.trim()}` : null, r.billDate ? shortDate(r.billDate, today) : null].filter(Boolean).join(' · ') || null,
          }))}
          total={{ label: 'Total', value: money(total) }}
        />
        {err ? <Banner tone="danger" title="Couldn’t send yet" message={err} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={!!sent}
        onClose={() => router.back()}
        title={sent ? `${plural(sent.count, 'bill')} sent` : 'Bills sent'}
        subtitle={extra > 0 ? 'They add up to more than your petty cash, so the extra was sent for approval.' : 'Your expense report is ready.'}
        secondaryLabel={sent?.batchId ? 'Done' : undefined}
        onSecondary={() => router.back()}
        primaryLabel={sent?.batchId ? 'View expense report' : 'Done'}
        onPrimary={openReport}>
        <SummaryCard
          rows={[
            { key: 'count', label: 'Bills', value: sent ? String(sent.count) : null },
            ...(extra > 0 ? [{ key: 'extra', label: 'Extra, sent for approval', value: money(extra) }] : []),
          ]}
          total={{ label: 'Total', value: money(sent?.total ?? 0) }}
        />
      </SuccessSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  addRow: { alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0 },
  flexText: { flex: 1, minWidth: 0, gap: 2 },
  bill: { gap: space.md },
  billHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  // A hairline between one bill and the next.
  billHeadSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator, paddingTop: space.md, marginTop: space.xs },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.7),
    borderWidth: 1,
    borderColor: withAlpha(palette.ink, 0.07),
  },
  thumb: { width: 56, height: 56, borderRadius: radius.xs, flexShrink: 0 },
  thumbDoc: { backgroundColor: moduleTone.pettyCash.bg, alignItems: 'center', justifyContent: 'center' },
  attach: {
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.7),
    borderWidth: 1,
    borderColor: withAlpha(palette.ink, 0.07),
  },
  attachHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 20 },
  attachActions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
}));
