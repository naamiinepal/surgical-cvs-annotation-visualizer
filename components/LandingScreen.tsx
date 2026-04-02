"use client";
import Link from "next/link";
import { ThemeIcon } from "./ThemeIcon";
import { Button } from "./ui/button";
import { Theme } from "../lib/types";

interface LandingScreenProps {
  startSession: (mode: "single" | "compare") => void;
  browsing: boolean;
  error: string;
  theme: Theme;
  cycleTheme: () => void;
}

export function LandingScreen({
  startSession,
  browsing,
  error,
  theme,
  cycleTheme,
}: LandingScreenProps) {
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
          <Button
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
          </Button>
          <Button
            onClick={() => startSession("compare")}
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
                d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
              />
            </svg>
            Compare Model Output
          </Button>
          <Link href="/eda">
            <Button
              disabled={browsing}
              className="h-14 px-8 font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-wait transition-colors flex items-center gap-3 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
            >
              EDA
            </Button>
          </Link>
        </div>

        {error && (
          <p className="text-xs text-red-400 max-w-md text-center bg-red-400/10 p-2 rounded">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
