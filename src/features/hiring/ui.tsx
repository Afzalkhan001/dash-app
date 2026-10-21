// Hiring domain — small building blocks the hiring screens share: a posting's picture or badge, a
// posting row, a candidate's heading card, a switch row and the résumé row.

import { Image } from 'expo-image';
import { BriefcaseBusiness, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import { fetchReferralResume, type JobOpening, useJobImage } from '@/api/hiring';
import { FileError, saveDataUrl, shareFile } from '@/lib/files';
import { coins, bonusOf, isOpen, whereLine } from '@/features/hiring/model';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space, type StatusTone } from '@/theme/tokens';
import { AccountRow, Avatar, Card, isDarkScheme, ListRow, ModuleBadge, StatusPill, Text } from '@/ui';

/** The posting's picture when it has one (lazy, never stored on the phone), else the module badge. */
export function JobThumb({ job, size = 40 }: { job: Pick<JobOpening, 'id' | 'hasImage' | 'position'>; size?: number }) {
  const img = useJobImage(job);
  if (img.data) {
    return (
      <Image
        source={{ uri: img.data }}
        style={{ width: size, height: size, borderRadius: size >= 56 ? radius.md : radius.sm }}
        contentFit="cover"
        cachePolicy="none"
        accessibilityLabel={`${job.position} picture`}
      />
    );
  }
  return <ModuleBadge module="people" icon={BriefcaseBusiness} size={size} />;
}

/** A posting as a list row: picture, title, where, the bonus on the right and its open/closed pill. */
export function JobRow({ job, sub, onPress, showStatus = true }: { job: JobOpening; sub?: string | null; onPress?: () => void; showStatus?: boolean }) {
  const bonus = bonusOf(job);
  const open = isOpen(job);
  return (
    <ListRow
      left={<JobThumb job={job} />}
      title={job.position}
      subtitle={sub ?? (whereLine(job) || null)}
      numberOfLines={2}
      subtitleLines={2}
      value={bonus ? coins(bonus) : null}
      valueMeta={bonus ? 'referral bonus' : null}
      below={showStatus ? <StatusPill label={open ? 'Open' : 'Closed'} tone={open ? 'done' : 'neutral'} /> : undefined}
      onPress={onPress}
      chevron={!!onPress}
      accessibilityLabel={[job.position, whereLine(job), bonus ? `${coins(bonus)} referral bonus` : '', showStatus ? (open ? 'open' : 'closed') : ''].filter(Boolean).join(', ')}
    />
  );
}

/** A candidate's heading: initials, name, what they applied for, the status pill. */
export function CandidateHeader({ name, sub, status }: { name: string; sub?: string | null; status: { label: string; tone: StatusTone } }) {
  return (
    <Card tone="frostStrong" style={styles.head}>
      <Avatar name={name} size={56} ring={false} />
      <View style={styles.headText}>
        <Text variant="title" numberOfLines={2}>
          {name}
        </Text>
        {sub ? (
          <Text variant="caption" muted numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
        <StatusPill label={status.label} tone={status.tone} style={styles.pill} />
      </View>
    </Card>
  );
}

/** A switch as a whole-row control (the row is the switch for touch and screen readers). */
export function SwitchRow({ title, subtitle, value, onChange, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const offTrack = isDarkScheme() ? palette.hairline : palette.surfaceSunken;
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={({ pressed }) => [styles.switchRow, pressed && styles.pressed]}>
      <ListRow
        title={title}
        subtitle={subtitle}
        numberOfLines={2}
        subtitleLines={4}
        right={
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Switch value={value} disabled={disabled} trackColor={{ false: offTrack, true: palette.accentDeep }} thumbColor={palette.onAccent} ios_backgroundColor={offTrack} />
          </View>
        }
      />
    </Pressable>
  );
}

function fileProblem(e: unknown, fallback: string) {
  const msg = e instanceof FileError || e instanceof Error ? e.message : fallback;
  Alert.alert('Couldn’t open the résumé', msg || fallback);
}

/**
 * A referral's résumé (GET /referrals/:id/resume → the share sheet: save to Files, open in a PDF or
 * Word viewer). `stampNote` says the first open is recorded, for the people whose open is.
 */
export function ReferralResumeRow({ id, fileName, sub, onOpened }: { id: string; fileName?: string | null; sub?: string | null; onOpened?: () => void }) {
  const [busy, setBusy] = useState(false);
  const name = fileName?.trim() || 'Résumé';
  const open = () => {
    if (busy) return;
    setBusy(true);
    fetchReferralResume(id)
      .then(async (r) => {
        if (!r.resumeFileData) throw new FileError('There is no résumé on file.');
        const uri = await saveDataUrl(r.resumeFileData, r.resumeFileName || name);
        const mime = /^data:([^;,]+)/.exec(r.resumeFileData)?.[1];
        onOpened?.();
        await shareFile(uri, mime, 'Résumé');
      })
      .catch((e: unknown) => fileProblem(e, 'Try again.'))
      .finally(() => setBusy(false));
  };
  return (
    <AccountRow
      icon={FileText}
      module="people"
      title="Résumé"
      sub={busy ? 'Opening…' : sub || name}
      actionLabel="Open"
      onPress={open}
      accessibilityLabel={busy ? 'Résumé, opening' : `Open résumé, ${name}`}
      hint="Opens the share sheet to save or view it"
    />
  );
}

const styles = themedStyles(() => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  pill: { alignSelf: 'flex-start', marginTop: space.xxs },
  switchRow: { borderRadius: radius.md },
  pressed: { backgroundColor: palette.pressedTint },
}));
