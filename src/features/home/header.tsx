// Home's header (docs/REFERENCE-COMPONENTS.md §3 Home, kit HomeHeader): my photo (or initials) on the
// left (→ My profile), a small muted "Good morning 👋" over my first name, and on the right the Lendora
// IconPillGroup — one frosted pill holding two round buttons, each with a red dot when there is
// something new (never a number: the count itself is only on the Inbox tab):
//   bell   → Announcements (the company announcements), only for people who can see announcements; the dot
//            shows while something was posted in the last 2 days
//   inbox  → Inbox; the dot shows while something waits on me
//   chat   → (slot) the chat domain's button, before the inbox, when features/chat/header-action
//            useChatHeaderAction() returns one. Only while there is room for three buttons: below
//            360 dp (or with large text) the pill keeps two, so "Good morning 👋" is never cut to
//            "Good mo…" — Chat stays one tap away in More
// No logo.
//
// The greeting and the "new news" window are India time and re-read every minute (useNow), so a Home
// left open past noon or midnight updates them. The header is its own component so only it
// re-renders on the tick. The announcements query is the one Home's News section already reads, and
// the photo comes from my profile record, which that query already loads (no request of its own).

import { useRouter } from 'expo-router';
import { Inbox } from 'lucide-react-native';

import { isCelebration, useVisibleAnnouncements } from '@/api/announcements';
import { useMyProfile, useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { postedWithin } from '@/features/announcements/parts';
import { useNow } from '@/features/attendance/use-now';
import { useChatHeaderAction } from '@/features/chat/header-action';
import { useInboxCount } from '@/features/inbox/use-inbox-count';
import { canSeeAnnouncements } from '@/features/more/menu';
import { greeting } from '@/lib/dates';
import { firstName } from '@/lib/format';
import { HomeHeader, type NavAction, shouldStack, useLayout } from '@/ui';

const NEW_NEWS_DAYS = 2;

export function HomeTopBar() {
  const router = useRouter();
  const name = useSession((s) => s.user?.name);
  const role = useSession((s) => s.user?.role);
  const tenant = useMyTenant().data;
  const avatar = useMyProfile().data?.avatar;
  const photo = typeof avatar === 'string' && avatar ? avatar : null;
  const inbox = useInboxCount();
  const chat = useChatHeaderAction();
  // Three round buttons leave the greeting about 80 dp at 320 dp; two below 360 dp or with large text.
  const roomy = !shouldStack(useLayout(), { below: 'narrow' });
  const now = useNow();
  const hello = greeting(new Date(now));

  const news = canSeeAnnouncements(role, tenant);
  const { feed } = useVisibleAnnouncements();
  const freshNews = news && (Array.isArray(feed) ? feed : []).some((a) => !!a && !isCelebration(a) && postedWithin(a, NEW_NEWS_DAYS, now));

  const inboxAction: NavAction = {
    key: 'inbox',
    icon: Inbox,
    label: inbox > 0 ? `Inbox, ${inbox} waiting` : 'Inbox',
    dot: inbox > 0,
    onPress: () => router.push('/inbox'),
  };

  return (
    <HomeHeader
      greeting={hello}
      name={firstName(name) || undefined}
      avatarName={name ?? ''}
      avatarUri={photo}
      onAvatarPress={() => router.push('/profile')}
      avatarTourId="home.avatar"
      // The bell is Announcements; without them the pill holds the inbox alone.
      onBellPress={news ? () => router.push('/announcements') : undefined}
      bellDot={freshNews}
      bellLabel={freshNews ? 'Announcements, new posts' : 'Announcements'}
      actions={chat && roomy ? [chat, inboxAction] : [inboxAction]}
    />
  );
}
