// File: packages/ui/src/components/FileListItem/FileListItem.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileListItem } from './FileListItem';
import type { FileInfo } from './FileListItem.types';

const makeFile = (overrides: Partial<FileInfo> = {}): FileInfo => ({
  key: 'tenant/file.pdf',
  filename: 'document.pdf',
  contentType: 'application/pdf',
  size: 1024 * 512, // 512 KB
  uploadedAt: new Date('2025-06-15T10:00:00Z'),
  bucket: 'tenant-uploads',
  ...overrides,
});

describe('FileListItem — row variant (default)', () => {
  it('renders the filename', () => {
    render(<FileListItem file={makeFile()} />);
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('renders the content type', () => {
    render(<FileListItem file={makeFile()} />);
    expect(screen.getByText('application/pdf')).toBeInTheDocument();
  });

  it('renders the formatted file size', () => {
    render(<FileListItem file={makeFile({ size: 1024 })} />);
    expect(screen.getByText('1 KB')).toBeInTheDocument();
  });

  it('renders with role="row"', () => {
    render(<FileListItem file={makeFile()} />);
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  it('shows Download button when onDownload is provided', () => {
    render(<FileListItem file={makeFile()} onDownload={vi.fn()} />);
    expect(screen.getByRole('button', { name: /download document\.pdf/i })).toBeInTheDocument();
  });

  it('calls onDownload with the file when Download is clicked', () => {
    const onDownload = vi.fn();
    const file = makeFile();
    render(<FileListItem file={file} onDownload={onDownload} />);
    fireEvent.click(screen.getByRole('button', { name: /download document\.pdf/i }));
    expect(onDownload).toHaveBeenCalledOnce();
    expect(onDownload).toHaveBeenCalledWith(file);
  });

  it('does not show Download button when onDownload is not provided', () => {
    render(<FileListItem file={makeFile()} />);
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('shows Delete button when onDelete is provided', () => {
    render(<FileListItem file={makeFile()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /delete document\.pdf/i })).toBeInTheDocument();
  });

  it('calls onDelete with the file when Delete is clicked', () => {
    const onDelete = vi.fn();
    const file = makeFile();
    render(<FileListItem file={file} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete document\.pdf/i }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(file);
  });

  it('does not show Delete button when onDelete is not provided', () => {
    render(<FileListItem file={makeFile()} />);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<FileListItem file={makeFile()} className="my-row" />);
    expect(container.firstElementChild).toHaveClass('my-row');
  });
});

describe('FileListItem — compact variant', () => {
  it('renders the filename in compact mode', () => {
    render(<FileListItem file={makeFile()} variant="compact" />);
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('renders the formatted size in compact mode', () => {
    render(<FileListItem file={makeFile({ size: 2048 })} variant="compact" />);
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
  });

  it('does NOT have role="row" in compact mode', () => {
    render(<FileListItem file={makeFile()} variant="compact" />);
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
  });

  it('calls onDownload in compact mode', () => {
    const onDownload = vi.fn();
    const file = makeFile();
    render(<FileListItem file={file} variant="compact" onDownload={onDownload} />);
    fireEvent.click(screen.getByRole('button', { name: /download document\.pdf/i }));
    expect(onDownload).toHaveBeenCalledWith(file);
  });

  it('calls onDelete in compact mode', () => {
    const onDelete = vi.fn();
    const file = makeFile();
    render(<FileListItem file={file} variant="compact" onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete document\.pdf/i }));
    expect(onDelete).toHaveBeenCalledWith(file);
  });
});

describe('FileListItem — file type icons', () => {
  it('renders for image contentType without crashing', () => {
    render(<FileListItem file={makeFile({ contentType: 'image/png', filename: 'photo.png' })} />);
    expect(screen.getByText('photo.png')).toBeInTheDocument();
  });

  it('renders for video contentType without crashing', () => {
    render(<FileListItem file={makeFile({ contentType: 'video/mp4', filename: 'clip.mp4' })} />);
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
  });

  it('renders for audio contentType without crashing', () => {
    render(<FileListItem file={makeFile({ contentType: 'audio/mpeg', filename: 'song.mp3' })} />);
    expect(screen.getByText('song.mp3')).toBeInTheDocument();
  });

  it('renders for zip contentType without crashing', () => {
    render(
      <FileListItem file={makeFile({ contentType: 'application/zip', filename: 'archive.zip' })} />
    );
    expect(screen.getByText('archive.zip')).toBeInTheDocument();
  });
});
