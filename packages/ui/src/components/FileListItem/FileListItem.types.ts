// File: packages/ui/src/components/FileListItem/FileListItem.types.ts
// Shared FileInfo type — mirrors core-services.types.ts without backend import

export interface FileInfo {
  key: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
  bucket: string;
  metadata?: Record<string, string>;
}
