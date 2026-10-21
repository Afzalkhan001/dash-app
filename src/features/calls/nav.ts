// Calls domain — what it adds to More, the + sheet and Home (docs/port/EXTENSION-POINTS.md §3–6).
//   More › links   "Calls" → /call (start a call, test the ring), right after Chat
//   + sheet        "Start call" → /call?start=1 (opens the people picker)
// Same gate as chat: Meets is for everyone signed in (dash.html:7000). In Expo Go the rows still
// show: the Calls screen says "Available in the installed app" and offers the test ring.

import { Phone, PhoneCall } from 'lucide-react-native';

import { canSeeCalls } from '@/features/calls/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  if (!canSeeCalls(access.user, access.tenant)) return [];
  return [
    {
      key: 'calls.calls',
      section: 'links',
      label: 'Calls',
      subtitle: 'Voice and video calls with colleagues',
      href: '/call',
      icon: Phone,
      module: 'news',
      order: 11,
      tourId: 'more.calls',
    },
  ];
}

export function createActions(access: Access): CreateAction[] {
  if (!canSeeCalls(access.user, access.tenant)) return [];
  return [{ key: 'calls.start', label: 'Start call', href: '/call?start=1', icon: PhoneCall, module: 'news', hint: 'Pick a colleague and ring them', order: 120 }];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
