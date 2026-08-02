import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnotationDocumentV1 } from "../../api/types";
import {
  ImageAnnotationEditor,
  type ImageAnnotationEditorProps
} from "./ImageAnnotationEditor";

const emptyDocument: AnnotationDocumentV1 = {
  schemaVersion: 1,
  imageWidth: 1000,
  imageHeight: 800,
  elements: []
};
const MAX_ANNOTATION_BYTES = 256 * 1024;

function makeByteBoundaryDocument(): AnnotationDocumentV1 {
  let document: AnnotationDocumentV1 = {
    ...emptyDocument,
    elements: [{
      id: "full-path",
      type: "freehand",
      points: Array.from({ length: 5_000 }, () => ({ x: 0.123456, y: 0.654321 })),
      color: "#ef4444",
      strokeWidth: 2
    }]
  };
  while (document.elements.length < 199) {
    const id = `note-${document.elements.length}`;
    const next = (text: string): AnnotationDocumentV1 => ({
      ...document,
      elements: [...document.elements, {
        id,
        type: "text",
        x: 0.25,
        y: 0.75,
        text,
        color: "#ef4444",
        strokeWidth: 2
      }]
    });
    const remaining =
      MAX_ANNOTATION_BYTES -
      new TextEncoder().encode(JSON.stringify(next(""))).byteLength;
    if (remaining < 1) break;
    const emojiCount = Math.min(250, Math.floor(remaining / 4));
    const asciiCount = Math.min(500 - emojiCount * 2, remaining - emojiCount * 4);
    const text = `${"😀".repeat(emojiCount)}${"x".repeat(asciiCount)}`;
    const candidate = next(text);
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > MAX_ANNOTATION_BYTES) break;
    document = candidate;
    if (text.length < 500) break;
  }
  return document;
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function EditorHarness({
  initial = emptyDocument,
  onDocument = vi.fn(),
  ...props
}: Partial<ImageAnnotationEditorProps> & {
  initial?: AnnotationDocumentV1;
  onDocument?: (document: AnnotationDocumentV1) => void;
}) {
  const [document, setDocument] = useState(initial);
  return (
    <ImageAnnotationEditor
      imageSource="blob:protected-drawing"
      imageWidth={1000}
      imageHeight={800}
      value={document}
      readOnly={false}
      onChange={(next) => {
        setDocument(next);
        onDocument(next);
      }}
      {...props}
    />
  );
}

function canvasRect(canvas: SVGSVGElement) {
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 800,
    right: 1000,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
}

function draw(canvas: SVGSVGElement, start: [number, number], end: [number, number]) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: start[0], clientY: start[1] });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: end[0], clientY: end[1] });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: end[0], clientY: end[1] });
}

describe("ImageAnnotationEditor", () => {
  it("starts with Rectangle ready and creates a mark on the first drag", () => {
    const onDocument = vi.fn();
    render(<EditorHarness onDocument={onDocument} />);
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);

    expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Choose a tool, then drag on the drawing.")).toBeVisible();
    draw(canvas, [100, 100], [300, 300]);

    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({ type: "rectangle" });
    expect(screen.getByLabelText("Rectangle annotation")).toBeVisible();
  });

  it.each([
    ["Ellipse", "ellipse"],
    ["Rectangle", "rectangle"],
    ["Arrow", "arrow"]
  ] as const)("creates a bounded %s with pointer input", async (buttonName, type) => {
    const onDocument = vi.fn();
    const user = userEvent.setup();
    render(<EditorHarness onDocument={onDocument} />);
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);

    await user.click(screen.getByRole("button", { name: buttonName }));
    draw(canvas, [800, 640], [200, 160]);

    const document = onDocument.mock.lastCall?.[0] as AnnotationDocumentV1;
    expect(document.elements).toHaveLength(1);
    expect(document.elements[0]).toMatchObject({ type, color: "#ef4444", strokeWidth: 3 });
    expect(screen.getByLabelText(`${buttonName} annotation`)).toBeVisible();
  });

  it("creates a simplified freehand line and exposes named editing controls", async () => {
    const onDocument = vi.fn();
    const user = userEvent.setup();
    render(<EditorHarness onDocument={onDocument} />);
    const toolbar = screen.getByRole("toolbar", { name: "Annotation tools" });
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);

    for (const name of ["Select", "Ellipse", "Rectangle", "Arrow", "Freehand", "Text", "Undo", "Redo", "Delete selected"]) {
      expect(within(toolbar).getByRole("button", { name })).toBeVisible();
    }
    await user.click(within(toolbar).getByRole("button", { name: "Freehand" }));
    fireEvent.pointerDown(canvas, { pointerId: 4, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 4, clientX: 101, clientY: 101 });
    fireEvent.pointerMove(canvas, { pointerId: 4, clientX: 300, clientY: 250 });
    fireEvent.pointerUp(canvas, { pointerId: 4, clientX: 500, clientY: 400 });

    const document = onDocument.mock.lastCall?.[0] as AnnotationDocumentV1;
    expect(document.elements[0]).toMatchObject({ type: "freehand" });
    if (document.elements[0]?.type === "freehand") {
      expect(document.elements[0].points).toEqual([
        { x: 0.1, y: 0.125 },
        { x: 0.3, y: 0.3125 },
        { x: 0.5, y: 0.5 }
      ]);
    }
  });

  it("adds text through an HTML dialog and form", async () => {
    const onDocument = vi.fn();
    const user = userEvent.setup();
    render(<EditorHarness onDocument={onDocument} />);
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 250, clientY: 320 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 250, clientY: 320 });
    const dialog = screen.getByRole("dialog", { name: "Add text note" });
    await user.type(within(dialog).getByLabelText("Text note"), "Move this wall");
    await user.click(within(dialog).getByRole("button", { name: "Add note" }));

    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({
      type: "text",
      x: 0.25,
      y: 0.4,
      text: "Move this wall"
    });
    expect(screen.getByText("Move this wall")).toBeVisible();
  });

  it("selects, moves, and resizes a shape with visible handles", () => {
    const onDocument = vi.fn();
    const initial: AnnotationDocumentV1 = {
      ...emptyDocument,
      elements: [{
        id: "box",
        type: "rectangle",
        x: 0.2,
        y: 0.2,
        width: 0.2,
        height: 0.2,
        color: "#ef4444",
        strokeWidth: 3
      }]
    };
    render(<EditorHarness initial={initial} onDocument={onDocument} />);
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 300, clientY: 240 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 240 });
    expect(screen.getByLabelText("Rectangle annotation")).toHaveAttribute("data-selected", "true");
    const handle = screen.getByRole("button", { name: "Resize south-east" });
    expect(handle).toBeVisible();

    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 300, clientY: 240 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 500, clientY: 400 });
    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({ x: 0.4, y: 0.4 });

    fireEvent.pointerDown(handle, { pointerId: 3, clientX: 600, clientY: 480 });
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 800, clientY: 640 });
    fireEvent.pointerUp(canvas, { pointerId: 3, clientX: 800, clientY: 640 });
    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({
      x: 0.4,
      y: 0.4,
      width: 0.4,
      height: 0.4
    });
  });

  it("focuses and selects an existing annotation, then moves it with bounded keyboard steps", async () => {
    const onDocument = vi.fn();
    const initial: AnnotationDocumentV1 = {
      ...emptyDocument,
      elements: [{
        id: "keyboard-box",
        type: "rectangle",
        x: 0.2,
        y: 0.2,
        width: 0.2,
        height: 0.2,
        color: "#ef4444",
        strokeWidth: 3
      }]
    };
    render(<EditorHarness initial={initial} onDocument={onDocument} />);
    const annotation = screen.getByRole("button", { name: "Rectangle annotation" });

    expect(annotation).toHaveAttribute("tabindex", "0");
    annotation.focus();
    fireEvent.focus(annotation);
    expect(annotation).toHaveFocus();
    expect(annotation).toHaveAttribute("data-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({ x: 0.205, y: 0.2 });
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({ x: 0.205, y: 0.225 });

    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({ x: 0 });
  });

  it("activates a resize handle and resizes with arrow keys", async () => {
    const onDocument = vi.fn();
    const initial: AnnotationDocumentV1 = {
      ...emptyDocument,
      elements: [{
        id: "keyboard-box",
        type: "rectangle",
        x: 0.2,
        y: 0.2,
        width: 0.2,
        height: 0.2,
        color: "#ef4444",
        strokeWidth: 3
      }]
    };
    render(<EditorHarness initial={initial} onDocument={onDocument} />);
    const annotation = screen.getByRole("button", { name: "Rectangle annotation" });
    annotation.focus();
    fireEvent.focus(annotation);
    const handle = screen.getByRole("button", { name: "Resize south-east" });

    handle.focus();
    await userEvent.keyboard(" ");
    expect(handle).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({ width: 0.205, height: 0.2 });
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({ width: 0.205, height: 0.225 });
    await userEvent.keyboard("{Escape}");
    expect(handle).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["Ellipse", "Ellipse annotation"],
    ["Rectangle", "Rectangle annotation"],
    ["Arrow", "Arrow annotation"],
    ["Freehand", "Freehand annotation"]
  ] as const)("creates a default %s at the viewport center using only the keyboard", async (toolName, annotationName) => {
    const onDocument = vi.fn();
    render(<EditorHarness onDocument={onDocument} />);
    const tool = screen.getByRole("button", { name: toolName });
    const canvas = screen.getByRole("img", { name: "Drawing annotation canvas" });

    tool.focus();
    await userEvent.keyboard("{Enter}");
    canvas.focus();
    await userEvent.keyboard("{Enter}");

    expect(onDocument).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: annotationName })).toBeVisible();
    const element = onDocument.mock.lastCall?.[0].elements[0];
    if (element.type === "rectangle" || element.type === "ellipse") {
      expect(element).toMatchObject({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 });
    }
  });

  it("opens and submits the text-note flow using only the keyboard", async () => {
    const onDocument = vi.fn();
    render(<EditorHarness onDocument={onDocument} />);
    const textTool = screen.getByRole("button", { name: "Text" });
    const canvas = screen.getByRole("img", { name: "Drawing annotation canvas" });
    textTool.focus();
    await userEvent.keyboard("{Enter}");
    canvas.focus();
    await userEvent.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog", { name: "Add text note" });
    await userEvent.type(within(dialog).getByLabelText("Text note"), "Keyboard note");
    const add = within(dialog).getByRole("button", { name: "Add note" });
    add.focus();
    await userEvent.keyboard("{Enter}");

    expect(onDocument.mock.lastCall?.[0].elements[0]).toMatchObject({
      type: "text",
      x: 0.5,
      y: 0.5,
      text: "Keyboard note"
    });
  });

  it("undoes, redoes, deletes by keyboard, and announces each change", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);
    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    draw(canvas, [100, 80], [300, 240]);
    expect(screen.getByLabelText("Rectangle annotation")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByLabelText("Rectangle annotation")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Undid annotation change");
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByLabelText("Rectangle annotation")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 200, clientY: 160 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 200, clientY: 160 });
    canvas.focus();
    fireEvent.keyDown(canvas, { key: "Delete" });
    expect(screen.queryByLabelText("Rectangle annotation")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Deleted annotation");
  });

  it("cancels an active drawing operation with Escape", async () => {
    const onDocument = vi.fn();
    const user = userEvent.setup();
    render(<EditorHarness onDocument={onDocument} />);
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);
    await user.click(screen.getByRole("button", { name: "Arrow" }));
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 500, clientY: 500 });
    fireEvent.keyDown(canvas, { key: "Escape" });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 500, clientY: 500 });

    expect(onDocument).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Arrow annotation")).not.toBeInTheDocument();
  });

  it("does not exceed the document-wide freehand point budget", async () => {
    const onDocument = vi.fn();
    const initial: AnnotationDocumentV1 = {
      ...emptyDocument,
      elements: [{
        id: "full-pen",
        type: "freehand",
        points: Array.from({ length: 4_999 }, (_, index) => ({
          x: index / 5_000,
          y: 0.5
        })),
        color: "#ef4444",
        strokeWidth: 2
      }]
    };
    render(<EditorHarness initial={initial} onDocument={onDocument} />);
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);
    await userEvent.click(screen.getByRole("button", { name: "Freehand" }));
    draw(canvas, [100, 80], [300, 240]);

    expect(onDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Freehand point limit reached");
  });

  it("blocks a commit whose UTF-8 JSON payload would exceed 256 KiB", async () => {
    const onDocument = vi.fn();
    const initial = makeByteBoundaryDocument();
    expect(new TextEncoder().encode(JSON.stringify(initial)).byteLength).toBe(MAX_ANNOTATION_BYTES);
    render(<EditorHarness initial={initial} onDocument={onDocument} />);
    const canvas = screen.getByTestId("annotation-canvas") as unknown as SVGSVGElement;
    canvasRect(canvas);

    await userEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.pointerDown(canvas, { pointerId: 9, clientX: 500, clientY: 400 });
    const dialog = screen.getByRole("dialog", { name: "Add text note" });
    await userEvent.type(within(dialog).getByLabelText("Text note"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add note" }));

    expect(onDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Annotation payload must be 256 KiB or smaller");
    expect(screen.getByRole("dialog", { name: "Add text note" })).toBeVisible();
  });

  it("renders immutable overlays without mounting editing controls in read-only mode", () => {
    const initial: AnnotationDocumentV1 = {
      ...emptyDocument,
      elements: [{
        id: "note",
        type: "text",
        x: 0.2,
        y: 0.3,
        text: "Client note",
        color: "#ef4444",
        strokeWidth: 2
      }]
    };
    render(
      <ImageAnnotationEditor
        imageSource="blob:protected-drawing"
        imageWidth={1000}
        imageHeight={800}
        value={initial}
        readOnly
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("Client note")).toBeVisible();
    expect(screen.queryByRole("toolbar", { name: "Annotation tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resize/ })).not.toBeInTheDocument();
  });
});
