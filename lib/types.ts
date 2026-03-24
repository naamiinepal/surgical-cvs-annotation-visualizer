/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */
export   type Theme = "light" | "dark" | "system";

export type CVSArray = [number, number, number];

export type FrameAnnotation = {
  avg: CVSArray;
  a1: CVSArray | null;
  a2: CVSArray | null;
  a3: CVSArray | null;
};

export type Annotations = Record<string, Record<string, FrameAnnotation>>;

export const DEFAULT_ANN: FrameAnnotation = {
  avg: [0, 0, 0],
  a1: null,
  a2: null,
  a3: null,
};

export type VideoEntry = {
  id: string;
  name: string;
  frames: string[];
  dirHandle: FileSystemDirectoryHandle;
};
