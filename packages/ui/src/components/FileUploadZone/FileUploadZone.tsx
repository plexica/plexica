// File: packages/ui/src/components/FileUploadZone/FileUploadZone.tsx
// T007-26 — Drag-and-drop file upload with XHR progress, size validation, cancel/retry

import * as React from 'react';
import { Upload, X, RotateCcw, CheckCircle, AlertCircle, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../Button/Button';
import { Progress } from '../Progress/Progress';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UploadFile {
  id: string;
  file: File;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'done' | 'error' | 'cancelled';
  error?: string;
  abortController?: AbortController;
}

export interface FileUploadZoneProps {
  /**
   * Called for each accepted file with an XHR progress callback and abort signal.
   * Should return a promise that resolves when upload is complete.
   */
  onUpload?: (file: File, onProgress: (pct: number) => void, signal: AbortSignal) => Promise<void>;
  /** Accepted MIME types (e.g. ['image/*', 'application/pdf']). */
  accept?: string[];
  /** Maximum file size in bytes. */
  maxSizeBytes?: number;
  /** Allow multiple files to be selected/dropped. */
  multiple?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function uniqueId(): string {
  return Math.random().toString(36).slice(2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const FileUploadZone = React.forwardRef<HTMLDivElement, FileUploadZoneProps>(
  ({ onUpload, accept, maxSizeBytes, multiple = false, className }, ref) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [uploads, setUploads] = React.useState<UploadFile[]>([]);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const updateUpload = (id: string, patch: Partial<UploadFile>) => {
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    };

    const processFiles = (fileList: FileList | File[]) => {
      const files = Array.from(fileList);

      for (const file of files) {
        // Client-side size validation
        if (maxSizeBytes && file.size > maxSizeBytes) {
          const entry: UploadFile = {
            id: uniqueId(),
            file,
            progress: 0,
            status: 'error',
            error: `File exceeds maximum size of ${formatBytes(maxSizeBytes)}`,
          };
          setUploads((prev) => [...prev, entry]);
          continue;
        }

        const ac = new AbortController();
        const entry: UploadFile = {
          id: uniqueId(),
          file,
          progress: 0,
          status: 'pending',
          abortController: ac,
        };

        setUploads((prev) => [...prev, entry]);

        if (!onUpload) {
          updateUpload(entry.id, { status: 'done', progress: 100 });
          continue;
        }

        updateUpload(entry.id, { status: 'uploading' });
        onUpload(file, (pct) => updateUpload(entry.id, { progress: pct }), ac.signal)
          .then(() => updateUpload(entry.id, { status: 'done', progress: 100 }))
          .catch((err: Error) => {
            if (err.name === 'AbortError') {
              updateUpload(entry.id, { status: 'cancelled' });
            } else {
              updateUpload(entry.id, { status: 'error', error: err.message ?? 'Upload failed' });
            }
          });
      }
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length) {
        processFiles(e.dataTransfer.files);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };

    const handleDragLeave = () => setIsDragOver(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        processFiles(e.target.files);
        // Reset so re-selecting same file works
        e.target.value = '';
      }
    };

    const handleCancel = (upload: UploadFile) => {
      upload.abortController?.abort();
    };

    const handleRetry = (upload: UploadFile) => {
      const ac = new AbortController();
      updateUpload(upload.id, {
        status: 'uploading',
        progress: 0,
        error: undefined,
        abortController: ac,
      });
      if (!onUpload) {
        updateUpload(upload.id, { status: 'done', progress: 100 });
        return;
      }
      onUpload(upload.file, (pct) => updateUpload(upload.id, { progress: pct }), ac.signal)
        .then(() => updateUpload(upload.id, { status: 'done', progress: 100 }))
        .catch((err: Error) => {
          if (err.name === 'AbortError') {
            updateUpload(upload.id, { status: 'cancelled' });
          } else {
            updateUpload(upload.id, { status: 'error', error: err.message ?? 'Upload failed' });
          }
        });
    };

    const handleRemove = (id: string) => {
      setUploads((prev) => prev.filter((u) => u.id !== id));
    };

    const acceptStr = accept?.join(',');

    return (
      <div ref={ref} className={cn('space-y-3', className)}>
        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload files — click or drag and drop"
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <Upload
            className={cn(
              'mb-3 h-10 w-10 transition-colors',
              isDragOver ? 'text-primary' : 'text-muted-foreground'
            )}
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-foreground">
            {isDragOver ? 'Drop to upload' : 'Click to upload or drag and drop'}
          </p>
          {(accept || maxSizeBytes) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {accept && accept.join(', ')}
              {accept && maxSizeBytes && ' · '}
              {maxSizeBytes && `Max ${formatBytes(maxSizeBytes)}`}
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={acceptStr}
            multiple={multiple}
            className="sr-only"
            onChange={handleInputChange}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>

        {/* Upload progress list */}
        {uploads.length > 0 && (
          <ul className="space-y-2" aria-label="Upload queue">
            {uploads.map((upload) => (
              <li
                key={upload.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <File className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {upload.file.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(upload.file.size)}
                    </span>
                  </div>

                  {upload.status === 'uploading' && (
                    <div
                      role="progressbar"
                      aria-valuenow={upload.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Uploading ${upload.file.name}: ${upload.progress}%`}
                    >
                      <Progress value={upload.progress} className="h-1.5" />
                    </div>
                  )}

                  {upload.status === 'error' && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      {upload.error ?? 'Upload failed'}
                    </p>
                  )}

                  {upload.status === 'cancelled' && (
                    <p className="text-xs text-muted-foreground">Upload cancelled</p>
                  )}
                </div>

                {/* Status icon */}
                {upload.status === 'done' && (
                  <CheckCircle
                    className="h-4 w-4 shrink-0 text-green-500"
                    aria-label="Upload complete"
                  />
                )}

                {/* Actions */}
                <div className="flex shrink-0 gap-1">
                  {upload.status === 'uploading' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(upload)}
                      aria-label={`Cancel upload of ${upload.file.name}`}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}

                  {(upload.status === 'error' || upload.status === 'cancelled') && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRetry(upload)}
                        aria-label={`Retry upload of ${upload.file.name}`}
                        className="h-7 w-7 p-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(upload.id)}
                        aria-label={`Remove ${upload.file.name} from queue`}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </>
                  )}

                  {upload.status === 'done' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(upload.id)}
                      aria-label={`Dismiss ${upload.file.name}`}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);
FileUploadZone.displayName = 'FileUploadZone';

export { FileUploadZone };
