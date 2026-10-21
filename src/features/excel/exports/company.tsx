// Excel downloads for the company and for me:
//   Activity audit   AuditView doExport('excel') (dash.html:15082): POST /audit_log/export with the date
//                    filter (or everything), the website's 16 columns under the letterhead. The server
//                    records the download in the audit itself.
//   A chat           Meets exportChat (:10104): GET /meets/conversations/:id/export, one "Messages" sheet.
//                    The rows are already clipped to my membership and made formula-safe by the server.

import { MessagesSquare, Search } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { isApiError } from '@/api/client';
import { chatApi, useConversations } from '@/api/chat';
import { exportAudit } from '@/api/company';
import { useTodayIst } from '@/features/attendance/use-now';
import type { ExportDef } from '@/features/excel/catalog';
import { ExportShell, PickedRow, type Range, RangeCard } from '@/features/excel/export-shell';
import { xDate, xStamp, xTime } from '@/features/excel/format';
import { useExcelAccess } from '@/features/excel/gate';
import { ROLE_LABEL } from '@/lib/access';
import { letterheadRows } from '@/lib/xlsx';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { Banner, ListCard, ListRow, Sheet, Text, TextField, toast } from '@/ui';

const AUDIT_COLS = ['Date', 'Time', 'Actor Name', 'Actor Role', 'Affected User', 'Employee ID', 'Module', 'Action', 'Description', 'Entity Type', 'Entity ID', 'Previous Value', 'New Value', 'Status', 'IP Address', 'User Agent'];
const val = (v: unknown) => (v && typeof v === 'object' ? JSON.stringify(v) : v === null || v === undefined ? '' : String(v));

export function AuditExport({ def }: { def: ExportDef }) {
  const { ready, user, access } = useExcelAccess();
  const today = useTodayIst();
  const [range, setRange] = useState<Range>({ from: today.slice(0, 7) + '-01', to: today });
  const everything = !range.from && !range.to;
  return (
    <ExportShell
      def={def}
      ready={ready}
      intro="Every recorded activity in the dates (or everything): when, who did it and their role, who it affected, the module, the action, before and after values, status, IP address and device."
      sensitive="The audit shows what each person did, with before-and-after values. Your download is itself recorded in the audit."
      disabled={!everything && (!range.from || !range.to) ? 'Choose both dates, or Everything.' : false}
      build={async () => {
        if (!user) return null;
        const rows = await exportAudit(user.id, everything ? {} : { dateFrom: range.from, dateTo: range.to });
        if (!rows.length) {
          toast.show('Nothing was recorded in these dates.', 'info');
          return null;
        }
        const body = rows.map((r) => [
          r.createdAt ? xDate(r.createdAt) : '',
          r.createdAt ? xTime(r.createdAt) : '',
          r.actorName || '',
          ROLE_LABEL[r.actorRole || ''] || r.actorRole || '',
          r.affectedUserName || '',
          r.affectedUserEmpId || '',
          r.module || '',
          r.action || '',
          r.description || '',
          r.entityType || '',
          r.entityId || '',
          val(r.previousData),
          val(r.newData),
          r.status || '',
          r.ipAddress || '',
          r.userAgent || '',
        ]);
        return {
          fileName: `User_Activity_Audit_${today}`,
          sheets: [{ name: 'Audit Log', rows: [...letterheadRows(access.tenant, 'User Activity Audit Report', `Generated: ${xStamp(new Date().toISOString())}`), AUDIT_COLS, ...body], cols: [12, 10, 20, 14, 20, 12, 14, 12, 50, 14, 20, 40, 40, 10, 16, 30] }],
        };
      }}>
      <RangeCard value={range} onChange={setRange} today={today} presets={['month', 'last', '7', '30', 'all']} />
    </ExportShell>
  );
}

export function ChatExport({ def }: { def: ExportDef }) {
  const { ready, user } = useExcelAccess();
  const today = useTodayIst();
  const convs = useConversations(ready);
  const [id, setId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const titleOf = (c: { type: string; name?: string | null; others?: { name?: string | null }[] }) =>
    c.type === 'group' ? c.name || 'Group' : (c.others ?? []).map((o) => o.name).filter(Boolean).join(', ') || c.name || 'Chat';
  const list = convs.data ?? [];
  const chosen = list.find((c) => c.id === id) ?? null;
  const needle = q.trim().toLowerCase();
  const matches = list.filter((c) => !needle || titleOf(c).toLowerCase().includes(needle)).slice(0, 80);
  return (
    <ExportShell
      def={def}
      ready={ready && !convs.isPending}
      intro="Every message of one conversation you are in, oldest first: when (India time), who sent it, the message and any file name. Only the part you were a member for is included."
      disabled={!chosen ? 'Choose a conversation first.' : false}
      build={async () => {
        if (!chosen) return null;
        const r = await chatApi.exportChat(chosen.id);
        if (isApiError(r)) throw new Error(r.error);
        const rows = Array.isArray(r.rows) ? r.rows : [];
        if (r.truncated) toast.show('This chat is very long, so the oldest messages are not included.', 'info');
        const name = String(r.conversation?.name || titleOf(chosen)).replace(/[^\w.-]+/g, '_');
        return {
          fileName: `DASH_Meets_${name}_${today}`,
          sheets: [{ name: 'Messages', rows: [['Timestamp', 'Sender', 'Message', 'File'], ...rows.map((x) => [x.timestamp, x.sender, x.message, x.attachment ?? ''])], cols: [20, 22, 70, 28] }],
        };
      }}>
      <PickedRow icon={MessagesSquare} title={chosen ? titleOf(chosen) : null} sub={chosen ? (chosen.type === 'group' ? `Group · ${chosen.memberCount} people` : 'Direct chat') : null} placeholder="Choose a conversation" onChange={() => setPicking(true)} />
      {user && !list.length ? <Banner tone="info" message="You are not in any conversation yet." /> : null}
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Choose a conversation">
        <View style={styles.gap}>
          <TextField placeholder="Search" value={q} onChangeText={setQ} left={<Search size={18} />} autoCorrect={false} />
          {matches.length ? (
            <ListCard>
              {matches.map((c) => (
                <ListRow
                  key={c.id}
                  title={titleOf(c)}
                  subtitle={c.type === 'group' ? `Group · ${c.memberCount} people` : 'Direct chat'}
                  onPress={() => {
                    setId(c.id);
                    setPicking(false);
                  }}
                />
              ))}
            </ListCard>
          ) : (
            <Text variant="caption" muted>
              No conversation matches.
            </Text>
          )}
        </View>
      </Sheet>
    </ExportShell>
  );
}

const styles = themedStyles(() => ({ gap: { gap: space.sm } }));
