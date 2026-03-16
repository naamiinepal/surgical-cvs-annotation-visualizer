"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */
type CVSArray = [number, number, number];

type FrameAnnotation = {
  avg: CVSArray;
  a1: CVSArray | null;
  a2: CVSArray | null;
  a3: CVSArray | null;
};

type Annotations = Record<string, Record<string, FrameAnnotation>>;

const DEFAULT_ANN: FrameAnnotation = {
  avg: [0, 0, 0],
  a1: null,
  a2: null,
  a3: null,
};

type VideoEntry = {
  id: string;
  name: string;
  frames: string[];
  dirHandle: FileSystemDirectoryHandle;
};

const IMAGE_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp",
]);

/* ═══════════════════════════════════════════════════════════════════
   Constants & Helpers
   ═══════════════════════════════════════════════════════════════════ */
const CRITERIA = [
  { label: "C1", color: "#ef4444" },
  { label: "C2", color: "#22c55e" },
  { label: "C3", color: "#3b82f6" },
] as const;

function rgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

// Robust CSV row parser to handle quoted arrays like "[0.0,0.0,0.0]"
function parseCSVRow(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCVS(str: string | undefined): CVSArray | null {
  if (!str) return null;
  try {
    const arr = JSON.parse(str);
    if (Array.isArray(arr) && arr.length === 3) return arr as CVSArray;
  } catch {
    // silently fail and return null if badly formatted
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */
export default function Home() {
  /* ── state ─────────────────────────────────────────────────────── */
  const [folderName, setFolderName] = useState("");
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotations>({});
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
  type Theme = "light" | "dark" | "system";
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
    setTheme((t) => (t === "dark" ? "light" : t === "light" ? "system" : "dark"));
  }, []);

  const ThemeIcon = ({ size = 14 }: { size?: number }) => {
    if (theme === "dark")
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    if (theme === "light")
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    );
  };

  /* ── derived ───────────────────────────────────────────────────── */
  const video = videos[vidIdx];
  const frame = video?.frames[frameIdx];
  const total = video?.frames.length ?? 0;

  const ann: FrameAnnotation = useMemo(() => {
    if (!video || !frame) return DEFAULT_ANN;
    return annotations[video.id]?.[frame] ?? DEFAULT_ANN;
  }, [annotations, video, frame]);

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
    return () => { cancelled = true; };
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

  /* ── parse dataset folder ──────────────────────────────────────── */
  const loadDataset = useCallback(
    async (dirHandle: FileSystemDirectoryHandle) => {
      try {
        let allHandle: FileSystemDirectoryHandle;
        try {
          allHandle = await dirHandle.getDirectoryHandle("all");
        } catch {
          throw new Error("Could not find 'all' directory in the selected folder.");
        }

        const validImages = new Map<string, string>();
        for await (const entry of allHandle.values()) {
          if (entry.kind === "file" && IMAGE_EXT.has(ext(entry.name))) {
            const base = entry.name.substring(0, entry.name.lastIndexOf("."));
            validImages.set(base, entry.name);
          }
        }

        let csvHandle: FileSystemFileHandle;
        try {
          csvHandle = await dirHandle.getFileHandle("all_metadata.csv");
        } catch {
          throw new Error("Could not find 'all_metadata.csv' in the selected folder.");
        }
        
        const file = await csvHandle.getFile();
        const csvText = await file.text();
        const lines = csvText.trim().split("\n");
        if (lines.length < 2) throw new Error("CSV file is empty or missing data rows.");

        const headers = parseCSVRow(lines[0].trim());
        const hIdx: Record<string, number> = {};
        headers.forEach((h, i) => (hIdx[h.trim()] = i));

        // Added "is_ds_keyframe" to required headers
        const requiredHeaders = ["vid", "frame", "is_ds_keyframe"];
        for (const rh of requiredHeaders) {
          if (!(rh in hIdx)) throw new Error(`Missing required CSV column: ${rh}`);
        }

        const parsedAnnotations: Annotations = {};
        const vidToFrames: Record<string, { num: number; img: string }[]> = {};

        for (let i = 1; i < lines.length; i++) {
          const row = parseCSVRow(lines[i].trim());
          if (row.length < 2) continue;

          // Extract and check if the record is a keyframe
          const isKeyframeStr = row[hIdx["is_ds_keyframe"]]?.trim().toLowerCase();
          const isKeyframe = isKeyframeStr === "true" || isKeyframeStr === "1";
          
          if (!isKeyframe) continue;

          const vid = row[hIdx["vid"]];
          const frameNum = row[hIdx["frame"]];
          const baseName = `${vid}_${frameNum}`;

          const imgName = validImages.get(baseName);
          if (!imgName) continue;

          if (!vidToFrames[vid]) vidToFrames[vid] = [];
          vidToFrames[vid].push({ num: parseInt(frameNum, 10), img: imgName });

          if (!parsedAnnotations[vid]) parsedAnnotations[vid] = {};
          
          let avg = parseCVS(row[hIdx["avg_cvs"]]);
          if (!avg) {
            avg = [
              parseFloat(row[hIdx["C1"]]) || 0,
              parseFloat(row[hIdx["C2"]]) || 0,
              parseFloat(row[hIdx["C3"]]) || 0,
            ];
          }

          parsedAnnotations[vid][imgName] = {
            avg,
            a1: parseCVS(row[hIdx["cvs_annotator_1"]]),
            a2: parseCVS(row[hIdx["cvs_annotator_2"]]),
            a3: parseCVS(row[hIdx["cvs_annotator_3"]]),
          };
        }

        const vids: VideoEntry[] = Object.keys(vidToFrames).map((vid) => {
          const sorted = vidToFrames[vid]
            .sort((a, b) => a.num - b.num)
            .map((x) => x.img);
          return {
            id: vid,
            name: `Video ${vid}`,
            frames: sorted,
            dirHandle: allHandle,
          };
        });

        vids.sort((a, b) => parseInt(a.id) - parseInt(b.id));

        return { vids, parsedAnnotations };
      } catch (err: any) {
        throw err;
      }
    },
    [],
  );

  /* ── open folder (browser File System Access API) ──────────────── */
  const browseFolder = useCallback(async () => {
    setBrowsing(true);
    setError("");
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "read" });
      rootHandle.current = dirHandle;

      for (const url of blobCache.current.values()) URL.revokeObjectURL(url);
      blobCache.current.clear();

      const { vids, parsedAnnotations } = await loadDataset(dirHandle);

      if (vids.length === 0) {
        setError("No valid keyframes mapped between 'all' and 'all_metadata.csv'.");
        setBrowsing(false);
        return;
      }

      setFolderName(dirHandle.name);
      setVideos(vids);
      setAnnotations(parsedAnnotations);
      setVidIdx(0);
      setFrameIdx(0);
      setLoaded(true);
    } catch (e: unknown) {
      if ((e as DOMException)?.name !== "AbortError") {
        const msg =
          typeof window.showDirectoryPicker !== "function"
            ? "Your browser does not support the File System Access API. Use Chrome or Edge."
            : (e as Error)?.message ?? "Failed to open folder";
        setError(msg);
        console.error("browseFolder error:", e);
      }
    }
    setBrowsing(false);
  }, [loadDataset]);

  /* ── navigation ────────────────────────────────────────────────── */
  const goFrame = useCallback(
    (d: number) => {
      if (!video) return;
      setFrameIdx((i) =>
        Math.max(0, Math.min(i + d, video.frames.length - 1)),
      );
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
      <div className="h-screen flex flex-col items-center justify-center gap-10" style={{ background: "var(--bg)", color: "var(--fg)" }}>
        <button
          onClick={cycleTheme}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ background: "var(--surface)", color: "var(--fg-muted)" }}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon size={14} />
        </button>

        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-5xl font-bold tracking-tighter">
            <span className="opacity-40 mr-1">◆</span> CVS Dataset Visualizer
          </h1>
          <p className="text-[11px] uppercase tracking-[0.3em]" style={{ color: "var(--fg-muted)" }}>
            Review Multi-Annotator Labels
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <button
            onClick={browseFolder}
            disabled={browsing}
            className="h-14 px-12 font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-wait transition-colors flex items-center gap-3 dark:bg-white dark:text-black dark:hover:bg-neutral-200 bg-black text-white hover:bg-neutral-800 active:bg-neutral-700 dark:active:bg-neutral-300"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            {browsing ? "Opening…" : "Open Folder"}
          </button>
          {error && (
            <p className="text-xs text-red-400 max-w-md text-center">{error}</p>
          )}
          <p className="text-[11px] mt-1" style={{ color: "var(--fg-faint)" }}>
            Select root Endoscapes dataset folder 
          </p>
        </div>

        <div className="flex items-center gap-8 text-[10px] uppercase tracking-widest mt-4" style={{ color: "var(--fg-faint)" }}>
          <span>← → Navigate Frames</span>
          <span>↑ ↓ Switch Videos</span>
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     Main Viewer
     ═════════════════════════════════════════════════════════════════ */
  return (
    <div className="h-screen flex flex-col select-none overflow-hidden" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="h-11 shrink-0 flex items-center gap-4 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-xs font-bold tracking-tight shrink-0 opacity-70">
          ◆ CVS Viewer
        </span>

        <div className="h-5 w-px" style={{ background: "var(--border)" }} />

        <span className="text-[11px] font-mono truncate max-w-sm" style={{ color: "var(--fg-muted)" }} title={folderName}>
          {folderName}
        </span>

        <button
          onClick={browseFolder}
          disabled={browsing}
          className="h-7 px-3 text-[11px] rounded disabled:opacity-40 transition-colors flex items-center gap-1.5"
          style={{ background: "var(--btn-bg)", color: "var(--fg-muted)" }}
        >
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          {browsing ? "…" : "Change Folder"}
        </button>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={cycleTheme}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors"
            style={{ background: "var(--btn-bg)", color: "var(--fg-muted)" }}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon size={13} />
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className="w-56 shrink-0 flex flex-col" style={{ borderRight: "1px solid var(--border)" }}>
          <div className="h-8 flex items-center justify-between px-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--fg-muted)" }}>
              Videos
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-faint)" }}>
              {videos.length}
            </span>
          </div>

          <div className="flex items-center gap-3 px-4 py-1.5 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {CRITERIA.map((c, ci) => (
              <div key={ci} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                <span className="text-[9px]" style={{ color: "var(--fg-muted)" }}>{c.label}</span>
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

                  {/* Based on Average Annotations */}
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
                    <span className="text-[9px] ml-1 tabular-nums w-6 text-right shrink-0" style={{ color: "var(--fg-faint)" }}>
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
          <div className="flex-1 flex items-center justify-center min-h-0 relative" style={{ background: "var(--bg-deep)" }}>
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
              className="absolute top-3 right-3 flex flex-col gap-2 p-3 rounded-lg shadow-sm backdrop-blur-md" 
              style={{ background: rgba("var(--surface)", 0.8), border: "1px solid var(--border)" }}
            >
              {[
                { label: "AVG", data: ann.avg, isAvg: true },
                { label: "A1", data: ann.a1, isAvg: false },
                { label: "A2", data: ann.a2, isAvg: false },
                { label: "A3", data: ann.a3, isAvg: false },
              ].map((row) => {
                const rowData = row.data || [0, 0, 0];
                const hasData = row.data !== null;

                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-[10px] font-bold w-6 tracking-wide" style={{ color: "var(--fg)" }}>
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
                              background: isActive ? rgba(c.color, 0.1) : "transparent",
                              border: `1px solid ${isActive ? rgba(c.color, 0.5) : "var(--border)"}`,
                            }}
                            title={`${c.label} Average: ${val.toFixed(2)}`}
                          >
                            {Number(val).toFixed(2)}
                          </div>
                        );
                      }

                      return (
                        <div key={ci} className="w-8 flex justify-center items-center">
                          <div
                            className="w-5 h-5 flex items-center justify-center text-[8px] font-bold rounded-full transition-all duration-150"
                            style={{
                              // ALWAYS keep a border. Use the color if it has data, otherwise a visible neutral border.
                              border: `1px solid ${hasData ? c.color : "var(--border)"}`,
                              background: isActive && hasData ? c.color : "transparent",
                              color: isActive && hasData ? "#ffffff" : (hasData ? c.color : "var(--fg-muted)"),
                              // Raise the lowest opacity from 0.1 to 0.4 so unfilled circles aren't lost
                              opacity: hasData ? (isActive ? 1 : 0.6) : 0.4,
                              boxShadow: isActive && hasData ? `0 0 8px ${rgba(c.color, 0.4)}` : "none",
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
            </div>

            <div className="absolute top-3 left-3 flex gap-2">
              <span className="px-2 py-1 rounded text-[10px] uppercase tracking-widest font-mono" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}>
                {video?.name}
              </span>
            </div>
          </div>

          {/* ── Scrubber ─────────────────────────────────────────── */}
          <div className="h-5 shrink-0 flex items-center justify-center px-3" style={{ background: "var(--scrubber-bg)" }}>
            <div
              className="flex items-end gap-px w-full py-0.5"
              style={{
                maxWidth: total <= 100 ? `${total * 10}px` : total <= 300 ? `${total * 5}px` : "100%",
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
                          background: fa.avg[ci] > 0 ? rgba(c.color, fa.avg[ci]) : "var(--scrubber-empty)",
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Controls bar ─────────────────────────────────────── */}
          <div className="shrink-0 flex items-center justify-between px-6 h-14" style={{ background: "var(--controls-bg)", borderTop: "1px solid var(--border)" }}>
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
                <div className="text-[11px] truncate font-mono" style={{ color: "var(--fg)" }}>
                  {frame}
                </div>
                <div className="text-[10px] tabular-nums" style={{ color: "var(--fg-faint)" }}>
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

            <div className="flex items-center gap-5 text-[9px] uppercase tracking-widest" style={{ color: "var(--fg-faint)" }}>
              <span>← → Navigate Frames</span>
              <span>↑ ↓ Switch Videos</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}