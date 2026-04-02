"use client";
import { useEffect } from "react";

export function useKeyboardNav(
  goFrame: (d: number) => void,
  goVideo: (d: number) => void,
) {
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
}
