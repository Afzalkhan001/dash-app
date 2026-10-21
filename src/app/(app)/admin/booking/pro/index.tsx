// Book a professional, step 1 (web: BookProfessional search, dash.html:27736). Pick the day (today
// to 7 days ahead, India time), the kind of professional and the city; the list shows who is bookable
// (professionalAvailable, a type, the city, not away that day, not you) and still has a free stretch
// that day (profHasFreeSlots), best rated first, with a specialisation filter. A row opens step 2.

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Clapperboard, MapPin, PenTool, Scissors, SearchX, Users } from 'lucide-react-native';
import { useState } from 'react';

import { useAllBookings, useBookingDepartments, useBookingFeed, useBookingUsers } from '@/api/booking';
import { useTodayIst } from '@/features/attendance/use-now';
import { canBook } from '@/features/booking/access';
import { activeProfTypes, availablePros, citiesOf, proBookingsOn, profTypeLabel, ratingOf, specsOf } from '@/features/booking/model';
import { DayStrip, useMe, useProfTypes } from '@/features/booking/ui';
import { dateLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { palette } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  MenuSheet,
  NavHeader,
  PillSelector,
  Row,
  Screen,
  SelectTiles,
  SkeletonList,
  Text,
} from '@/ui';

const MAX_DAYS = 7; // dash.html:27368 BK_PRO_MAX_DAYS_AHEAD (the server checks the same, IST)
const ANY = '__any';
const typeIconOf = (id: string) => (id === 'cinematographer' ? Clapperboard : id === 'editor' ? Scissors : id === 'graphic_designer' ? PenTool : Users);

export default function BookProSearchScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const today = useTodayIst();
  const types = useProfTypes();
  const allowed = canBook(access);
  const users = useBookingUsers(allowed);
  const feed = useBookingFeed(allowed);
  const depts = useBookingDepartments(allowed);
  // Ratings count every rated booking, as the website's do (getRating reads the whole table).
  const rated = useAllBookings(allowed);
  const [date, setDate] = useState(today);
  const [type, setType] = useState<string>(ANY);
  const [city, setCity] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [spec, setSpec] = useState('');

  if (!allowed) return <Redirect href="/" />;

  const loaded = !!users.data && !!feed.data;
  const cities = citiesOf(users.data ?? []);
  const base = loaded ? availablePros(users.data!, feed.data!, rated.data ?? feed.data!, { city, type: type === ANY ? '' : type, date, meId: me?.id }, types) : [];
  const specs = specsOf(base);
  const pros = spec ? base.filter((u) => u.specializations.some((s) => s.toLowerCase() === spec.toLowerCase())) : base;
  const deptName = (v: string) => depts.data?.find((d) => d.id === v)?.name || v;
  const pickDate = (d: string) => {
    setDate(d);
    setSpec('');
  };

  return (
    <>
      <Screen header={<NavHeader title="Book a professional" />} onRefresh={() => qc.invalidateQueries({ queryKey: ['booking', 'users'] })}>
        <DayStrip value={date} onChange={pickDate} today={today} days={MAX_DAYS + 1} />
        <SelectTiles
          accessibilityLabel="Kind of professional"
          value={type}
          onChange={(v) => {
            setType(v);
            setSpec('');
          }}
          options={[{ value: ANY, label: 'Anyone', icon: Users }, ...activeProfTypes(types).map((t) => ({ value: t.id, label: t.label, icon: typeIconOf(t.id) }))]}
        />
        {cities.length ? (
          <Row>
            <PillSelector icon={MapPin} label={city || 'Any city'} onPress={() => setCityOpen(true)} accessibilityLabel={`City: ${city || 'any'}`} />
          </Row>
        ) : null}

        {(users.isError && !users.data) || (feed.isError && !feed.data) ? (
          <ErrorState
            message={(users.error ?? feed.error)?.message || 'Couldn’t load the professionals.'}
            onRetry={() => void Promise.all([users.refetch(), feed.refetch()])}
          />
        ) : !loaded ? (
          <SkeletonList rows={4} avatar />
        ) : (
          <>
            {specs.length > 1 ? (
              <ChipRow>
                <Chip label="All skills" selected={!spec} onPress={() => setSpec('')} />
                {specs.map((s) => (
                  <Chip key={s} label={s} selected={spec === s} onPress={() => setSpec(spec === s ? '' : s)} />
                ))}
              </ChipRow>
            ) : null}
            {pros.length ? (
              <ActivityList title={`Free on ${dateLabel(date, today)}`}>
                {pros.map((u) => {
                  const r = ratingOf(rated.data ?? feed.data!, u.id);
                  const busy = proBookingsOn(feed.data!, u.id, date).length > 0;
                  return (
                    <ActivityRow
                      key={u.id}
                      person={{ name: u.name }}
                      title={u.name}
                      subtitle={[profTypeLabel(types, u.professionalType), deptName(u.dept), u.location].filter(Boolean).join(' · ')}
                      note={u.specializations.join(', ') || undefined}
                      value={r ? `★ ${r.avg.toFixed(1)}` : undefined}
                      meta={r ? `${r.count} review${r.count === 1 ? '' : 's'}` : undefined}
                      status={busy ? { label: 'Partly booked', tone: 'pending' } : { label: 'Free', tone: 'done' }}
                      chevron
                      onPress={() => router.push(`/admin/booking/pro/${encodeURIComponent(u.id)}?date=${date}`)}
                    />
                  );
                })}
              </ActivityList>
            ) : (
              <EmptyState
                icon={<SearchX color={palette.textMuted} strokeWidth={1.8} />}
                title="Nobody free"
                message="No professional matches on this day. Try another day, kind or city."
              />
            )}
            <Text variant="caption" muted>
              You can book up to 7 days ahead. Their manager approves the request.
            </Text>
          </>
        )}
      </Screen>
      <MenuSheet
        visible={cityOpen}
        onClose={() => setCityOpen(false)}
        title="City"
        items={[
          {
            key: ANY,
            label: 'Any city',
            onPress: () => {
              setCity('');
              setCityOpen(false);
              setSpec('');
            },
          },
          ...cities.map((c) => ({
            key: c,
            label: c,
            onPress: () => {
              setCity(c);
              setCityOpen(false);
              setSpec('');
            },
          })),
        ]}
      />
    </>
  );
}
