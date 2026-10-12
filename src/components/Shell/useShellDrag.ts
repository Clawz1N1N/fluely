import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** Physical native coordinates avoid DPI drift; screen deltas avoid a moving DOM origin. */
export function useShellDrag(axis: 'x' | 'y' | 'free') {
  const currentWindow = getCurrentWindow();
  const start = useRef<{
    pointer: number; sx: number; sy: number; wx: number; wy: number;
    scale: number; ready: boolean; dx: number; dy: number;
  } | null>(null);
  const moved = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const move = useCallback(() => {
    const point = start.current;
    if (!point?.ready) return;
    const dx = axis === 'y' ? 0 : point.dx;
    const dy = axis === 'x' ? 0 : point.dy;
    if (!moved.current && Math.hypot(dx, dy) < 4) return;
    moved.current = true;
    const position = {
      label: currentWindow.label, axis,
      x: Math.round(point.wx + dx * point.scale), y: Math.round(point.wy + dy * point.scale),
    };
    queue.current = queue.current.then(() => invoke('move_shell_window', position)).catch(console.error);
  }, [axis, currentWindow.label]);
  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button,input,textarea,a,select') && !target.closest('[data-shell-drag]')) return;
    const point = {
      pointer: event.pointerId, sx: event.screenX, sy: event.screenY,
      wx: 0, wy: 0, scale: 1, ready: false, dx: 0, dy: 0,
    };
    start.current = point;
    moved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    void Promise.all([currentWindow.outerPosition(), currentWindow.scaleFactor()]).then(([position, scale]) => {
      if (start.current !== point) return;
      point.wx = position.x; point.wy = position.y; point.scale = scale; point.ready = true;
      move();
    }).catch(console.error);
  }, [currentWindow, move]);
  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const point = start.current;
    if (!point || point.pointer !== event.pointerId) return;
    point.dx = event.screenX - point.sx; point.dy = event.screenY - point.sy;
    move();
  }, [move]);
  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (start.current?.pointer !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    start.current = null;
  }, []);
  useEffect(() => () => { start.current = null; }, []);
  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    consumeClick: () => { const dragged = moved.current; moved.current = false; return dragged; },
  };
}
