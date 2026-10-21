// Upload history — the "Upload History" tabs of the employee and asset bulk uploads (dash.html:6310
// dlBatch, :20314 dlAssetBatch, :20915). Each past upload can be downloaded again as the sheet it was,
// with the website's columns and file name.

import { Redirect } from 'expo-router';
import { FileDown, History } from 'lucide-react-native';
import { useState } from 'react';

import { type UploadBatch, useUploadBatches } from '@/features/excel/api';
import { useExcelAccess } from '@/features/excel/gate';
import { ASSET_COL_WIDTHS, ASSET_COLS, KEKA_COLS } from '@/features/excel/parse';
import { stampLabel } from '@/lib/dates';
import { plural } from '@/lib/format';
import { type Cell, shareXlsx } from '@/lib/xlsx';
import { ActivityList, ActivityRow, EmptyState, ErrorState, NavHeader, Screen, Segmented, SkeletonList, toast } from '@/ui';

type Kind = 'employees' | 'assets';
const s = (v: unknown): Cell => (v === null || v === undefined ? '' : typeof v === 'number' ? v : String(v));

function batchSheet(kind: Kind, b: UploadBatch) {
  if (kind === 'employees') {
    return [
      {
        name: 'Employees',
        cols: KEKA_COLS.map(() => 20),
        rows: [
          KEKA_COLS,
          ...b.rows.map((r) => [s(r.employeeNumber || r.kekaCode), s(r.name), s(r.email), s(r.gender), s(r.mobile || r.phone), s(r.location), s(r.deptName || r.dept), s(r.jobTitle), s(r.reportingManager), s(r.dateJoined), s(r.dob), s(r.bloodGroup)]),
        ],
      },
    ];
  }
  return [
    {
      name: 'Assets',
      cols: ASSET_COL_WIDTHS,
      rows: [
        ASSET_COLS,
        ...b.rows.map((r) => [
          s(r.assetId),
          s(r.name),
          s(r.description),
          s(r.location),
          s(r.category),
          s(r.assetType),
          s(r.purchaseDate),
          s(r.warrantyStatus),
          s(r.warrantyExpiry),
          s(r.condition),
          s(r.assignedToEmpNo),
          s(r.assignmentDate),
          s(r.serial),
          Number(r.price) || 0,
        ]),
      ],
    },
  ];
}

export default function UploadHistory() {
  const { gates, ready } = useExcelAccess();
  const kinds: Kind[] = [...(gates.imports.employees ? (['employees'] as const) : []), ...(gates.imports.assets ? (['assets'] as const) : [])];
  const [pick, setPick] = useState<Kind | null>(null);
  const kind: Kind = pick && kinds.includes(pick) ? pick : (kinds[0] ?? 'employees');
  const q = useUploadBatches(kind, ready && kinds.length > 0);
  const [busy, setBusy] = useState<string | null>(null);

  if (ready && !kinds.length) return <Redirect href="/" />;

  const download = async (b: UploadBatch) => {
    setBusy(b.id);
    try {
      await shareXlsx(b.fileName || (kind === 'employees' ? 'Employee_Batch' : 'Asset_Batch'), batchSheet(kind, b));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The file could not be shared.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen header={<NavHeader title="Upload history" />} onRefresh={() => q.refetch()}>
      {kinds.length > 1 ? (
        <Segmented
          options={[
            { key: 'employees', label: 'Employees' },
            { key: 'assets', label: 'Assets' },
          ]}
          value={kind}
          onChange={(k) => setPick(k as Kind)}
        />
      ) : null}
      {!ready || q.isPending ? (
        <SkeletonList rows={4} />
      ) : q.isError ? (
        <ErrorState message={q.error instanceof Error ? q.error.message : 'Upload history could not be loaded.'} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title="No uploads yet" message={kind === 'employees' ? 'Employee sheets you upload appear here.' : 'Asset sheets you upload appear here.'} icon={<History />} />
      ) : (
        <ActivityList title={kind === 'employees' ? 'Employee uploads' : 'Asset uploads'} overline="Tap to download again">
          {q.data.map((b) => (
            <ActivityRow
              key={b.id}
              title={b.fileName || 'Upload'}
              subtitle={stampLabel(b.uploadedAt)}
              value={plural(b.count, 'row')}
              module={kind === 'employees' ? 'people' : 'support'}
              icon={FileDown}
              disabled={busy === b.id}
              onPress={() => download(b)}
              accessibilityHint="Downloads this upload as an Excel file"
            />
          ))}
        </ActivityList>
      )}
    </Screen>
  );
}
