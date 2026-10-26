// No runtime imports here on purpose: demo/fixtures read this, and importing api/booking from there
// made a require cycle through api/client and auth/session.

import type { RoomPurpose } from '@/api/booking';

// The five purposes the website falls back to when IT Admin has none (dash.html:897, server.js:3186).
export const FALLBACK_PURPOSES: RoomPurpose[] = [
  { id: 'business_meeting', label: 'Business Meeting', active: true },
  { id: 'client_meeting', label: 'Client Meeting', active: true, requiresClient: true, requiresRequirements: true },
  {
    id: 'shooting',
    label: 'Shooting',
    active: true,
    notice: 'If any employee needs this conference room at the same time for a business purpose, your booking may be cancelled by the IT Admin without any prior notice.',
  },
  { id: 'training', label: 'Training', active: true },
  { id: 'team_standup', label: 'Team Standup', active: true },
];
