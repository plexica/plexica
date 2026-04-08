// create-workspace-dialog.tsx
// Dialog form for creating a new workspace.
// Uses react-hook-form + Zod. All strings via react-intl.

import { useIntl, FormattedMessage } from 'react-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Input,
  Textarea,
  Select,
  DialogRoot,
  DialogContent,
  DialogTitle,
} from '@plexica/ui';

import { useCreateWorkspace } from '../../hooks/use-workspaces.js';
import { useWorkspaces } from '../../hooks/use-workspaces.js';
import { useWorkspaceTemplates } from '../../hooks/use-workspace-templates.js';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentId: z.string().optional(),
  templateId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps): JSX.Element {
  const intl = useIntl();
  const { mutate, isPending } = useCreateWorkspace();
  const { data: workspacesData } = useWorkspaces();
  const { data: templatesData } = useWorkspaceTemplates();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function onSubmit(values: FormValues): void {
    const payload = {
      name: values.name,
      ...(values.description ? { description: values.description } : {}),
      ...(values.parentId ? { parentId: values.parentId } : {}),
      ...(values.templateId ? { templateId: values.templateId } : {}),
    };
    mutate(payload, {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    });
  }

  const workspaceOptions = (workspacesData?.data ?? []).map((w) => ({
    value: w.id,
    label: w.name,
  }));

  const templateOptions = (templatesData?.data ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={intl.formatMessage({ id: 'common.cancel' })}>
        <DialogTitle>
          <FormattedMessage id="workspace.create.title" />
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <Input
            label={intl.formatMessage({ id: 'workspace.create.name.label' })}
            {...(errors.name?.message !== undefined ? { error: errors.name.message } : {})}
            {...register('name')}
          />
          <Textarea
            label={intl.formatMessage({ id: 'workspace.create.description.label' })}
            {...register('description')}
          />
          {workspaceOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                <FormattedMessage id="workspace.create.parent.label" />
              </label>
              <Select
                options={workspaceOptions}
                placeholder="None"
                onValueChange={(v) => setValue('parentId', v)}
                aria-label={intl.formatMessage({ id: 'workspace.create.parent.label' })}
              />
            </div>
          )}
          {templateOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                <FormattedMessage id="workspace.create.template.label" />
              </label>
              <Select
                options={templateOptions}
                placeholder="None"
                onValueChange={(v) => setValue('templateId', v)}
                aria-label={intl.formatMessage({ id: 'workspace.create.template.label' })}
              />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              <FormattedMessage id="common.cancel" />
            </Button>
            <Button type="submit" loading={isPending}>
              <FormattedMessage id="workspace.create.submit" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
