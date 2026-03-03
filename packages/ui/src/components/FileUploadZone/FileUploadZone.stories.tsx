// File: packages/ui/src/components/FileUploadZone/FileUploadZone.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileUploadZone } from './FileUploadZone';

const meta: Meta<typeof FileUploadZone> = {
  title: 'Components/FileUploadZone',
  component: FileUploadZone,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof FileUploadZone>;

const mockUpload = async (
  _file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<void> => {
  for (let i = 0; i <= 100; i += 10) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise((r) => setTimeout(r, 200));
    onProgress(i);
  }
};

export const Default: Story = {
  args: { onUpload: mockUpload, multiple: true },
};

export const WithTypeAndSizeLimit: Story = {
  args: {
    onUpload: mockUpload,
    accept: ['image/*', 'application/pdf'],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    multiple: true,
  },
};

export const NoUploadHandler: Story = {
  args: { multiple: true },
};
