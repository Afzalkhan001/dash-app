// Pictures for posts, resized on the phone the way the website's form resizes them (dash.html
// AnnouncementForm): a pop-up's poster fits inside 1200 × 1200 (JPEG 0.85), a Home banner inside
// 1600 × 400 (JPEG 0.85, the wide strip — scaled to fit, never cropped). An image post uses
// lib/files pickImage (1600 px, the web's 1600 cap). Expo Go only: expo-image-picker +
// expo-image-manipulator, both already in the app.

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { FileError, type PickedFile } from '@/lib/files';

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'image.jpg';
}

async function pickFitted(maxW: number, maxH: number): Promise<PickedFile | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0]!;
  const w = asset.width || 0;
  const h = asset.height || 0;
  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  const scale = w > 0 && h > 0 ? Math.min(maxW / w, maxH / h, 1) : 1;
  if (scale < 1) ctx.resize({ width: Math.round(w * scale), height: Math.round(h * scale) });
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new FileError('Could not read that picture.');
  const base = (asset.fileName || `image-${Date.now()}`).replace(/\.\w+$/, '');
  return {
    name: safeName(`${base}.jpg`),
    type: 'image/jpeg',
    size: Math.round((saved.base64.length * 3) / 4),
    dataUrl: `data:image/jpeg;base64,${saved.base64}`,
    uri: saved.uri,
  };
}

/** A pop-up's picture: poster-shaped, up to 1200 × 1200. */
export const pickPopupImage = () => pickFitted(1200, 1200);

/** A Home banner: a wide strip, up to 1600 × 400. */
export const pickBannerImage = () => pickFitted(1600, 400);
