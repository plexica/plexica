// workspace-templates-page.tsx
// Lists all workspace templates.

import { FormattedMessage } from 'react-intl';
import { LayoutTemplate } from 'lucide-react';

import { useWorkspaceTemplates } from '../hooks/use-workspace-templates.js';
import { TemplateCard } from '../components/workspace/template-card.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';
import { PageError } from '../components/feedback/page-error.js';

function TemplatesSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-36" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLoader key={i} variant="card" className="h-36" />
        ))}
      </div>
    </div>
  );
}

export function WorkspaceTemplatesPage(): JSX.Element {
  const { data, isPending, isError, refetch } = useWorkspaceTemplates();

  if (isPending) return <TemplatesSkeleton />;
  if (isError) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

  const templates = data ?? [];

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="workspace.create.template.label" />
      </h1>

      {templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          heading={<FormattedMessage id="workspace.templates.empty" />}
          description={<FormattedMessage id="workspace.templates.empty.description" />}
        />
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
