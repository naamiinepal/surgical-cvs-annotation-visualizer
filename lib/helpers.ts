import { Annotations, CVSArray, ModelAnnotations, ModelPrediction } from "./types";

export function rgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/* ── parse dataset folder & csv ────────────────────────────────── */
export const parseCSV = async (
  file: File,
  validImages: Map<string, string>,
  isDatasetGT: boolean,
) => {
  const csvText = await file.text();
  const lines = csvText.trim().split("\n");
  if (lines.length < 2)
    throw new Error(`CSV file ${file.name} is empty or missing data rows.`);

  const headers = parseCSVRow(lines[0].trim());
  const hIdx: Record<string, number> = {};
  headers.forEach((h, i) => (hIdx[h.trim()] = i));

  const requiredHeaders = isDatasetGT
    ? ["vid", "frame", "is_ds_keyframe"]
    : ["vid", "frame"];
  for (const rh of requiredHeaders) {
    if (!(rh in hIdx))
      throw new Error(`Missing required CSV column: ${rh} in ${file.name}`);
  }

  const parsedAnnotations: Annotations = {};
  const vidToFrames: Record<string, { num: number; img: string }[]> = {};

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i].trim());
    if (row.length < 2) continue;

    // Only filter by is_ds_keyframe if we are loading the ground truth dataset
    if (isDatasetGT) {
      const isKeyframeStr = row[hIdx["is_ds_keyframe"]]?.trim().toLowerCase();
      const isKeyframe = isKeyframeStr === "true" || isKeyframeStr === "1";
      if (!isKeyframe) continue;
    }

    const vid = row[hIdx["vid"]];
    const frameNum = row[hIdx["frame"]];
    const baseName = `${vid}_${frameNum}`;

    const imgName = validImages.get(baseName);
    if (!imgName) continue; // skip if image doesn't exist

    if (!vidToFrames[vid]) vidToFrames[vid] = [];
    vidToFrames[vid].push({ num: parseInt(frameNum, 10), img: imgName });

    if (!parsedAnnotations[vid]) parsedAnnotations[vid] = {};

    // Parse whichever annotator columns exist
    const a1 = "a1" in hIdx ? parseCVS(row[hIdx["a1"]]) : null;
    const a2 = "a2" in hIdx ? parseCVS(row[hIdx["a2"]]) : null;
    const a3 = "a3" in hIdx ? parseCVS(row[hIdx["a3"]]) : null;

    // Compute average from available annotators
    const present = [a1, a2, a3].filter((a): a is CVSArray => a !== null);
    const avg: CVSArray = present.length > 0
      ? [
        present.reduce((s, a) => s + a[0], 0) / present.length,
        present.reduce((s, a) => s + a[1], 0) / present.length,
        present.reduce((s, a) => s + a[2], 0) / present.length,
      ]
      : [0, 0, 0];

    parsedAnnotations[vid][imgName] = { avg, a1, a2, a3 };
  }

  return { parsedAnnotations, vidToFrames };
};

export const parseModelPredictionsCSV = async (
  file: File,
  validImages: Map<string, string>,
) => {
  const csvText = await file.text();
  const lines = csvText.trim().split("\n");
  if (lines.length < 2)
    throw new Error(`CSV file ${file.name} is empty or missing data rows.`);

  const headers = parseCSVRow(lines[0].trim());
  const hIdx: Record<string, number> = {};
  headers.forEach((h, i) => (hIdx[h.trim()] = i));

  const requiredHeaders = ["vid", "frame", "C1", "C2", "C3"];
  for (const rh of requiredHeaders) {
    if (!(rh in hIdx))
      throw new Error(`Missing required CSV column: ${rh} in ${file.name}`);
  }

  const parsedAnnotations: ModelAnnotations = {};
  const vidToFrames: Record<string, { num: number; img: string }[]> = {};

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i].trim());
    if (row.length < 2) continue;

    const vid = row[hIdx["vid"]];
    const rawFrame = row[hIdx["frame"]];
    // Strip .jpg/.png extension if present to get frame number
    const frameNum = rawFrame.replace(/\.[^.]+$/, "");
    const baseName = `${vid}_${frameNum}`;

    const imgName = validImages.get(baseName);
    if (!imgName) continue;

    if (!vidToFrames[vid]) vidToFrames[vid] = [];
    vidToFrames[vid].push({ num: parseInt(frameNum, 10), img: imgName });

    if (!parsedAnnotations[vid]) parsedAnnotations[vid] = {};

    parsedAnnotations[vid][imgName] = {
      c1: parseFloat(row[hIdx["C1"]]) || 0,
      c2: parseFloat(row[hIdx["C2"]]) || 0,
      c3: parseFloat(row[hIdx["C3"]]) || 0,
    };
  }

  return { parsedAnnotations, vidToFrames };
};

export function parseCSVRow(text: string): string[] {
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

export function parseCVS(str: string | undefined): CVSArray | null {
  if (!str) return null;
  try {
    const arr = JSON.parse(str);
    if (Array.isArray(arr) && arr.length === 3) return arr as CVSArray;
  } catch {
    // silently fail
  }
  return null;
}
