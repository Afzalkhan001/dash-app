// /attendance was the Attendance tab; it now lives in Me (the Attendance segment). Old links land there.
import { MeRedirect } from '@/features/me/redirect';

export default function AttendanceRedirect() {
  return <MeRedirect tab="attendance" />;
}
