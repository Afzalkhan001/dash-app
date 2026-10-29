// The phone side of a live call (installed Android app only; Expo Go and the web build get null and
// behave exactly as before):
//   - Audio: react-native-incall-manager puts the phone in call mode (communication audio, audio
//     focus, keep the screen on). Voice calls start on the earpiece, with the screen going off when
//     the phone is held to the ear (proximity); a wired or Bluetooth headset takes over by itself.
//     Turning the camera on moves the sound to the speaker (unless a headset is in or the user chose).
//     The call screen's Speaker button switches it by hand. Hang-up restores the phone's audio.
//   - Background: modules/dash-call (our own Expo module, Kotlin) runs a foreground service of type
//     microphone (+ camera while the camera is on) with the ongoing "DASH call in progress · Tap to
//     return" notification, so the call keeps its microphone when the user leaves the app. It also
//     opens a headless JS task for the length of the call (React Native pauses JS timers in the
//     background otherwise, which stopped the heartbeat after ~45 s) and sends a tick every 5 s.
// The engine (engine.ts LiveEngine) owns one CallSession from "connected" to hang-up.

import { requireOptionalNativeModule } from 'expo';
import { AppRegistry, DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

import { hasCallAudio, isExpoGo, isWeb } from '@/lib/capabilities';

/** Where the call's sound is going. */
export type AudioRoute = 'earpiece' | 'speaker' | 'headset' | 'bluetooth';

type Subscription = { remove(): void };

type DashCallNative = {
  start(title: string, video: boolean): boolean;
  update(title: string, video: boolean): boolean;
  stop(): void;
  isRunning(): boolean;
  addListener(event: 'onTick', fn: (e: { at: number }) => void): Subscription;
  addListener(event: 'onLeaveRequested', fn: (e: { reason: string }) => void): Subscription;
};

type InCallManagerNative = {
  start(media: 'audio' | 'video', auto: boolean, ringback: string): void;
  stop(busytone: string): void;
  /** 1 = speaker, -1 = earpiece, 0 = automatic (headset or Bluetooth if present, else the default). */
  setForceSpeakerphoneOn(flag: number): void;
};

const KEEP_ALIVE_TASK = 'DashCallKeepAlive';

let dashCall: DashCallNative | null | undefined;
function dashCallModule(): DashCallNative | null {
  if (dashCall !== undefined) return dashCall;
  dashCall = isWeb() || isExpoGo() || Platform.OS !== 'android' ? null : requireOptionalNativeModule<DashCallNative>('DashCall');
  return dashCall;
}

function inCallManager(): InCallManagerNative | null {
  return hasCallAudio() ? (NativeModules.InCallManager as InCallManagerNative) : null;
}

// The keep-alive task: open while a call is on, so React Native keeps running JS timers in the
// background (its JavaTimerManager only pauses them when no headless task is running).
let endKeepAlive: (() => void) | null = null;
let registered = false;
function registerKeepAlive() {
  if (registered) return;
  registered = true;
  AppRegistry.registerHeadlessTask(KEEP_ALIVE_TASK, () => () =>
    new Promise<void>((resolve) => {
      endKeepAlive?.();
      endKeepAlive = resolve;
    }),
  );
}

/** True when this build can route call audio or keep a call alive in the background. */
export function hasCallSession(): boolean {
  return inCallManager() != null || dashCallModule() != null;
}

/**
 * Asks for "Nearby devices" (Android 12+) once, before the call audio starts, so a Bluetooth headset
 * can carry the call. Saying no is fine: the call stays on the phone or a wired headset.
 */
export async function prepareCallAudio(): Promise<void> {
  if (Platform.OS !== 'android' || !inCallManager() || Number(Platform.Version) < 31) return;
  try {
    const p = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
    if (await PermissionsAndroid.check(p)) return;
    await PermissionsAndroid.request(p, {
      title: 'Use your Bluetooth headset in calls?',
      message: 'DASH needs “Nearby devices” to send call sound to a Bluetooth headset. Without it, calls use the phone or a wired headset.',
      buttonPositive: 'Continue',
    });
  } catch {
    // not asked: Bluetooth just isn't offered
  }
}

const ROUTES: Record<string, AudioRoute> = {
  EARPIECE: 'earpiece',
  SPEAKER_PHONE: 'speaker',
  WIRED_HEADSET: 'headset',
  BLUETOOTH: 'bluetooth',
};

function parseDevices(raw: unknown): string[] {
  try {
    const list = JSON.parse(String(raw ?? '[]'));
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

export type CallSessionEvents = {
  /** The sound moved (button, headset plugged in or out, Bluetooth connected). */
  onRoute: (route: AudioRoute, canSwitch: boolean) => void;
  /** Every 5 s while the call is on, also in the background. */
  onTick: () => void;
  /** "Leave call" on the notification, or the app swiped away from Recents. */
  onLeave: (reason: string) => void;
};

/** One call's phone session. Every method is safe to call after stop(). */
export class CallSession {
  private audio = inCallManager();
  private native = dashCallModule();
  private subs: Subscription[] = [];
  private video = false;
  private title = '';
  /** null = automatic (earpiece for voice, speaker for video); otherwise the user's own pick. */
  private choice: boolean | null = null;
  private route: AudioRoute = 'earpiece';
  private headsets = false;
  private stopped = false;

  constructor(private events: CallSessionEvents) {}

  /** The call connected. */
  start(title: string, video: boolean) {
    this.title = title;
    this.video = video;
    if (this.audio) {
      this.subs.push(DeviceEventEmitter.addListener('onAudioDeviceChanged', this.onDevices));
      try {
        // 'audio' + automatic: earpiece by default, proximity screen-off on the earpiece, headsets win.
        // iOS video uses the system's video-chat mode instead: loudspeaker unless AirPods or a headset
        // are connected (on iOS this module never sends the device events Android uses for that).
        this.audio.start(Platform.OS === 'ios' && video ? 'video' : 'audio', true, '');
      } catch {
        this.audio = null;
      }
      this.applySpeaker();
    }
    if (this.native) {
      registerKeepAlive();
      try {
        this.subs.push(this.native.addListener('onTick', () => this.events.onTick()));
        this.subs.push(this.native.addListener('onLeaveRequested', (e) => this.events.onLeave(String(e?.reason ?? 'notification'))));
        this.native.start(title, video);
      } catch {
        // no background service: the call still works while the app is open
      }
    }
  }

  /** Whether the Speaker button can do anything on this phone. */
  get canSwitch() {
    return this.audio != null;
  }

  get speaker() {
    return this.route === 'speaker';
  }

  setTitle(title: string) {
    if (this.stopped || !title || title === this.title) return;
    this.title = title;
    try {
      this.native?.update(title, this.video);
    } catch {
      // the notification keeps the old title
    }
  }

  /** Camera on or off: the service type follows, and the sound follows unless the user chose. */
  setVideo(video: boolean) {
    if (this.stopped || video === this.video) return;
    this.video = video;
    try {
      this.native?.update(this.title, video);
    } catch {
      // the service keeps its microphone type; the camera works while the app is open
    }
    if (this.choice == null) this.applySpeaker();
  }

  /** The Speaker button. */
  toggleSpeaker() {
    if (this.stopped || !this.audio) return;
    this.choice = !this.speaker;
    this.applySpeaker();
  }

  private wantSpeaker() {
    if (this.choice != null) return this.choice;
    return this.video && !this.headsets;
  }

  private applySpeaker() {
    if (!this.audio || this.stopped) return;
    const on = this.wantSpeaker();
    // iOS: left automatic, the call mode above picks the route (headsets win); a pick of "off" has to be
    // forced (-1), because automatic on a video call means the loudspeaker there.
    const flag = Platform.OS === 'ios' ? (this.choice == null ? 0 : this.choice ? 1 : -1) : on ? 1 : 0;
    try {
      this.audio.setForceSpeakerphoneOn(flag);
    } catch {
      return;
    }
    // Shown at once; the device event below corrects it if the phone picked something else.
    if (on) this.setRoute('speaker');
    else if (this.route === 'speaker') this.setRoute('earpiece');
  }

  private setRoute(route: AudioRoute) {
    this.route = route;
    this.events.onRoute(route, this.canSwitch);
  }

  private onDevices = (e: { availableAudioDeviceList?: string; selectedAudioDevice?: string }) => {
    if (this.stopped) return;
    const devices = parseDevices(e?.availableAudioDeviceList);
    const headsets = devices.includes('WIRED_HEADSET') || devices.includes('BLUETOOTH');
    const plugged = headsets && !this.headsets;
    this.headsets = headsets;
    if (plugged && this.choice === true) {
      // A headset just arrived while the speaker was forced on: the headset wins, like a phone call.
      this.choice = null;
      this.applySpeaker();
    }
    const route = ROUTES[String(e?.selectedAudioDevice ?? '')];
    if (route) this.setRoute(route);
  };

  /** Hang-up, removal, end, or the screen closing: everything back to how it was. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const s of this.subs.splice(0)) {
      try {
        s.remove();
      } catch {
        // already removed
      }
    }
    try {
      this.audio?.stop('');
    } catch {
      // the phone restores call audio itself when the app closes
    }
    try {
      this.native?.stop();
    } catch {
      // the service also stops with the app
    }
    endKeepAlive?.();
    endKeepAlive = null;
  }
}
