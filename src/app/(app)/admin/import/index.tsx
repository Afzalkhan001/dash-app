// Import & export — the phone's home for every bulk upload and Excel download the website has
// (features/excel/catalog, gates in features/excel/access). Uploads: pick a sheet, check every row,
// swipe to save. Downloads: choose what to include, then a real .xlsx goes to the share sheet.

import { Redirect, useRouter } from 'expo-router';
import { History } from 'lucide-react-native';

import { EXPORT_GROUP_ORDER, EXPORT_GROUP_TITLE, EXPORTS, IMPORTS } from '@/features/excel/catalog';
import { useExcelAccess } from '@/features/excel/gate';
import { ActivityList, ActivityRow, Banner, NavHeader, Screen, SkeletonList } from '@/ui';

export default function ImportExportHub() {
  const router = useRouter();
  const { user, gates, ready } = useExcelAccess();

  if (ready && !gates.any) return <Redirect href="/" />;

  const imports = IMPORTS.filter((i) => gates.imports[i.key]);
  const history = gates.imports.employees || gates.imports.assets;
  const groups = EXPORT_GROUP_ORDER.map((g) => ({ g, rows: EXPORTS.filter((e) => e.group === g && gates.exports[e.key]) })).filter((x) => x.rows.length);

  return (
    <Screen header={<NavHeader title="Import & export" />}>
      {!ready || !user ? (
        <SkeletonList rows={5} />
      ) : (
        <>
          <Banner
            tone="info"
            title="Excel, the same as the website"
            message={
              imports.length
                ? 'Uploads use the website’s templates and save nothing until you have checked every row. Downloads are real Excel files you can share.'
                : 'Every download is a real Excel file. Send it to Files, Drive, WhatsApp or email from the share sheet.'
            }
          />
          {imports.length ? (
            <ActivityList title="Upload a sheet">
              {imports.map((i) => (
                <ActivityRow key={i.key} title={i.title} subtitle={i.subtitle} module={i.module} icon={i.icon} chevron onPress={() => router.push(i.href)} />
              ))}
              {history ? (
                <ActivityRow
                  title="Upload history"
                  subtitle="Past employee and asset uploads, to download again"
                  module="timesheets"
                  icon={History}
                  chevron
                  onPress={() => router.push('/admin/import/history')}
                />
              ) : null}
            </ActivityList>
          ) : null}
          {groups.map(({ g, rows }, gi) => (
            <ActivityList key={g} title={EXPORT_GROUP_TITLE[g]} overline={gi === 0 ? 'Download as Excel' : undefined}>
              {rows.map((e) => (
                <ActivityRow
                  key={e.key}
                  title={e.title}
                  subtitle={e.subtitle}
                  module={e.module}
                  icon={e.icon}
                  chevron
                  onPress={() => router.push({ pathname: '/admin/import/export/[key]', params: { key: e.key } })}
                />
              ))}
            </ActivityList>
          ))}
        </>
      )}
    </Screen>
  );
}
