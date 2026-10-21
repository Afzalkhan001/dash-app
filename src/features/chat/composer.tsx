// The thread's composer (website: dash.html:10316–10377), pinned under the messages.
//   +      Photo (library) · Camera · File — the picked file is staged as a chip with a ×; nothing
//          uploads until Send. Size and type are checked here against GET /meets/attachments/policy
//          (8 MB files, 3 MB audio; the server's allowlist, mapped by extension — spec §5.3), and the
//          server checks again.
//   text   up to 4000 characters; Enter adds a new line, the Send button sends.
//   Send   a caption alone, a file alone, or both. Server errors (size, kind, rate limit) show as a toast.
//   mic    shown while the draft is empty: records a voice note (features/chatvoice/recorder.tsx),
//          staged with Play / Discard / Send. Not while a call is live (website: disabled in a call).
// A former member gets a muted note instead: "You left this conversation. You can still read and export it."

import { Camera, FileUp, ImageIcon, Mic, Paperclip, Plus, SendHorizontal, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AttachmentPolicy, DEFAULT_POLICY, MAX_BODY } from '@/api/chat';
import { isAudioType, sendableType, sizeLabel, withType } from '@/features/chat/format';
import { chatBus } from '@/features/chat/realtime';
import { VoiceRecorder } from '@/features/chatvoice/recorder';
import { FileError, pickDocument, pickImage, type PickedFile } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { font, palette, radius, space } from '@/theme/tokens';
import { MenuSheet, Text, toast, useLayout } from '@/ui';

/** `localUri`: a voice note recorded on this phone (played back from the file after it is sent). */
export type Staged = { name: string; type: string; size: number; dataUrl: string; localUri?: string };

export function Composer({
  canPost,
  policy,
  sending,
  onSend,
}: {
  canPost: boolean;
  policy?: AttachmentPolicy | null;
  sending: boolean;
  /** Resolves true when the message went (the draft and file are then cleared). */
  onSend: (body: string, attachment: Staged | null) => Promise<boolean>;
}) {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const [draft, setDraft] = useState('');
  const [staged, setStaged] = useState<Staged | null>(null);
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const [voice, setVoice] = useState(false);
  const p = policy ?? DEFAULT_POLICY;

  if (!canPost) {
    return (
      <View style={[styles.bar, styles.note, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <Text variant="label" muted align="center">
          You left this conversation. You can still read and export it.
        </Text>
      </View>
    );
  }

  const stage = (f: PickedFile | null) => {
    if (!f) return;
    const type = sendableType(f.name, f.type, p.types);
    if (!type) {
      toast.show(`That kind of file can’t be sent here. These can: ${p.extensions.join(', ')}`, 'danger');
      return;
    }
    const cap = isAudioType(type) ? p.maxAudioBytes : p.maxBytes;
    if (f.size > cap) {
      toast.show(`That file is ${sizeLabel(f.size)}. The limit is ${sizeLabel(cap)}.`, 'danger');
      return;
    }
    setStaged({ name: f.name, type, size: f.size, dataUrl: withType(f.dataUrl, type) });
  };

  const pick = async (kind: 'library' | 'camera' | 'file') => {
    setPicking(true);
    try {
      stage(kind === 'file' ? await pickDocument(p.types.filter((t) => !isAudioType(t)).concat(['text/comma-separated-values', 'application/octet-stream'])) : await pickImage(kind));
    } catch (e) {
      toast.show(e instanceof FileError ? e.message : 'That file could not be read.', 'danger');
    } finally {
      setPicking(false);
    }
  };

  const body = draft.trim();
  const ready = (!!body || !!staged) && !sending && !picking;
  const showMic = !body && !staged && !sending;

  const startVoice = () => {
    if (chatBus.callLive) {
      toast.show('You can’t record a voice message during a call.', 'info');
      return;
    }
    setVoice(true);
  };

  if (voice) {
    return (
      <View style={[styles.bar, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <VoiceRecorder
          maxBytes={p.maxAudioBytes}
          sending={sending}
          onDone={() => setVoice(false)}
          onSend={(c) => onSend('', { name: c.name, type: c.type, size: c.size, dataUrl: c.dataUrl, localUri: c.localUri })}
        />
      </View>
    );
  }
  const send = async () => {
    if (!ready) return;
    const ok = await onSend(body, staged);
    if (ok) {
      setDraft('');
      setStaged(null);
    }
  };

  return (
    <View style={[styles.bar, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {staged ? (
        <View style={styles.chip}>
          <Paperclip size={16} color={palette.primaryText} strokeWidth={1.8} />
          <View style={styles.chipText}>
            <Text variant="labelStrong" numberOfLines={1}>
              {staged.name}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {sizeLabel(staged.size)} · sends with your message
            </Text>
          </View>
          <Pressable onPress={() => setStaged(null)} disabled={sending} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${staged.name}`} style={styles.chipX}>
            <X size={16} color={palette.textMuted} strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable
          onPress={() => setMenu(true)}
          disabled={sending || picking}
          accessibilityRole="button"
          accessibilityLabel="Attach a photo or file"
          style={({ pressed }) => [styles.round, styles.attach, pressed && styles.pressed, (sending || picking) && styles.dim]}>
          {picking ? <ActivityIndicator color={palette.primaryText} /> : <Plus size={22} color={palette.text} strokeWidth={1.8} />}
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={palette.textFaint}
          multiline
          // The web build's textarea would default to two rows; phones size it from minHeight.
          numberOfLines={Platform.OS === 'web' ? 1 : undefined}
          maxLength={MAX_BODY}
          editable={!sending}
          accessibilityLabel="Message"
          style={styles.input}
          maxFontSizeMultiplier={1.4}
        />
        {showMic ? (
          <Pressable
            onPress={startVoice}
            disabled={picking}
            accessibilityRole="button"
            accessibilityLabel="Record a voice message"
            accessibilityHint={`Up to 2 minutes. You can play it back before sending`}
            style={({ pressed }) => [styles.round, styles.send, picking && styles.dim, pressed && styles.pressed]}>
            <Mic size={20} color={palette.onPrimary} strokeWidth={1.9} />
          </Pressable>
        ) : (
        <Pressable
          onPress={send}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !ready, busy: sending }}
          style={({ pressed }) => [styles.round, styles.send, !ready && styles.dim, pressed && styles.pressed]}>
          {sending ? <ActivityIndicator color={palette.onPrimary} /> : <SendHorizontal size={20} color={palette.onPrimary} strokeWidth={1.9} />}
        </Pressable>
        )}
      </View>
      {draft.length > MAX_BODY - 200 ? (
        <Text variant="caption" muted align="right">
          {draft.length}/{MAX_BODY}
        </Text>
      ) : null}

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Attach"
        items={[
          { key: 'library', label: 'Photo', hint: 'From your gallery', icon: ImageIcon, onPress: () => void pick('library') },
          ...(Platform.OS === 'web' ? [] : [{ key: 'camera', label: 'Camera', hint: 'Take a photo now', icon: Camera, onPress: () => void pick('camera') }]),
          { key: 'file', label: 'File', hint: `PDF, Word, Excel, PowerPoint, text, CSV or zip, up to ${sizeLabel(p.maxBytes)}`, icon: FileUp, onPress: () => void pick('file') },
        ]}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  bar: { paddingTop: space.xs, gap: space.xs, borderTopWidth: 1, borderTopColor: palette.glassLine, backgroundColor: palette.canvasTop },
  note: { paddingTop: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  round: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  attach: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.glassLine },
  send: { backgroundColor: palette.charcoal },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 132,
    paddingHorizontal: space.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    color: palette.text,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 20,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.sm,
    paddingRight: space.xxs,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: palette.primarySoft,
  },
  chipText: { flex: 1, minWidth: 0 },
  chipX: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
}));
