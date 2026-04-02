"use client";
import { FrameAnnotation, ModelPrediction } from "../lib/types";
import { CRITERIA } from "../lib/constants";
import { rgba } from "../lib/helpers";

interface AnnotationOverlayProps {
  ann: FrameAnnotation;
  modAnn: ModelPrediction | null;
  mode: "single" | "compare";
  threshold: number;
  modelThresholded: [number, number, number] | null;
}

export function AnnotationOverlay({
  ann,
  modAnn,
  mode,
  threshold,
  modelThresholded,
}: AnnotationOverlayProps) {
  // Build GT annotator rows dynamically (only show annotators that have data)
  const gtAnnotatorRows: {
    label: string;
    data: [number, number, number] | null;
    isAvg: boolean;
  }[] = [
    {
      label: mode === "compare" ? "GT AVG" : "AVG",
      data: ann.avg,
      isAvg: true,
    },
  ];
  if (ann.a1)
    gtAnnotatorRows.push({
      label: mode === "compare" ? "GT A1" : "A1",
      data: ann.a1,
      isAvg: false,
    });
  if (ann.a2)
    gtAnnotatorRows.push({
      label: mode === "compare" ? "GT A2" : "A2",
      data: ann.a2,
      isAvg: false,
    });
  if (ann.a3)
    gtAnnotatorRows.push({
      label: mode === "compare" ? "GT A3" : "A3",
      data: ann.a3,
      isAvg: false,
    });

  return (
    <div
      className="absolute top-3 right-3 flex flex-col gap-1 p-3 rounded-xl shadow-lg backdrop-blur-xl"
      style={{
        background: "rgba(0,0,0,0.75)",
        border: "1px solid rgba(255,255,255,0.1)",
        minWidth: 200,
        zIndex: 10,
      }}
    >
      {/* GT Annotator Rows */}
      {gtAnnotatorRows.map((row) => {
        const rowData = row.data || [0, 0, 0];
        const hasData = row.data !== null;

        return (
          <div key={row.label} className="flex items-center gap-3 py-0.5">
            <span className="text-[10px] font-bold w-14 tracking-wide text-neutral-300">
              {row.label}
            </span>
            <div className="flex gap-2">
              {CRITERIA.map((c, ci) => {
                const val = rowData[ci];
                const isActive = val > 0;

                if (row.isAvg) {
                  return (
                    <div
                      key={ci}
                      className="w-9 py-0.5 text-center text-[10px] font-mono rounded transition-colors"
                      style={{
                        color: isActive ? c.color : "rgba(255,255,255,0.3)",
                        background: isActive
                          ? rgba(c.color, 0.15)
                          : "transparent",
                        border: `1px solid ${isActive ? rgba(c.color, 0.6) : "rgba(255,255,255,0.1)"}`,
                      }}
                      title={`${c.label} Score: ${val.toFixed(2)}`}
                    >
                      {Number(val).toFixed(2)}
                    </div>
                  );
                }

                return (
                  <div
                    key={ci}
                    className="w-9 flex justify-center items-center"
                  >
                    <div
                      className="w-5 h-5 flex items-center justify-center text-[8px] font-bold rounded-full transition-all duration-150"
                      style={{
                        border: `1.5px solid ${hasData ? c.color : "rgba(255,255,255,0.15)"}`,
                        background:
                          isActive && hasData ? c.color : "transparent",
                        color:
                          isActive && hasData
                            ? "#fff"
                            : hasData
                              ? c.color
                              : "rgba(255,255,255,0.3)",
                        opacity: hasData ? (isActive ? 1 : 0.6) : 0.4,
                        boxShadow:
                          isActive && hasData
                            ? `0 0 10px ${rgba(c.color, 0.5)}`
                            : "none",
                      }}
                      title={hasData ? `${c.label}: ${val}` : "Not annotated"}
                    >
                      {c.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Model Prediction Row */}
      {mode === "compare" && (
        <>
          <div className="border-t border-white/10 my-1" />
          <div className="flex items-center gap-3 py-0.5">
            <span className="text-[10px] font-bold w-14 tracking-wide text-blue-300">
              Prob
            </span>
            <div className="flex gap-2">
              {CRITERIA.map((c, ci) => {
                const prob = modAnn ? [modAnn.c1, modAnn.c2, modAnn.c3][ci] : 0;
                return (
                  <div
                    key={ci}
                    className="w-9 py-0.5 text-center text-[10px] font-mono rounded transition-colors"
                    style={{
                      color: prob > 0 ? c.color : "rgba(255,255,255,0.3)",
                      background:
                        prob > 0 ? rgba(c.color, 0.15) : "transparent",
                      border: `1px solid ${prob > 0 ? rgba(c.color, 0.6) : "rgba(255,255,255,0.1)"}`,
                    }}
                    title={`${c.label} Probability: ${prob.toFixed(4)}`}
                  >
                    {prob.toFixed(2)}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 py-0.5">
            <span className="text-[10px] font-bold w-14 tracking-wide text-blue-300">
              Model
            </span>
            <div className="flex gap-2">
              {CRITERIA.map((c, ci) => {
                const isActive = modelThresholded
                  ? modelThresholded[ci] > 0
                  : false;
                return (
                  <div
                    key={ci}
                    className="w-9 flex justify-center items-center"
                  >
                    <div
                      className="w-5 h-5 flex items-center justify-center text-[8px] font-bold rounded-full transition-all duration-150"
                      style={{
                        border: `1.5px solid ${modAnn ? c.color : "rgba(255,255,255,0.15)"}`,
                        background: isActive ? c.color : "transparent",
                        color: isActive
                          ? "#fff"
                          : modAnn
                            ? c.color
                            : "rgba(255,255,255,0.3)",
                        opacity: modAnn ? (isActive ? 1 : 0.6) : 0.4,
                        boxShadow: isActive
                          ? `0 0 10px ${rgba(c.color, 0.5)}`
                          : "none",
                      }}
                      title={
                        modAnn
                          ? `${c.label}: ${isActive ? "Yes" : "No"} (t=${threshold})`
                          : "No prediction"
                      }
                    >
                      {c.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
