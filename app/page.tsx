"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Annotations,
  DEFAULT_ANN,
  FrameAnnotation,
  VideoEntry,
  ModelAnnotations,
  ModelPrediction,
} from "../lib/types";
import { CRITERIA, IMAGE_EXT } from "../lib/constants";
import { ext, parseCSV, parseModelPredictionsCSV } from "../lib/helpers";
import { useTheme } from "../lib/hooks/useTheme";
import { useKeyboardNav } from "../lib/hooks/useKeyboardNav";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { AnnotationOverlay } from "@/components/AnnotationOverlay";
import { Scrubber } from "@/components/Scrubber";
import { TimelineControls } from "@/components/TimelineControls";
import { LandingScreen } from "@/components/LandingScreen";

type AppMode = "single" | "compare";

export default function Home() {
  /* ── State ─────────────────────────────────────────────────────── */
  const [mode, setMode] = useState<AppMode>("single");
  const [folderName, setFolderName] = useState("");
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotations>({});
  const [modelAnnotations, setModelAnnotations] = useState<ModelAnnotations>(
    {},
  );
  const [threshold, setThreshold] = useState(0.5);
  const [showAll, setShowAll] = useState(false);

  const [vidIdx, setVidIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState("");

  const videoListRef = useRef<HTMLDivElement>(null);
  const rootHandle = useRef<FileSystemDirectoryHandle | null>(null);
  const blobCache = useRef<Map<string, string>>(new Map());
  const [frameUrl, setFrameUrl] = useState("");

  const { theme, cycleTheme } = useTheme();

  /* ── Computed ───────────────────────────────────────────────────── */
  const allFrames = useMemo(() => {
    const list: { vidId: string; frame: string; vidEntry: VideoEntry }[] = [];
    for (const v of videos) {
      for (const f of v.frames) {
        list.push({ vidId: v.id, frame: f, vidEntry: v });
      }
    }
    return list;
  }, [videos]);

  const video = showAll ? allFrames[frameIdx]?.vidEntry : videos[vidIdx];
  const frame = showAll ? allFrames[frameIdx]?.frame : video?.frames[frameIdx];
  const total = showAll ? allFrames.length : (video?.frames.length ?? 0);
  const currentVidId = showAll ? allFrames[frameIdx]?.vidId : video?.id;

  const ann: FrameAnnotation = useMemo(() => {
    if (!currentVidId || !frame) return DEFAULT_ANN;
    return annotations[currentVidId]?.[frame] ?? DEFAULT_ANN;
  }, [annotations, currentVidId, frame]);

  const modAnn: ModelPrediction | null = useMemo(() => {
    if (!currentVidId || !frame) return null;
    return modelAnnotations[currentVidId]?.[frame] ?? null;
  }, [modelAnnotations, currentVidId, frame]);

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

  const modelThresholded: [number, number, number] | null = modAnn
    ? [
        modAnn.c1 >= threshold ? 1 : 0,
        modAnn.c2 >= threshold ? 1 : 0,
        modAnn.c3 >= threshold ? 1 : 0,
      ]
    : null;

  /* ── Logic ─────────────────────────────────────────────────────── */
  const getFrameUrl = useCallback(
    async (v: VideoEntry | undefined, frameName: string): Promise<string> => {
      if (!v) return "";
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

  const startSession = useCallback(async (selectedMode: AppMode) => {
    setBrowsing(true);
    setError("");
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
        modData = await parseModelPredictionsCSV(modFile, validImages);
      }

      for (const url of blobCache.current.values()) URL.revokeObjectURL(url);
      blobCache.current.clear();

      const vids: VideoEntry[] = Object.keys(gtData.vidToFrames).map((vid) => {
        const uniqueFrames = Array.from(
          new Set(gtData.vidToFrames[vid].map((f: any) => f.img)),
        );
        const sorted = uniqueFrames.sort((a, b) => {
          const baseA = a.substring(0, a.lastIndexOf("."));
          const baseB = b.substring(0, b.lastIndexOf("."));
          const numA = parseInt(
            baseA.substring(baseA.lastIndexOf("_") + 1),
            10,
          );
          const numB = parseInt(
            baseB.substring(baseB.lastIndexOf("_") + 1),
            10,
          );
          return numA - numB;
        });

        return {
          id: vid,
          name: `Video ${vid}`,
          frames: sorted,
          dirHandle: allHandle,
        };
      });

      if (vids.length === 0)
        throw new Error(
          "No valid keyframes mapped between the images and the dataset CSV.",
        );

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
        setError((e as Error)?.message ?? "Failed to open folder/files");
      }
    } finally {
      setBrowsing(false);
    }
  }, []);

  const goFrame = useCallback(
    (d: number) => {
      if (showAll) {
        setFrameIdx((i) => Math.max(0, Math.min(i + d, allFrames.length - 1)));
      } else {
        if (!video) return;
        setFrameIdx((i) =>
          Math.max(0, Math.min(i + d, video.frames.length - 1)),
        );
      }
    },
    [video, showAll, allFrames.length],
  );

  const goVideo = useCallback(
    (d: number) => {
      if (showAll) return;
      setVidIdx((i) => {
        const n = Math.max(0, Math.min(i + d, videos.length - 1));
        if (n !== i) setFrameIdx(0);
        return n;
      });
    },
    [videos.length, showAll],
  );

  useKeyboardNav(goFrame, goVideo);

  useEffect(() => {
    const el = videoListRef.current?.querySelector("[data-active=true]");
    el?.scrollIntoView({ block: "nearest" });
  }, [vidIdx]);

  /* ── Render ────────────────────────────────────────────────────── */
  if (!loaded) {
    return (
      <LandingScreen
        startSession={startSession}
        browsing={browsing}
        error={error}
        theme={theme}
        cycleTheme={cycleTheme}
      />
    );
  }

  const scrubberFrames = showAll
    ? allFrames
    : (video?.frames.map((f) => ({ vidId: video!.id, frame: f })) ?? []);

  return (
    <div
      className="h-screen flex flex-col select-none overflow-hidden"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <Header
        title="CVS Viewer"
        folderName={folderName}
        theme={theme}
        cycleTheme={cycleTheme}
        onBack={() => {
          setLoaded(false);
          setError("");
        }}
        mode={mode}
        threshold={threshold}
        setThreshold={setThreshold}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          videos={videos}
          allFrames={allFrames}
          vidIdx={vidIdx}
          frameIdx={frameIdx}
          setVidIdx={setVidIdx}
          setFrameIdx={setFrameIdx}
          showAll={showAll}
          setShowAll={setShowAll}
          annotations={annotations}
          stats={stats}
          videoListRef={videoListRef}
        />

        <main className="flex-1 flex flex-col min-w-0">
          <div
            className="flex-1 flex items-start justify-center min-h-0 relative"
            style={{ background: "var(--bg-deep)" }}
          >
            {video?.name && (
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
            )}

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

            <AnnotationOverlay
              ann={ann}
              modAnn={modAnn}
              mode={mode}
              threshold={threshold}
              modelThresholded={modelThresholded}
            />
          </div>

          <Scrubber
            label="GT"
            frames={scrubberFrames}
            frameIdx={frameIdx}
            setFrameIdx={setFrameIdx}
            annotations={annotations}
            type="gt"
          />

          {mode === "compare" && (
            <Scrubber
              label="MD"
              frames={scrubberFrames}
              frameIdx={frameIdx}
              setFrameIdx={setFrameIdx}
              annotations={modelAnnotations}
              type="model"
              threshold={threshold}
            />
          )}

          <TimelineControls
            frame={frame ?? ""}
            frameIdx={frameIdx}
            total={total}
            goFrame={goFrame}
          />
        </main>
      </div>
    </div>
  );
}
