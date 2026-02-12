// File: packages/ui/src/stories/foundations/Icons.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  HelpCircle,
  Home,
  Info,
  Loader2,
  LogOut,
  Menu,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import '../../styles/globals.css';

const iconCategories = [
  {
    title: 'Navigation',
    icons: [
      { Icon: ChevronLeft, name: 'ChevronLeft', usage: 'Back, previous page' },
      { Icon: ChevronRight, name: 'ChevronRight', usage: 'Forward, next page' },
      { Icon: ChevronDown, name: 'ChevronDown', usage: 'Dropdown trigger' },
      { Icon: Home, name: 'Home', usage: 'Home/dashboard link' },
      { Icon: Menu, name: 'Menu', usage: 'Mobile menu toggle' },
      { Icon: ExternalLink, name: 'ExternalLink', usage: 'Opens in new tab' },
    ],
  },
  {
    title: 'Actions',
    icons: [
      { Icon: Plus, name: 'Plus', usage: 'Create/add' },
      { Icon: Edit, name: 'Edit', usage: 'Edit/modify' },
      { Icon: Trash2, name: 'Trash2', usage: 'Delete' },
      { Icon: Copy, name: 'Copy', usage: 'Copy to clipboard' },
      { Icon: Download, name: 'Download', usage: 'Download/export' },
      { Icon: Search, name: 'Search', usage: 'Search' },
      { Icon: Filter, name: 'Filter', usage: 'Filter results' },
      { Icon: ArrowUpDown, name: 'ArrowUpDown', usage: 'Sort toggle' },
      { Icon: MoreHorizontal, name: 'MoreHorizontal', usage: 'More actions (horizontal)' },
      { Icon: MoreVertical, name: 'MoreVertical', usage: 'More actions (vertical)' },
    ],
  },
  {
    title: 'Status & Feedback',
    icons: [
      { Icon: Info, name: 'Info', usage: 'Info alert (default)' },
      { Icon: CheckCircle2, name: 'CheckCircle2', usage: 'Success alert' },
      { Icon: AlertCircle, name: 'AlertCircle', usage: 'Warning alert' },
      { Icon: XCircle, name: 'XCircle', usage: 'Error/destructive alert' },
      { Icon: Check, name: 'Check', usage: 'Checkbox checked, confirmation' },
      { Icon: Loader2, name: 'Loader2', usage: 'Loading spinner (animated)' },
      { Icon: HelpCircle, name: 'HelpCircle', usage: 'Help/tooltip trigger' },
    ],
  },
  {
    title: 'UI Controls',
    icons: [
      { Icon: X, name: 'X', usage: 'Close/dismiss' },
      { Icon: Eye, name: 'Eye', usage: 'Show/visible' },
      { Icon: EyeOff, name: 'EyeOff', usage: 'Hide/invisible' },
      { Icon: Settings, name: 'Settings', usage: 'Settings/configuration' },
      { Icon: User, name: 'User', usage: 'User profile/account' },
      { Icon: LogOut, name: 'LogOut', usage: 'Sign out' },
    ],
  },
];

function IconGrid({
  title,
  icons,
}: {
  title: string;
  icons: { Icon: React.ComponentType<{ className?: string }>; name: string; usage: string }[];
}) {
  return (
    <section style={{ marginBottom: '32px' }}>
      <h3
        style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', fontFamily: 'monospace' }}
      >
        {title}
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '8px',
        }}
      >
        {icons.map(({ Icon, name, usage }) => (
          <div
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
            }}
          >
            <Icon className="h-4 w-4" />
            <div>
              <div style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace' }}>
                {name}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{usage}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IconsPage() {
  return (
    <div style={{ padding: '24px', fontFamily: "'JetBrains Mono Variable', monospace" }}>
      <h1 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '8px' }}>Iconography</h1>
      <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '8px' }}>
        All icons come from <strong>Lucide React</strong> (<code>lucide-react</code>).
      </p>
      <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '32px' }}>
        Standard size: <code>h-4 w-4</code> (16px). Default stroke width: 2.
      </p>

      {/* Size examples */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Sizes</h3>
        <div style={{ display: 'flex', alignItems: 'end', gap: '24px' }}>
          {[
            { size: 'h-3 w-3', label: '12px', px: 12 },
            { size: 'h-4 w-4', label: '16px (default)', px: 16 },
            { size: 'h-5 w-5', label: '20px', px: 20 },
            { size: 'h-6 w-6', label: '24px', px: 24 },
            { size: 'h-8 w-8', label: '32px', px: 32 },
            { size: 'h-12 w-12', label: '48px (empty state)', px: 48 },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <Settings style={{ width: s.px, height: s.px }} />
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {iconCategories.map((cat) => (
        <IconGrid key={cat.title} title={cat.title} icons={cat.icons} />
      ))}

      {/* Usage example */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Usage</h3>
        <pre
          style={{
            backgroundColor: 'var(--muted)',
            padding: '16px',
            borderRadius: '4px',
            fontSize: '13px',
            overflow: 'auto',
          }}
        >
          {`import { X, ChevronLeft, Info } from 'lucide-react';

// Standard inline icon
<X className="h-4 w-4" />

// Icon with semantic color
<Info className="h-4 w-4 text-blue-500" />

// Icon button
<Button variant="ghost" size="icon">
  <X className="h-4 w-4" />
</Button>`}
        </pre>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: 'Foundations/Icons',
  component: IconsPage,
  parameters: {
    layout: 'fullscreen',
  },
};
export default meta;

type Story = StoryObj;

export const Catalog: Story = {
  render: () => <IconsPage />,
};
