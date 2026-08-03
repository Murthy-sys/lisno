import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

import type {
  AnnotationDocumentV1,
  AnnotationElement,
  AnnotationPoint
} from "../../api/types";
import {
  addElement,
  hitTestElements,
  makeArrow,
  makeBoundedShape,
  isAnnotationDocumentWithinByteLimit,
  moveElement,
  removeElement,
  resizeShape,
  simplifyFreehand,
  updateElement,
  viewportToNormalized,
  type ResizeHandle,
  type ViewTransform
} from "./annotationGeometry";

export type AnnotationTool =
  | "select"
  | "ellipse"
  | "rectangle"
  | "arrow"
  | "freehand"
  | "text";

export interface ImageAnnotationEditorProps {
  imageSource: string;
  imageWidth: number;
  imageHeight: number;
  value: AnnotationDocumentV1;
  sharedAnnotations?: AnnotationDocumentV1["elements"];
  readOnly: boolean;
  onChange: (document: AnnotationDocumentV1) => void;
  viewTransform?: ViewTransform;
}

type DrawingOperation = {
  kind: "draw";
  tool: Exclude<AnnotationTool, "select" | "text">;
  start: AnnotationPoint;
  current: AnnotationPoint;
  points: AnnotationPoint[];
};

type MoveOperation = {
  kind: "move";
  start: AnnotationPoint;
  original: AnnotationElement;
};

type ResizeOperation = {
  kind: "resize";
  handle: ResizeHandle;
  original: Extract<AnnotationElement, { type: "rectangle" | "ellipse" }>;
};

type EditorOperation = DrawingOperation | MoveOperation | ResizeOperation;

const tools: Array<{ tool: AnnotationTool; label: string }> = [
  { tool: "ellipse", label: "Ellipse" },
  { tool: "rectangle", label: "Rectangle" },
  { tool: "arrow", label: "Arrow" },
  { tool: "freehand", label: "Freehand" },
  { tool: "text", label: "Text" }
];
const resizeHandles: ResizeHandle[] = [
  "north-west",
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west"
];
const DEFAULT_TRANSFORM: ViewTransform = { zoom: 1, panX: 0, panY: 0 };
const ANNOTATION_BASE = { color: "#ef4444", strokeWidth: 3 };

function annotationLabel(element: AnnotationElement) {
  return `${element.type[0]!.toUpperCase()}${element.type.slice(1)} annotation`;
}

function handlePoint(
  element: Extract<AnnotationElement, { type: "rectangle" | "ellipse" }>,
  handle: ResizeHandle
) {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const right = element.x + element.width;
  const bottom = element.y + element.height;
  const positions: Record<ResizeHandle, AnnotationPoint> = {
    "north-west": { x: element.x, y: element.y },
    north: { x: centerX, y: element.y },
    "north-east": { x: right, y: element.y },
    east: { x: right, y: centerY },
    "south-east": { x: right, y: bottom },
    south: { x: centerX, y: bottom },
    "south-west": { x: element.x, y: bottom },
    west: { x: element.x, y: centerY }
  };
  return positions[handle];
}

function renderElement(
  element: AnnotationElement,
  imageWidth: number,
  imageHeight: number,
  selected: boolean,
  markerId: string,
  interaction?: {
    onFocus: () => void;
    onKeyDown: (event: ReactKeyboardEvent<SVGElement>) => void;
  },
  isShared = false
) {
  const shared = {
    "aria-label": annotationLabel(element),
    "data-annotation-id": element.id,
    "data-selected": selected ? "true" : "false",
    ...(isShared ? { "data-shared": "true", style: { pointerEvents: "none" as const } } : {}),
    stroke: element.color,
    strokeWidth: element.strokeWidth,
    vectorEffect: "non-scaling-stroke" as const,
    ...(interaction ? {
      role: "button" as const,
      tabIndex: 0,
      onFocus: interaction.onFocus,
      onKeyDown: interaction.onKeyDown
    } : {})
  };
  if (element.type === "rectangle") {
    return (
      <rect
        key={element.id}
        {...shared}
        x={element.x * imageWidth}
        y={element.y * imageHeight}
        width={element.width * imageWidth}
        height={element.height * imageHeight}
        fill="transparent"
      />
    );
  }
  if (element.type === "ellipse") {
    return (
      <ellipse
        key={element.id}
        {...shared}
        cx={(element.x + element.width / 2) * imageWidth}
        cy={(element.y + element.height / 2) * imageHeight}
        rx={(element.width / 2) * imageWidth}
        ry={(element.height / 2) * imageHeight}
        fill="transparent"
      />
    );
  }
  if (element.type === "arrow") {
    return (
      <line
        key={element.id}
        {...shared}
        x1={element.x1 * imageWidth}
        y1={element.y1 * imageHeight}
        x2={element.x2 * imageWidth}
        y2={element.y2 * imageHeight}
        markerEnd={`url(#${markerId})`}
      />
    );
  }
  if (element.type === "freehand") {
    return (
      <polyline
        key={element.id}
        {...shared}
        points={element.points.map((point) => `${point.x * imageWidth},${point.y * imageHeight}`).join(" ")}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  return (
    <text
      key={element.id}
      {...shared}
      x={element.x * imageWidth}
      y={element.y * imageHeight}
      fill={element.color}
      stroke="none"
      fontSize={Math.max(14, element.strokeWidth * 7)}
      paintOrder="stroke"
    >
      {element.text}
    </text>
  );
}

export function AnnotationOverlay({
  imageSource,
  imageWidth,
  imageHeight,
  value,
  viewTransform = DEFAULT_TRANSFORM
}: Omit<ImageAnnotationEditorProps, "readOnly" | "onChange">) {
  const markerId = useId().replaceAll(":", "");
  const visibleWidth = imageWidth / viewTransform.zoom;
  const visibleHeight = imageHeight / viewTransform.zoom;
  const viewBoxX = (0.5 - 0.5 / viewTransform.zoom - viewTransform.panX) * imageWidth;
  const viewBoxY = (0.5 - 0.5 / viewTransform.zoom - viewTransform.panY) * imageHeight;
  return (
    <div className="annotation-overlay">
      <svg
        className="annotation-editor__canvas"
        viewBox={`${viewBoxX} ${viewBoxY} ${visibleWidth} ${visibleHeight}`}
        role="img"
        aria-label="Drawing annotation canvas"
      >
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        <image href={imageSource} width={imageWidth} height={imageHeight} preserveAspectRatio="xMidYMid meet" />
        {value.elements.map((element) =>
          renderElement(element, imageWidth, imageHeight, false, markerId)
        )}
      </svg>
    </div>
  );
}

export function ImageAnnotationEditor({
  imageSource,
  imageWidth,
  imageHeight,
  value,
  sharedAnnotations = [],
  readOnly,
  onChange,
  viewTransform = DEFAULT_TRANSFORM
}: ImageAnnotationEditorProps) {
  const [tool, setTool] = useState<AnnotationTool>("rectangle");
  const [selectedId, setSelectedId] = useState<string>();
  const [draftElement, setDraftElement] = useState<AnnotationElement>();
  const [textDraft, setTextDraft] = useState<{ point: AnnotationPoint; text: string }>();
  const [announcement, setAnnouncement] = useState("");
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle>();
  const operationRef = useRef<EditorOperation | undefined>(undefined);
  const undoRef = useRef<AnnotationDocumentV1[]>([]);
  const redoRef = useRef<AnnotationDocumentV1[]>([]);
  const idCounterRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const markerId = useId().replaceAll(":", "");

  const selected = value.elements.find((element) => element.id === selectedId);
  const renderedElements = draftElement
    ? value.elements.some((element) => element.id === draftElement.id)
      ? value.elements.map((element) => element.id === draftElement.id ? draftElement : element)
      : [...value.elements, draftElement]
    : value.elements;
  const visibleWidth = imageWidth / viewTransform.zoom;
  const visibleHeight = imageHeight / viewTransform.zoom;
  const viewBoxX = (0.5 - 0.5 / viewTransform.zoom - viewTransform.panX) * imageWidth;
  const viewBoxY = (0.5 - 0.5 / viewTransform.zoom - viewTransform.panY) * imageHeight;

  function nextId() {
    idCounterRef.current += 1;
    return `annotation-${Date.now()}-${idCounterRef.current}`;
  }

  function commit(next: AnnotationDocumentV1, message: string) {
    if (!isAnnotationDocumentWithinByteLimit(next)) {
      setAnnouncement("Annotation payload must be 256 KiB or smaller. Remove or shorten annotations.");
      return false;
    }
    undoRef.current = [...undoRef.current.slice(-99), valueRef.current];
    redoRef.current = [];
    valueRef.current = next;
    onChange(next);
    setAnnouncement(message);
    return true;
  }

  function pointFromEvent(event: ReactPointerEvent<SVGElement>) {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
      ?? event.currentTarget.getBoundingClientRect();
    return viewportToNormalized(
      { x: event.clientX, y: event.clientY },
      bounds,
      viewTransform
    );
  }

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (readOnly || (event.button !== undefined && event.button !== 0)) return;
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (tool === "text") {
      setTextDraft({ point, text: "" });
      return;
    }
    const annotationTarget = (event.target as Element).closest?.("[data-annotation-id]");
    if (tool === "select" || annotationTarget) {
      const tolerance = 10 / Math.max(1, Math.min(event.currentTarget.getBoundingClientRect().width, event.currentTarget.getBoundingClientRect().height));
      const hit = annotationTarget
        ? value.elements.find((element) => element.id === annotationTarget.getAttribute("data-annotation-id"))
        : hitTestElements(value.elements, point, tolerance);
      setSelectedId(hit?.id);
      if (hit) operationRef.current = { kind: "move", start: point, original: hit };
      return;
    }
    operationRef.current = {
      kind: "draw",
      tool,
      start: point,
      current: point,
      points: [point]
    };
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const operation = operationRef.current;
    if (!operation || readOnly) return;
    const point = pointFromEvent(event);
    if (operation.kind === "move") {
      setDraftElement(moveElement(operation.original, {
        x: point.x - operation.start.x,
        y: point.y - operation.start.y
      }));
      return;
    }
    if (operation.kind === "resize") {
      setDraftElement(resizeShape(operation.original, operation.handle, point));
      return;
    }
    operation.current = point;
    if (operation.tool === "freehand") {
      const previous = operation.points[operation.points.length - 1]!;
      if (
        operation.points.length < 5_000 &&
        Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.002
      ) {
        operation.points.push(point);
      }
    }
    const base = { ...ANNOTATION_BASE, id: nextId() };
    if (draftElement) base.id = draftElement.id;
    if (operation.tool === "rectangle" || operation.tool === "ellipse") {
      setDraftElement(makeBoundedShape(operation.tool, operation.start, point, base));
    } else if (operation.tool === "arrow") {
      setDraftElement(makeArrow(operation.start, point, base));
    } else {
      setDraftElement({
        ...base,
        type: "freehand",
        points: simplifyFreehand(operation.points)
      });
    }
  }

  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const operation = operationRef.current;
    if (!operation || readOnly) return;
    const point = pointFromEvent(event);
    operationRef.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (operation.kind === "move") {
      const moved = moveElement(operation.original, {
        x: point.x - operation.start.x,
        y: point.y - operation.start.y
      });
      setDraftElement(undefined);
      if (JSON.stringify(moved) !== JSON.stringify(operation.original)) {
        commit(updateElement(valueRef.current, moved), "Moved annotation");
      }
      return;
    }
    if (operation.kind === "resize") {
      const resized = resizeShape(operation.original, operation.handle, point);
      setDraftElement(undefined);
      commit(updateElement(valueRef.current, resized), "Resized annotation");
      return;
    }

    const base = { ...ANNOTATION_BASE, id: draftElement?.id ?? nextId() };
    let created: AnnotationElement;
    if (operation.tool === "rectangle" || operation.tool === "ellipse") {
      created = makeBoundedShape(operation.tool, operation.start, point, base);
    } else if (operation.tool === "arrow") {
      created = makeArrow(operation.start, point, base);
    } else {
      const usedPoints = valueRef.current.elements.reduce(
        (count, element) => count + (element.type === "freehand" ? element.points.length : 0),
        0
      );
      const remainingPoints = 5_000 - usedPoints;
      if (remainingPoints < 2) {
        setDraftElement(undefined);
        setAnnouncement("Freehand point limit reached");
        return;
      }
      created = {
        ...base,
        type: "freehand",
        points: simplifyFreehand([...operation.points, point], 0.004, remainingPoints)
      };
    }
    setDraftElement(undefined);
    if (valueRef.current.elements.length >= 200) {
      setAnnouncement("Annotation limit reached");
      return;
    }
    if (commit(addElement(valueRef.current, created), `Added ${operation.tool} annotation`)) {
      setSelectedId(created.id);
    }
  }

  function startResize(
    event: ReactPointerEvent<SVGCircleElement>,
    element: Extract<AnnotationElement, { type: "rectangle" | "ellipse" }>,
    handle: ResizeHandle
  ) {
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
    operationRef.current = { kind: "resize", original: element, handle };
  }

  function elementKeyDown(
    event: ReactKeyboardEvent<SVGElement>,
    element: AnnotationElement
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      setSelectedId(element.id);
      setAnnouncement(`Selected ${element.type} annotation`);
      return;
    }
    const directions: Record<string, AnnotationPoint> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 }
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.025 : 0.005;
    const moved = moveElement(element, {
      x: direction.x * step,
      y: direction.y * step
    });
    setSelectedId(element.id);
    commit(updateElement(valueRef.current, moved), `Moved ${element.type} annotation`);
  }

  function resizeHandleKeyDown(
    event: ReactKeyboardEvent<SVGCircleElement>,
    element: Extract<AnnotationElement, { type: "rectangle" | "ellipse" }>,
    handle: ResizeHandle
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      setActiveResizeHandle((current) => current === handle ? undefined : handle);
      setAnnouncement(`Resize ${handle} handle ${activeResizeHandle === handle ? "released" : "active"}`);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setActiveResizeHandle(undefined);
      setAnnouncement("Resize handle released");
      return;
    }
    const directions: Record<string, AnnotationPoint> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 }
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.025 : 0.005;
    const point = handlePoint(element, handle);
    const resized = resizeShape(element, handle, {
      x: point.x + direction.x * step,
      y: point.y + direction.y * step
    });
    commit(updateElement(valueRef.current, resized), `Resized ${element.type} annotation`);
  }

  function createWithKeyboard() {
    if (tool === "select") return;
    if (tool === "text") {
      setTextDraft({ point: { x: 0.5, y: 0.5 }, text: "" });
      return;
    }
    if (valueRef.current.elements.length >= 200) {
      setAnnouncement("Annotation limit reached");
      return;
    }
    const base = { ...ANNOTATION_BASE, id: nextId() };
    let created: AnnotationElement;
    if (tool === "rectangle" || tool === "ellipse") {
      created = makeBoundedShape(
        tool,
        { x: 0.4, y: 0.4 },
        { x: 0.6, y: 0.6 },
        base
      );
    } else if (tool === "arrow") {
      created = makeArrow({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, base);
    } else {
      const usedPoints = valueRef.current.elements.reduce(
        (count, element) => count + (element.type === "freehand" ? element.points.length : 0),
        0
      );
      if (5_000 - usedPoints < 3) {
        setAnnouncement("Freehand point limit reached");
        return;
      }
      created = {
        ...base,
        type: "freehand",
        points: [{ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.45 }, { x: 0.6, y: 0.5 }]
      };
    }
    if (commit(addElement(valueRef.current, created), `Added ${tool} annotation`)) {
      setSelectedId(created.id);
    }
  }

  function undo() {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current = [...redoRef.current.slice(-99), valueRef.current];
    valueRef.current = previous;
    setSelectedId(undefined);
    onChange(previous);
    setAnnouncement("Undid annotation change");
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current = [...undoRef.current.slice(-99), valueRef.current];
    valueRef.current = next;
    onChange(next);
    setAnnouncement("Redid annotation change");
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit(removeElement(valueRef.current, selectedId), "Deleted annotation");
    setSelectedId(undefined);
  }

  function keyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (readOnly) return;
    if (event.key === "Enter" && tool !== "select") {
      event.preventDefault();
      createWithKeyboard();
      return;
    }
    if (event.key === "Escape") {
      operationRef.current = undefined;
      setDraftElement(undefined);
      setTextDraft(undefined);
      setAnnouncement("Cancelled annotation");
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
    }
  }

  function submitText(event: FormEvent) {
    event.preventDefault();
    if (!textDraft?.text.trim() || valueRef.current.elements.length >= 200) return;
    const created: AnnotationElement = {
      ...ANNOTATION_BASE,
      id: nextId(),
      type: "text",
      x: textDraft.point.x,
      y: textDraft.point.y,
      text: textDraft.text.trim().slice(0, 500)
    };
    if (commit(addElement(valueRef.current, created), "Added text annotation")) {
      setSelectedId(created.id);
      setTextDraft(undefined);
    }
  }

  return (
    <div
      className={`annotation-editor${readOnly ? " annotation-editor--read-only" : ""}`}
      data-annotation-drawing={!readOnly && tool !== "select" ? "true" : "false"}
      data-active-tool={tool}
    >
      {!readOnly ? (
        <div className="annotation-toolbar" role="toolbar" aria-label="Annotation tools">
          <p className="annotation-toolbar__hint">Choose a tool, then drag on the drawing.</p>
          {tools.map((item) => (
            <button
              key={item.tool}
              type="button"
              aria-pressed={tool === item.tool}
              onClick={() => setTool(item.tool)}
            >
              {item.label}
            </button>
          ))}
          <button type="button" onClick={undo} disabled={undoRef.current.length === 0}>Undo</button>
          <button type="button" onClick={redo} disabled={redoRef.current.length === 0}>Redo</button>
          <button type="button" onClick={deleteSelected} disabled={!selectedId}>Delete selected</button>
        </div>
      ) : null}
      <div className="annotation-editor__viewport">
        <svg
          data-testid="annotation-canvas"
          className="annotation-editor__canvas"
          viewBox={`${viewBoxX} ${viewBoxY} ${visibleWidth} ${visibleHeight}`}
          role="img"
          aria-label="Drawing annotation canvas"
          tabIndex={readOnly ? undefined : 0}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onKeyDown={keyDown}
        >
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          <image href={imageSource} width={imageWidth} height={imageHeight} preserveAspectRatio="xMidYMid meet" />
          {sharedAnnotations.map((element) =>
            renderElement(element, imageWidth, imageHeight, false, markerId, undefined, true)
          )}
          {renderedElements.map((element) =>
            renderElement(
              element,
              imageWidth,
              imageHeight,
              element.id === selectedId,
              markerId,
              readOnly ? undefined : {
                onFocus: () => {
                  setSelectedId(element.id);
                  setActiveResizeHandle(undefined);
                },
                onKeyDown: (event) => elementKeyDown(event, element)
              }
            )
          )}
          {!readOnly && selected && (selected.type === "rectangle" || selected.type === "ellipse")
            ? resizeHandles.map((handle) => {
                const point = handlePoint(selected, handle);
                return (
                  <circle
                    key={handle}
                    role="button"
                    tabIndex={0}
                    aria-label={`Resize ${handle}`}
                    aria-pressed={activeResizeHandle === handle}
                    cx={point.x * imageWidth}
                    cy={point.y * imageHeight}
                    r={6}
                    fill="#ffffff"
                    stroke="#ef4444"
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(event) => startResize(event, selected, handle)}
                    onKeyDown={(event) => resizeHandleKeyDown(event, selected, handle)}
                  />
                );
              })
            : null}
        </svg>
      </div>
      {!readOnly ? <span className="sr-only" role="status" aria-live="polite">{announcement}</span> : null}
      {textDraft ? (
        <dialog className="annotation-text-dialog" open aria-labelledby={`${markerId}-text-title`}>
          <form method="dialog" onSubmit={submitText}>
            <h3 id={`${markerId}-text-title`}>Add text note</h3>
            <label>
              Text note
              <textarea
                autoFocus
                maxLength={500}
                value={textDraft.text}
                onChange={(event) => setTextDraft({ ...textDraft, text: event.target.value })}
              />
            </label>
            <div>
              <button type="button" onClick={() => setTextDraft(undefined)}>Cancel</button>
              <button type="submit" disabled={!textDraft.text.trim()}>Add note</button>
            </div>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}
