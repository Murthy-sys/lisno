import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  useWindowDimensions, type GestureResponderEvent
} from "react-native";
import Svg, { Circle, Ellipse, Image as SvgImage, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";

import {
  clampNormalized, containedImageRect, normalizedPointToViewport, viewportPointToNormalized,
  type AnnotationPoint, type AnnotationRect, type ViewTransform
} from "../../platform/annotations/coordinates";
import {
  MAX_ANNOTATION_ELEMENTS, MAX_ANNOTATION_POINTS, validateAnnotationDocument,
  type AnnotationDocumentV1, type AnnotationElementV1
} from "../../platform/annotations/document";
import {
  addElement, hitTestElements, makeArrow, makeBoundedShape, moveElement,
  removeElement, resizeShape, simplifyFreehand, updateElement, type ResizeHandle
} from "../../platform/annotations/geometry";
import {
  IDENTITY_VIEW, panByViewportDelta, pinchViewTransform, zoomAtViewportPoint
} from "../../platform/annotations/gestures";
import { colors, fonts, spacing } from "../../ui/tokens";

export type AnnotationTool = "select" | "pan" | "rectangle" | "ellipse" | "arrow" | "freehand" | "text";

export interface NativeAnnotationEditorProps {
  /** An authenticated, temporary local file URI. */
  readonly imageUri: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly value: AnnotationDocumentV1;
  readonly onChange: (next: AnnotationDocumentV1) => void;
  readonly readOnly?: boolean;
  readonly sharedAnnotations?: readonly AnnotationElementV1[];
}

type Shape = Extract<AnnotationElementV1, { type: "rectangle" | "ellipse" }>;
type DrawTool = Exclude<AnnotationTool, "select" | "pan" | "text">;
type Interaction =
  | { kind: "draw"; tool: DrawTool; start: AnnotationPoint; points: AnnotationPoint[]; id: string }
  | { kind: "move"; start: AnnotationPoint; original: AnnotationElementV1 }
  | { kind: "resize"; original: Shape; handle: ResizeHandle }
  | { kind: "pan"; start: AnnotationPoint; transform: ViewTransform }
  | { kind: "pinch"; initial: readonly [AnnotationPoint, AnnotationPoint]; transform: ViewTransform };

const TOOLS: readonly { tool: AnnotationTool; label: string }[] = [
  { tool: "select", label: "Select" }, { tool: "pan", label: "Pan" },
  { tool: "rectangle", label: "Rectangle" }, { tool: "ellipse", label: "Ellipse" },
  { tool: "arrow", label: "Arrow" }, { tool: "freehand", label: "Freehand" },
  { tool: "text", label: "Text" }
];
const COLORS = [
  { name: "Red", hex: "#B42318" },
  { name: "Blue", hex: "#315AB8" },
  { name: "Olive", hex: "#3D4A32" }
] as const;
const STROKES = [2, 4, 8] as const;
const HISTORY_LIMIT = 100;

function labelFor(element: AnnotationElementV1, index: number, shared = false): string {
  const type = element.type[0]!.toUpperCase() + element.type.slice(1);
  return `${shared ? "Submitted " : ""}${type} annotation ${index + 1}${element.type === "text" ? `: ${element.text}` : ""}`;
}

function eventTouches(event: GestureResponderEvent): AnnotationPoint[] {
  const native = event.nativeEvent as typeof event.nativeEvent & {
    touches?: readonly { locationX: number; locationY: number }[];
  };
  const touches = native.touches;
  if (touches && touches.length > 0) return touches.map((touch) => ({ x: touch.locationX, y: touch.locationY }));
  return [{ x: native.locationX, y: native.locationY }];
}

function viewBox(imageWidth: number, imageHeight: number, transform: ViewTransform): string {
  const x = (0.5 - 0.5 / transform.zoom - transform.panX) * imageWidth;
  const y = (0.5 - 0.5 / transform.zoom - transform.panY) * imageHeight;
  return `${x} ${y} ${imageWidth / transform.zoom} ${imageHeight / transform.zoom}`;
}

function arrowHead(element: Extract<AnnotationElementV1, { type: "arrow" }>, width: number, height: number): string {
  const x1 = element.x1 * width;
  const y1 = element.y1 * height;
  const x2 = element.x2 * width;
  const y2 = element.y2 * height;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(14, Math.min(width, height) * 0.018);
  const left = { x: x2 - size * Math.cos(angle - Math.PI / 6), y: y2 - size * Math.sin(angle - Math.PI / 6) };
  const right = { x: x2 - size * Math.cos(angle + Math.PI / 6), y: y2 - size * Math.sin(angle + Math.PI / 6) };
  return `M ${left.x} ${left.y} L ${x2} ${y2} L ${right.x} ${right.y}`;
}

const Mark = memo(function Mark({ element, width, height, selected, shared }: {
  readonly element: AnnotationElementV1;
  readonly width: number;
  readonly height: number;
  readonly selected: boolean;
  readonly shared: boolean;
}) {
  const stroke = element.color;
  const strokeWidth = element.strokeWidth + (selected ? 1 : 0);
  const opacity = shared ? 0.58 : 1;
  if (element.type === "rectangle") return <Rect x={element.x * width} y={element.y * height}
    width={element.width * width} height={element.height * height} fill="transparent"
    stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" opacity={opacity} />;
  if (element.type === "ellipse") return <Ellipse cx={(element.x + element.width / 2) * width}
    cy={(element.y + element.height / 2) * height} rx={element.width * width / 2}
    ry={element.height * height / 2} fill="transparent" stroke={stroke}
    strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" opacity={opacity} />;
  if (element.type === "arrow") return <>
    <Line x1={element.x1 * width} y1={element.y1 * height} x2={element.x2 * width} y2={element.y2 * height}
      stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" opacity={opacity} />
    <Path d={arrowHead(element, width, height)} fill="none" stroke={stroke} strokeWidth={strokeWidth}
      vectorEffect="non-scaling-stroke" opacity={opacity} />
  </>;
  if (element.type === "freehand") return <Polyline
    points={element.points.map((point) => `${point.x * width},${point.y * height}`).join(" ")}
    fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round"
    strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={opacity} />;
  return <SvgText x={element.x * width} y={element.y * height} fill={stroke}
    fontSize={Math.max(18, height * 0.024)} fontWeight={selected ? "bold" : "normal"}
    opacity={opacity}>{element.text}</SvgText>;
});

function shapeHandles(shape: Shape): { handle: ResizeHandle; point: AnnotationPoint }[] {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const right = shape.x + shape.width;
  const bottom = shape.y + shape.height;
  return [
    { handle: "north-west", point: { x: shape.x, y: shape.y } },
    { handle: "north", point: { x: cx, y: shape.y } },
    { handle: "north-east", point: { x: right, y: shape.y } },
    { handle: "east", point: { x: right, y: cy } },
    { handle: "south-east", point: { x: right, y: bottom } },
    { handle: "south", point: { x: cx, y: bottom } },
    { handle: "south-west", point: { x: shape.x, y: bottom } },
    { handle: "west", point: { x: shape.x, y: cy } }
  ];
}

function hitHandle(
  shape: Shape, screen: AnnotationPoint, imageRect: AnnotationRect, transform: ViewTransform
): ResizeHandle | undefined {
  return shapeHandles(shape).find((handle) => {
    const projected = normalizedPointToViewport(handle.point, imageRect, transform);
    return Math.hypot(projected.x - screen.x, projected.y - screen.y) <= 18;
  })?.handle;
}

export function NativeAnnotationEditor({
  imageUri, imageWidth, imageHeight, value, onChange, readOnly = false, sharedAnnotations = []
}: NativeAnnotationEditorProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ViewTransform>(IDENTITY_VIEW);
  const [tool, setTool] = useState<AnnotationTool>(readOnly ? "pan" : "select");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedSharedId, setSelectedSharedId] = useState<string>();
  const [draftElement, setDraftElement] = useState<AnnotationElementV1>();
  const [textDraft, setTextDraft] = useState<{ point: AnnotationPoint; text: string; editId?: string }>();
  const [color, setColor] = useState<string>(COLORS[0].hex);
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [announcement, setAnnouncement] = useState("");
  const [, setHistoryTick] = useState(0);
  const interactionRef = useRef<Interaction | undefined>(undefined);
  const valueRef = useRef(value);
  const transformRef = useRef(transform);
  const undoRef = useRef<AnnotationDocumentV1[]>([]);
  const redoRef = useRef<AnnotationDocumentV1[]>([]);
  const previewTimeRef = useRef(0);
  const idCounterRef = useRef(0);
  valueRef.current = value;
  transformRef.current = transform;

  useEffect(() => {
    interactionRef.current = undefined;
    undoRef.current = [];
    redoRef.current = [];
    setSelectedId(undefined);
    setSelectedSharedId(undefined);
    setDraftElement(undefined);
    setTextDraft(undefined);
    setTransform(IDENTITY_VIEW);
    setHistoryTick((count) => count + 1);
  }, [imageUri, imageWidth, imageHeight]);

  const validation = useMemo(
    () => validateAnnotationDocument(value, imageWidth, imageHeight),
    [value, imageWidth, imageHeight]
  );
  const imageSource = useMemo(() => ({ uri: imageUri }), [imageUri]);
  const stageHeight = Math.max(320, Math.min(560, (windowWidth - 32) * imageHeight / imageWidth));
  const imageRect = viewport.width > 0 && viewport.height > 0 && imageWidth > 0 && imageHeight > 0
    ? containedImageRect({ width: imageWidth, height: imageHeight }, { x: 0, y: 0, ...viewport })
    : null;
  const selected = value.elements.find((element) => element.id === selectedId);
  const displayed = draftElement ? value.elements.some((element) => element.id === draftElement.id)
    ? value.elements.map((element) => element.id === draftElement.id ? draftElement : element)
    : [...value.elements, draftElement] : value.elements;

  function announce(message: string) {
    setAnnouncement(message);
    AccessibilityInfo.announceForAccessibility(message);
  }

  function nextId(): string {
    idCounterRef.current += 1;
    return `mobile-annotation-${Date.now()}-${idCounterRef.current}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function commit(next: AnnotationDocumentV1, message: string): boolean {
    if (readOnly) return false;
    const result = validateAnnotationDocument(next, imageWidth, imageHeight);
    if (!result.valid) { announce(result.message); return false; }
    undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), valueRef.current];
    redoRef.current = [];
    valueRef.current = next;
    onChange(next);
    setHistoryTick((count) => count + 1);
    announce(message);
    return true;
  }

  function toSource(point: AnnotationPoint): AnnotationPoint | null {
    return imageRect ? viewportPointToNormalized(point, imageRect, transformRef.current, false) : null;
  }

  function preview(element: AnnotationElementV1 | undefined) {
    const now = Date.now();
    if (now - previewTimeRef.current >= 30) { setDraftElement(element); previewTimeRef.current = now; }
  }

  function setNavigation(next: ViewTransform, force = false) {
    transformRef.current = next;
    const now = Date.now();
    if (force || now - previewTimeRef.current >= 30) {
      setTransform(next);
      previewTimeRef.current = now;
    }
  }

  function begin(event: GestureResponderEvent) {
    if (!validation.valid || !imageRect) return;
    const touches = eventTouches(event);
    if (touches.length >= 2) {
      interactionRef.current = { kind: "pinch", initial: [touches[0]!, touches[1]!], transform: transformRef.current };
      return;
    }
    const screen = touches[0]!;
    if (readOnly || tool === "pan") {
      interactionRef.current = { kind: "pan", start: screen, transform: transformRef.current };
      return;
    }
    const point = toSource(screen);
    if (!point) return;
    if (tool === "text") {
      setTextDraft({ point, text: "" });
      return;
    }
    if (tool === "select") {
      if (selected && (selected.type === "rectangle" || selected.type === "ellipse")) {
        const handle = hitHandle(selected, screen, imageRect, transformRef.current);
        if (handle) { interactionRef.current = { kind: "resize", original: selected, handle }; return; }
      }
      const hit = hitTestElements(valueRef.current.elements, point);
      setSelectedId(hit?.id);
      setSelectedSharedId(undefined);
      if (hit) interactionRef.current = { kind: "move", start: point, original: hit };
      return;
    }
    interactionRef.current = { kind: "draw", tool, start: point, points: [point], id: nextId() };
  }

  function move(event: GestureResponderEvent) {
    if (!imageRect) return;
    const touches = eventTouches(event);
    let interaction = interactionRef.current;
    if (touches.length >= 2) {
      if (interaction?.kind !== "pinch") {
        interaction = { kind: "pinch", initial: [touches[0]!, touches[1]!], transform: transformRef.current };
        interactionRef.current = interaction;
        setDraftElement(undefined);
      }
      setNavigation(pinchViewTransform(interaction.transform, interaction.initial, [touches[0]!, touches[1]!], imageRect));
      return;
    }
    if (!interaction || interaction.kind === "pinch") return;
    const screen = touches[0]!;
    if (interaction.kind === "pan") {
      setNavigation(panByViewportDelta(interaction.transform,
        { x: screen.x - interaction.start.x, y: screen.y - interaction.start.y }, imageRect));
      return;
    }
    const point = toSource(screen);
    if (!point) return;
    if (interaction.kind === "move") {
      preview(moveElement(interaction.original, { x: point.x - interaction.start.x, y: point.y - interaction.start.y }));
      return;
    }
    if (interaction.kind === "resize") { preview(resizeShape(interaction.original, interaction.handle, point)); return; }
    if (interaction.tool === "freehand") {
      const previous = interaction.points[interaction.points.length - 1]!;
      if (interaction.points.length < MAX_ANNOTATION_POINTS && Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.001) {
        interaction.points.push(point);
      }
    }
    const base = { id: interaction.id, color, strokeWidth };
    preview(interaction.tool === "rectangle" || interaction.tool === "ellipse"
      ? makeBoundedShape(interaction.tool, interaction.start, point, base)
      : interaction.tool === "arrow"
        ? makeArrow(interaction.start, point, base)
        : { ...base, type: "freehand", points: simplifyFreehand(interaction.points) });
  }

  function finish(event: GestureResponderEvent) {
    const interaction = interactionRef.current;
    interactionRef.current = undefined;
    if (!interaction || !imageRect) return;
    if (interaction.kind === "pinch" || interaction.kind === "pan") {
      setNavigation(transformRef.current, true);
      return;
    }
    setDraftElement(undefined);
    const point = viewportPointToNormalized(eventTouches(event)[0]!, imageRect, transformRef.current, true)!;
    if (interaction.kind === "move") {
      const moved = moveElement(interaction.original, { x: point.x - interaction.start.x, y: point.y - interaction.start.y });
      if (JSON.stringify(moved) !== JSON.stringify(interaction.original)) commit(updateElement(valueRef.current, moved), "Moved annotation");
      return;
    }
    if (interaction.kind === "resize") {
      commit(updateElement(valueRef.current, resizeShape(interaction.original, interaction.handle, point)), "Resized annotation");
      return;
    }
    if (valueRef.current.elements.length >= MAX_ANNOTATION_ELEMENTS) { announce("Annotation limit reached"); return; }
    const base = { id: interaction.id, color, strokeWidth };
    let created: AnnotationElementV1;
    if (interaction.tool === "rectangle" || interaction.tool === "ellipse") {
      created = makeBoundedShape(interaction.tool, interaction.start, point, base);
    } else if (interaction.tool === "arrow") {
      created = makeArrow(interaction.start, point, base);
    } else {
      const used = valueRef.current.elements.reduce((sum, element) => sum + (element.type === "freehand" ? element.points.length : 0), 0);
      const remaining = MAX_ANNOTATION_POINTS - used;
      if (remaining < 2) { announce("Freehand point limit reached"); return; }
      created = { ...base, type: "freehand", points: simplifyFreehand([...interaction.points, point], 0.004, remaining) };
    }
    if (commit(addElement(valueRef.current, created), `Added ${created.type} annotation`)) setSelectedId(created.id);
  }

  function undo() {
    if (readOnly) return;
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current = [...redoRef.current.slice(-(HISTORY_LIMIT - 1)), valueRef.current];
    valueRef.current = previous;
    onChange(previous);
    setSelectedId(undefined);
    setHistoryTick((count) => count + 1);
    announce("Undid annotation change");
  }

  function redo() {
    if (readOnly) return;
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), valueRef.current];
    valueRef.current = next;
    onChange(next);
    setSelectedId(undefined);
    setHistoryTick((count) => count + 1);
    announce("Redid annotation change");
  }

  function addAtCenter() {
    if (readOnly || tool === "select" || tool === "pan") return;
    if (tool === "text") { setTextDraft({ point: { x: 0.5, y: 0.5 }, text: "" }); return; }
    if (valueRef.current.elements.length >= MAX_ANNOTATION_ELEMENTS) { announce("Annotation limit reached"); return; }
    const base = { id: nextId(), color, strokeWidth };
    const created: AnnotationElementV1 = tool === "rectangle" || tool === "ellipse"
      ? makeBoundedShape(tool, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }, base)
      : tool === "arrow" ? makeArrow({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, base)
        : { ...base, type: "freehand", points: [{ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.45 }, { x: 0.6, y: 0.5 }] };
    if (commit(addElement(valueRef.current, created), `Added ${tool} annotation`)) setSelectedId(created.id);
  }

  function saveText() {
    if (!textDraft || readOnly) return;
    const text = textDraft.text.trim();
    if (!text) { announce("Enter text for the annotation"); return; }
    if (text.length > 500) { announce("Text annotations must be 500 characters or fewer"); return; }
    if (!textDraft.editId && valueRef.current.elements.length >= MAX_ANNOTATION_ELEMENTS) { announce("Annotation limit reached"); return; }
    const original = valueRef.current.elements.find((element) => element.id === textDraft.editId);
    const element: AnnotationElementV1 = original?.type === "text"
      ? { ...original, text }
      : { type: "text", id: nextId(), x: clampNormalized(textDraft.point.x), y: clampNormalized(textDraft.point.y), text, color, strokeWidth };
    const next = original ? updateElement(valueRef.current, element) : addElement(valueRef.current, element);
    if (commit(next, original ? "Updated text annotation" : "Added text annotation")) {
      setSelectedId(element.id);
      setTextDraft(undefined);
    }
  }

  function restyle(nextColor: string, nextWidth: number) {
    setColor(nextColor);
    setStrokeWidth(nextWidth);
    if (selected) commit(updateElement(valueRef.current, { ...selected, color: nextColor, strokeWidth: nextWidth }), "Updated annotation style");
  }

  function moveSelected(delta: AnnotationPoint) {
    if (selected) commit(updateElement(valueRef.current, moveElement(selected, delta)), "Moved annotation");
  }

  function resizeSelected(delta: number) {
    if (!selected || (selected.type !== "rectangle" && selected.type !== "ellipse")) return;
    const point = { x: selected.x + selected.width + delta, y: selected.y + selected.height + delta };
    commit(updateElement(valueRef.current, resizeShape(selected, "south-east", point)), "Resized annotation");
  }

  if (!validation.valid) return <View style={styles.invalid} accessibilityLiveRegion="assertive">
    <Text style={styles.errorTitle}>Annotation unavailable</Text>
    <Text style={styles.errorText}>{validation.message}</Text>
  </View>;

  return <View style={styles.root}>
    {!readOnly ? <>
      <Text style={styles.hint}>Choose a tool, then mark the plan. Use two fingers to zoom and move around.</Text>
      <View accessibilityRole="toolbar" accessibilityLabel="Annotation tools" style={styles.tools}>
        {TOOLS.map((entry) => <Pressable key={entry.tool} accessibilityRole="button"
          accessibilityLabel={`${entry.label} tool`} accessibilityState={{ selected: tool === entry.tool }}
          onPress={() => { interactionRef.current = undefined; setDraftElement(undefined); setTool(entry.tool); }}
          style={[styles.tool, tool === entry.tool && styles.toolSelected]}>
          <Text style={[styles.toolText, tool === entry.tool && styles.toolTextSelected]}>{entry.label}</Text>
        </Pressable>)}
      </View>
    </> : <Text style={styles.hint}>Submitted annotations are read only. Use two fingers to zoom and move around.</Text>}

    <View accessibilityLabel="Drawing annotation canvas" style={[styles.stage, { height: stageHeight }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== viewport.width || height !== viewport.height) setViewport({ width, height });
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={begin}
      onResponderMove={move}
      onResponderRelease={finish}
      onResponderTerminate={() => { interactionRef.current = undefined; setDraftElement(undefined); setNavigation(transformRef.current, true); }}>
      {imageRect ? <Svg width={imageRect.width} height={imageRect.height}
        style={{ position: "absolute", left: imageRect.x, top: imageRect.y }}
        viewBox={viewBox(imageWidth, imageHeight, transform)} preserveAspectRatio="xMidYMid meet">
        <SvgImage x={0} y={0} width={imageWidth} height={imageHeight} href={imageSource} />
        {sharedAnnotations.map((element) => <Mark key={`shared-${element.id}`} element={element}
          width={imageWidth} height={imageHeight} selected={selectedSharedId === element.id} shared />)}
        {displayed.map((element) => <Mark key={element.id} element={element} width={imageWidth}
          height={imageHeight} selected={selectedId === element.id} shared={false} />)}
        {!readOnly && selected && (selected.type === "rectangle" || selected.type === "ellipse")
          ? shapeHandles(selected).map(({ handle, point }) => <Circle key={handle}
              cx={point.x * imageWidth} cy={point.y * imageHeight}
              r={Math.max(5, Math.min(imageWidth, imageHeight) * 0.007)}
              fill={colors.surface} stroke={selected.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />)
          : null}
      </Svg> : null}
    </View>

    <View style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={transform.zoom <= 1}
        accessibilityState={{ disabled: transform.zoom <= 1 }} style={styles.control}
        onPress={() => imageRect && setNavigation(zoomAtViewportPoint(transformRef.current, transformRef.current.zoom / 1.4,
          { x: imageRect.x + imageRect.width / 2, y: imageRect.y + imageRect.height / 2 }, imageRect), true)}>
        <Text style={styles.controlText}>−</Text>
      </Pressable>
      <Text accessibilityLabel={`Zoom ${Math.round(transform.zoom * 100)} percent`} style={styles.zoomLabel}>{Math.round(transform.zoom * 100)}%</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={transform.zoom >= 5}
        accessibilityState={{ disabled: transform.zoom >= 5 }} style={styles.control}
        onPress={() => imageRect && setNavigation(zoomAtViewportPoint(transformRef.current, transformRef.current.zoom * 1.4,
          { x: imageRect.x + imageRect.width / 2, y: imageRect.y + imageRect.height / 2 }, imageRect), true)}>
        <Text style={styles.controlText}>+</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Reset view" style={[styles.control, styles.resetControl]}
        onPress={() => setNavigation(IDENTITY_VIEW, true)}><Text style={styles.resetText}>Reset view</Text></Pressable>
    </View>

    {!readOnly ? <>
      <View style={styles.editActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo annotation" disabled={undoRef.current.length === 0}
          accessibilityState={{ disabled: undoRef.current.length === 0 }} onPress={undo} style={styles.action}>
          <Text style={styles.actionText}>Undo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Redo annotation" disabled={redoRef.current.length === 0}
          accessibilityState={{ disabled: redoRef.current.length === 0 }} onPress={redo} style={styles.action}>
          <Text style={styles.actionText}>Redo</Text>
        </Pressable>
        {tool !== "select" && tool !== "pan" ? <Pressable accessibilityRole="button"
          accessibilityLabel={`Add ${tool} at center without dragging`} onPress={addAtCenter} style={styles.action}>
          <Text style={styles.actionText}>Add at center</Text>
        </Pressable> : null}
      </View>
      <View style={styles.styleControls}>
        <Text style={styles.groupLabel}>Color</Text>
        {COLORS.map((option) => <Pressable key={option.name} accessibilityRole="button"
          accessibilityLabel={`${option.name} annotation color`} accessibilityState={{ selected: color === option.hex }}
          onPress={() => restyle(option.hex, strokeWidth)} style={[styles.colorButton, { borderColor: option.hex }, color === option.hex && styles.colorSelected]}>
          <View style={[styles.colorSample, { backgroundColor: option.hex }]} />
          <Text style={styles.colorLabel}>{option.name}</Text>
        </Pressable>)}
      </View>
      <View style={styles.styleControls}>
        <Text style={styles.groupLabel}>Line</Text>
        {STROKES.map((width) => <Pressable key={width} accessibilityRole="button"
          accessibilityLabel={`${width} point annotation line`} accessibilityState={{ selected: strokeWidth === width }}
          onPress={() => restyle(color, width)} style={[styles.strokeButton, strokeWidth === width && styles.toolSelected]}>
          <Text style={[styles.toolText, strokeWidth === width && styles.toolTextSelected]}>{width}</Text>
        </Pressable>)}
      </View>
    </> : null}

    {textDraft && !readOnly ? <View style={styles.textEditor}>
      <Text style={styles.groupLabel}>{textDraft.editId ? "Edit note" : "New text note"}</Text>
      <TextInput accessibilityLabel="Annotation text" multiline maxLength={500}
        placeholder="Describe the change" placeholderTextColor={colors.inkMuted}
        value={textDraft.text} onChangeText={(text) => setTextDraft({ ...textDraft, text })} style={styles.textInput} />
      <View style={styles.editActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Save text annotation" onPress={saveText} style={styles.action}>
          <Text style={styles.actionText}>Save note</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel text annotation" onPress={() => setTextDraft(undefined)} style={styles.action}>
          <Text style={styles.actionText}>Cancel</Text>
        </Pressable>
      </View>
    </View> : null}

    {selected && !readOnly ? <View style={styles.selection}>
      <Text style={styles.groupLabel}>Selected {selected.type} annotation</Text>
      <View style={styles.editActions}>
        {([ ["Left", -0.015, 0], ["Right", 0.015, 0], ["Up", 0, -0.015], ["Down", 0, 0.015] ] as const)
          .map(([label, x, y]) => <Pressable key={label} accessibilityRole="button"
            accessibilityLabel={`Move annotation ${label.toLowerCase()}`} onPress={() => moveSelected({ x, y })}
            style={styles.action}><Text style={styles.actionText}>{label}</Text></Pressable>)}
      </View>
      <View style={styles.editActions}>
        {(selected.type === "rectangle" || selected.type === "ellipse") ? <>
          <Pressable accessibilityRole="button" accessibilityLabel="Make annotation larger" onPress={() => resizeSelected(0.025)} style={styles.action}>
            <Text style={styles.actionText}>Larger</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Make annotation smaller" onPress={() => resizeSelected(-0.025)} style={styles.action}>
            <Text style={styles.actionText}>Smaller</Text></Pressable>
        </> : null}
        {selected.type === "text" ? <Pressable accessibilityRole="button" accessibilityLabel="Edit text annotation"
          onPress={() => setTextDraft({ point: { x: selected.x, y: selected.y }, text: selected.text, editId: selected.id })}
          style={styles.action}><Text style={styles.actionText}>Edit text</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Remove selected annotation" onPress={() => {
          if (commit(removeElement(valueRef.current, selected.id), "Removed annotation")) setSelectedId(undefined);
        }} style={[styles.action, styles.removeAction]}><Text style={styles.removeText}>Remove</Text></Pressable>
      </View>
    </View> : null}

    <View style={styles.list}>
      <Text accessibilityRole="header" style={styles.listTitle}>Annotations ({value.elements.length + sharedAnnotations.length})</Text>
      {value.elements.length + sharedAnnotations.length === 0
        ? <Text style={styles.empty}>No marks on this page.</Text>
        : <ScrollView nestedScrollEnabled style={styles.listScroll}>
            {[...value.elements.map((element, index) => ({ element, label: labelFor(element, index), shared: false })),
              ...sharedAnnotations.map((element, index) => ({ element, label: labelFor(element, index, true), shared: true }))]
              .map(({ element, label, shared }) => <Pressable key={`${shared ? "shared" : "own"}-${element.id}`}
                accessibilityRole="button" accessibilityLabel={label}
                accessibilityState={{ selected: shared ? selectedSharedId === element.id : selectedId === element.id }}
                onPress={() => {
                  setSelectedId(shared ? undefined : element.id);
                  setSelectedSharedId(shared ? element.id : undefined);
                  announce(label);
                }}
                style={[styles.listItem, (shared ? selectedSharedId === element.id : selectedId === element.id) && styles.listItemSelected]}>
                <View style={[styles.listSwatch, { backgroundColor: element.color }]} />
                <Text numberOfLines={2} style={styles.listText}>{label}</Text>
              </Pressable>)}
          </ScrollView>}
    </View>
    {announcement ? <Text accessibilityLiveRegion="polite" style={styles.announcement}>{announcement}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, width: "100%" },
  hint: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tool: { minHeight: 44, paddingHorizontal: 11, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 5 },
  toolSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  toolText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 },
  toolTextSelected: { color: colors.primaryInk },
  stage: { width: "100%", backgroundColor: colors.surfaceMuted, overflow: "hidden", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 3 },
  navigation: { flexDirection: "row", alignItems: "center", gap: 8 },
  control: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, borderRadius: 5 },
  controlText: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 22 },
  zoomLabel: { minWidth: 55, textAlign: "center", color: colors.ink, fontFamily: fonts.medium, fontSize: 13 },
  resetControl: { paddingHorizontal: 12, marginLeft: 4 },
  resetText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 },
  editActions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  action: { minHeight: 44, minWidth: 58, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, borderRadius: 5 },
  actionText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 },
  removeAction: { borderColor: colors.danger },
  removeText: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13 },
  styleControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  groupLabel: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 13, minWidth: 42 },
  colorButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, borderWidth: 1, backgroundColor: colors.surface, borderRadius: 5 },
  colorSelected: { borderWidth: 2 },
  colorSample: { width: 16, height: 16, borderRadius: 8 },
  colorLabel: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12 },
  strokeButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, borderRadius: 5 },
  textEditor: { gap: 8, padding: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  textInput: { minHeight: 70, borderWidth: 1, borderColor: colors.borderStrong, padding: 10, color: colors.ink, fontFamily: fonts.regular, fontSize: 14, textAlignVertical: "top" },
  selection: { gap: 8, padding: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  list: { gap: 6 },
  listTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  empty: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13 },
  listScroll: { maxHeight: 200 },
  listItem: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border },
  listItemSelected: { backgroundColor: colors.primarySoft },
  listSwatch: { width: 12, height: 12, borderRadius: 6 },
  listText: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 13 },
  announcement: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12 },
  invalid: { padding: 16, borderWidth: 1, borderColor: colors.danger, gap: 6 },
  errorTitle: { color: colors.danger, fontFamily: fonts.semibold, fontSize: 15 },
  errorText: { color: colors.ink, fontFamily: fonts.regular, fontSize: 13 }
});
