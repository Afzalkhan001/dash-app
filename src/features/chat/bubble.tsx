// A thread's pieces: message bubbles (mine on the right in the brand colour, others on the left in
// white, with the sender's name in groups), day chips, the "New messages" divider and attachments.
// Website: dash.html:10230–10380. Message text is rendered as plain text (never parsed as markup).
//
// Attachments (spec §4.2): images inline (expo-image with the Bearer header; tap for full screen);
// voice notes as a pill with the length from their name; other files as a row with name and size.
// Voice notes play inline (features/chatvoice/voice-player.tsx, one shared player per thread); tapping
// a file downloads it and opens the share sheet ("Open in…").

import { Image } from 'expo-image';
import { Ban, FileText } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { authHeaders, isDemoSession } from '@/api/client';
import { attachmentUrl, type MeetsMessage } from '@/api/chat';
import { chatDemoImage } from '@/demo/fixtures/chat';
import { captionOf, isAudioType, isImageType, sizeLabel } from '@/features/chat/format';
import { VoicePill } from '@/features/chatvoice/voice-player';
import { timeOf } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/ui';

const AVATAR = 28;

export function imageSource(m: MeetsMessage) {
  if (isDemoSession()) {
    const uri = chatDemoImage(m.id);
    return uri ? { uri } : null;
  }
  return { uri: attachmentUrl(m.conversationId, m.id, true), headers: authHeaders() };
}

export const MessageBubble = memo(function MessageBubble({
  m,
  mine,
  group,
  showName,
  showAvatar,
  onLongPress,
  onOpenImage,
  onOpenFile,
}: {
  m: MeetsMessage;
  mine: boolean;
  group: boolean;
  /** First of a run from the same person (top of the run): the name shows in groups. */
  showName: boolean;
  /** Last of a run (bottom): the avatar shows in groups. */
  showAvatar: boolean;
  onLongPress?: (m: MeetsMessage) => void;
  onOpenImage: (m: MeetsMessage) => void;
  onOpenFile: (m: MeetsMessage) => void;
}) {
  const time = timeOf(m.createdAt);
  const caption = m.deleted ? '' : captionOf(m);
  const a = m.deleted ? null : m.attachment;
  const fg = mine ? palette.onPrimary : palette.text;
  const fgMuted = mine ? palette.onPrimaryMuted : palette.textMuted;
  const who = m.senderName || 'Someone';

  let attachment = null;
  if (a && isImageType(a.type)) {
    const src = imageSource(m);
    attachment = (
      <Pressable onPress={() => onOpenImage(m)} onLongPress={onLongPress ? () => onLongPress(m) : undefined} accessibilityRole="imagebutton" accessibilityLabel={`Photo, ${a.name}. Opens it full screen`}>
        {src ? (
          <Image source={src} cachePolicy="memory" contentFit="cover" style={styles.image} transition={150} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.image, styles.imageEmpty]}>
            <Text variant="caption" muted numberOfLines={2} align="center">
              {a.name}
            </Text>
          </View>
        )}
      </Pressable>
    );
  } else if (a && isAudioType(a.type)) {
    attachment = <VoicePill m={m} mine={mine} onShare={onOpenFile} onLongPress={onLongPress} />;
  } else if (a) {
    attachment = (
      <Pressable
        onPress={() => onOpenFile(m)}
        onLongPress={onLongPress ? () => onLongPress(m) : undefined}
        accessibilityRole="button"
        accessibilityLabel={`File ${a.name}, ${sizeLabel(a.size)}`}
        accessibilityHint="Downloads it and opens the share sheet"
        style={({ pressed }) => [styles.file, mine ? styles.fileMine : styles.fileOther, pressed && styles.pressed]}>
        <View style={[styles.fileIcon, mine ? styles.fileIconMine : styles.fileIconOther]}>
          <FileText size={18} color={mine ? palette.onPrimary : palette.primaryText} strokeWidth={1.8} />
        </View>
        <View style={styles.fileText}>
          <Text variant="labelStrong" color={fg} numberOfLines={2}>
            {a.name}
          </Text>
          <Text variant="caption" color={fgMuted} numberOfLines={1}>
            {sizeLabel(a.size)}
          </Text>
        </View>
      </Pressable>
    );
  }

  const bubble = (
    <Pressable
      onLongPress={onLongPress ? () => onLongPress(m) : undefined}
      delayLongPress={350}
      disabled={!onLongPress}
      // With a photo or file the bubble is not one accessible block, so a screen reader can still reach
      // and open the attachment inside it (an accessible parent hides its children).
      accessible={!a}
      accessibilityLabel={[mine ? 'You' : who, m.deleted ? 'message deleted' : caption, a ? (isImageType(a.type) ? 'photo' : isAudioType(a.type) ? 'voice message' : a.name) : null, time].filter(Boolean).join(', ')}
      accessibilityHint={onLongPress ? 'Long press for options' : undefined}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'Message options' }] : undefined}
      onAccessibilityAction={onLongPress ? (e) => e.nativeEvent.actionName === 'longpress' && onLongPress(m) : undefined}
      style={[styles.bubble, mine ? styles.mine : styles.other, m.deleted && styles.deleted, a && isImageType(a.type) && styles.bubbleImage]}>
      {group && !mine && showName ? (
        <Text variant="labelStrong" color={palette.primaryText} numberOfLines={1} style={a && isImageType(a.type) ? styles.nameOnImage : undefined}>
          {who}
        </Text>
      ) : null}
      {m.deleted ? (
        <View style={styles.deletedRow}>
          <Ban size={14} color={palette.textMuted} strokeWidth={1.8} />
          <Text variant="label" muted>
            Message deleted
          </Text>
        </View>
      ) : null}
      {attachment}
      {caption ? (
        <Text variant="body" color={fg} selectable style={a && isImageType(a.type) ? styles.captionOnImage : undefined}>
          {caption}
        </Text>
      ) : null}
      <Text variant="micro" color={m.deleted ? palette.textFaint : fgMuted} align="right" style={a && isImageType(a.type) ? styles.timeOnImage : undefined}>
        {time}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowOther, showName ? styles.runStart : null]}>
      {group && !mine ? showAvatar ? <Avatar name={who} size={AVATAR} ring={false} /> : <View style={styles.avatarGap} /> : null}
      {bubble}
    </View>
  );
});

export function DayChip({ label }: { label: string }) {
  return (
    <View style={styles.dayWrap} accessibilityRole="header">
      <View style={styles.day}>
        <Text variant="caption" muted numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export function NewDivider() {
  return (
    <View style={styles.newWrap} accessibilityRole="header" accessibilityLabel="New messages">
      <View style={styles.newLine} />
      <Text variant="labelStrong" color={palette.dangerInk}>
        New messages
      </Text>
      <View style={styles.newLine} />
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, paddingVertical: 2 },
  runStart: { marginTop: space.xs },
  rowMine: { justifyContent: 'flex-end', paddingLeft: 48 },
  rowOther: { justifyContent: 'flex-start', paddingRight: 48 },
  avatarGap: { width: AVATAR },
  bubble: { maxWidth: '100%', flexShrink: 1, borderRadius: radius.lg, paddingHorizontal: space.sm, paddingVertical: space.xs, gap: 4 },
  bubbleImage: { padding: 4 },
  mine: { backgroundColor: palette.primary, borderBottomRightRadius: 6 },
  other: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.glassLine, borderBottomLeftRadius: 6 },
  deleted: { backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.glassLine },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  image: { width: 220, height: 150, borderRadius: radius.md, backgroundColor: palette.surfaceSunken },
  imageEmpty: { alignItems: 'center', justifyContent: 'center', padding: space.sm },
  nameOnImage: { paddingHorizontal: space.xs, paddingTop: 2 },
  captionOnImage: { paddingHorizontal: space.xs },
  timeOnImage: { paddingHorizontal: space.xs, paddingBottom: 2 },
  file: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, padding: space.xs, minWidth: 180 },
  fileMine: { backgroundColor: palette.frostOnDark },
  fileOther: { backgroundColor: palette.surfaceMuted },
  fileIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  fileIconMine: { backgroundColor: palette.frostEdgeOnDark },
  fileIconOther: { backgroundColor: palette.primarySoft },
  fileText: { flexShrink: 1, gap: 2 },
  pressed: { opacity: 0.8 },
  dayWrap: { alignItems: 'center', paddingVertical: space.sm },
  day: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: palette.frostStrong, borderWidth: 1, borderColor: palette.glassLine },
  newWrap: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.sm },
  newLine: { flex: 1, height: 1, backgroundColor: palette.danger, opacity: 0.5 },
}));
