// Inbox › Rate › one booking (web: BookProfessional "Pending Reviews", dash.html:27778; submitReview
// :27558). Stars 1–5 (required), how likely you'd book them again 1–5 (optional), comments. The rating
// goes into the booking (PUT {reviews:[…, review], status:'reviewed'}) — /api/prof_reviews is not used,
// as on the web — then the booking's task is completed like "Approve & complete" does.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { BookingRecord } from '@/api/booking';
import { useTodayIst } from '@/features/attendance/use-now';
import { canBook } from '@/features/booking/access';
import { rateBooking, refreshBookings, StepError } from '@/features/booking/actions';
import { BookingHero, bookingFields, useBookingById } from '@/features/booking/detail-parts';
import { bookingLooksCancelled } from '@/features/booking/model';
import { StarPicker, useMe, useProfTypes, whenLine } from '@/features/booking/ui';
import { noteDecision } from '@/features/inbox/decided';
import { DecidedSheet, DetailsCard, explainDecisionError, useOutcome } from '@/features/inbox/detail';
import type { InboxDetailProps } from '@/features/plugin-types';
import { useAccess } from '@/lib/use-access';
import { space } from '@/theme/tokens';
import { FIELD_LABEL_INSET, ActionBar, Button, Card, Chip, ChipRow, ConfirmSheet, EmptyState, ErrorState, NavHeader, Screen, SkeletonList, SummaryCard, Text, TextField } from '@/ui';

import { themedStyles } from '@/theme/themed';

export function BookingRateDetail({ id }: InboxDetailProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const today = useTodayIst();
  const types = useProfTypes();
  const allowed = canBook(access);
  const { b, loading, error, refetch } = useBookingById(id);
  const outcome = useOutcome();
  const [rating, setRating] = useState(0);
  const [likely, setLikely] = useState(0);
  const [comments, setComments] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [tried, setTried] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  const send = useMutation({
    mutationFn: (x: BookingRecord) => rateBooking(x, { rating, likelihood: likely, comments: comments.trim() }, me!),
    onSuccess: (_r, x) => {
      noteDecision(`bkrate:${x.id}`, me?.id, 'approve');
      refreshBookings(qc);
      setConfirm(false);
      outcome.show({
        decision: 'approve',
        title: 'Thanks for rating',
        subtitle: `Your rating helps others pick ${x.resource || 'them'}.`,
        rows: [
          { key: 'stars', label: 'Rating', value: `${rating} of 5` },
          ...(likely ? [{ key: 'again', label: 'Book again', value: `${likely} of 5` }] : []),
        ],
      });
    },
    onError: (e) => {
      setConfirm(false);
      refreshBookings(qc);
      if (e instanceof StepError) Alert.alert('Partly done', `${e.done}\n\n${e.message}`, [{ text: 'OK', onPress: leave }]);
      else explainDecisionError(e, leave);
    },
  });

  if (!allowed) return <Redirect href="/" />;
  if (!b) {
    return (
      <Screen header={<NavHeader title="Rate a booking" />}>
        {loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} onRetry={() => void refetch()} /> : <EmptyState title="This booking isn’t here any more" message="Pull to refresh the Inbox." />}
      </Screen>
    );
  }

  const reviewed = Array.isArray(b.reviews) && b.reviews.length > 0;
  const mine = !!me && b.requestedById === me.id && b.status === 'completed' && !reviewed && !bookingLooksCancelled(b) && !outcome.done;
  const first = reviewed ? b.reviews![0]! : null;

  return (
    <>
      <Screen
        header={<NavHeader title="Rate a booking" />}
        onRefresh={() => refetch()}
        footer={
          mine ? (
            <ActionBar note={tried && !rating ? 'Pick a star rating first.' : null}>
              <Button
                title="Send rating"
                icon={<Send />}
                onPress={() => {
                  setTried(true);
                  if (rating) setConfirm(true);
                }}
              />
            </ActionBar>
          ) : undefined
        }>
        <BookingHero b={b} today={today} types={types} label="How did it go?" />
        {mine ? (
          <Card tone="frostStrong" style={styles.form}>
            <StarPicker value={rating} onChange={setRating} label={`Rate ${b.resource ? `${b.resource}’s` : 'their'} work`} />
            <View style={styles.likely}>
              <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
                Would you book them again? (optional)
              </Text>
              <ChipRow bleed="card" wrap>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Chip key={n} label={String(n)} selected={likely === n} onPress={() => setLikely(likely === n ? 0 : n)} />
                ))}
              </ChipRow>
              <Text variant="caption" muted>
                1 is unlikely, 5 is very likely.
              </Text>
            </View>
            <TextField label="Comments (optional)" value={comments} onChangeText={setComments} multiline maxLength={500} counter placeholder="What went well, what could be better" />
          </Card>
        ) : first ? (
          <SummaryCard
            title="Your rating"
            rows={[
              { key: 'r', label: 'Rating', value: `${first.rating ?? '—'} of 5` },
              { key: 'l', label: 'Book again', value: first.likelihood ? `${first.likelihood} of 5` : null },
              { key: 'c', label: 'Comments', value: first.comments || null },
            ]}
          />
        ) : null}
        <DetailsCard fields={bookingFields(b)} />
      </Screen>

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Send your rating?"
        from={{ title: 'You', subtitle: `${rating} of 5 stars`, avatar: { name: me?.name || 'You' } }}
        to={{ title: b.resource || '—', subtitle: 'Gets rated', avatar: { name: b.resource || '' } }}
        detailsTitle="Booking"
        confirmLabel="Swipe to send"
        onConfirm={() => send.mutate(b)}
        loading={send.isPending}
        note={`This also completes the booking’s task, so ${b.resource || 'they'} may get an email and WhatsApp.`}>
        <SummaryCard
          rows={[
            { key: 'when', label: 'When', value: whenLine(b, today) },
            { key: 'again', label: 'Book again', value: likely ? `${likely} of 5` : null },
            { key: 'c', label: 'Comments', value: comments.trim() || null },
          ]}
          hideEmpty
        />
      </ConfirmSheet>

      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={leave} />
    </>
  );
}

const styles = themedStyles(() => ({
  form: { gap: space.md },
  likely: { gap: space.xs },
}));
