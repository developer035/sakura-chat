'use client';

import React, { useRef, useState } from 'react';

interface ResizableDividerProps {
  /** Horizontal movement since the last call, in px (positive = pointer moved right). */
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
  /** Double-click resets to the default width. */
  onReset?: () => void;
}

/** Thin draggable bar between two panels. Works with mouse, touch and the arrow keys. */
export function ResizableDivider({ onResize, onResizeEnd, onReset }: ResizableDividerProps) {
  const [dragging, setDragging] = useState(false);
  const lastX = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const delta = e.clientX - lastX.current;
    lastX.current = e.clientX;
    if (delta !== 0) onResize(delta);
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onResizeEnd();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      onResize(e.key === 'ArrowLeft' ? -24 : 24);
      onResizeEnd();
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat panel"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      title="Drag to resize (double-click to reset)"
      className={`hidden md:flex w-[6px] shrink-0 cursor-col-resize items-center justify-center rounded-full touch-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pink-deep)] ${
        dragging ? 'bg-[var(--lavender)]' : 'bg-[var(--ink)]/15 hover:bg-[var(--lavender)]'
      }`}
    >
      <span className="h-8 w-[2px] rounded-full bg-[var(--ink)]/40" />
    </div>
  );
}
