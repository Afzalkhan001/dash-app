// A guest's visitor pass with a real QR (the desk's Invites). The QR holds only the 6-digit code
// (features/deskqr/pass.ts), so reception — or the kiosk — scans it instead of typing it, and the code is
// still checked by the server as usual. "Share pass" makes a PDF on the phone and opens the share sheet:
// the desk picks who to send it to, so nobody is messaged by the app. Only active invites have a pass
// (the server's rule for its own pass image, visitors.js:718).

import { Printer, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { Invite } from '@/api/visitors';
import { passPayload } from '@/features/deskqr/pass';
import { passHtml, printNow, printOrShare } from '@/features/deskqr/print';
import { QrImage } from '@/features/deskqr/qr';
import { dateLabel, timeWindow } from '@/features/visitors/format';
import { guestName } from '@/features/visitors/invites';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { ActionRow, Button, Sheet, SummaryCard, Text, toast } from '@/ui';

export function PassSheet({ invite, company, host, today, onClose }: { invite: Invite | null; company: string; host: string; today: string; onClose: () => void }) {
  const [busy, setBusy] = useState<'' | 'share' | 'print'>('');
  const active = invite?.status === 'active';
  const code = String(invite?.code ?? '').replace(/\D/g, '');
  const when = invite ? [dateLabel(invite.visitDate), timeWindow(invite.timeFrom, invite.timeTo)].filter(Boolean).join(', ') : '';

  const run = async (kind: 'share' | 'print') => {
    if (!invite || busy) return;
    setBusy(kind);
    try {
      const html = passHtml({ company, guest: guestName(invite), host, when, purpose: invite.purpose || '', code });
      if (kind === 'share') await printOrShare(html, 'Visitor pass');
      else await printNow(html);
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : 'Couldn’t make the pass. Try again.', 'danger');
    } finally {
      setBusy('');
    }
  };

  return (
    <Sheet visible={!!invite} onClose={onClose} title="Visitor pass" subtitle={invite ? guestName(invite) : undefined} floatingClose>
      {invite && active && code.length === 6 ? (
        <View style={styles.body}>
          <QrImage value={passPayload(code)} size={200} label={`Visitor pass QR for ${guestName(invite)}, code ${code}`} />
          <Text variant="caption" muted align="center">
            Check-in code
          </Text>
          <Text variant="title" tabular align="center" style={styles.code} accessibilityLabel={`Code ${code.split('').join(' ')}`}>
            {code.split('').join(' ')}
          </Text>
          <SummaryCard
            rows={[
              { label: 'Guest', value: guestName(invite) },
              { label: 'When', value: dateLabel(invite.visitDate, today) + (timeWindow(invite.timeFrom, invite.timeTo) ? `, ${timeWindow(invite.timeFrom, invite.timeTo)}` : '') },
              { label: 'Meeting', value: host || '—' },
            ]}
          />
          <Text variant="label" muted align="center">
            Reception scans this QR, or the guest types the code at the kiosk. It works once, on the day.
          </Text>
          <ActionRow>
            <Button variant="ghost" title="Print" icon={<Printer />} loading={busy === 'print'} disabled={!!busy} onPress={() => void run('print')} />
            <Button title="Share pass" icon={<Share2 />} loading={busy === 'share'} disabled={!!busy} onPress={() => void run('share')} />
          </ActionRow>
          <Text variant="caption" muted align="center">
            Sharing opens your phone’s share sheet. You choose who gets it — DASH sends nothing.
          </Text>
        </View>
      ) : invite ? (
        <Text variant="body" muted>
          {`This invitation is ${String(invite.status || 'closed')}, so it has no pass.`}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  body: { gap: space.sm, alignItems: 'stretch' },
  code: { letterSpacing: 2, color: palette.text, backgroundColor: palette.surfaceMuted, borderRadius: radius.md, paddingVertical: space.xs },
}));
