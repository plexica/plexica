// workspace-templates-page.tsx
// Lists all workspace templates.

import { FormattedMessage } from 'react-intl';

import { useWorkspaceTemplates } from '../hooks/use-workspace-templates.js';
import { TemplateCard } from '../components/workspace/template-card.js';

export function WorkspaceTemplatesPage(): JSX.Element {
  const { data, isPending, isError } = useWorkspaceTemplates();

  if (isPending) {
    return (
      <div className="p-6" aria-live="polite">
        <FormattedMessage id="common.loading" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6" role="alert">
        <FormattedMessage id="common.error" />
      </div>
    );
  }

  const templates = data?.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="workspace.create.template.label" />
      </h1>

      {templates.length === 0 ? (
        <p className="text-neutral-500">
          <FormattedMessage id="common.noData" />
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}
