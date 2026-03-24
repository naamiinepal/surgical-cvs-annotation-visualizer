/* ═══════════════════════════════════════════════════════════════════
Constants & Helpers
═══════════════════════════════════════════════════════════════════ */

export const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".tiff",
  ".tif",
  ".webp",
]);

export const CRITERIA = [
  { label: "C1", color: "#ef4444" },
  { label: "C2", color: "#22c55e" },
  { label: "C3", color: "#3b82f6" },
] as const;