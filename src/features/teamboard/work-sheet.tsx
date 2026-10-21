// Add a Work, add a Sub work, or rename one (WorkFormModal 14531 and WorkDetailModal's edit 14572):
// just a name and a description. Who does it, type, priority and dates come later in the task form.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createWork, tbKeys, type TrTask, updateTask } from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { Banner, Button, haptic, Sheet, TextField, toast } from '@/ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  projectId: string;
  /** Set for a Sub work. */
  parentId?: string | null;
  /** Set to rename an existing Work. */
  work?: TrTask | null;
  onDone?: (id?: string) => void;
};

export function WorkSheet(props: Props) {
  // A fresh draft each time it opens.
  return props.visible ? <Body key={props.work?.id ?? props.parentId ?? 'new'} {...props} /> : null;
}

function Body({ onClose, projectId, parentId, work, onDone }: Props) {
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const sub = !!parentId;
  const [name, setName] = useState(work?.title ?? '');
  const [description, setDescription] = useState(work?.description ?? '');
  const [tried, setTried] = useState(false);
  const what = sub ? 'Sub work' : 'Work';

  const save = useMutation({
    mutationFn: async () => {
      if (work) {
        await updateTask(work.id, {
          title: name.trim(),
          description: description.trim(),
        });
        return work.id;
      }
      return (await createWork(projectId, parentId ?? null, name.trim(), description.trim()))?.id;
    },
    onSuccess: (id) => {
      haptic.success();
      toast.show(work ? 'Saved' : `${what} added`, 'success');
      void qc.invalidateQueries({ queryKey: tbKeys.all(uid) });
      onClose();
      onDone?.(id);
    },
    onError: () => haptic.error(),
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={work ? `Edit ${what.toLowerCase()}` : `Add ${what.toLowerCase()}`}
      subtitle={work ? undefined : sub ? 'Give it a name now; assign it after.' : 'Plan it now; break it into sub works and assign those.'}
      dirty={(!!name.trim() || !!description.trim()) && !save.isPending && !work}
      footer={
        <Button
          title={work ? 'Save' : `Add ${what.toLowerCase()}`}
          loading={save.isPending}
          onPress={() => {
            setTried(true);
            if (name.trim()) save.mutate();
          }}
        />
      }>
      <TextField
        label={`${what} name`}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Client onboarding"
        maxLength={160}
        autoFocus={!work}
        error={tried && !name.trim() ? `${what} name is required` : null}
      />
      <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline maxLength={2000} />
      {save.error ? <Banner tone="danger" title="Couldn’t save" message={save.error.message} /> : null}
    </Sheet>
  );
}
