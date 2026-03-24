"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Annotations,
  DEFAULT_ANN,
  FrameAnnotation,
  VideoEntry,
  Theme,
} from "../lib/types";
import { CRITERIA, IMAGE_EXT } from "../lib/constants";
import { ext, parseCSVRow, parseCVS, rgba, parseCSV } from "../lib/helpers";
import { ThemeIcon } from "@/components/ThemeIcon";

type AppMode = "single" | "compare";

export default function Home() {
  /* ── state ─────────────────────────────────────────────────────── */
  const [mode, setMode] = useState<AppMode>("single");
  const [folderName, setFolderName] = useState("");
  const [videos, setVideos] = useState<VideoEntry[]>([]);

  const [annotations, setAnnotations] = useState<Annotations>({});
  const [modelAnnotations, setModelAnnotations] = useState<Annotations>({});

  const [vidIdx, setVidIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState("");

  const videoListRef = useRef<HTMLDivElement>(null);
  const rootHandle = useRef<FileSystemDirectoryHandle | null>(null);
  const blobCache = useRef<Map<string, string>>(new Map());
  const [frameUrl, setFrameUrl] = useState("");

  /* ── theme ──────────────────────────────────────────────────────── */

  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved === "light" || saved === "dark" || saved === "system") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const mq = matchMedia("(prefers-color-scheme: dark)");
      const apply = () => {
        if (mq.matches) root.classList.add("dark");
        else root.classList.remove("dark");
      };
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme((t) =>
      t === "dark" ? "light" : t === "light" ? "system" : "dark",
    );
  }, []);

  /* ── derived ───────────────────────────────────────────────────── */
  const video = videos[vidIdx];
  const frame = video?.frames[frameIdx];
  const total = video?.frames.length ?? 0;

  const ann: FrameAnnotation = useMemo(() => {
    if (!video || !frame) return DEFAULT_ANN;
    return annotations[video.id]?.[frame] ?? DEFAULT_ANN;
  }, [annotations, video, frame]);

  const modAnn: FrameAnnotation = useMemo(() => {
    if (!video || !frame) return DEFAULT_ANN;
    return modelAnnotations[video.id]?.[frame] ?? DEFAULT_ANN;
  }, [modelAnnotations, video, frame]);

  /* ── read image file → blob URL ────────────────────────────────── */
  const getFrameUrl = useCallback(
    async (v: VideoEntry, frameName: string): Promise<string> => {
      const key = `${v.id}/${frameName}`;
      const cached = blobCache.current.get(key);
      if (cached) return cached;
      try {
        const fileHandle = await v.dirHandle.getFileHandle(frameName);
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        blobCache.current.set(key, url);
        return url;
      } catch {
        return "";
      }
    },
    [],
  );

  /* ── load current frame ────────────────────────────────────────── */
  useEffect(() => {
    if (!video || !frame) {
      setFrameUrl("");
      return;
    }
    let cancelled = false;
    getFrameUrl(video, frame).then((url) => {
      if (!cancelled) setFrameUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [video, frame, getFrameUrl]);

  /* ── preload neighbour frames ──────────────────────────────────── */
  useEffect(() => {
    if (!video) return;
    for (const d of [-1, 1]) {
      const idx = frameIdx + d;
      if (idx >= 0 && idx < video.frames.length) {
        getFrameUrl(video, video.frames[idx]);
      }
    }
  }, [frameIdx, video, getFrameUrl]);

  /* ── open flow (browser File System Access API) ────────────────── */
  const startSession = useCallback(async (selectedMode: AppMode) => {
    setBrowsing(true);
    setError("");
    try {
      // 1. Alert & Pick Images Directory Directly
      alert("Select the folder containing your dataset images.");
      const allHandle = await window.showDirectoryPicker({ mode: "read" });

      // If rootHandle is used elsewhere in your app, we just point it to the selected image folder now
      rootHandle.current = allHandle;

      // 2. Cache images directly from the selected folder (no "train" subfolder needed)
      const validImages = new Map<string, string>();
      for await (const entry of (allHandle as any).values()) {
        if (entry.kind === "file" && IMAGE_EXT.has(ext(entry.name))) {
          const base = entry.name.substring(0, entry.name.lastIndexOf("."));
          validImages.set(base, entry.name);
        }
      }

      // 3. Prompt for Dataset Annotation CSV
      alert("Select the Ground Truth annotations CSV file.");
      const [gtFileHandle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Dataset Annotations CSV",
            accept: { "text/csv": [".csv"] },
          },
        ],
        multiple: false,
        excludeAcceptAllOption: true,
      });
      const gtFile = await gtFileHandle.getFile();
      const gtData = await parseCSV(gtFile, validImages, true);

      // 4. Prompt for Model Annotation CSV if in compare mode
      let modData = null;
      if (selectedMode === "compare") {
        alert("Select the Model Prediction CSV file.");
        const [modFileHandle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: "Model Output CSV",
              accept: { "text/csv": [".csv"] },
            },
          ],
          multiple: false,
          excludeAcceptAllOption: true,
        });
        const modFile = await modFileHandle.getFile();
        modData = await parseCSV(modFile, validImages, false);
      }

      // Cleanup previous object URLs
      for (const url of blobCache.current.values()) URL.revokeObjectURL(url);
      blobCache.current.clear();

      // Consolidate Videos using GT data as the source of truth for frames
      const vids: VideoEntry[] = Object.keys(gtData.vidToFrames).map((vid) => {
        // Remove duplicates if any and sort
        const uniqueFrames = Array.from(
          new Set(gtData.vidToFrames[vid].map((f: any) => f.img)),
        );
        const sorted = uniqueFrames.sort((a, b) => {
          const numA = parseInt(a.split("_")[1], 10);
          const numB = parseInt(b.split("_")[1], 10);
          return numA - numB;
        });

        return {
          id: vid,
          name: `Video ${vid}`,
          frames: sorted,
          dirHandle: allHandle, // Now using allHandle directly
        };
      });

      if (vids.length === 0) {
        throw new Error(
          "No valid keyframes mapped between the images and the dataset CSV.",
        );
      }

      vids.sort((a, b) => parseInt(a.id) - parseInt(b.id));

      setFolderName(allHandle.name);
      setVideos(vids);
      setAnnotations(gtData.parsedAnnotations);
      if (modData) setModelAnnotations(modData.parsedAnnotations);

      setMode(selectedMode);
      setVidIdx(0);
      setFrameIdx(0);
      setLoaded(true);
    } catch (e: unknown) {
      if ((e as DOMException)?.name !== "AbortError") {
        const msg =
          typeof (window as any).showDirectoryPicker !== "function"
            ? "Your browser does not support the File System Access API. Use Chrome or Edge."
            : ((e as Error)?.message ?? "Failed to open folder/files");
        setError(msg);
        console.error("startSession error:", e);
      } else {
        // Added a quick log so you know when the user clicks "Cancel" on the alerts/pickers
        console.log("User cancelled file/folder selection.");
      }
    }

    setBrowsing(false);
  }, []);

  /* ── navigation ────────────────────────────────────────────────── */
  const goFrame = useCallback(
    (d: number) => {
      if (!video) return;
      setFrameIdx((i) => Math.max(0, Math.min(i + d, video.frames.length - 1)));
    },
    [video],
  );

  const goVideo = useCallback(
    (d: number) => {
      setVidIdx((i) => {
        const n = Math.max(0, Math.min(i + d, videos.length - 1));
        if (n !== i) setFrameIdx(0);
        return n;
      });
    },
    [videos.length],
  );

  /* ── keyboard ──────────────────────────────────────────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goFrame(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          goFrame(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          goVideo(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          goVideo(1);
          break;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [goFrame, goVideo]);

  /* ── scroll active video into view ─────────────────────────────── */
  useEffect(() => {
    const el = videoListRef.current?.querySelector("[data-active=true]");
    el?.scrollIntoView({ block: "nearest" });
  }, [vidIdx]);

  /* ── per-video stats (Based on Averages) ───────────────────────── */
  const stats = useMemo(
    () =>
      videos.map((v) => {
        const va = annotations[v.id] ?? {};
        const counts = [0, 0, 0];
        for (const f of v.frames) {
          const a = va[f];
          if (a) {
            if (a.avg[0] > 0) counts[0]++;
            if (a.avg[1] > 0) counts[1]++;
            if (a.avg[2] > 0) counts[2]++;
          }
        }
        return { counts };
      }),
    [videos, annotations],
  );

  /* ═════════════════════════════════════════════════════════════════
     Landing screen
     ═════════════════════════════════════════════════════════════════ */
  if (!loaded) {
    return (
      <div
        className="h-screen flex flex-col items-center justify-center gap-10"
        style={{ background: "var(--bg)", color: "var(--fg)" }}
      >
        <button
          onClick={cycleTheme}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ background: "var(--surface)", color: "var(--fg-muted)" }}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon size={14} theme={theme} />
        </button>

        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-5xl font-bold tracking-tighter">
            <span className="opacity-40 mr-1">◆</span> CVS Dataset Visualizer
          </h1>
          <p
            className="text-[11px] uppercase tracking-[0.3em]"
            style={{ color: "var(--fg-muted)" }}
          >
            Review Annotations & Compare Models
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-4">
            <button
              onClick={() => startSession("single")}
              disabled={browsing}
              className="h-14 px-8 font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-wait transition-colors flex items-center gap-3 bg-neutral-100 text-black hover:bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
            >
              <svg
                width="18"
                height="18"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              View Dataset
            </button>
            <button
              onClick={() => startSession("compare")}
              disabled={browsing}
              className="h-14 px-8 font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-wait transition-colors flex items-center gap-3  bg-neutral-100 text-black hover:bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
            >
              <svg
                width="18"
                height="18"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                />
              </svg>
              Compare Model Output
            </button>
            <Link href="/eda">
              <button
                disabled={browsing}
                className="h-14 px-8 font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-wait transition-colors flex items-center gap-3 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
              >
                EDA
              </button>
            </Link>
          </div>

          {error && (
            <p className="text-xs text-red-400 max-w-md text-center bg-red-400/10 p-2 rounded">
              {error}
            </p>
          )}

          {/* <div className="text-[11px] mt-1 text-center" style={{ color: "var(--fg-faint)" }}>
            <p>1. Select root dataset folder (containing 'train')</p>
            <p>2. Select the relevant CSV files when prompted</p>
          </div> */}
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     Main Viewer
     ═════════════════════════════════════════════════════════════════ */
  const infoRows =
    mode === "compare"
      ? [
          { label: "GT AVG", data: ann.avg, isAvg: true },
          { label: "GT A1", data: ann.a1, isAvg: false },
          { label: "GT A2", data: ann.a2, isAvg: false },
          { label: "GT A3", data: ann.a3, isAvg: false },
          // { label: "MD AVG", data: modAnn.avg, isAvg: true },
          { label: "Model", data: modAnn.a1, isAvg: false },
          // { label: "MD A2", data: modAnn.a2, isAvg: false },
          // { label: "MD A3", data: modAnn.a3, isAvg: false },
        ]
      : [
          { label: "AVG", data: ann.avg, isAvg: true },
          { label: "A1", data: ann.a1, isAvg: false },
          { label: "A2", data: ann.a2, isAvg: false },
          { label: "A3", data: ann.a3, isAvg: false },
        ];

  return (
    <div
      className="h-screen flex flex-col select-none overflow-hidden"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="h-11 shrink-0 flex items-center gap-4 px-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-xs font-bold tracking-tight shrink-0 opacity-70 flex items-center gap-2">
          ◆ CVS Viewer{" "}
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-500/20">
            {mode.toUpperCase()} MODE
          </span>
        </span>

        <div className="h-5 w-px" style={{ background: "var(--border)" }} />

        <span
          className="text-[11px] font-mono truncate max-w-sm"
          style={{ color: "var(--fg-muted)" }}
          title={folderName}
        >
          {folderName}
        </span>

        <button
          onClick={() => {
            setLoaded(false);
            setError("");
          }}
          disabled={browsing}
          className="h-7 px-3 text-[11px] rounded disabled:opacity-40 transition-colors flex items-center gap-1.5"
          style={{ background: "var(--btn-bg)", color: "var(--fg-muted)" }}
        >
          <svg
            width="12"
            height="12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Setup
        </button>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={cycleTheme}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors"
            style={{ background: "var(--btn-bg)", color: "var(--fg-muted)" }}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon size={13} theme={theme} />
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside
          className="w-56 shrink-0 flex flex-col"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div
            className="h-8 flex items-center justify-between px-4 shrink-0"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: "var(--fg-muted)" }}
            >
              Videos
            </span>
            <span
              className="text-[10px] tabular-nums"
              style={{ color: "var(--fg-faint)" }}
            >
              {videos.length}
            </span>
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
                <span
                  className="text-[9px]"
                  style={{ color: "var(--fg-muted)" }}
                >
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

                  {/* Based on Average Annotations (GT) */}
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

        {/* ── Main content ─────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0">
          <div
            className="flex-1 flex items-center justify-center min-h-0 relative"
            style={{ background: "var(--bg-deep)" }}
          >
            {frameUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={frameUrl}
                src={frameUrl}
                alt={frame}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            ) : (
              <span className="text-neutral-700 text-sm">No frame</span>
            )}

            {/* Comprehensive Annotators Data Stack */}
            <div
              className="absolute top-3 right-3 flex flex-col gap-1.5 p-3 rounded-lg shadow-sm backdrop-blur-md"
              style={{
                background: rgba("var(--surface)", 0.8),
                border: "1px solid var(--border)",
              }}
            >
              {infoRows.map((row) => {
                const rowData = row.data || [0, 0, 0];
                const hasData = row.data !== null;

                const isModelStart = row.label === "Model";

                return (
                  <div
                    key={row.label}
                    className={`flex items-center gap-3 ${isModelStart ? "mt-2 pt-2 border-t border-neutral-500/20" : ""}`}
                  >
                    <span
                      className="text-[10px] font-bold w-12 tracking-wide"
                      style={{ color: "var(--fg)" }}
                    >
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
                              className="w-8 py-0.5 text-center text-[9px] font-mono rounded transition-colors"
                              style={{
                                color: isActive ? c.color : "var(--fg-faint)",
                                background: isActive
                                  ? rgba(c.color, 0.1)
                                  : "transparent",
                                border: `1px solid ${isActive ? rgba(c.color, 0.5) : "var(--border)"}`,
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
                            className="w-8 flex justify-center items-center"
                          >
                            <div
                              className="w-5 h-5 flex items-center justify-center text-[8px] font-bold rounded-full transition-all duration-150"
                              style={{
                                border: `1px solid ${hasData ? c.color : "var(--border)"}`,
                                background:
                                  isActive && hasData ? c.color : "transparent",
                                color:
                                  isActive && hasData
                                    ? "#ffffff"
                                    : hasData
                                      ? c.color
                                      : "var(--fg-muted)",
                                opacity: hasData ? (isActive ? 1 : 0.6) : 0.4,
                                boxShadow:
                                  isActive && hasData
                                    ? `0 0 8px ${rgba(c.color, 0.4)}`
                                    : "none",
                              }}
                              title={
                                hasData ? `${c.label}: ${val}` : "Not annotated"
                              }
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
            </div>

            <div className="absolute top-3 left-3 flex gap-2">
              <span
                className="px-2 py-1 rounded text-[10px] uppercase tracking-widest font-mono"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                {video?.name}
              </span>
            </div>
          </div>

          {/* ── Scrubber (Based on GT) ─────────────────────────────── */}
          <div
            className="h-5 shrink-0 flex items-center justify-center px-3"
            style={{ background: "var(--scrubber-bg)" }}
          >
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
              {video?.frames.map((f, i) => {
                const fa = annotations[video.id]?.[f] ?? DEFAULT_ANN;
                const cur = i === frameIdx;
                const hasAny = fa.avg[0] > 0 || fa.avg[1] > 0 || fa.avg[2] > 0;
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
                    {CRITERIA.map((c, ci) => (
                      <div
                        key={ci}
                        className="flex-1"
                        style={{
                          background:
                            fa.avg[ci] > 0
                              ? rgba(c.color, fa.avg[ci])
                              : "var(--scrubber-empty)",
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Controls bar ─────────────────────────────────────── */}
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
        </main>
      </div>
    </div>
  );
}
