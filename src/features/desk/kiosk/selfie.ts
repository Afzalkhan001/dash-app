// The kiosk's selfie (web: VisitSelfie + visitShrink, dash.html:35218-35270). Expo Go has no live camera
// preview without expo-camera (not installed, PLAN D4), so the phone's own camera app opens on the FRONT
// camera; "Choose a photo" is the web's file-input fallback. Either way the photo is shrunk exactly as the
// web does it: at most 640 px wide, JPEG quality 0.7, stepping down by 0.1 (not below 0.3) until it is
// under 550 KB — the server refuses anything over 600 KB (visitors.js:60) and WhatsApp rejects a big
// header image. Nothing is written anywhere but the image cache.

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type Selfie = { dataUrl: string; uri: string };

const MAX_WIDTH = 640;
const MAX_BYTES = 550 * 1024;

export class SelfieError extends Error {}

/** Opens the front camera (or the photo library) and returns a shrunk JPEG data URL, or null if cancelled. */
export async function takeSelfie(source: 'camera' | 'library' = 'camera'): Promise<Selfie | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    if (!perm?.granted) throw new SelfieError('The camera is blocked. Allow camera access for this app in Settings, or choose a photo instead.');
  }
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
    cameraType: ImagePicker.CameraType.front,
  };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0]!;

  try {
    return await shrink(asset);
  } catch (e) {
    if (e instanceof SelfieError) throw e;
    throw new SelfieError('That photo could not be read. Try again.');
  }
}

async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<Selfie> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  const w = asset.width || 0;
  const h = asset.height || 0;
  // Both sides are given when known (the web build can't infer a missing one).
  if (w > MAX_WIDTH) ctx.resize(h > 0 ? { width: MAX_WIDTH, height: Math.round((h * MAX_WIDTH) / w) } : { width: MAX_WIDTH, height: null });
  const rendered = await ctx.renderAsync();
  let quality = 0.7;
  for (;;) {
    const saved = await rendered.saveAsync({ compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (!saved.base64) throw new SelfieError('That photo could not be read. Try again.');
    const bytes = Math.round((saved.base64.length * 3) / 4);
    if (bytes <= MAX_BYTES || quality <= 0.3 + 1e-9) {
      if (bytes > 600 * 1024) throw new SelfieError('That photo is too large. Take it again.');
      return { dataUrl: `data:image/jpeg;base64,${saved.base64}`, uri: saved.uri };
    }
    quality = Math.round((quality - 0.1) * 10) / 10;
  }
}
