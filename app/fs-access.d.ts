/* File System Access API type augmentations (Chromium only) */

declare global {
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemHandle>;
    getDirectoryHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<FileSystemDirectoryHandle>;
    getFileHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<FileSystemFileHandle>;
  }

  interface FileSystemFileHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | BufferSource | Blob): Promise<void>;
    close(): Promise<void>;
  }

  interface Window {
    showDirectoryPicker(options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: string;
    }): Promise<FileSystemDirectoryHandle>;
  }
}

export {};
