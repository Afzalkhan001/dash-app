// A conversation (website MeetsHub thread, dash.html:10230–10380).
//   Header    the name, "N members" / "Direct message" (· you left), and an info button.
//   History   50 at a time, newest at the bottom; scrolling to the top loads earlier ones.
//   Chips     Today / Yesterday / 'Mon, 19 Oct'; a red "New messages" divider placed from the read
//             mark captured ONCE when the thread opens (dash.html:7117), and the thread jumps to it.
//   Bubbles   mine on the right in the brand colour, others on the left with the name in groups;
//             photos inline (tap = full screen), files and voice notes open the share sheet.
//   Delete    long-press my own message → "Delete for everyone" → swipe to confirm (cannot be undone).
//   Read      marked read on open, when a message lands while the thread is on screen, and when the app
//             comes back to the foreground (dash.html:9881).
//   Composer  text, photo, camera, file (features/chat/composer.tsx); a former member reads only.

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Info, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, View } from 'react-native';

import {
  addMessageToCache,
  attachmentPath,
  bumpRowInCache,
  chatApi,
  chatKeys,
  clearRowUnread,
  markDeletedInCache,
  type MeetsMessage,
  useAttachmentPolicy,
  useConversation,
  useConversations,
  useMessages,
} from '@/api/chat';
import { isApiError } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { canDeleteMessage, canSeeMeets } from '@/features/chat/access';
import { DayChip, MessageBubble, NewDivider } from '@/features/chat/bubble';
import { Composer, type Staged } from '@/features/chat/composer';
import { captionOf, dayChip, firstUnreadId, readMark, subtitleOf } from '@/features/chat/format';
import { ImageViewer } from '@/features/chat/image-viewer';
import { chatBus } from '@/features/chat/realtime';
import { istDateOf, stampLabel, timeOf } from '@/lib/dates';
import { FileError, downloadAuthed, shareFile } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Button, ConfirmSheet, EmptyState, ErrorState, haptic, MenuSheet, NavHeader, Screen, SkeletonList, SummaryCard, Text, toast } from '@/ui';

type Item =
  | { kind: 'msg'; key: string; m: MeetsMessage; mine: boolean; showName: boolean; showAvatar: boolean }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'new'; key: string };

const RUN_GAP_MS = 5 * 60_000;

export default function ThreadScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const id = String(params.id ?? '');
  const user = useSession((s) => s.user);
  const me = user?.id;
  const tenant = useMyTenant().data;
  const on = canSeeMeets(user, tenant);
  const today = useTodayIst();

  const conv = useConversation(id, on);
  const msgs = useMessages(id, on);
  const policy = useAttachmentPolicy(on);
  const row = (useConversations(on).data ?? []).find((c) => c.id === id);

  const [mark, setMark] = useState<{ for: string; dividerId: string | null } | null>(null);
  const [sending, setSending] = useState(false);
  const [menuFor, setMenuFor] = useState<MeetsMessage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MeetsMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewer, setViewer] = useState<MeetsMessage | null>(null);
  const listRef = useRef<FlatList<Item>>(null);
  const jumped = useRef<string | null>(null);
  const focused = useRef(false);

  const detail = conv.data?.conversation;
  const members = conv.data?.members ?? [];
  const pages = msgs.data?.pages ?? [];
  const newestFirst = pages.flatMap((p) => p.messages);
  const oldestFirst = [...newestFirst].reverse();
  const canPost = detail ? detail.canPost : !row?.leftAt;
  const group = (detail?.type ?? row?.type) === 'group';
  const current = members.filter((m) => !m.leftAt);
  const other = current.find((m) => m.id !== me) ?? members.find((m) => m.id !== me);
  const title = (group ? detail?.name || row?.name : other?.name || row?.name) || params.name || 'Chat';
  const subtitle = conv.data ? subtitleOf(detail?.type, current.length, detail?.leftAt) : row ? subtitleOf(row.type, row.memberCount, row.leftAt) : undefined;
  const loaded = !!msgs.data && (!!conv.data || conv.isError);

  // The read mark, captured once per open (during render, React's "adjust state on a change" pattern):
  // the earlier of the list row's and the thread's, and the divider goes above the first unread.
  if (loaded && mark?.for !== id) {
    setMark({ for: id, dividerId: firstUnreadId(oldestFirst, readMark(row?.lastReadAt, detail?.lastReadAt), me) });
  }

  const markRead = useCallback(async () => {
    if (!id || !me) return;
    const r = await chatApi.markRead(id);
    if (isApiError(r)) return;
    clearRowUnread(qc, me, id, typeof r?.lastReadAt === 'string' ? r.lastReadAt : null);
    void qc.invalidateQueries({ queryKey: chatKeys.unread(me) });
  }, [id, me, qc]);

  // Mark read once the mark is captured (so this open never takes the divider away).
  useEffect(() => {
    if (mark?.for === id) void markRead();
  }, [mark?.for, id, markRead]);

  // On screen: no notice or unread bump for this chat; mark read when a message lands or the app returns.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      chatBus.viewing = id;
      const off = chatBus.on(({ name, data }) => {
        if (name === 'message' && data?.conversationId === id && String(data?.senderId) !== String(me)) void markRead();
      });
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active' && focused.current) void markRead();
      });
      return () => {
        focused.current = false;
        if (chatBus.viewing === id) chatBus.viewing = null;
        off();
        sub.remove();
      };
    }, [id, me, markRead]),
  );

  // Items, newest first for the inverted list: day chips above each day, the divider above the first unread.
  const items: Item[] = [];
  {
    let lastDay = '';
    let prev: MeetsMessage | null = null;
    const up: Item[] = [];
    oldestFirst.forEach((m, i) => {
      const day = istDateOf(m.createdAt);
      if (day !== lastDay) {
        up.push({ kind: 'day', key: `day-${day}`, label: dayChip(day, today) });
        lastDay = day;
        prev = null;
      }
      if (mark?.for === id && mark.dividerId === m.id) {
        up.push({ kind: 'new', key: 'new' });
        prev = null;
      }
      const next = oldestFirst[i + 1];
      const sameRun = (a: MeetsMessage | null | undefined, b: MeetsMessage | null | undefined) =>
        !!a && !!b && a.senderId === b.senderId && Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) < RUN_GAP_MS && istDateOf(a.createdAt) === istDateOf(b.createdAt);
      const nextBreaks = !next || !sameRun(m, next) || (mark?.for === id && mark.dividerId === next.id);
      up.push({ kind: 'msg', key: m.id, m, mine: String(m.senderId) === String(me), showName: !sameRun(prev, m), showAvatar: nextBreaks });
      prev = m;
    });
    for (let i = up.length - 1; i >= 0; i--) items.push(up[i]!);
  }
  const dividerIndex = items.findIndex((it) => it.kind === 'new');

  // Jump to the divider once per open when it is off screen.
  useEffect(() => {
    if (jumped.current === id || mark?.for !== id) return;
    jumped.current = id;
    if (dividerIndex > 8) {
      const t = setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({ index: dividerIndex, viewPosition: 0.7, animated: false });
        } catch {
          // onScrollToIndexFailed retries
        }
      }, 60);
      return () => clearTimeout(t);
    }
  }, [mark?.for, id, dividerIndex]);

  // Re-check the gate (the session may still be loading: only a signed-in person without chat goes home).
  if (user && !on) return <Redirect href="/" />;

  const send = async (body: string, att: Staged | null) => {
    setSending(true);
    const r = await chatApi.send(id, body, att ? { name: att.name, type: att.type, dataUrl: att.dataUrl } : null);
    setSending(false);
    if (isApiError(r) || !r?.message) {
      toast.show(isApiError(r) ? r.error : 'Could not send that.', 'danger');
      return false;
    }
    addMessageToCache(qc, me, r.message);
    if (!bumpRowInCache(qc, me, r.message, false)) void qc.invalidateQueries({ queryKey: chatKeys.conversations(me) });
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    return true;
  };

  const doDelete = async () => {
    const m = confirmDelete;
    if (!m) return;
    setDeleting(true);
    const r = await chatApi.deleteMessage(id, m.id);
    setDeleting(false);
    if (isApiError(r)) {
      toast.show(r.error, 'danger');
      return;
    }
    haptic.success();
    markDeletedInCache(qc, me, id, m.id);
    void qc.invalidateQueries({ queryKey: chatKeys.conversations(me) });
    setConfirmDelete(null);
    toast.show('Message deleted');
  };

  const openFile = async (m: MeetsMessage) => {
    if (!m.attachment) return;
    try {
      const uri = await downloadAuthed(attachmentPath(id, m.id), m.attachment.name);
      await shareFile(uri, m.attachment.type, m.attachment.name);
    } catch (e) {
      toast.show(e instanceof FileError ? e.message : 'Could not open that file. Try again.', 'danger');
    }
  };

  const onLongPress = (m: MeetsMessage) => {
    if (!canDeleteMessage(m, me, canPost)) return;
    haptic.select();
    setMenuFor(m);
  };

  const renderItem = ({ item }: { item: Item }) =>
    item.kind === 'day' ? (
      <DayChip label={item.label} />
    ) : item.kind === 'new' ? (
      <NewDivider />
    ) : (
      <MessageBubble
        m={item.m}
        mine={item.mine}
        group={group}
        showName={item.showName}
        showAvatar={item.showAvatar}
        onLongPress={canDeleteMessage(item.m, me, canPost) ? onLongPress : undefined}
        onOpenImage={setViewer}
        onOpenFile={openFile}
      />
    );

  const top = msgs.isFetchingNextPage ? (
    <View style={styles.top}>
      <ActivityIndicator color={palette.primaryText} />
    </View>
  ) : msgs.hasNextPage ? (
    <View style={styles.top}>
      <Button title="Load earlier messages" variant="ghost" size="sm" onPress={() => void msgs.fetchNextPage()} />
    </View>
  ) : newestFirst.length ? (
    <View style={styles.top}>
      <Text variant="caption" muted align="center">
        {group ? 'This is the start of the group.' : 'This is the start of your chat.'}
      </Text>
    </View>
  ) : null;

  let body;
  if (msgs.isPending && !conv.isError) body = <SkeletonList rows={6} avatar />;
  else if (!msgs.data && (msgs.isError || conv.isError)) {
    body = <ErrorState message={(msgs.error ?? conv.error)?.message ?? ''} onRetry={() => void Promise.all([msgs.refetch(), conv.refetch()])} />;
  } else if (!newestFirst.length) {
    body = (
      <View style={styles.empty}>
        <EmptyState title="No messages yet" message={canPost ? 'Say hello to get things going.' : 'Nothing was said before you left.'} />
      </View>
    );
  } else {
    body = (
      <FlatList
        ref={listRef}
        data={items}
        inverted
        keyExtractor={(it) => it.key}
        renderItem={renderItem}
        onEndReached={() => {
          if (msgs.hasNextPage && !msgs.isFetchingNextPage) void msgs.fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={top}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        initialNumToRender={24}
        maxToRenderPerBatch={20}
        windowSize={11}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.7, animated: false });
            } catch {
              // give up: the divider is still in the list
            }
          }, 120);
        }}
      />
    );
  }

  const menuMsg = menuFor;
  return (
    <Screen
      scroll={false}
      animate={false}
      header={
        <NavHeader
          title={title}
          subtitle={subtitle}
          actions={[{ key: 'info', icon: Info, label: 'Chat details', onPress: () => router.push({ pathname: '/chat/[id]/info', params: { id } }) }]}
        />
      }
      footer={<Composer canPost={canPost} policy={policy.data} sending={sending} onSend={send} />}>
      {body}

      <MenuSheet
        visible={!!menuMsg}
        onClose={() => setMenuFor(null)}
        title="Your message"
        subtitle={menuMsg ? `Sent ${timeOf(menuMsg.createdAt)}` : undefined}
        items={[{ key: 'delete', label: 'Delete for everyone', icon: Trash2, tone: 'danger', onPress: () => setConfirmDelete(menuMsg) }]}
      />

      <ConfirmSheet
        visible={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this message?"
        subtitle="It is deleted for everyone. You can’t undo this."
        detailsTitle="Message"
        confirmLabel="Swipe to delete"
        onConfirm={doDelete}
        loading={deleting}
        note={`Everyone in ${group ? 'this group' : 'this chat'} sees “Message deleted”. No email or WhatsApp is sent.`}>
        <SummaryCard
          rows={[
            { label: 'Sent', value: confirmDelete ? stampLabel(confirmDelete.createdAt, today) : '' },
            { label: confirmDelete?.attachment ? 'File' : 'Text', value: confirmDelete ? confirmDelete.attachment?.name ?? captionOf(confirmDelete).slice(0, 120) : '' },
          ]}
          hideEmpty
        />
      </ConfirmSheet>

      <ImageViewer m={viewer} today={today} onClose={() => setViewer(null)} onShare={(m) => void openFile(m)} />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  list: { paddingTop: space.sm, paddingBottom: space.sm },
  top: { alignItems: 'center', paddingVertical: space.md },
  empty: { flex: 1, justifyContent: 'center' },
}));
