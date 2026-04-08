// file-upload.tsx — FileUpload component
// Drag-drop file upload with image preview
// WCAG 2.1 AA: keyboard accessible, aria-live for errors

import * as React from 'react';
import { Upload, X } from 'lucide-react';

import { cn } from '../lib/cn.js';

export interface FileUploadProps {
  accept: string;
  maxSizeBytes: number;
  onFile: (file: File) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  preview?: string | null;
}

export function FileUpload({
  accept,
  maxSizeBytes,
  onFile,
  label,
  error: externalError,
  disabled = false,
  preview,
}: FileUploadProps): React.JSX.Element {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const errorId = React.useId();
  const currentError = externalError ?? localError;
  const displayPreview = localPreview ?? preview ?? null;

  function validateAndAccept(file: File): void {
    const acceptedTypes = accept.split(',').map((t) => t.trim());
    const typeMatch = acceptedTypes.some((t) =>
      t.endsWith('/*') ? file.type.startsWith(t.replace('/*', '/')) : file.type === t
    );
    if (!typeMatch) {
      setLocalError('File type not accepted.');
      return;
    }
    if (file.size > maxSizeBytes) {
      const mb = (maxSizeBytes / 1_048_576).toFixed(1);
      setLocalError(`File exceeds maximum size of ${mb} MB.`);
      return;
    }
    setLocalError(null);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setLocalPreview(url);
    }
    onFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) validateAndAccept(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) validateAndAccept(file);
    e.target.value = '';
  }

  function clearPreview(): void {
    setLocalPreview(null);
    setLocalError(null);
  }

  return (
    <div className="flex flex-col gap-1">
      {label !== undefined && <span className="text-sm font-medium text-neutral-700">{label}</span>}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={currentError !== null ? errorId : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => {
          setDragOver(false);
        }}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
        }}
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          dragOver ? 'border-primary-500 bg-primary-50' : 'border-neutral-300 bg-neutral-50',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled && 'cursor-pointer hover:border-primary-400 hover:bg-primary-50'
        )}
      >
        {displayPreview !== null ? (
          <>
            <img
              src={displayPreview}
              alt="Preview"
              className="h-24 w-24 rounded-full object-cover"
            />
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearPreview();
                }}
                aria-label="Remove preview"
                className="absolute right-2 top-2 rounded-full bg-white p-1 shadow hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-neutral-400" aria-hidden="true" />
            <span className="text-sm text-neutral-500">Drag & drop or click to upload</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
          tabIndex={-1}
        />
      </div>
      <div aria-live="polite" aria-atomic="true">
        {currentError !== null && (
          <p id={errorId} className="text-sm text-error" role="alert">
            {currentError}
          </p>
        )}
      </div>
    </div>
  );
}
