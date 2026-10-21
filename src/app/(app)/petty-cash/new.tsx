// Request money — the website's PettyCashRequestForm (dash.html ~L16634):
//   project code* (an active project), project name*, for myself or a teammate (same department
//   only), one or more expense type + amount lines, an optional note (≤500).
// For a teammate the request waits on their consent: the server emails them a 6-digit code and the
// request stays "Not confirmed yet" until it is entered — here (read out by the teammate) or later by
// them in their own Petty cash screen. Body is exactly the website's POST /petty_cash_requests.
// Layout (Payno): who it is for as two SelectTiles; each expense as type tiles + a giant AmountEntry
// typed on the NumericKeypad (on its deep wash at the bottom while an amount is being typed); the
// project code as an AccountRow ("Change"); then "Review request" opens the ConfirmSheet (who gets it →
// who approves it, the details, Swipe to send request) and a SuccessSheet once it is sent.
// "Teammate" is only offered to people in a department (the server accepts no one else).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowRight, BriefcaseBusiness, Landmark, Plus, Trash2, UserRound, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  createPettyCashRequest,
  type NewPettyCashRequest,
  type PettyCashRequest,
  useExpenseHeads,
  useKekaProjects,
  useTeammates,
} from '@/api/petty-cash';
import { useSession } from '@/auth/session';
import { OtpConfirmSheet, type PickerItem, SearchPickerField } from '@/features/petty-cash/components';
import { list, money, pettyCashRef, statusMeta } from '@/features/petty-cash/logic';
import { KeypadReadout } from '@/features/petty-cash/keypad-readout';
import { ExpenseTypeTiles } from '@/features/petty-cash/type-tiles';
import { firstName } from '@/lib/format';
import { palette, space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
  ActionBar,
  AmountEntry,
  amountValue,
  Banner,
  Button,
  ConfirmSheet,
  haptic,
  IconButton,
  KeypadWash,
  NavHeader,
  NumericKeypad,
  PressableScale,
  Screen,
  SelectTiles,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  toast,
  useAmountKeypad,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
type HeadRow = { key: number; departmentId: string; amount: string };
const nextRow = (rs: HeadRow[]): HeadRow => ({ key: Math.max(0, ...rs.map((r) => r.key)) + 1, departmentId: '', amount: '' });

type RowErrors = { head?: string; amount?: string };
type Errors = { project?: string; projectName?: string; teammate?: string; rows?: Record<number, RowErrors> };

export default function NewPettyCashRequestScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const projectsQ = useKekaProjects();
  const headsQ = useExpenseHeads();
  const [raiseFor, setRaiseFor] = useState<'self' | 'team'>('self');
  const teammatesQ = useTeammates(raiseFor === 'team');
  const canAskForTeammate = !!user?.dept;

  const [project, setProject] = useState<PickerItem | null>(null);
  const [projectName, setProjectName] = useState('');
  const [teammate, setTeammate] = useState<PickerItem | null>(null);
  const [rows, setRows] = useState<HeadRow[]>([{ key: 1, departmentId: '', amount: '' }]);
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<PettyCashRequest | null>(null);
  // Which line's amount the keypad is typing into (null: keypad closed).
  const [keypadFor, setKeypadFor] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<PettyCashRequest | null>(null);

  const heads = list(headsQ.data).filter((h) => !!h && !!h.id);
  const projects = list(projectsQ.data).filter((p) => !!p && !!p.id);
  const chosen = projects.find((p) => p.id === project?.id) ?? null;
  const total = rows.reduce((s, r) => s + amountValue(r.amount), 0);
  // Project codes or expense types that failed to load make the form unusable — say so, with a retry.
  const listsFailed = (!!projectsQ.error && !projects.length) || (!!headsQ.error && !heads.length);
  const retryLists = () => {
    if (projectsQ.error) void projectsQ.refetch();
    if (headsQ.error) void headsQ.refetch();
  };

  const projectItems: PickerItem[] = projects
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((p) => ({
      id: p.id,
      title: p.kekaCode ? `${p.kekaCode} — ${p.name || ''}` : p.name || p.id,
      subtitle: p.costCodeOwner ? `Project owner: ${p.costCodeOwner}` : undefined,
      keywords: `${p.kekaCode || ''} ${p.name || ''}`,
    }));
  // The chosen project in its AccountRow: the code, with the project's name under it.
  const projectDisplay = (item: PickerItem) => {
    const p = projects.find((x) => x.id === item.id);
    return p ? { title: p.kekaCode || p.name || item.title, sub: p.kekaCode ? p.name || null : null } : { title: item.title };
  };
  const teammateItems: PickerItem[] = list(teammatesQ.data)
    .filter((u) => !!u && !!u.id)
    .map((u) => ({ id: u.id, title: u.name || 'Unnamed', subtitle: u.employeeNumber || u.email }));

  // Back to Petty cash, with a toast saying what happens next.
  const done = (message: string) => {
    void qc.invalidateQueries({ queryKey: ['petty'] });
    router.back();
    toast.show(message);
  };
  // Who approves it next: the project owner, or Accounts when the code has none (or it is mine).
  const sentTo = (req: PettyCashRequest | null | undefined) =>
    req?.status === 'pending_accounts_approval' || !req?.costCodeOwnerName ? 'Accounts' : req.costCodeOwnerName;

  const create = useMutation({
    mutationFn: async (body: NewPettyCashRequest) => {
      const r = await createPettyCashRequest(body);
      if (isApiError(r)) throw new Error(r.error);
      return r.request;
    },
    onSuccess: (req) => {
      haptic.success();
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ['petty'] });
      // A request for myself is done; one for a teammate still needs their code. Either sheet rises
      // once the confirm sheet has gone.
      if (req?.status === 'pending_confirmation') setTimeout(() => setPending(req), 380);
      else setTimeout(() => setSent(req ?? ({ id: '', status: 'pending_approval' } as PettyCashRequest)), 380);
    },
    onError: (e: Error) => {
      haptic.error();
      setMsg(e.message);
    },
  });

  const clear = (patch: Partial<Errors>) => setErrors((e) => ({ ...e, ...patch }));
  const clearRow = (key: number, field: keyof RowErrors) =>
    setErrors((e) => (e.rows?.[key]?.[field] ? { ...e, rows: { ...e.rows, [key]: { ...e.rows[key], [field]: undefined } } } : e));
  const setRow = (key: number, patch: Partial<HeadRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const typing = rows.find((r) => r.key === keypadFor) ?? null;
  const typingAt = typing ? rows.indexOf(typing) : -1;
  const typingType = typing ? heads.find((h) => h.id === typing.departmentId)?.name : '';
  const typingLabel = [rows.length > 1 ? `Expense ${typingAt + 1}` : '', typingType || 'Amount'].filter(Boolean).join(' · ');
  const pad = useAmountKeypad(typing?.amount ?? '', (v) => {
    if (keypadFor == null) return;
    setRow(keypadFor, { amount: v });
    clearRow(keypadFor, 'amount');
  });

  // The lines the server gets: every line with a type (as before, and as the website).
  const departments = rows
    .filter((r) => r.departmentId)
    .map((r) => ({ departmentId: r.departmentId, departmentName: heads.find((h) => h.id === r.departmentId)?.name || '', amount: amountValue(r.amount) }));

  // Same rules as before (and as the website); every problem is shown under its own field at once.
  const review = () => {
    setMsg(null);
    const next: Errors = {};
    if (!chosen) next.project = 'Choose a project code.';
    if (!projectName.trim()) next.projectName = 'Enter the project name.';
    const rowErrors: Record<number, RowErrors> = {};
    if (!departments.length && rows[0]) rowErrors[rows[0].key] = { head: 'Choose what it is for.' };
    for (const r of rows) {
      if (r.departmentId && !(amountValue(r.amount) > 0)) rowErrors[r.key] = { ...rowErrors[r.key], amount: 'Enter an amount.' };
    }
    if (Object.keys(rowErrors).length) next.rows = rowErrors;
    if (raiseFor === 'team' && !teammate) next.teammate = 'Choose who it is for.';
    setErrors(next);
    if (next.project || next.projectName || next.rows || next.teammate || !chosen) {
      haptic.warning();
      return;
    }
    setKeypadFor(null);
    setConfirming(true);
  };

  const send = () => {
    if (!chosen || create.isPending) return;
    setMsg(null);
    create.mutate({
      kekaCode: chosen.kekaCode || chosen.name || '',
      projectId: chosen.id,
      projectName: projectName.trim(),
      departments,
      remarks: remarks.trim(),
      employeeId: raiseFor === 'team' && teammate ? teammate.id : user?.id || '',
    });
  };

  // Removing a line also drops its errors, so the note never points at a field that is gone.
  const removeRow = (key: number) => {
    setRows((rs) => rs.filter((x) => x.key !== key));
    if (keypadFor === key) setKeypadFor(null);
    setErrors((e) => {
      if (!e.rows?.[key]) return e;
      const rest = { ...e.rows };
      delete rest[key];
      return { ...e, rows: Object.keys(rest).length ? rest : undefined };
    });
  };
  const fieldErrors = !!(errors.project || errors.projectName || errors.teammate || (errors.rows && Object.values(errors.rows).some((e) => e.head || e.amount)));
  const forTeam = raiseFor === 'team';
  const many = rows.length > 1;
  const owner = chosen?.costCodeOwner || '';
  const sentStatus = sent ? statusMeta(sent.status) : null;

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
      <ActionBar
        note={fieldErrors ? 'Fix the fields marked in red.' : total > 0 ? `${money(total)} in total${forTeam ? ' · they confirm it with a code' : ''}` : null}>
        <Button title="Review request" icon={<ArrowRight />} onPress={review} />
      </ActionBar>
    );

  return (
    <>
      <Screen header={<NavHeader title="Request money" />} footer={footer}>
        {listsFailed ? (
          <Banner
            tone="danger"
            title="Couldn’t load the form"
            message="Project codes or expense types didn’t load."
            action={{ label: 'Try again', onPress: retryLists, loading: projectsQ.isFetching || headsQ.isFetching }}
          />
        ) : null}

        {canAskForTeammate ? (
          <View style={{ gap: space.xs }}>
            <Text variant="labelStrong" muted numberOfLines={1} style={FIELD_LABEL_INSET}>
              Who is it for?
            </Text>
            <SelectTiles<'self' | 'team'>
              accessibilityLabel="Who is it for?"
              columns={2}
              value={raiseFor}
              onChange={(k) => {
                setRaiseFor(k);
                if (k === 'self') {
                  setTeammate(null);
                  clear({ teammate: undefined });
                }
              }}
              options={[
                { value: 'self', label: 'Myself', icon: UserRound },
                { value: 'team', label: 'A teammate', icon: UsersRound, sub: 'Same department' },
              ]}
            />
            {forTeam ? (
              <SearchPickerField
                variant="row"
                icon={UserRound}
                label="Teammate"
                placeholder={teammatesQ.isLoading ? 'Loading teammates…' : 'Choose a teammate'}
                rowSub="Search by name"
                value={teammate}
                items={teammateItems}
                error={errors.teammate}
                hint="They get an email with a code to confirm it."
                onPick={(t) => {
                  setTeammate(t);
                  clear({ teammate: undefined });
                }}
                emptyHint="No one else is in your department."
              />
            ) : null}
          </View>
        ) : null}

        {rows.map((r, i) => {
          const rowErr = errors.rows?.[r.key];
          const editing = keypadFor === r.key;
          const value = amountValue(r.amount);
          return (
            <View key={r.key} style={{ gap: space.sm }}>
              {many ? (
                <View style={[styles.lineHead, i > 0 && styles.lineHeadSep]}>
                  <Text variant="heading" numberOfLines={1} accessibilityRole="header" style={styles.flex}>
                    Expense {i + 1}
                  </Text>
                  <IconButton tone="muted" accessibilityLabel={`Remove expense ${i + 1}`} onPress={() => removeRow(r.key)}>
                    <Trash2 size={18} color={palette.dangerInk} strokeWidth={1.8} />
                  </IconButton>
                </View>
              ) : null}
              <ExpenseTypeTiles
                heads={heads}
                value={r.departmentId || null}
                taken={rows.filter((x) => x.key !== r.key).map((x) => x.departmentId)}
                loading={headsQ.isLoading}
                failed={!!headsQ.error}
                error={rowErr?.head}
                onChange={(id) => {
                  setRow(r.key, { departmentId: id });
                  clearRow(r.key, 'head');
                  // Next comes the amount: open the keypad for it.
                  if (!value) setKeypadFor(r.key);
                }}
              />
              <PressableScale
                onPress={() => setKeypadFor(r.key)}
                disabled={editing}
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityLabel={`Amount${many ? ` for expense ${i + 1}` : ''}: ${value > 0 ? money(value) : 'not entered'}`}
                accessibilityHint={editing ? undefined : 'Opens the keypad'}>
                <AmountEntry label="Amount" value={r.amount} caret={editing} helper={editing ? undefined : value > 0 ? 'Tap to change' : 'Tap to enter'} error={rowErr?.amount} />
              </PressableScale>
            </View>
          );
        })}
        {heads.length > rows.length && !headsQ.isLoading ? (
          <Button
            title="Add another expense"
            variant="text"
            icon={<Plus />}
            onPress={() => setRows((rs) => [...rs, nextRow(rs)])}
            style={styles.addRow}
          />
        ) : null}

        <SearchPickerField
          variant="row"
          icon={BriefcaseBusiness}
          label="Project code"
          placeholder={projectsQ.isLoading ? 'Loading project codes…' : 'Choose a project code'}
          display={projectDisplay}
          rowSub="Search by code or project name"
          value={project}
          items={projectItems}
          requireQuery={projectItems.length > 40}
          error={errors.project}
          hint={chosen ? (chosen.costCodeOwner ? `Project owner: ${chosen.costCodeOwner}` : 'No project owner, so Accounts approves it') : null}
          onPick={(p) => {
            setProject(p);
            clear({ project: undefined });
            if (!projectName.trim()) {
              setProjectName(projects.find((x) => x.id === p.id)?.name || '');
              clear({ project: undefined, projectName: undefined });
            }
          }}
          emptyHint={projectsQ.error ? 'Project codes couldn’t be loaded. Use Try again at the top.' : undefined}
        />
        <TextField
          label="Project name"
          value={projectName}
          onChangeText={(v) => {
            setProjectName(v);
            if (errors.projectName) clear({ projectName: undefined });
          }}
          onFocus={() => setKeypadFor(null)}
          placeholder="Project name"
          error={errors.projectName}
        />
        <TextField
          label="Note (optional)"
          value={remarks}
          onChangeText={(v) => setRemarks(v.slice(0, 500))}
          onFocus={() => setKeypadFor(null)}
          multiline
          maxLength={500}
          counter
          placeholder="Anything they should know"
        />
      </Screen>

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Send this request?"
        from={
          forTeam && teammate
            ? { title: teammate.title, subtitle: 'Gets the money', avatar: { name: teammate.title } }
            : { title: 'You', subtitle: 'Get the money', avatar: { name: user?.name || 'You' } }
        }
        to={owner ? { title: owner, subtitle: 'Project owner approves', avatar: { name: owner } } : { title: 'Accounts', subtitle: 'Approves it', icon: Landmark, module: 'pettyCash' }}
        detailsTitle="Request details"
        // Short enough to stay whole on a 320 dp phone (the screen-reader button reads "Request").
        confirmLabel="Swipe to request"
        onConfirm={send}
        loading={create.isPending}
        note={forTeam ? 'They confirm it with the code we email them.' : undefined}>
        <SummaryCard
          rows={[
            ...departments.map((d, i) => ({ key: `${d.departmentId}-${i}`, label: d.departmentName || 'Expense', value: money(d.amount) })),
            { key: 'code', label: 'Project code', value: chosen?.kekaCode || chosen?.name || null },
            { key: 'name', label: 'Project name', value: projectName.trim() || null },
            ...(remarks.trim() ? [{ key: 'note', label: 'Note', value: remarks.trim() }] : []),
          ]}
          total={{ label: 'Total', value: money(total) }}
        />
        {msg ? <Banner tone="danger" title="Couldn’t send the request" message={msg} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={!!sent}
        onClose={() => router.back()}
        title="Request sent"
        subtitle={`Sent to ${sentTo(sent)} to approve.`}
        secondaryLabel={sent?.id ? 'View request' : undefined}
        onSecondary={() => {
          if (sent?.id) router.replace(`/petty-cash/request/${encodeURIComponent(sent.id)}`);
        }}
        onPrimary={() => router.back()}>
        <SummaryCard
          hideEmpty
          rows={[
            { key: 'ref', label: 'Request number', value: sent?.id ? pettyCashRef('request', sent) : null },
            { key: 'total', label: 'Amount', value: money(sent?.amount ?? total) },
            { key: 'status', label: 'Status', value: sentStatus?.label ?? null, status: sentStatus?.tone ?? null },
          ]}
        />
      </SuccessSheet>

      <OtpConfirmSheet
        request={pending}
        visible={!!pending}
        // "Later": the request waits for the teammate's code; confirmed: it goes on to be approved.
        onClose={() => done(`Request saved. ${firstName(pending?.employeeName) || 'Your teammate'} can confirm it later.`)}
        onDone={() => done(`Request sent to ${sentTo(pending)} to approve`)}
        intro={
          pending ? (
            <Text variant="body">
              We emailed <Text variant="bodyStrong">{pending.employeeName || 'your teammate'}</Text> a 6-digit code. Ask them for it, or they can confirm it later.
            </Text>
          ) : undefined
        }
      />
    </>
  );
}

const styles = themedStyles(() => ({
  addRow: { alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  // A hairline between one expense line and the next.
  lineHeadSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator, paddingTop: space.md, marginTop: space.xs },
}));
