declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it';
  const taskLists: PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>;
  export default taskLists;
}

// File System Access API (Chromium only; not yet in lib.dom.d.ts)
interface Window {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

interface FileSystemHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}
