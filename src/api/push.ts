// Push device routes (server branch feature/mobile-push: routes/push.js, lib/push.js). The only app
// calls to endpoints that are new on the server (PLAN D1); everything else in the app uses existing
// routes. Until the server change is deployed these answer 404, which the app treats as "push is not
// set up on DASH yet" and keeps quiet about (docs/PUSH.md).
//
//   POST /push/devices         {token, platform, deviceName?, appVersion?} → {ok:true}
//   POST /push/devices/remove  {token}                                    → {ok:true}
//   POST /push/test                                                        → {ok, sent, errors[], skipped?}
//
// Demo only (fixtures/push.ts): GET /push/demo-samples → the sample notifications for the demo role.

import { api, type ApiResult } from '@/api/client';

export type PushPlatform = 'ios' | 'android';

export type PushDeviceBody = { token: string; platform: PushPlatform; deviceName?: string; appVersion?: string };
export type PushOk = { ok: true };
export type PushTestResult = { ok: boolean; sent: number; errors: string[]; skipped?: string };

/** Where a tap on a notification goes, and which Android channel it uses. */
export type PushKind = 'approvals' | 'visitors' | 'updates';
export type PushData = { url?: string; kind?: PushKind };

/** A sample notification the demo can send to this phone (GET /push/demo-samples). */
export type PushSample = { id: string; title: string; body: string; url: string; kind: PushKind };

export const registerPushDevice = (body: PushDeviceBody): Promise<ApiResult<PushOk>> => api.post<PushOk>('/push/devices', body);

export const removePushDevice = (token: string): Promise<ApiResult<PushOk>> => api.post<PushOk>('/push/devices/remove', { token });

export const sendTestPush = (): Promise<ApiResult<PushTestResult>> => api.post<PushTestResult>('/push/test', {});

export const getDemoPushSamples = (): Promise<ApiResult<PushSample[]>> => api.get<PushSample[]>('/push/demo-samples');
