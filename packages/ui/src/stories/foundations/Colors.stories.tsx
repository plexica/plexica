// File: packages/ui/src/stories/foundations/Colors.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../styles/globals.css';

const semanticColors = [
  { name: 'background', label: 'Background', desc: 'Page background' },
  { name: 'foreground', label: 'Foreground', desc: 'Default text color' },
  { name: 'primary', label: 'Primary', desc: 'Primary actions, links' },
  { name: 'primary-foreground', label: 'Primary Foreground', desc: 'Text on primary' },
  { name: 'secondary', label: 'Secondary', desc: 'Secondary elements' },
  { name: 'secondary-foreground', label: 'Secondary Foreground', desc: 'Text on secondary' },
  { name: 'muted', label: 'Muted', desc: 'Muted/disabled backgrounds' },
  { name: 'muted-foreground', label: 'Muted Foreground', desc: 'Subdued text' },
  { name: 'accent', label: 'Accent', desc: 'Hover states, highlights' },
  { name: 'accent-foreground', label: 'Accent Foreground', desc: 'Text on accent' },
  { name: 'destructive', label: 'Destructive', desc: 'Delete, error actions' },
];

const surfaceColors = [
  { name: 'card', label: 'Card', desc: 'Card background' },
  { name: 'card-foreground', label: 'Card Foreground', desc: 'Card text' },
  { name: 'popover', label: 'Popover', desc: 'Popover/dropdown bg' },
  { name: 'popover-foreground', label: 'Popover Foreground', desc: 'Popover text' },
];

const borderColors = [
  { name: 'border', label: 'Border', desc: 'Default borders' },
  { name: 'input', label: 'Input', desc: 'Input borders' },
  { name: 'ring', label: 'Ring', desc: 'Focus ring' },
];

const chartColors = [
  { name: 'chart-1', label: 'Chart 1', desc: 'Light blue' },
  { name: 'chart-2', label: 'Chart 2', desc: 'Medium blue' },
  { name: 'chart-3', label: 'Chart 3', desc: 'Blue-purple' },
  { name: 'chart-4', label: 'Chart 4', desc: 'Purple' },
  { name: 'chart-5', label: 'Chart 5', desc: 'Deep purple' },
];

const sidebarColors = [
  { name: 'sidebar', label: 'Sidebar', desc: 'Sidebar background' },
  { name: 'sidebar-foreground', label: 'Sidebar Foreground', desc: 'Sidebar text' },
  { name: 'sidebar-primary', label: 'Sidebar Primary', desc: 'Active item' },
  { name: 'sidebar-primary-foreground', label: 'Sidebar Primary FG', desc: 'Active item text' },
  { name: 'sidebar-accent', label: 'Sidebar Accent', desc: 'Hover state' },
  { name: 'sidebar-accent-foreground', label: 'Sidebar Accent FG', desc: 'Hover text' },
  { name: 'sidebar-border', label: 'Sidebar Border', desc: 'Sidebar dividers' },
  { name: 'sidebar-ring', label: 'Sidebar Ring', desc: 'Sidebar focus' },
];

function ColorSwatch({ name, label, desc }: { name: string; label: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '4px',
          backgroundColor: `var(--${name})`,
          border: '1px solid var(--border)',
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>--{name}</div>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
          {label} -- {desc}
        </div>
      </div>
    </div>
  );
}

function ColorSection({
  title,
  colors,
}: {
  title: string;
  colors: { name: string; label: string; desc: string }[];
}) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <h3
        style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', fontFamily: 'monospace' }}
      >
        {title}
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '4px',
        }}
      >
        {colors.map((c) => (
          <ColorSwatch key={c.name} {...c} />
        ))}
      </div>
    </div>
  );
}

function ColorsPage() {
  return (
    <div style={{ padding: '24px', fontFamily: "'JetBrains Mono Variable', monospace" }}>
      <h1 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '8px' }}>Color Palette</h1>
      <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '32px' }}>
        All colors use the oklch color space. Toggle dark mode to see the dark theme variants.
        Defined in <code>packages/ui/src/styles/globals.css</code>.
      </p>
      <ColorSection title="Semantic Colors" colors={semanticColors} />
      <ColorSection title="Surface Colors" colors={surfaceColors} />
      <ColorSection title="Border & Input Colors" colors={borderColors} />
      <ColorSection title="Chart Colors" colors={chartColors} />
      <ColorSection title="Sidebar Colors" colors={sidebarColors} />
    </div>
  );
}

const meta: Meta = {
  title: 'Foundations/Colors',
  component: ColorsPage,
  parameters: {
    layout: 'fullscreen',
  },
};
export default meta;

type Story = StoryObj;

export const Palette: Story = {
  render: () => <ColorsPage />,
};
