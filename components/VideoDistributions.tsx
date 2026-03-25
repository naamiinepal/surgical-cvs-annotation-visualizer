import React, { useEffect, useState } from "react";
import { VideoEntry } from "../lib/types";
import { Bar, Line } from "react-chartjs-2";
import Chart from "chart.js/auto";
import { CategoryScale } from "chart.js";
Chart.register(CategoryScale);

interface VideoDistributionsProps {
  video?: VideoEntry;
  rootHandle?: FileSystemDirectoryHandle | null;
  videos?: VideoEntry[];
}

// Helper to get image data (width, height, rgb) with cache and compatibility
const frameStatsCache = new Map<
  string,
  { width: number; height: number; rgb: [number, number, number] }
>();
async function getImageStats(
  videoId: string,
  frameName: string,
  fileHandle: any,
): Promise<{ width: number; height: number; rgb: [number, number, number] }> {
  const cacheKey = `${videoId}/${frameName}`;
  if (frameStatsCache.has(cacheKey)) {
    return frameStatsCache.get(cacheKey)!;
  }
  let file;
  if (typeof fileHandle.getFile === "function") {
    file = await fileHandle.getFile();
  } else if (typeof fileHandle.file === "function") {
    file = await fileHandle.file();
  } else {
    throw new Error("fileHandle does not support getFile() or file() method");
  }
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject("No canvas context");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      let r = 0,
        g = 0,
        b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      const n = data.length / 4;
      const stats = {
        width: img.width,
        height: img.height,
        rgb: [r / n, g / n, b / n] as [number, number, number],
      };
      frameStatsCache.set(cacheKey, stats);
      resolve(stats);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const VideoDistributions: React.FC<VideoDistributionsProps> = ({
  video,
  rootHandle,
  videos,
}) => {
  const [widths, setWidths] = useState<number[]>([]);
  const [heights, setHeights] = useState<number[]>([]);
  const [rgbs, setRGBs] = useState<[number, number, number][]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function computeAllStats() {
      setLoading(true);
      let allStats: {
        width: number;
        height: number;
        rgb: [number, number, number];
      }[] = [];
      if (video && rootHandle) {
        allStats = await Promise.all(
          video.frames.map(async (frame) => {
            const fileHandle = await rootHandle.getFileHandle(frame);
            return getImageStats(video.id, frame, fileHandle);
          }),
        );
      } else if (videos && videos.length > 0) {
        // For 'all' mode, combine all frames from all videos
        const statsArr = await Promise.all(
          videos.flatMap((v) =>
            v.frames.map(async (frame) => {
              const fileHandle = await v.dirHandle.getFileHandle(frame);
              return getImageStats(v.id, frame, fileHandle);
            }),
          ),
        );
        allStats = statsArr;
      }
      if (!cancelled) {
        setWidths(allStats.map((s) => s.width));
        setHeights(allStats.map((s) => s.height));
        setRGBs(allStats.map((s) => s.rgb));
        setLoading(false);
      }
    }
    computeAllStats();
    return () => {
      cancelled = true;
    };
  }, [video, rootHandle, videos]);

  if ((video && !rootHandle) || (!video && !videos))
    return <div>No video(s) selected.</div>;
  if (loading) return <div>Loading frame stats...</div>;
  if (widths.length === 0) return <div>No frames found.</div>;

  // Prepare RGB arrays
  const r = rgbs.map((rgb) => rgb[0]);
  const g = rgbs.map((rgb) => rgb[1]);
  const b = rgbs.map((rgb) => rgb[2]);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-8">
      <div>
        <h3 className="font-semibold mb-2">Width Distribution</h3>
        <Bar
          data={{
            labels: widths.map((_, i) => `Frame ${i + 1}`),
            datasets: [
              {
                label: "Width",
                data: widths,
                backgroundColor: "#3b82f6",
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false } },
          }}
        />
      </div>
      <div>
        <h3 className="font-semibold mb-2">Height Distribution</h3>
        <Bar
          data={{
            labels: heights.map((_, i) => `Frame ${i + 1}`),
            datasets: [
              {
                label: "Height",
                data: heights,
                backgroundColor: "#10b981",
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false } },
          }}
        />
      </div>
      <div>
        <h3 className="font-semibold mb-2">Average RGB per Frame</h3>
        <Line
          data={{
            labels: r.map((_, i) => `Frame ${i + 1}`),
            datasets: [
              {
                label: "R",
                data: r,
                borderColor: "#ef4444",
                backgroundColor: "#ef4444",
                fill: false,
                borderWidth: 1,
                pointRadius: 1,
                pointHoverRadius: 4,
              },
              {
                label: "G",
                data: g,
                borderColor: "#22c55e",
                backgroundColor: "#22c55e",
                fill: false,
                borderWidth: 1,
                pointRadius: 1,
                pointHoverRadius: 4,
              },
              {
                label: "B",
                data: b,
                borderColor: "#3b82f6",
                backgroundColor: "#3b82f6",
                fill: false,
                borderWidth: 1,
                pointRadius: 1,
                pointHoverRadius: 4,
              },
            ],
          }}
          options={{ responsive: true }}
        />
      </div>
    </div>
  );
};

export default VideoDistributions;
