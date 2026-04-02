"use client";

interface TimelineControlsProps {
  frame: string;
  frameIdx: number;
  total: number;
  goFrame: (d: number) => void;
}

export function TimelineControls({
  frame,
  frameIdx,
  total,
  goFrame,
}: TimelineControlsProps) {
  return (
    <div
      className="shrink-0 flex items-center justify-between px-6 h-14"
      style={{
        background: "var(--controls-bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => goFrame(-1)}
          disabled={frameIdx === 0}
          className="w-7 h-7 flex items-center justify-center rounded disabled:opacity-20 disabled:cursor-not-allowed transition text-[11px]"
          style={{ background: "var(--btn-bg)" }}
        >
          ◀
        </button>
        <div className="text-center min-w-[180px]">
          <div
            className="text-[11px] truncate font-mono"
            style={{ color: "var(--fg)" }}
          >
            {frame}
          </div>
          <div
            className="text-[10px] tabular-nums"
            style={{ color: "var(--fg-faint)" }}
          >
            {frameIdx + 1} / {total}
          </div>
        </div>
        <button
          onClick={() => goFrame(1)}
          disabled={frameIdx >= total - 1}
          className="w-7 h-7 flex items-center justify-center rounded disabled:opacity-20 disabled:cursor-not-allowed transition text-[11px]"
          style={{ background: "var(--btn-bg)" }}
        >
          ▶
        </button>
      </div>

      <div
        className="flex items-center gap-5 text-[9px] uppercase tracking-widest"
        style={{ color: "var(--fg-faint)" }}
      >
        <span>← → Navigate Frames</span>
        <span>↑ ↓ Switch Videos</span>
      </div>
    </div>
  );
}
