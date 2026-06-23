// template-card.tsx
// Card component for displaying a workspace template.

import { FormattedMessage } from 'react-intl';
import { Layers } from 'lucide-react';
import { Badge } from '@plexica/ui';

import { getTemplateChildren } from '../../types/workspace.js';

import type { WorkspaceTemplate } from '../../types/workspace.js';

interface TemplateCardProps {
  template: WorkspaceTemplate;
}

export function TemplateCard({ template }: TemplateCardProps): JSX.Element {
  const children = getTemplateChildren(template);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
          <h3 className="font-medium text-neutral-900">{template.name}</h3>
        </div>
        {template.isBuiltin && <Badge variant="default" label="Built-in" />}
      </div>
      {template.description !== null && (
        <p className="mt-1 text-sm text-neutral-500">{template.description}</p>
      )}
      {children.length > 0 && (
        <p className="mt-2 text-xs text-neutral-500">
          {children.length} <FormattedMessage id="workspace.detail.children" />
        </p>
      )}
    </div>
  );
}
