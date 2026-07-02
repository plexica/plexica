// plugin-detail-sections.tsx
// Extracted sub-components for PluginDetailSheet to keep files under 200 lines
// (Constitution Rule 4). Used by plugin-detail-sheet.tsx.

import type { ReactNode } from 'react';
import type { PluginAction, PluginTable } from '../../types/plugin.js';

export function InfoSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="mb-4 rounded-lg border border-neutral-200 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-700">
        {icon}
        <span>{title}</span>
      </h3>
      {children}
    </div>
  );
}

export function PermissionsSummary({ actions }: { actions: PluginAction[] }): JSX.Element {
  return (
    <ul className="space-y-1">
      {actions.map((a) => (
        <li key={a.key} className="flex items-center justify-between text-xs text-neutral-600">
          <span>{a.label}</span>
          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-500">
            {a.defaultRole}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DataTablesSummary({ tables }: { tables: PluginTable[] }): JSX.Element {
  return (
    <ul className="space-y-1">
      {tables.map((t) => (
        <li key={t.name} className="flex items-center justify-between text-xs text-neutral-600">
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs">{t.name}</code>
          <span className="text-neutral-400">{t.description}</span>
        </li>
      ))}
    </ul>
  );
}

export function EventsSummary({ events }: { events: string[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {events.map((e) => (
        <span key={e} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono text-neutral-500">
          {e}
        </span>
      ))}
    </div>
  );
}
