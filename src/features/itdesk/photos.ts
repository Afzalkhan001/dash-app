// Room and location photos, shrunk the way the website does it (AddShootingLocationPage / AddConference-
// RoomPage, dash.html:21430): JPEG or PNG up to 10 MB in, longest edge 900 px, JPEG quality 0.82 out, as
// a data URL inside the JSON body (the server has no multipart). Up to 5 per room or location.
// lib/files.pickImage keeps 1600 px for receipts, which would make every room ~3× heavier.

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export const MAX_PHOTOS = 5;
const EDGE = 900;
const MAX_IN_BYTES = 10 * 1024 * 1024;

export class PhotoError extends Error {}

/** One photo from the library → a 900 px JPEG data URL; null when the person cancels. */
export async function pickFacilityPhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0]!;
  const mime = String(asset.mimeType || '').toLowerCase();
  if (mime && !/^image\/(jpeg|jpg|png)$/.test(mime)) throw new PhotoError('Choose a JPEG or PNG photo.');
  if (asset.fileSize && asset.fileSize > MAX_IN_BYTES) throw new PhotoError('That photo is over 10 MB. Choose a smaller one.');
  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  const w = asset.width || 0;
  const h = asset.height || 0;
  if (Math.max(w, h) > EDGE) {
    if (w >= h) ctx.resize({ width: EDGE, height: null });
    else ctx.resize({ width: null, height: EDGE });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new PhotoError('Could not read that photo.');
  return `data:image/jpeg;base64,${saved.base64}`;
}
