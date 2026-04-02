"use client";
import { CRITERIA } from "../lib/constants";
import { rgba } from "../lib/helpers";
import { DEFAULT_ANN } from "../lib/types";

interface ScrubberProps {
  label: string;
  frames: { vidId: string; frame: string }[];
  frameIdx: number;
  setFrameIdx: (i: number) => void;
  annotations: any;
  type: "gt" | "model";
  threshold?: number;
}

export function Scrubber({
  label,
  frames,
  frameIdx,
  setFrameIdx,
  annotations,
  type,
  threshold = 0.5,
}: ScrubberProps) {
  const total = frames.length;

  return (
    <div
      className="shrink-0 flex items-center px-3"
      style={{
        background: "var(--scrubber-bg)",
        height: 16,
        borderTop: type === "model" ? "1px solid var(--border-subtle)" : "none",
      }}
    >
      <span
        className="text-[8px] uppercase tracking-widest shrink-0 w-8 text-center"
        style={{ color: "var(--fg-faint)" }}
      >
        {label}
      </span>
      <div
        className="flex items-end gap-px w-full py-0.5"
        style={{
          maxWidth:
            total <= 100
              ? `${total * 10}px`
              : total <= 300
                ? `${total * 5}px`
                : "100%",
          margin: "0 auto",
        }}
      >
        {frames.map((entry, i) => {
          const { vidId, frame } = entry;
          const cur = i === frameIdx;
          let hasAny = false;
          let displayColors: string[] = [];

          if (type === "gt") {
            const fa = annotations[vidId]?.[frame] ?? DEFAULT_ANN;
            hasAny = fa.avg[0] > 0 || fa.avg[1] > 0 || fa.avg[2] > 0;
            displayColors = CRITERIA.map((c, ci) =>
              fa.avg[ci] > 0
                ? rgba(c.color, fa.avg[ci])
                : "var(--scrubber-empty)",
            );
          } else {
            const mp = annotations[vidId]?.[frame];
            const probs = mp ? [mp.c1, mp.c2, mp.c3] : [0, 0, 0];
            const threshed: [number, number, number] = [
              probs[0] >= threshold ? 1 : 0,
              probs[1] >= threshold ? 1 : 0,
              probs[2] >= threshold ? 1 : 0,
            ];
            hasAny = threshed[0] > 0 || threshed[1] > 0 || threshed[2] > 0;
            displayColors = CRITERIA.map((c, ci) =>
              threshed[ci] > 0
                ? rgba(c.color, probs[ci])
                : "var(--scrubber-empty)",
            );
          }

          return (
            <div
              key={i}
              className="flex-1 cursor-pointer flex flex-col rounded-[1px] overflow-hidden transition-all duration-100"
              style={{
                minWidth: 1,
                height: cur ? 14 : hasAny ? 8 : 4,
                outline: cur ? "1.5px solid var(--fg)" : "none",
                outlineOffset: 1,
              }}
              onClick={() => setFrameIdx(i)}
            >
              {displayColors.map((bgColor, ci) => (
                <div
                  key={ci}
                  className="flex-1"
                  style={{ background: bgColor }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
