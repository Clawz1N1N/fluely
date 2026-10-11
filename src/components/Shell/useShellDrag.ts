import React, { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Axis-locked dragging for shell windows.
 *
 * `data-tauri-drag-region` cannot lock an axis, so we implement
 * pointer events here and call the Rust `move_shell_window` command
 * with the locked axis ("x" or "y"). Rust clamps to the monitor.
 */
export function useShellDrag(axis: "x" | "y" | "free") {
  const label = getCurrentWindow().label;
  const startRef = useRef<{ px: number; py: number; wx: number; wy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startRef.current = {
      px: e.clientX,
      py: e.clientY,
      wx: window.screenX,
      wy: window.screenY,
    };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = e.clientX - start.px;
      const dy = e.clientY - start.py;
      let nx = start.wx;
      let ny = start.wy;
      if (axis === "x") nx = start.wx + dx;
      else if (axis === "y") ny = start.wy + dy;
      else {
        nx = start.wx + dx;
        ny = start.wy + dy;
      }
      invoke("move_shell_window", {
        label,
        x: Math.round(nx),
        y: Math.round(ny),
        axis,
      }).catch(() => {});
    },
    [axis, label]
  );

  const onPointerUp = useCallback(() => {
    startRef.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
