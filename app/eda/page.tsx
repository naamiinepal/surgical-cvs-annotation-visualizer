"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Annotations, VideoEntry } from "../../lib/types";
import { IMAGE_EXT } from "@/lib/constants";
import { ext, parseCSV } from "@/lib/helpers";

const page = () => {
  const [folderName, setFolderName] = useState("");
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotations>({});
  const [error, setError] = useState("");
  const [vidIdx, setVidIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const rootHandle = useRef<FileSystemDirectoryHandle | null>(null);
  const blobCache = useRef<Map<string, string>>(new Map());

  // Refactored: importData is now called by a hidden button click, which is triggered on mount
  const importData = async () => {
    try {
      alert("Select the folder containing your dataset images.");
      const allHandle = await window.showDirectoryPicker({ mode: "read" });

      // If rootHandle is used elsewhere in your app, we just point it to the selected image folder now
      rootHandle.current = allHandle;

      // 2. Cache images directly from the selected folder
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
          dirHandle: allHandle,
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

      setVidIdx(0);
      setFrameIdx(0);
      setLoaded(true);

      console.log({ vids, gtData });
    } catch (e: unknown) {
      if ((e as DOMException)?.name !== "AbortError") {
        const msg =
          typeof (window as any).showDirectoryPicker !== "function"
            ? "Your browser does not support the File System Access API. Use Chrome or Edge."
            : ((e as Error)?.message ?? "Failed to open folder/files");
        setError(msg);
        // console.error("startSession error:", e);
      } else {
        console.log("User cancelled file/folder selection.");
      }
    }
  };

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

  return (
    <div>
      <button onClick={importData} tabIndex={-1} aria-hidden="true">
        Load Dataset
      </button>
      Visualizer
    </div>
  );
};

export default page;
