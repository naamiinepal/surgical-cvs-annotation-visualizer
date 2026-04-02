"use client";
import { Annotations, VideoEntry, DEFAULT_ANN } from "../lib/types";
import { CRITERIA } from "../lib/constants";

interface SidebarProps {
  videos: VideoEntry[];
  allFrames: { vidId: string; frame: string }[];
  vidIdx: number;
  frameIdx: number;
  setVidIdx: (i: number) => void;
  setFrameIdx: (i: number) => void;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  annotations: Annotations;
  stats: { counts: number[] }[];
  videoListRef: React.RefObject<HTMLDivElement | null>;
}

export function Sidebar({
  videos,
  allFrames,
  vidIdx,
  frameIdx,
  setVidIdx,
  setFrameIdx,
  showAll,
  setShowAll,
  annotations,
  stats,
  videoListRef,
}: SidebarProps) {
  return (
    <aside
      className="w-56 shrink-0 flex flex-col"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      {/* Segmented toggle: Videos / All */}
      <div
        className="flex items-center px-3 py-1.5 gap-1 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {(["videos", "all"] as const).map((tab) => {
          const active = tab === "videos" ? !showAll : showAll;
          return (
            <button
              key={tab}
              onClick={() => {
                const next = tab === "all";
                if (next !== showAll) {
                  setShowAll(next);
                  setFrameIdx(0);
                  setVidIdx(0);
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
              {tab === "videos"
                ? `Videos (${videos.length})`
                : `All (${allFrames.length})`}
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
        {showAll ? (
          /* ── All frames flat list ─────────────────────── */
          allFrames.map((entry, i) => {
            const active = i === frameIdx;
            const fa = annotations[entry.vidId]?.[entry.frame] ?? DEFAULT_ANN;
            return (
              <button
                key={`${entry.vidId}_${entry.frame}`}
                data-active={active}
                onClick={() => setFrameIdx(i)}
                className="w-full text-left px-3 py-1 transition-colors border-l-2 flex items-center gap-2"
                style={{
                  borderColor: active ? "var(--fg)" : "transparent",
                  background: active ? "var(--surface)" : undefined,
                }}
              >
                <div className="flex gap-[3px] shrink-0">
                  {CRITERIA.map((c, ci) => (
                    <div
                      key={ci}
                      className="w-[6px] h-[6px] rounded-full"
                      style={{
                        background:
                          fa.avg[ci] > 0 ? c.color : "var(--border-subtle)",
                        opacity: fa.avg[ci] > 0 ? 1 : 0.4,
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-[10px] truncate flex-1 font-mono"
                  style={{
                    color: active ? "var(--fg)" : "var(--fg-muted)",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {entry.frame}
                </span>
              </button>
            );
          })
        ) : (
          /* ── Grouped by video ────────────────────────── */
          videos.map((v, i) => {
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
          })
        )}
      </div>
    </aside>
  );
}
