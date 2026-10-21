// Changing my profile photo — the web's My Profile upload (dash.html ProfileView uploadAvatar
// ~L29038 + processAvatarFile ~L933): the picture is centre-cropped to a square on its shorter side,
// scaled down (never up) to 480 px and stored as PNG; the save stamps who changed it and when
// (avatarUpdatedBy / avatarUpdatedById / avatarUpdatedAt), which Employee Roster shows. Removing
// the photo writes avatar: null with the same stamp. Success is a toast ("Photo updated." / "Photo
// removed."), a failure an alert; the haptic comes from useSaveMyProfile.

import * as ImageManipulator from 'expo-image-manipulator';
import { Camera, ImagePlus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { useSaveMyProfile } from '@/api/people';
import { useSession } from '@/auth/session';
import { FileError, pickImage } from '@/lib/files';
import { MenuSheet, toast } from '@/ui';

const AVATAR_MAX_DIM = 480;

export async function pickAvatarDataUrl(source: 'camera' | 'library'): Promise<string | null> {
  const picked = await pickImage(source);
  if (!picked) return null;
  const probe = await ImageManipulator.ImageManipulator.manipulate(picked.uri).renderAsync();
  const side = Math.min(probe.width, probe.height);
  if (!side) throw new FileError('That photo could not be read.');
  const ctx = ImageManipulator.ImageManipulator.manipulate(picked.uri).crop({
    originX: Math.floor((probe.width - side) / 2),
    originY: Math.floor((probe.height - side) / 2),
    width: side,
    height: side,
  });
  if (side > AVATAR_MAX_DIM) ctx.resize({ width: AVATAR_MAX_DIM, height: AVATAR_MAX_DIM });
  const out = await (await ctx.renderAsync()).saveAsync({ format: ImageManipulator.SaveFormat.PNG, base64: true });
  if (!out.base64) throw new FileError('That photo could not be read.');
  return `data:image/png;base64,${out.base64}`;
}

export function usePhotoActions(hasPhoto: boolean) {
  const user = useSession((s) => s.user);
  const save = useSaveMyProfile();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const stamp = () => ({
    avatarUpdatedBy: user?.name || user?.email || '',
    avatarUpdatedById: user?.id,
    avatarUpdatedAt: new Date().toISOString(),
  });

  const choose = async (source: 'camera' | 'library') => {
    setOpen(false);
    setWorking(true);
    try {
      // Let the sheet finish closing first: iOS will not present the picker over a closing modal.
      await new Promise((r) => setTimeout(r, 300));
      const dataUrl = await pickAvatarDataUrl(source);
      if (dataUrl) {
        await save.mutateAsync({ avatar: dataUrl, ...stamp() });
        toast.show('Photo updated.');
      }
    } catch (e) {
      Alert.alert('Couldn’t update your photo', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setWorking(false);
    }
  };

  const confirmRemove = () =>
    Alert.alert('Remove your profile photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove photo',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          try {
            await save.mutateAsync({ avatar: null, ...stamp() });
            toast.show('Photo removed.');
          } catch (e) {
            Alert.alert('Couldn’t remove your photo', e instanceof Error ? e.message : 'Try again.');
          } finally {
            setWorking(false);
          }
        },
      },
    ]);
  const remove = () => {
    setOpen(false);
    setTimeout(confirmRemove, 300); // after the sheet has closed (MenuSheet already waited 280 ms)
  };

  // The kit overflow menu: it closes itself, then runs the action 280 ms later. choose()/remove()
  // wait a little longer still, because iOS won't present the picker or an Alert over a closing modal.
  const sheet = (
    <MenuSheet
      visible={open}
      onClose={() => setOpen(false)}
      title="Profile photo"
      subtitle="Shown to colleagues across DASH."
      items={[
        { key: 'camera', label: 'Take a photo', icon: Camera, onPress: () => void choose('camera'), disabled: working },
        { key: 'library', label: 'Choose from library', icon: ImagePlus, onPress: () => void choose('library'), disabled: working },
        ...(hasPhoto ? [{ key: 'remove', label: 'Remove photo', icon: Trash2, tone: 'danger' as const, onPress: remove, disabled: working }] : []),
      ]}
    />
  );

  return { openPhotoSheet: () => setOpen(true), photoSheet: sheet, photoBusy: working };
}
