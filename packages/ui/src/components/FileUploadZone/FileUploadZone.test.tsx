// File: packages/ui/src/components/FileUploadZone/FileUploadZone.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploadZone } from './FileUploadZone';

function makeFile(name = 'test.txt', size = 1024, type = 'text/plain'): File {
  const file = new File(['x'.repeat(size)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('FileUploadZone', () => {
  it('renders the drop zone with the correct aria-label', () => {
    render(<FileUploadZone />);
    expect(
      screen.getByRole('button', { name: /upload files — click or drag and drop/i })
    ).toBeInTheDocument();
  });

  it('shows default instruction text', () => {
    render(<FileUploadZone />);
    expect(screen.getByText(/click to upload or drag and drop/i)).toBeInTheDocument();
  });

  it('shows accepted types and max size hint when provided', () => {
    render(<FileUploadZone accept={['image/*', 'application/pdf']} maxSizeBytes={1024 * 1024} />);
    expect(screen.getByText(/image\/\*, application\/pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/max 1 MB/i)).toBeInTheDocument();
  });

  it('shows "Drop to upload" text while dragging over the zone', () => {
    render(<FileUploadZone />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    fireEvent.dragOver(zone);
    expect(screen.getByText('Drop to upload')).toBeInTheDocument();
  });

  it('reverts to default text when drag leaves', () => {
    render(<FileUploadZone />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    fireEvent.dragOver(zone);
    fireEvent.dragLeave(zone);
    expect(screen.getByText(/click to upload or drag and drop/i)).toBeInTheDocument();
  });

  it('adds a file entry when a file is dropped', () => {
    render(<FileUploadZone onUpload={() => new Promise(() => {})} />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    const file = makeFile('hello.txt');
    fireEvent.drop(zone, {
      dataTransfer: { files: [file] },
    });
    expect(screen.getByText('hello.txt')).toBeInTheDocument();
  });

  it('shows error entry when file exceeds maxSizeBytes', () => {
    render(<FileUploadZone maxSizeBytes={100} />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    const bigFile = makeFile('big.txt', 200);
    fireEvent.drop(zone, {
      dataTransfer: { files: [bigFile] },
    });
    expect(screen.getByText('big.txt')).toBeInTheDocument();
    expect(screen.getByText(/file exceeds maximum size/i)).toBeInTheDocument();
  });

  it('shows progressbar while uploading', async () => {
    const onUpload = vi.fn(() => new Promise<void>(() => {})); // never resolves
    render(<FileUploadZone onUpload={onUpload} />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    const file = makeFile('upload.txt');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    // The outer wrapper div has a unique aria-label; use that to avoid matching
    // the nested Radix Progress primitive which also carries role="progressbar".
    await waitFor(() =>
      expect(screen.getByLabelText(/uploading upload\.txt/i)).toBeInTheDocument()
    );
  });

  it('calls onUpload with the file when dropped', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUploadZone onUpload={onUpload} />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    const file = makeFile('data.txt');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce());
    expect(onUpload.mock.calls[0][0]).toBe(file);
  });

  it('shows upload complete icon after successful upload', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUploadZone onUpload={onUpload} />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    const file = makeFile('done.txt');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText('Upload complete')).toBeInTheDocument());
  });

  it('shows error state when upload rejects', async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<FileUploadZone onUpload={onUpload} />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    const file = makeFile('fail.txt');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });

  it('shows cancelled state when upload is aborted', async () => {
    let abortFn: (() => void) | undefined;
    const onUpload = vi.fn(
      (_file: File, _onProgress: (pct: number) => void, signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          abortFn = () => {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            reject(err);
          };
          signal.addEventListener('abort', abortFn);
        })
    );
    render(<FileUploadZone onUpload={onUpload} />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    const file = makeFile('cancel.txt');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByLabelText(/uploading cancel\.txt/i)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel upload of cancel\.txt/i }));
    await waitFor(() => expect(screen.getByText('Upload cancelled')).toBeInTheDocument());
  });

  it('removes an entry from the queue when dismiss/remove is clicked', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUploadZone onUpload={onUpload} />);
    const zone = screen.getByRole('button', { name: /upload files/i });
    const file = makeFile('remove.txt');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText('Upload complete')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /dismiss remove\.txt/i }));
    expect(screen.queryByText('remove.txt')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<FileUploadZone className="custom-zone" />);
    expect(container.firstElementChild).toHaveClass('custom-zone');
  });
});
