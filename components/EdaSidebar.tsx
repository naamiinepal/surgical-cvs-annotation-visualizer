"use client";
import { CRITERIA } from "../lib/constants";
import { VideoEntry } from "../lib/types";

interface EdaSidebarProps {
  videos: VideoEntry[];
  vidIdx: number;
  setVidIdx: (i: number) => void;
  setFrameIdx: (i: number) => void;
  groupMode: "video" | "all";
  setGroupMode: (m: "video" | "all") => void;
  stats: any[];
  videoListRef: React.RefObject<HTMLDivElement>;
}

export function EdaSidebar({
  videos,
  vidIdx,
  setVidIdx,
  setFrameIdx,
  groupMode,
  setGroupMode,
  stats,
  videoListRef,
}: EdaSidebarProps) {
  const totalFrames = videos.reduce((sum, v) => sum + v.frames.length, 0);

  return (
    <aside
      className="w-56 shrink-0 flex flex-col"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      {/* Segmented toggle: Video / All */}
      <div
        className="flex items-center px-3 py-1.5 gap-1 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {(["video", "all"] as const).map((tab) => {
          const active = groupMode === tab;
          return (
            <button
              key={tab}
              onClick={() => {
                if (groupMode !== tab) {
                  setGroupMode(tab);
                  if (tab === "video") setFrameIdx(0);
                }
              }}
              className="flex-1 text-[10px] uppercase tracking-widest py-1 rounded transition-colors font-medium"
              style={{
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--fg)" : "var(--fg-faint)",
                border: active
                  ? "1px solid var(--border)"
                  : "1px solid transparent",
              }}
            >
              {tab === "video"
                ? `Videos (${videos.length})`
                : `All (${totalFrames})`}
            </button>
          );
        })}
      </div>

      <div
        className="flex items-center gap-3 px-4 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {CRITERIA.map((c, ci) => (
          <div key={ci} className="flex items-center gap-1">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: c.color }}
            />
            <span className="text-[9px]" style={{ color: "var(--fg-muted)" }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto" ref={videoListRef}>
        {videos.map((v, i) => {
          const active = i === vidIdx;
          const st = stats[i];
          return (
            <button
              key={v.id}
              data-active={active}
              onClick={() => {
                setVidIdx(i);
                setFrameIdx(0);
              }}
              className="w-full text-left px-4 py-2 transition-colors border-l-2"
              style={{
                borderColor: active ? "var(--fg)" : "transparent",
                background: active ? "var(--surface)" : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] truncate flex-1 font-mono"
                  style={{
                    color: active ? "var(--fg)" : "var(--fg-muted)",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {v.name}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                {CRITERIA.map((c, ci) => (
                  <div
                    key={ci}
                    className="h-[3px] flex-1 rounded-full overflow-hidden"
                    style={{ background: "var(--border-subtle)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${v.frames.length > 0 ? (st.counts[ci] / v.frames.length) * 100 : 0}%`,
                        background: c.color,
                      }}
                    />
                  </div>
                ))}
                <span
                  className="text-[9px] ml-1 tabular-nums w-6 text-right shrink-0"
                  style={{ color: "var(--fg-faint)" }}
                >
                  {v.frames.length}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
