"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Annotations,
  DEFAULT_ANN,
  FrameAnnotation,
  VideoEntry,
} from "../../lib/types";
import { IMAGE_EXT } from "../../lib/constants";
import { ext, parseCSV } from "../../lib/helpers";
import dynamic from "next/dynamic";
import { useTheme } from "../../lib/hooks/useTheme";
import { useKeyboardNav } from "../../lib/hooks/useKeyboardNav";
import { Header } from "@/components/Header";
import { EdaSidebar } from "@/components/EdaSidebar";
import { EdaLandingScreen } from "@/components/EdaLandingScreen";

const VideoDistributions = dynamic(
  () => import("@/components/VideoDistributions"),
  { ssr: false },
);

export default function EdaPage() {
  const [groupMode, setGroupMode] = useState<"video" | "all">("video");
  const [folderName, setFolderName] = useState("");
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotations>({});
  const [vidIdx, setVidIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const rootHandle = useRef<FileSystemDirectoryHandle | null>(null);
  const blobCache = useRef<Map<string, string>>(new Map());
  const videoListRef = useRef<HTMLDivElement>(null);

  const { theme, cycleTheme } = useTheme();

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
      // Group by video id (prefix before last '_')
      const vidsMap: Record<string, string[]> = {};
      for (const [base, name] of validImages.entries()) {
        const lastUnderscore = base.lastIndexOf("_");
        const vidId =
          lastUnderscore === -1 ? base : base.substring(0, lastUnderscore);
        if (!vidsMap[vidId]) vidsMap[vidId] = [];
        vidsMap[vidId].push(name);
      }
      const vids: VideoEntry[] = Object.keys(vidsMap).map((vid) => {
        const sorted = vidsMap[vid].sort((a, b) => {
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
        setError((e as Error)?.message ?? "Failed to open folder/files");
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
        setError((e as Error)?.message ?? "Failed to open file");
      }
    }
  };

  const video = videos[vidIdx];

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

  useKeyboardNav(goFrame, goVideo);

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

  if (!loaded) {
    return (
      <EdaLandingScreen
        loadImages={loadImages}
        loadAnnotations={loadAnnotations}
        loaded={loaded}
        error={error}
        theme={theme}
        cycleTheme={cycleTheme}
      />
    );
  }

  return (
    <div
      className="h-screen flex flex-col select-none overflow-hidden"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <Header
        title="EDA Viewer"
        folderName={folderName}
        theme={theme}
        cycleTheme={cycleTheme}
        onBack={() => {
          setLoaded(false);
          setError("");
        }}
      />
      <div className="flex-1 flex min-h-0">
        <EdaSidebar
          videos={videos}
          vidIdx={vidIdx}
          setVidIdx={setVidIdx}
          setFrameIdx={setFrameIdx}
          groupMode={groupMode}
          setGroupMode={setGroupMode}
          stats={stats}
          videoListRef={videoListRef}
        />
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
