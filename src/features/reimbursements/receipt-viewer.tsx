// "View bill" (web: PettyCashReceiptLink with base /reimbursements/). The server returns the bill
// as a data URL; a photo is shown right here (with Share), a PDF is written to the cache and handed
// to the share sheet so it opens in the phone's PDF viewer. Deliberately NOT a TanStack query: the
// query cache is persisted to disk, and a multi-megabyte receipt has no business living there.

import { Image } from 'expo-image';
import { Receipt, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, useWindowDimensions } from 'react-native';

import { fetchReceipt } from '@/api/reimbursements';
import { saveDataUrl, shareFile } from '@/lib/files';
import { palette, radius } from '@/theme/tokens';
import { AccountRow, Button, haptic, Sheet } from '@/ui';

type Loaded = { fileData: string; fileName: string; mime: string };

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic' };
function withExt(name: string, mime: string) {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  return `${name || 'receipt'}.${EXT[mime] || 'bin'}`;
}

async function shareLoaded(r: Loaded) {
  const uri = await saveDataUrl(r.fileData, withExt(r.fileName, r.mime));
  await shareFile(uri, r.mime, 'Bill');
}

/**
 * "View bill": a ghost button (default), or — `variant="row"` — a frosted AccountRow ("Bill · The photo
 * or PDF you sent  [View]") for detail screens.
 */
export function ReceiptButton({
  id,
  label = 'View bill',
  size = 'md',
  variant = 'button',
}: {
  id: string;
  label?: string;
  size?: 'md' | 'lg';
  variant?: 'button' | 'row';
}) {
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<Loaded | null>(null);
  const [sharing, setSharing] = useState(false);
  const { height } = useWindowDimensions();

  const open = async () => {
    setLoading(true);
    try {
      const r = await fetchReceipt(id);
      if (r.mime === 'application/pdf') await shareLoaded(r);
      else setImage(r);
    } catch (e: any) {
      haptic.error();
      Alert.alert('Couldn’t open the bill', e?.message || 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  const share = async () => {
    if (!image) return;
    setSharing(true);
    try {
      await shareLoaded(image);
    } catch (e: any) {
      Alert.alert('Couldn’t share', e?.message || 'Try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      {variant === 'row' ? (
        <AccountRow
          icon={Receipt}
          module="expenses"
          title="Bill"
          sub={loading ? 'Opening…' : 'Photo or PDF of the bill'}
          actionLabel="View"
          accessibilityLabel={label}
          hint="Opens the bill"
          onPress={loading ? undefined : () => void open()}
        />
      ) : (
        <Button title={label} variant="ghost" size={size} loading={loading} onPress={open} icon={<Receipt />} />
      )}
      <Sheet
        visible={!!image}
        onClose={() => setImage(null)}
        title="Bill"
        subtitle={image?.fileName}
        // The same button as every bill / receipt preview in the app (Inbox, Petty cash).
        footer={<Button title="Share or save" variant="primary" loading={sharing} onPress={share} icon={<Share2 />} />}>
        {image ? (
          <Image
            source={{ uri: image.fileData }}
            style={{ width: '100%', height: Math.round(height * 0.55), borderRadius: radius.md, backgroundColor: palette.surfaceMuted }}
            contentFit="contain"
            transition={200}
            accessibilityLabel={`Bill ${image.fileName || ''}`.trim()}
          />
        ) : null}
      </Sheet>
    </>
  );
}
