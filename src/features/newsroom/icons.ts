// The line icon for a post in the studio lists (a fixed component per kind / type).

import { Award, BellRing, Cake, FileSpreadsheet, Image as ImageIcon, Link, type LucideIcon, Megaphone, Presentation, Video } from 'lucide-react-native';

import type { Announcement } from '@/api/announcements';

export function postIcon(a: Pick<Announcement, 'kind' | 'type'>): LucideIcon {
  if (a.kind === 'popup') return BellRing;
  switch (a.type) {
    case 'link':
      return Link;
    case 'image':
      return ImageIcon;
    case 'video':
      return Video;
    case 'excel':
      return FileSpreadsheet;
    case 'ppt':
      return Presentation;
    case 'birthday':
      return Cake;
    case 'anniversary':
      return Award;
    default:
      return Megaphone;
  }
}
