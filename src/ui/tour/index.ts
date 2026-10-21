// Tour engine (coach marks) — docs/TOUR.md. Generic kit: role tours live in src/features/tour.
export { TourProvider, TourOverlay, tour, useTour } from '@/ui/tour/provider';
export { TourTarget, TourScrollContext, TourScrollProvider, useTourScrollHandle, useTourTarget } from '@/ui/tour/target';
export type { TourScrollHandle, TourScrollOptions, TourScrollRef, TourTargetProps } from '@/ui/tour/target';
export { hasSeenTour, markTourSeen, markTourStarted, readTourRecord, resetTours } from '@/ui/tour/storage';
export type { TourRecord, TourRecordState } from '@/ui/tour/storage';
export { tourScrimColor } from '@/ui/tour/spotlight';
export type {
  TourEndReason,
  TourHoleTap,
  TourIntro,
  TourLabels,
  TourRect,
  TourResult,
  TourShape,
  TourStartOptions,
  TourStep,
  TourTargetOptions,
} from '@/ui/tour/types';
