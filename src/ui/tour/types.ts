// Types for the tour engine (coach marks): src/ui/tour. The engine is generic — it knows nothing about
// roles or screens. Role tours (steps, copy, when to show) live in src/features/tour and call
// useTour().start(tourId, steps, options). Spec: docs/TOUR.md §2–4.

/** A rect in window coordinates (dp). */
export type TourRect = { x: number; y: number; width: number; height: number };

/** 'circle' for round targets (the + button, round icon buttons); 'rect' otherwise. */
export type TourShape = 'rect' | 'circle';

/** What a tap inside the spotlight does. */
export type TourHoleTap = 'next' | 'activate' | 'none';

export type TourStep = {
  /** A stable name for the step ('manager.inbox'); reported in onStep / onEnd. Defaults to the index. */
  key?: string;
  /** The <TourTarget id> to spotlight. Omit for a centred card with no spotlight. */
  target?: string;
  /** At most 4 words, sentence case, no full stop. */
  title: string;
  /** At most 2 short sentences. Name the control as it reads on screen ("the Inbox tab"). */
  body: string;
  /** Checked once, when the tour starts: false leaves the step out (and out of the dot count). */
  when?: () => boolean;
  /**
   * Runs before the step looks for its target: switch tab, pick a segment, open a screen. May return a
   * promise. While it runs the card fades out and the spotlight closes, so screen changes look calm.
   */
  onEnter?: () => void | Promise<void>;
  /** How long to wait for the target to register and measure (default 600 ms). Then the step is dropped. */
  timeout?: number;
  /** Default: 'activate' when the target has an `activate` (tap-through), otherwise 'next'. */
  holeTap?: TourHoleTap;
  /** Override the target's own shape / corner radius / spotlight padding. */
  shape?: TourShape;
  radius?: number;
  padding?: number;
  /** Ask the target's scroll area (TourScrollProvider) to bring it into view first. Default true. */
  scroll?: boolean;
  /** Share of the target that must be on screen (default 0.8; tall targets need 48 dp). Else it is dropped. */
  minVisible?: number;
};

/** The welcome card shown before step 1 (first sign-in only). Not counted as a step. */
export type TourIntro = {
  title: string;
  body: string;
  /** Default "Show me around". */
  startLabel?: string;
  /** Default "Skip". */
  skipLabel?: string;
};

/**
 * Why a tour ended:
 *   done       Done on the last step (or Next with no steps left)
 *   skipped    Skip, Android back, Esc, the screen-reader escape gesture
 *   activated  the person tapped a tap-through target (its real action ran)
 *   stopped    stop() was called (sign-out, a deep link, another tour started)
 *   empty      no step could be shown
 */
export type TourEndReason = 'done' | 'skipped' | 'activated' | 'stopped' | 'empty';

export type TourResult = {
  tourId: string;
  reason: TourEndReason;
  /** The step showing when it ended (null on the intro or when nothing showed). */
  stepKey: string | null;
  /** 1-based position of that step among the steps still in the tour (0 when none). */
  position: number;
  /** Steps left in the tour after `when` and run-time drops. */
  total: number;
};

export type TourLabels = { next?: string; back?: string; done?: string; skip?: string };

export type TourStartOptions = {
  /** Show the welcome card first. */
  intro?: TourIntro;
  /** Index (into the steps passed to start) to begin at. Default 0. */
  startAt?: number;
  /** A toast after Skip ("You can see the tour again in More."). */
  skipToast?: string;
  /** Called once when the tour ends, for any reason (save the record here). */
  onEnd?: (result: TourResult) => void;
  /** Called each time a step is shown. */
  onStep?: (step: TourStep, position: number, total: number) => void;
  /** Button labels (defaults: Next, Back, Done, Skip). */
  labels?: TourLabels;
};

/** What a registered target tells the engine about itself (see useTourTarget). */
export type TourTargetOptions = {
  shape?: TourShape;
  /** The target's own corner radius (the spotlight adds its padding). Default radius.md. */
  radius?: number;
  /** Space between the target and the spotlight edge. Default 6. */
  padding?: number;
  /**
   * Tap-through: the target's real action (open the tab, clock in). When set, tapping the spotlight
   * ends the tour and runs it. Leave it out for targets where a tap should just mean Next.
   */
  activate?: () => void;
};
