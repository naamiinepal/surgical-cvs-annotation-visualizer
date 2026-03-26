"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Annotations,
  DEFAULT_ANN,
  FrameAnnotation,
  VideoEntry,
  Theme,
} from "../../lib/types";
import { CRITERIA, IMAGE_EXT } from "../../lib/constants";
import { ext, parseCSV, rgba } from "../../lib/helpers";
import dynamic from "next/dynamic";

const VideoDistributions = dynamic(
  () => import("@/components/VideoDistributions"),
  { ssr: false },
);
import { ThemeIcon } from "@/components/ThemeIcon";
import { Button } from "@/components/ui/button";

export default function EdaPage() {
  const [groupMode, setGroupMode] = useState<"video" | "all">("video");
  const [folderName, setFolderName] = useState("");
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotations>({});
  const [vidIdx, setVidIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const rootHandle = useRef<FileSystemDirectoryHandle | null>(null);
  const blobCache = useRef<Map<string, string>>(new Map());
  const videoListRef = useRef<HTMLDivElement>(null);
  const [frameUrl, setFrameUrl] = useState("");

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

  // Load images only
  const loadImages = async () => {
    try {
      alert("Select the folder containing your dataset images.");
      const allHandle = await window.showDirectoryPicker({ mode: "read" });
      rootHandle.current = allHandle;
      const validImages = new Map<string, string>();
      for await (const entry of (allHandle as any).values()) {
        if (entry.kind === "file" && IMAGE_EXT.has(ext(entry.name))) {
          const base = entry.name.substring(0, entry.name.lastIndexOf("."));
          validImages.set(base, entry.name);
        }
      }
      // Group by video id (prefix before first '_')
      const vidsMap: Record<string, string[]> = {};
      for (const [base, name] of validImages.entries()) {
        const vidId = base.split("_")[0];
        if (!vidsMap[vidId]) vidsMap[vidId] = [];
        vidsMap[vidId].push(name);
      }
      const vids: VideoEntry[] = Object.keys(vidsMap).map((vid) => {
        const sorted = vidsMap[vid].sort((a, b) => {
          const numA = parseInt(a.split("_")[1], 10);
          const numB = parseInt(b.split("_")[1], 10);
          return numA - numB;
        });
        return {
          id: vid,
          name: `Video ${vid}`,
          frames: sorted,
          dirHandle: allHandle,
        };
      });
      vids.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      setFolderName(allHandle.name);
      setVideos(vids);
      setAnnotations({});
      setVidIdx(0);
      setFrameIdx(0);
      setLoaded(true);
      for (const url of blobCache.current.values()) URL.revokeObjectURL(url);
      blobCache.current.clear();
    } catch (e: unknown) {
      if ((e as DOMException)?.name !== "AbortError") {
        const msg =
          typeof (window as any).showDirectoryPicker !== "function"
            ? "Your browser does not support the File System Access API. Use Chrome or Edge."
            : ((e as Error)?.message ?? "Failed to open folder/files");
        setError(msg);
      } else {
        console.log("User cancelled file/folder selection.");
      }
    }
  };

  // Load annotations only (optional, after images)
  const loadAnnotations = async () => {
    if (!loaded || videos.length === 0) {
      setError("Please load images first.");
      return;
    }
    if (!rootHandle.current) {
      setError("Internal error: image folder handle is missing.");
      return;
    }
    try {
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
      const validImages = new Map<string, string>();
      for (const v of videos) {
        for (const f of v.frames) {
          const base = f.substring(0, f.lastIndexOf("."));
          validImages.set(base, f);
        }
      }
      const gtData = await parseCSV(gtFile, validImages, true);
      const vids: VideoEntry[] = Object.keys(gtData.vidToFrames).map((vid) => {
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
          dirHandle: rootHandle.current!,
        };
      });
      vids.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      setVideos(vids);
      setAnnotations(gtData.parsedAnnotations);
      setVidIdx(0);
      setFrameIdx(0);
    } catch (e: unknown) {
      if ((e as DOMException)?.name !== "AbortError") {
        const msg =
          typeof (window as any).showOpenFilePicker !== "function"
            ? "Your browser does not support the File System Access API. Use Chrome or Edge."
            : ((e as Error)?.message ?? "Failed to open file");
        setError(msg);
      } else {
        console.log("User cancelled file selection.");
      }
    }
  };

  const video = videos[vidIdx];
  const frame = video?.frames[frameIdx];
  const total = video?.frames.length ?? 0;

  const ann: FrameAnnotation = useMemo(() => {
    if (!video || !frame) return DEFAULT_ANN;
    return annotations[video.id]?.[frame] ?? DEFAULT_ANN;
  }, [annotations, video, frame]);

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

  useEffect(() => {
    if (!video) return;
    for (const d of [-1, 1]) {
      const idx = frameIdx + d;
      if (idx >= 0 && idx < video.frames.length) {
        getFrameUrl(video, video.frames[idx]);
      }
    }
  }, [frameIdx, video, getFrameUrl]);

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

  useEffect(() => {
    const el = videoListRef.current?.querySelector("[data-active=true]");
    el?.scrollIntoView({ block: "nearest" });
  }, [vidIdx]);

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

  // Landing screen: load images and (optionally) annotations
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
            <span className="opacity-40 mr-1">◆</span> EDA
          </h1>
          <p
            className="text-[11px] uppercase tracking-[0.3em]"
            style={{ color: "var(--fg-muted)" }}
          >
            Load Images and (Optionally) Annotations
          </p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <Button
            onClick={loadImages}
            className="h-14 px-8 font-semibold rounded-lg text-sm"
          >
            {loaded ? "Reload Images" : "Load Images"}
          </Button>
          <Button
            onClick={loadAnnotations}
            className="h-14 px-8 font-semibold rounded-lg text-sm"
            disabled={!loaded}
          >
            Load Annotations (Optional)
          </Button>
          {error && <div className="text-red-500 mt-2">{error}</div>}
        </div>
      </div>
    );
  }

  // Main viewer (same as app/page.tsx, but no model compare)
  const infoRows = [
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
      <header
        className="h-11 shrink-0 flex items-center gap-4 px-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-xs font-bold tracking-tight shrink-0 opacity-70 flex items-center gap-2">
          ◆ EDA Viewer
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
          className="h-7 px-3 text-[11px] rounded transition-colors flex items-center gap-1.5"
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
      <div className="flex-1 flex min-h-0">
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
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="text-xs font-semibold">Group by:</span>
            <Button
              className={`px-2 py-1 rounded ${groupMode === "video" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
              onClick={() => setGroupMode("video")}
            >
              Video
            </Button>
            <Button
              className={`px-2 py-1 rounded ${groupMode === "all" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
              onClick={() => setGroupMode("all")}
            >
              All
            </Button>
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
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
          <div className="flex-1 flex flex-col items-center justify-start min-h-0 relative p-10">
            <h2 className="text-lg font-bold mb-4">
              {groupMode === "video"
                ? `Frame Distributions for ${video?.name}`
                : "Frame Distributions for All Videos"}
            </h2>
            {groupMode === "video" ? (
              <VideoDistributions
                video={video}
                rootHandle={rootHandle.current}
              />
            ) : (
              <VideoDistributions videos={videos} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
