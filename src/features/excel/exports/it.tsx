// Excel downloads for IT and the office:
//   Asset register      exportAssetsExcel (dash.html:20430) with its four reports (:20703–20706: complete,
//                       assigned, acknowledgement pending, warranty ending in 60 days) and the per-asset
//                       history report (downloadExcel :20367, a CSV there; a sheet here)
//   Service desk        ServiceDesk exportXlsx (:21207): the rows this person's slice sees
//   Device monitoring   DeviceMonitoring exportRoster (:11010)
//   TM360, one person   the employee panel's exportSheet (:10688). The website exports only the tabs that
//                       were opened; the phone loads all four for the dates first.

import { useState } from 'react';
import { View } from 'react-native';

import { useRoster } from '@/api/people';
import { type Asset, useAssets } from '@/api/itdesk';
import { type Tm360Employee, useTm360Employee, useTm360Roster } from '@/api/insights';
import { useTodayIst } from '@/features/attendance/use-now';
import { useApiList } from '@/features/excel/api';
import type { ExportDef } from '@/features/excel/catalog';
import { ChoiceCard, ExportShell, PickedRow, type Range, RangeCard } from '@/features/excel/export-shell';
import { xDate, xStamp } from '@/features/excel/format';
import { useExcelAccess } from '@/features/excel/gate';
import { tmDur } from '@/features/insights/format';
import { categoryLabelFor, deptOf, raiserOf, refOf, STATUS_WORDS } from '@/features/servicedesk/format';
import { useDesk } from '@/features/servicedesk/use-desk';
import { addDaysYmd } from '@/lib/ist';
import { type Cell, letterheadRows, objectsToRows } from '@/lib/xlsx';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ListCard, ListRow, SelectField, Sheet, Text, TextField } from '@/ui';

// ── Asset register ───────────────────────────────────────────────────────────
type AssetView = 'all' | 'assigned' | 'ack' | 'warranty' | 'one';
const ASSET_HEAD = ['Asset Id', 'Asset Name', 'Asset Description', 'Asset Location', 'Asset Category', 'Asset Type', 'Purchased On', 'Warranty Expiry Status', 'Warranty Expires On', 'Asset Condition', 'Assigned To (Emp No.)', 'Assigned To (Name)', 'Date of Assignment', 'Serial Number', 'Asset Value (INR)', 'Status', 'Acknowledged'];
const ASSET_COLS = [22, 20, 35, 14, 14, 14, 14, 18, 18, 14, 20, 20, 18, 16, 14, 12, 12];
const FILE_TAG: Record<Exclude<AssetView, 'one'>, string> = { all: 'All', assigned: 'Assigned', ack: 'Pending_Ack', warranty: 'Warranty_Expiring' };

const dnum = (v: string) => {
  if (!v) return null;
  const t = Date.parse(String(v).trim().slice(0, 10));
  return Number.isNaN(t) ? null : t;
};

export function AssetsExport({ def }: { def: ExportDef }) {
  const { ready, access } = useExcelAccess();
  const today = useTodayIst();
  const assets = useAssets(ready);
  const roster = useRoster(ready);
  const [view, setView] = useState<AssetView>('all');
  const [oneId, setOneId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const all = assets.data ?? [];
  const t0 = Date.parse(`${today}T00:00:00Z`);
  const lists: Record<Exclude<AssetView, 'one'>, Asset[]> = {
    all,
    assigned: all.filter((a) => a.assignedToEmpNo),
    ack: all.filter((a) => a.assignedToEmpNo && !a.acknowledged && a.ackToken),
    warranty: all.filter((a) => {
      const t = dnum(a.warrantyExpiry);
      return t !== null && t >= t0 && t <= t0 + 60 * 864e5;
    }),
  };
  const one = all.find((a) => a.id === oneId) ?? null;
  const nameFor = (empNo: string) => {
    const n = String(empNo || '').trim().replace(/\.0+$/, '').toLowerCase();
    return n ? (roster.data?.rows ?? []).find((r) => r.employeeNumber.trim().toLowerCase() === n)?.name ?? '' : '';
  };
  const status = (a: Asset) => (a.assignedToEmpNo ? 'assigned' : a.status || 'available');
  const needle = q.trim().toLowerCase();
  const matches = all.filter((a) => !needle || [a.name, a.assetId, a.serial, a.assignedTo].some((v) => String(v || '').toLowerCase().includes(needle))).slice(0, 80);
  const count = view === 'one' ? (one ? 1 : null) : lists[view].length;
  return (
    <ExportShell
      def={def}
      ready={ready && !assets.isPending}
      intro={
        view === 'one'
          ? 'One asset: its details and every time it was assigned or returned, with remarks.'
          : 'One row per asset with ID, description, location, category, warranty, condition, who has it and since when, serial number, value, status and whether it was acknowledged.'
      }
      count={count}
      countNoun={['asset', 'assets']}
      disabled={view === 'one' && !one ? 'Choose an asset first.' : view !== 'one' && !lists[view].length ? 'No asset is in this report.' : false}
      build={() => {
        if (view === 'one') {
          if (!one) return null;
          const hist = one.history || [];
          const t = access.tenant;
          const rows: Cell[][] = [
            [t?.name || 'Company'],
            ...(t?.address ? [[t.address]] : []),
            ['Asset Report'],
            [''],
            ['Asset Name', one.name],
            ['Serial Number', one.serial || ''],
            ['Purchase Date', one.purchaseDate || ''],
            ['Price (INR)', Number(one.price) || 0],
            ['Status', one.status || 'available'],
            ['Currently Assigned To', one.assignedTo || 'Unassigned'],
            ['Report Generated', xStamp(new Date().toISOString())],
            [''],
            ['--- Assignment History ---'],
            ['Action', 'Employee', 'Date & Time', 'Remarks'],
            ...hist.map((h) => (h.action === 'assigned' ? ['ASSIGNED', h.to || '', xStamp(h.at), ''] : ['RETURNED', h.from || '', xStamp(h.at), h.note || ''])),
            ...(hist.length ? [] : [['No history yet', '', '', '']]),
          ];
          return { fileName: `Asset_Report_${one.name.replace(/\s+/g, '_')}_${today}`, sheets: [{ name: 'Asset', rows, cols: [24, 26, 22, 30] }] };
        }
        const rows = lists[view];
        const body = rows.map((a) => [
          a.assetId || '',
          a.name || '',
          a.description || '',
          a.location || '',
          a.category || '',
          a.assetType || '',
          a.purchaseDate || '',
          a.warrantyStatus || '',
          a.warrantyExpiry || '',
          a.condition || '',
          a.assignedToEmpNo || '',
          a.assignedTo || nameFor(a.assignedToEmpNo) || '',
          a.assignmentDate || '',
          a.serial || '',
          Number(a.price) || 0,
          status(a),
          a.assignedToEmpNo ? (a.acknowledged ? 'Yes' : 'No') : '',
        ]);
        const sub = `Generated: ${xStamp(new Date().toISOString())}   ·   ${rows.length} asset${rows.length !== 1 ? 's' : ''}`;
        return {
          fileName: `Asset_Report_${FILE_TAG[view]}_${today}`,
          sheets: [{ name: 'Assets', rows: [...letterheadRows(access.tenant, 'Asset Register', sub), ASSET_HEAD, ...body], cols: ASSET_COLS }],
        };
      }}>
      <ChoiceCard
        title="Report"
        value={view}
        onChange={setView}
        options={[
          { key: 'all', label: 'Complete register', count: lists.all.length },
          { key: 'assigned', label: 'Assigned', count: lists.assigned.length },
          { key: 'ack', label: 'Waiting for acknowledgement', count: lists.ack.length },
          { key: 'warranty', label: 'Warranty ending in 60 days', count: lists.warranty.length },
          { key: 'one', label: 'One asset’s history' },
        ]}
      />
      {view === 'one' ? <PickedRow title={one?.name} sub={one ? [one.assetId, one.serial].filter(Boolean).join(' · ') : null} placeholder="Choose an asset" onChange={() => setPicking(true)} /> : null}
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Choose an asset">
        <View style={styles.gap}>
          <TextField placeholder="Search name, asset ID, serial or person" value={q} onChangeText={setQ} autoCorrect={false} />
          {matches.length ? (
            <ListCard>
              {matches.map((a) => (
                <ListRow
                  key={a.id}
                  title={a.name}
                  subtitle={[a.assetId, a.assignedTo || 'In store'].filter(Boolean).join(' · ')}
                  onPress={() => {
                    setOneId(a.id);
                    setPicking(false);
                  }}
                />
              ))}
            </ListCard>
          ) : (
            <Text variant="caption" muted>
              No asset matches.
            </Text>
          )}
        </View>
      </Sheet>
    </ExportShell>
  );
}

// ── Service desk ─────────────────────────────────────────────────────────────
export function ServiceDeskExport({ def }: { def: ExportDef }) {
  const { ready } = useExcelAccess();
  const today = useTodayIst();
  const desk = useDesk({ enabled: ready });
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const items = desk.items;
  const cats = [...new Set(items.map(categoryLabelFor).filter(Boolean))].sort();
  const statuses = [...new Set(items.map((t) => String(t.status || '')).filter(Boolean))];
  const visible = items.filter((t) => (!status || t.status === status) && (!category || categoryLabelFor(t).toLowerCase() === category.toLowerCase()));
  return (
    <ExportShell
      def={def}
      ready={ready && !desk.tickets.isPending}
      intro="The tickets and requests you see on the Service desk: reference, category, subject, who raised it, department, project code, date, status and who it is assigned to."
      count={visible.length}
      countNoun={['request', 'requests']}
      disabled={!visible.length ? 'Nothing matches.' : false}
      build={() => ({
        fileName: `service_desk_${today}`,
        sheets: [
          {
            name: 'Service Desk',
            rows: objectsToRows(
              visible.map((t) => ({
                ID: refOf(t),
                Category: categoryLabelFor(t),
                Subject: t.subject || (t.category === 'asset' ? `${t.quantity}x ${t.assetType}` : t.category === 'admin_request' ? `${t.quantity}x ${t.itemType}` : ''),
                From: raiserOf(t) === 'Someone' ? '' : raiserOf(t),
                Department: deptOf(t),
                KekaCode: t.kekaCode || '',
                Date: t.date || '',
                Status: STATUS_WORDS[String(t.status || '')] || String(t.status || ''),
                AssignedTo: t.assignedTo || '',
              })),
              ['ID', 'Category', 'Subject', 'From', 'Department', 'KekaCode', 'Date', 'Status', 'AssignedTo'],
            ),
            cols: [12, 18, 36, 20, 16, 26, 12, 14, 18],
          },
        ],
      })}>
      <View style={styles.gap}>
        <SelectField label="Category" value={category} onChange={setCategory} options={[{ value: '', label: 'Every category' }, ...cats.map((c) => ({ value: c, label: c }))]} />
        <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Every status' }, ...statuses.map((x) => ({ value: x, label: STATUS_WORDS[x] || x }))]} />
      </View>
    </ExportShell>
  );
}

// ── Device monitoring ────────────────────────────────────────────────────────
type Dept = { id: string; name: string };
const deptLabel = (v: string, depts: readonly Dept[]) => depts.find((d) => d.id === v)?.name || v || '';

export function DevicesExport({ def }: { def: ExportDef }) {
  const { ready } = useExcelAccess();
  const today = useTodayIst();
  const roster = useTm360Roster(ready);
  const depts = useApiList<Dept>('/departments', { enabled: ready });
  const [filter, setFilter] = useState<'all' | 'linked' | 'unlinked' | 'paired'>('all');
  const all = roster.data?.employees ?? [];
  const pick = (f: typeof filter) =>
    all.filter((e) => (f === 'all' ? true : f === 'linked' ? e.matched : f === 'unlinked' ? !e.matched : (e.devices || []).some((x) => x.status === 'ACTIVE')));
  const rows = pick(filter);
  return (
    <ExportShell
      def={def}
      ready={ready && !roster.isPending}
      intro="Everyone you can see in Device monitoring: department, job title, employee number, reporting manager, DASH sign-up, TM360 link and status, paired devices and when they were last seen."
      count={rows.length}
      countNoun={['person', 'people']}
      disabled={roster.isError ? 'Device monitoring could not be loaded.' : !rows.length ? 'No one matches.' : false}
      build={() => ({
        fileName: `DASH_Device_Monitoring_${today}`,
        sheets: [
          {
            name: 'Device Monitoring',
            rows: objectsToRows(
              rows.map((e: Tm360Employee) => {
                const active = (e.devices || []).filter((x) => x.status === 'ACTIVE');
                const last = active.map((x) => x.lastSeenAt).filter(Boolean).sort().pop();
                return {
                  Employee: e.name || '',
                  Email: e.email,
                  Department: deptLabel(e.dept, depts.data ?? []),
                  'Job title': e.jobTitle || '',
                  'Employee no.': e.employeeNumber || '',
                  'Reporting manager': e.reportingManager || '',
                  'DASH signup': e.pendingSignup ? 'pending' : 'done',
                  'Linked in TM360': e.matched ? 'yes' : 'no',
                  'TM360 status': e.tm360?.status || '',
                  'Devices paired': active.length,
                  Devices: (e.devices || []).map((x) => `${x.hostname || x.id} (${x.status})`).join('; '),
                  'Last seen': last ? xStamp(last) : '',
                };
              }),
            ),
          },
        ],
      })}>
      <ChoiceCard
        title="Who"
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'all', label: 'Everyone', count: pick('all').length },
          { key: 'linked', label: 'Linked', count: pick('linked').length },
          { key: 'unlinked', label: 'Not linked', count: pick('unlinked').length },
          { key: 'paired', label: 'With a device', count: pick('paired').length },
        ]}
      />
    </ExportShell>
  );
}

// ── TM360 for one person ─────────────────────────────────────────────────────
export function Tm360Export({ def }: { def: ExportDef }) {
  const { ready } = useExcelAccess();
  const today = useTodayIst();
  const roster = useTm360Roster(ready);
  const depts = useApiList<Dept>('/departments', { enabled: ready });
  const [email, setEmail] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [range, setRange] = useState<Range>({ from: addDaysYmd(today, -7), to: today });
  const emp = (roster.data?.employees ?? []).find((e) => e.email === email) ?? null;
  const on = ready && !!emp && emp.matched;
  const sum = useTm360Employee('summary', emp?.email ?? '', range.from, range.to, on);
  const act = useTm360Employee('activity', emp?.email ?? '', range.from, range.to, on);
  const res = useTm360Employee('restrictions', emp?.email ?? '', range.from, range.to, on);
  const loc = useTm360Employee('location', emp?.email ?? '', range.from, range.to, on);
  const loading = on && (sum.isPending || act.isPending || res.isPending || loc.isPending);
  const failed = [sum, act, res, loc].find((x) => x.isError);
  const linked = (roster.data?.employees ?? []).filter((e) => e.matched);
  const needle = q.trim().toLowerCase();
  const matches = linked.filter((e) => !needle || [e.name, e.email, e.employeeNumber].some((v) => String(v || '').toLowerCase().includes(needle))).slice(0, 80);
  return (
    <ExportShell
      def={def}
      ready={ready && !roster.isPending}
      intro="For one person and the dates you choose: active and idle time, top apps, sites and categories, the daily score, every activity row, blocked or flagged items and device locations."
      sensitive="This is monitoring data about one person. Share it only for the reason it was collected."
      count={act.data ? act.data.activity.length : null}
      countNoun={['activity row', 'activity rows']}
      disabled={!emp ? 'Choose a person first.' : loading ? 'Loading their TM360 data…' : failed ? (failed.error instanceof Error ? failed.error.message : 'TM360 could not be reached.') : false}
      build={() => {
        if (!emp) return null;
        const sheets: { name: string; rows: Cell[][] }[] = [];
        const add = (name: string, rows: Record<string, Cell>[]) => {
          if (rows.length) sheets.push({ name, rows: objectsToRows(rows) });
        };
        add('Employee', [{ Name: emp.name, Email: emp.email, Department: deptLabel(emp.dept, depts.data ?? []), 'Job title': emp.jobTitle || '', From: range.from, To: range.to, Exported: xStamp(new Date().toISOString()) }]);
        const s = sum.data;
        if (s) {
          add('Summary', [
            {
              'Active time': tmDur(s.activeSeconds),
              'Idle time': tmDur(s.idleSeconds),
              'Active seconds': s.activeSeconds,
              'Idle seconds': s.idleSeconds,
              'Rows sampled': s.sampledRows,
              'Sample capped': s.sampleCapped ? 'YES - totals cover only these rows' : 'no',
            },
          ]);
          add('Top applications', s.topApps.map((x) => ({ Application: x.name, Time: tmDur(x.seconds), Seconds: x.seconds })));
          add('Top sites', s.topDomains.map((x) => ({ Site: x.name, Time: tmDur(x.seconds), Seconds: x.seconds })));
          add('By category', s.byCategory.map((x) => ({ Category: x.name, Time: tmDur(x.seconds), Seconds: x.seconds })));
          add(
            'Daily score',
            s.dailyScores.map((d) => ({
              Date: xDate(d.date),
              Score: d.score,
              'Productive (min)': d.productiveMinutes,
              'Neutral (min)': d.neutralMinutes,
              'Unproductive (min)': d.unproductiveMinutes,
              'Idle (min)': d.idleMinutes,
              'Active (min)': d.activeMinutes,
            })),
          );
        }
        add('Activity', (act.data?.activity ?? []).map((r) => ({ When: xStamp(r.occurredAt), Application: r.appName, 'Window / site': r.domain || r.windowTitle || '', URL: r.url || '', 'Duration (s)': r.durationSeconds, Idle: r.isIdle ? 'yes' : 'no', Category: r.category || '', Device: r.deviceId })));
        add('Blocked or flagged', (res.data?.events ?? []).map((e) => ({ When: xStamp(e.occurredAt), Kind: e.kind, Matched: e.matched, Rule: e.pattern, Outcome: e.outcome })));
        add(
          'Location',
          (loc.data?.locations ?? []).map((l) => ({
            Device: l.hostname || l.deviceId,
            Status: l.status,
            Address: l.address || '',
            Latitude: l.latitude,
            Longitude: l.longitude,
            'Accuracy (m)': l.accuracyMetres,
            Source: l.source,
            'Reported at': xStamp(l.reportedAt),
            'Last seen': xStamp(l.lastSeenAt),
          })),
        );
        const safe = String(emp.name || emp.email).replace(/[^\w.-]+/g, '_');
        return { fileName: `TM360_${safe}_${range.from}_to_${range.to}`, sheets };
      }}>
      <PickedRow title={emp?.name} sub={emp ? emp.email : null} placeholder="Choose a person" onChange={() => setPicking(true)} />
      <RangeCard value={range} onChange={setRange} today={today} presets={['7', '30', 'month', 'last']} />
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Whose activity" subtitle="People linked in TM360">
        <View style={styles.gap}>
          <TextField placeholder="Search name, email or employee number" value={q} onChangeText={setQ} autoCorrect={false} />
          {matches.length ? (
            <ListCard>
              {matches.map((e) => (
                <ListRow
                  key={e.email}
                  title={e.name || e.email}
                  subtitle={[e.jobTitle, deptLabel(e.dept, depts.data ?? [])].filter(Boolean).join(' · ')}
                  onPress={() => {
                    setEmail(e.email);
                    setPicking(false);
                  }}
                />
              ))}
            </ListCard>
          ) : (
            <Text variant="caption" muted>
              No linked person matches.
            </Text>
          )}
        </View>
      </Sheet>
    </ExportShell>
  );
}

const styles = themedStyles(() => ({ gap: { gap: space.sm } }));
