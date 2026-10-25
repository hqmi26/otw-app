import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

type Snap = 'min' | 'mid' | 'max';
const ORDER: Snap[] = ['min', 'mid', 'max'];

/** Pixels a finger must move before a press becomes a drag (so taps still work). */
const DRAG_START_PX = 6;
/** px per ms; a faster flick jumps to the next position in that direction. */
const FLICK_SPEED = 0.45;
/** The fully open sheet never covers more than this share of the screen. */
const MAX_SHARE = 0.8;

interface Props {
  /** Always visible, even when the sheet is at its smallest. Also the main drag area. */
  header: ReactNode;
  /** The rest. Mark the element that should still show at the middle position with data-peek. */
  children: ReactNode;
  label: string;
}

interface Heights {
  min: number;
  mid: number;
  max: number;
}

/**
 * A bottom sheet you can drag between three heights, like Google Maps:
 * small (header only), middle (header + the data-peek part), and full
 * (everything, scrollable). Publishes its height as --sheet-h so floating
 * buttons ride on top of it.
 */
export default function BottomSheet({ header, children, label }: Props) {
  const sheetRef = useRef<HTMLElement>(null);
  const grabRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Heights | null>(null);
  const [snap, setSnap] = useState<Snap>('mid');
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  // Work out the three heights from the content, and again whenever it changes size.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const grab = grabRef.current;
    const inner = innerRef.current;
    if (!sheet || !grab || !inner) return;
    const measure = () => {
      const padBottom = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
      const min = Math.round(grab.offsetHeight + padBottom);
      const peek = inner.querySelector<HTMLElement>('[data-peek]');
      const peekBottom = peek ? peek.getBoundingClientRect().bottom - inner.getBoundingClientRect().top : 0;
      const room = window.innerHeight * MAX_SHARE - min;
      const mid = Math.round(min + Math.min(peekBottom, room));
      const max = Math.round(Math.max(mid, min + Math.min(inner.scrollHeight, room)));
      setHeights((h) => (h && h.min === min && h.mid === mid && h.max === max ? h : { min, mid, max }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    ro.observe(grab);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Tell the rest of the app how much of the screen the sheet covers.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const app = sheet?.closest<HTMLElement>('.app');
    if (!sheet || !app) return;
    const publish = () => app.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(sheet);
    return () => {
      ro.disconnect();
      app.style.removeProperty('--sheet-h');
    };
  }, []);

  const height = dragHeight ?? (heights ? heights[snap] : undefined);
  /** Set right after a drag, so the click that follows doesn't press a row. */
  const justDragged = useRef(false);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!heights || e.button !== 0) return;
      const startY = e.clientY;
      const startT = e.timeStamp;
      const startH = height ?? heights[snap];
      const id = e.pointerId;
      let active = false;

      const rubberBand = (raw: number) =>
        raw < heights.min
          ? heights.min - (heights.min - raw) * 0.25
          : raw > heights.max
            ? heights.max + (raw - heights.max) * 0.25
            : raw;

      // Listen on the whole window, so a quick swipe that leaves the sheet still counts.
      const move = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== id) return;
        const dy = startY - ev.clientY;
        if (!active && Math.abs(dy) < DRAG_START_PX) return;
        active = true;
        setDragHeight(rubberBand(startH + dy));
      };
      const end = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        if (!active) return;
        const dy = startY - ev.clientY;
        const h = startH + dy;
        const speed = dy / Math.max(1, ev.timeStamp - startT);
        let next: Snap;
        if (Math.abs(speed) > FLICK_SPEED) {
          // A flick goes to the next stop beyond where the finger let go.
          next =
            speed > 0
              ? (ORDER.find((s) => heights[s] > h + 1) ?? 'max')
              : ([...ORDER].reverse().find((s) => heights[s] < h - 1) ?? 'min');
        } else {
          next = ORDER.reduce((best, s) => (Math.abs(heights[s] - h) < Math.abs(heights[best] - h) ? s : best), snap);
        }
        setSnap(next);
        setDragHeight(null);
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 80);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [heights, height, snap],
  );

  const cycle = () => setSnap((s) => (s === 'max' ? 'mid' : s === 'mid' ? 'max' : 'mid'));
  const bodyScrolls = snap === 'max' && dragHeight == null;
  const handlers = { onPointerDown };

  return (
    <section
      ref={sheetRef}
      className={`sheet sheet-draggable${dragHeight != null ? ' is-dragging' : ''}`}
      style={height != null ? { height } : undefined}
      aria-label={label}
      onClickCapture={(e) => {
        if (justDragged.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      <div ref={grabRef} className="sheet-grab" {...handlers}>
        <button
          type="button"
          className="handle-btn"
          onClick={cycle}
          aria-label={snap === 'max' ? `Shrink ${label}` : `Expand ${label}`}
          aria-expanded={snap === 'max'}
        >
          <span className="handle" />
        </button>
        {header}
      </div>
      <div
        className={`sheet-body${bodyScrolls ? ' is-scrollable' : ''}`}
        // While the body can't scroll, dragging it moves the sheet instead.
        {...(bodyScrolls ? {} : handlers)}
      >
        <div ref={innerRef} className="sheet-inner">
          {children}
        </div>
      </div>
    </section>
  );
}
