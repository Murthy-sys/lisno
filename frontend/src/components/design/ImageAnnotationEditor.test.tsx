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
