"use client";
import { ThemeIcon } from "./ThemeIcon";
import { Theme } from "../lib/types";

interface HeaderProps {
  title: string;
  folderName: string;
  theme: Theme;
  cycleTheme: () => void;
  onBack: () => void;
  mode?: "single" | "compare";
  threshold?: number;
  setThreshold?: (v: number) => void;
}

export function Header({
  title,
  folderName,
  theme,
  cycleTheme,
  onBack,
  mode,
  threshold,
  setThreshold,
}: HeaderProps) {
  return (
    <header
      className="h-11 shrink-0 flex items-center gap-4 px-4"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <span className="text-xs font-bold tracking-tight shrink-0 opacity-70 flex items-center gap-2">
        ◆ {title}
        {mode && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-500/20">
            {mode.toUpperCase()} MODE
          </span>
        )}
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
        onClick={onBack}
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
        {mode === "compare" && setThreshold && threshold !== undefined && (
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: "var(--fg-muted)" }}
            >
              Threshold
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-28 h-1 accent-blue-500 cursor-pointer"
              style={{ accentColor: "#3b82f6" }}
            />
            <input
              type="number"
              min="0"
              max="1"
              step="0.001"
              value={threshold}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0 && v <= 1) setThreshold(v);
              }}
              className="w-16 h-6 text-[11px] text-center font-mono rounded border bg-transparent"
              style={{ borderColor: "var(--border)", color: "var(--fg)" }}
            />
          </div>
        )}
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
  );
}
