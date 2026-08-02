import { useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from "react";

export interface MapViewTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function screenPointToDocumentPoint(point: ScreenPoint, transform: MapViewTransform): ScreenPoint {
  return {
    x: (point.x - transform.translateX) / transform.scale,
    y: (point.y - transform.translateY) / transform.scale
  };
}

const INITIAL_VIEW: MapViewTransform = { scale: 1, translateX: 0, translateY: 0 };
const MIN_SCALE = 0.5;
const MAX_SCALE = 8;

function clampScale(scale: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(scale * 100) / 100));
}

export function MapViewport({
  ariaLabel,
  children
}: {
  ariaLabel: string;
  children: (transform: MapViewTransform) => ReactNode;
}) {
  const [view, setView] = useState(INITIAL_VIEW);
  const pointers = useRef(new Map<number, ScreenPoint>());
  const dragOrigin = useRef<{ pointer: ScreenPoint; view: MapViewTransform } | undefined>(undefined);
  const pinchOrigin = useRef<{ distance: number; midpoint: ScreenPoint; view: MapViewTransform } | undefined>(undefined);

  function zoomAt(nextScale: number, focal: ScreenPoint) {
    setView((current) => {
      const scale = clampScale(nextScale);
      if (scale === current.scale) return current;
      const ratio = scale / current.scale;
      return {
        scale,
        translateX: focal.x - (focal.x - current.translateX) * ratio,
        translateY: focal.y - (focal.y - current.translateY) * ratio
      };
    });
  }

  function surfacePoint(clientX: number, clientY: number, element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    return { x: clientX - bounds.left, y: clientY - bounds.top };
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const focal = surfacePoint(event.clientX, event.clientY, event.currentTarget);
    zoomAt(view.scale + (event.deltaY < 0 ? 0.25 : -0.25), focal);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== undefined && event.button !== 0 && event.pointerType !== "touch") return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-map-no-drag="true"], [data-annotation-drawing="true"], [role="button"]')) return;
    const point = surfacePoint(event.clientX, event.clientY, event.currentTarget);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 1) dragOrigin.current = { pointer: point, view };
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      pinchOrigin.current = {
        distance: Math.hypot(second!.x - first!.x, second!.y - first!.y),
        midpoint: { x: (first!.x + second!.x) / 2, y: (first!.y + second!.y) / 2 },
        view
      };
      dragOrigin.current = undefined;
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const point = surfacePoint(event.clientX, event.clientY, event.currentTarget);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2 && pinchOrigin.current) {
      const [first, second] = [...pointers.current.values()];
      const distance = Math.hypot(second!.x - first!.x, second!.y - first!.y);
      const scale = clampScale(pinchOrigin.current.view.scale * distance / Math.max(1, pinchOrigin.current.distance));
      const ratio = scale / pinchOrigin.current.view.scale;
      const focal = pinchOrigin.current.midpoint;
      setView({ scale, translateX: focal.x - (focal.x - pinchOrigin.current.view.translateX) * ratio, translateY: focal.y - (focal.y - pinchOrigin.current.view.translateY) * ratio });
      return;
    }
    if (dragOrigin.current) {
      setView({
        ...dragOrigin.current.view,
        translateX: dragOrigin.current.view.translateX + point.x - dragOrigin.current.pointer.x,
        translateY: dragOrigin.current.view.translateY + point.y - dragOrigin.current.pointer.y
      });
    }
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    dragOrigin.current = undefined;
    pinchOrigin.current = undefined;
  }

  return (
    <section className="map-viewport" aria-label={ariaLabel}>
      <div className="map-viewport__toolbar" role="toolbar" aria-label="Zoom controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(view.scale + 0.25, { x: 0, y: 0 })} disabled={view.scale >= MAX_SCALE}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(view.scale - 0.25, { x: 0, y: 0 })} disabled={view.scale <= MIN_SCALE}>−</button>
        <button type="button" onClick={() => setView(INITIAL_VIEW)}>Fit</button>
        <button type="button" aria-label="Reset view" onClick={() => setView(INITIAL_VIEW)}>Reset</button>
        <span role="status" aria-live="polite">{Math.round(view.scale * 100)}% zoom</span>
      </div>
      <div
        className="map-viewport__surface"
        data-testid="map-viewport-surface"
        onWheel={onWheel}
        onDoubleClick={(event) => zoomAt(view.scale + 0.5, surfacePoint(event.clientX, event.clientY, event.currentTarget))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        {children(view)}
      </div>
    </section>
  );
}
