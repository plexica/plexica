// File: packages/ui/src/components/FileListItem/FileListItem.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileListItem } from './FileListItem';
import type { FileInfo } from './FileListItem.types';

const meta: Meta<typeof FileListItem> = {
  title: 'Components/FileListItem',
  component: FileListItem,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof FileListItem>;

const PDF_FILE: FileInfo = {
  key: 'uploads/report.pdf',
  filename: 'Q4-Report.pdf',
  contentType: 'application/pdf',
  size: 2_456_789,
  uploadedAt: new Date('2026-03-01T10:30:00Z'),
  bucket: 'tenant-abc',
};

const IMAGE_FILE: FileInfo = {
  key: 'uploads/banner.png',
  filename: 'banner.png',
  contentType: 'image/png',
  size: 512_000,
  uploadedAt: new Date('2026-03-02T08:00:00Z'),
  bucket: 'tenant-abc',
};

const VIDEO_FILE: FileInfo = {
  key: 'uploads/demo.mp4',
  filename: 'product-demo.mp4',
  contentType: 'video/mp4',
  size: 52_428_800,
  uploadedAt: new Date('2026-02-28T15:45:00Z'),
  bucket: 'tenant-abc',
};

export const TableRowPDF: Story = {
  args: {
    file: PDF_FILE,
    onDownload: (f) => alert(`Download: ${f.filename}`),
    onDelete: (f) => alert(`Delete: ${f.filename}`),
  },
};

export const TableRowImage: Story = {
  args: { file: IMAGE_FILE, onDownload: () => {}, onDelete: () => {} },
};

export const TableRowVideo: Story = {
  args: { file: VIDEO_FILE, onDownload: () => {}, onDelete: () => {} },
};

export const CompactCard: Story = {
  args: { file: PDF_FILE, variant: 'compact', onDownload: () => {}, onDelete: () => {} },
};

export const ReadOnly: Story = {
  args: { file: IMAGE_FILE },
};

export const FileList: Story = {
  render: () => (
    <div className="rounded-lg border border-border">
      {[PDF_FILE, IMAGE_FILE, VIDEO_FILE].map((f) => (
        <FileListItem key={f.key} file={f} onDownload={() => {}} onDelete={() => {}} />
      ))}
    </div>
  ),
};
