// File: packages/ui/src/components/FileListItem/FileListItem.tsx
// T007-27 — Displays a stored file with download + delete actions

import * as React from 'react';
import {
  Download,
  Trash2,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  File,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../Button/Button';
import type { FileInfo } from './FileListItem.types';

export type { FileInfo };

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

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

function FileTypeIcon({ contentType, className }: { contentType: string; className?: string }) {
  if (contentType.startsWith('image/'))
    return <FileImage className={className} aria-hidden="true" />;
  if (contentType.startsWith('video/'))
    return <FileVideo className={className} aria-hidden="true" />;
  if (contentType.startsWith('audio/'))
    return <FileAudio className={className} aria-hidden="true" />;
  if (contentType.startsWith('text/') || contentType.includes('document'))
    return <FileText className={className} aria-hidden="true" />;
  if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('gz'))
    return <FileArchive className={className} aria-hidden="true" />;
  return <File className={className} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface FileListItemProps {
  /** The file metadata to display. */
  file: FileInfo;
  /** Called when user clicks Download. */
  onDownload?: (file: FileInfo) => void;
  /** Called when user clicks Delete. */
  onDelete?: (file: FileInfo) => void;
  /** Display as a table row (default) or compact card. */
  variant?: 'row' | 'compact';
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const FileListItem = React.forwardRef<HTMLDivElement, FileListItemProps>(
  ({ file, onDownload, onDelete, variant = 'row', className }, ref) => {
    if (variant === 'compact') {
      return (
        <div
          ref={ref}
          className={cn(
            'flex items-center gap-3 rounded-lg border border-border bg-card p-3',
            className
          )}
        >
          <div className="shrink-0 text-muted-foreground">
            <FileTypeIcon contentType={file.contentType} className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{file.filename}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size)} · {formatDate(file.uploadedAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onDownload && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDownload(file)}
                aria-label={`Download ${file.filename}`}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(file)}
                aria-label={`Delete ${file.filename}`}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      );
    }

    // Default: table row layout
    return (
      <div
        ref={ref}
        role="row"
        className={cn(
          'flex items-center gap-4 border-b border-border px-4 py-3 hover:bg-muted/50 transition-colors',
          className
        )}
      >
        <div className="shrink-0 text-muted-foreground" role="cell">
          <FileTypeIcon contentType={file.contentType} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1" role="cell">
          <p className="truncate text-sm font-medium text-foreground">{file.filename}</p>
          <p className="text-xs text-muted-foreground">{file.contentType}</p>
        </div>
        <div className="shrink-0 text-sm text-muted-foreground" role="cell">
          {formatBytes(file.size)}
        </div>
        <div className="shrink-0 text-sm text-muted-foreground" role="cell">
          {formatDate(file.uploadedAt)}
        </div>
        <div className="flex shrink-0 items-center gap-1" role="cell">
          {onDownload && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDownload(file)}
              aria-label={`Download ${file.filename}`}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Download</span>
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(file)}
              aria-label={`Delete ${file.filename}`}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Delete</span>
            </Button>
          )}
        </div>
      </div>
    );
  }
);
FileListItem.displayName = 'FileListItem';

export { FileListItem };
