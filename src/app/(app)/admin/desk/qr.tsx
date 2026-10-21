// Check-in link (web: VisitorQrPage, dash.html:35767; GET /visitors/qr, POST /visitors/qr/regenerate).
// The reception QR code points at the public page DASH_URL + path (/visit/<company>/<token>): a visitor
// opens it on their own phone — no app, no account — and checks themselves in. Wave 1 shares the LINK
// (drawing the QR needs an encoder, PLAN D4); the printable poster stays on the website for now.
//   Share link       the share sheet (WhatsApp, email, …) with a short welcome line
//   Open the page    the check-in page in the browser, to try it
//   Make a new link  desk roles only (dash.html:35771 canRegen): a ConfirmSheet with a red notice and a
//                    swipe — every printed poster, saved QR image and running kiosk stops working at once.

import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, Link2, QrCode, RefreshCcw, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { isDemoSession } from '@/api/client';
import { checkInUrl, useDeskQr, useRegenerateQr } from '@/api/desk';
import { canRegenerateQr, canRunDesk, canSeeDeskQr } from '@/features/desk/access';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActionRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  haptic,
  NavHeader,
  Screen,
  SectionHeader,
  Skeleton,
  SummaryCard,
  SummaryHero,
  Text,
  toast,
} from '@/ui';

export default function CheckInLinkScreen() {
  const access = useAccess();
  const allowed = canRunDesk(access) && canSeeDeskQr(access);
  const qr = useDeskQr(allowed);
  const regen = useRegenerateQr();
  const [confirm, setConfirm] = useState(false);

  if (!allowed) return <Redirect href="/" />;

  const data = qr.data;
  const url = checkInUrl(data?.path);
  const company = data?.companyName || 'our office';

  const share = async () => {
    if (!url) return;
    try {
      await Share.share({ message: `Welcome to ${company}. Check in for your visit here: ${url}`, url, title: 'Visitor check-in' });
    } catch {
      toast.show('Sharing isn’t available here. Copy the link above.', 'info');
    }
  };
  const openPage = () => {
    if (!url) return;
    // The demo's link carries a sample token: the real DASH site would only say "not valid".
    if (isDemoSession()) {
      toast.show('This is a sample link in the demo, so it has no check-in page to open.', 'info');
      return;
    }
    void WebBrowser.openBrowserAsync(url).catch(() => toast.show('Couldn’t open the page.', 'danger'));
  };
  const makeNew = () => {
    if (regen.isPending) return;
    regen.mutate(undefined, {
      onSuccess: () => {
        haptic.success();
        setConfirm(false);
        toast.show('New check-in link made. Share it and replace the posters.', 'success');
      },
      onError: (e) => {
        haptic.error();
        Alert.alert('Couldn’t make a new link', e.message || 'Please try again.');
      },
    });
  };

  return (
    <Screen header={<NavHeader title="Check-in link" />} onRefresh={() => qr.refetch()}>
      <SummaryHero
        icon={QrCode}
        module="visitors"
        label="Visitor check-in"
        figure={
          data ? (
            <Text variant="title" numberOfLines={2}>
              {company}
            </Text>
          ) : qr.isError ? null : (
            <Skeleton width={180} height={32} radius={radius.sm} />
          )
        }
        sub="Visitors open it on their own phone to check in. No app needed."
      />

      {data ? (
        <>
          <Card style={styles.linkCard}>
            <View style={styles.linkHead}>
              <Link2 size={18} color={palette.textMuted} strokeWidth={1.8} />
              <Text variant="label" muted>
                The link
              </Text>
            </View>
            <Text variant="label" selectable style={styles.link} accessibilityLabel={`Check-in link: ${url}`}>
              {url}
            </Text>
            <ActionRow>
              <Button variant="ghost" title="Open page" icon={<ExternalLink />} onPress={openPage} />
              <Button variant="primary" title="Share link" icon={<Share2 />} onPress={share} />
            </ActionRow>
          </Card>

          <SummaryCard
            title="How visitors use it"
            rows={[
              { label: 'Step 1', value: 'Scan the poster or open the link' },
              { label: 'Step 2', value: 'Choose who they’re meeting' },
              { label: 'Step 3', value: 'Take a quick photo and wait to be let in' },
            ]}
          />
          <Banner tone="info" message="The QR code poster to print is on the DASH website for now. It points at this same link." />

          {canRegenerateQr(access.user) ? (
            <View style={styles.danger}>
              <SectionHeader title="If the link leaks" />
              <Button variant="danger" title="Make a new link" icon={<RefreshCcw />} onPress={() => setConfirm(true)} />
              <Text variant="caption" muted>
                Every printed poster stops working at once.
              </Text>
            </View>
          ) : null}
        </>
      ) : qr.isError ? (
        <ErrorState message={qr.error?.message ?? ''} onRetry={() => void qr.refetch()} />
      ) : null}

      <ConfirmSheet
        visible={confirm}
        onClose={() => {
          if (!regen.isPending) setConfirm(false);
        }}
        title="Make a new check-in link?"
        from={{ title: 'Old link', subtitle: 'Stops working now', icon: Link2 }}
        to={{ title: 'New link', subtitle: 'Works from now', icon: QrCode, module: 'visitors' }}
        confirmLabel="Swipe to make a new link"
        onConfirm={makeNew}
        loading={regen.isPending}
        note="Only do this if the link has leaked or been misused.">
        <Banner
          tone="danger"
          title="Every printed poster stops working"
          message="So do saved QR images and any kiosk that is running. Visitors who scan an old poster are told the link isn’t valid. Nobody is messaged."
        />
      </ConfirmSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  linkCard: { gap: space.sm },
  linkHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  link: { backgroundColor: palette.surfaceSunken, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs },
  danger: { gap: space.sm },
}));
