import axe from "axe-core";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import type { AnnotationDocumentV1 } from "../../api/types";
import {
  EstimateDrawingPreviewDialog,
  type EstimateDrawingPreviewDialogProps
} from "./EstimateDrawingPreviewDialog";

const emptyDocument: AnnotationDocumentV1 = {
  schemaVersion: 1,
  imageWidth: 1000,
  imageHeight: 800,
  elements: []
};
const markedDocument: AnnotationDocumentV1 = {
  ...emptyDocument,
  elements: [{
    id: "client-note",
    type: "text",
    x: 0.25,
    y: 0.4,
    text: "Keep this opening",
    color: "#ef4444",
    strokeWidth: 2
  }]
};

const setupUser = () => userEvent.setup({ delay: null });

function makeOversizedDocument(): AnnotationDocumentV1 {
  return {
    ...emptyDocument,
    elements: [{
      id: "full-path",
      type: "freehand",
      points: Array.from({ length: 5_000 }, () => ({ x: 0.123456, y: 0.654321 })),
      color: "#ef4444",
      strokeWidth: 2
    }, ...Array.from({ length: 120 }, (_, index) => ({
      id: `note-${index}`,
      type: "text" as const,
      x: 0.25,
      y: 0.75,
      text: "😀".repeat(250),
      color: "#ef4444",
      strokeWidth: 2
    }))]
  };
}

function previewProps(overrides: Partial<EstimateDrawingPreviewDialogProps> = {}) {
  return {
    title: "Ground floor plan",
    imageUrl: "/estimate-design-revisions/revision-1/image",
    imageWidth: 1000,
    imageHeight: 800,
    annotations: emptyDocument,
    canAnnotate: true,
    onClose: vi.fn(),
    onSaveDraft: vi.fn(),
    onSubmitChangeRequest: vi.fn(),
    ...overrides
  };
}

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open drawing</button>
      {open ? <EstimateDrawingPreviewDialog {...previewProps({ onClose: () => setOpen(false) })} /> : null}
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(apiClient, "getBlob").mockResolvedValue({
    blob: new Blob(["protected image"], { type: "image/png" }),
    filename: "drawing.png"
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:authenticated-drawing")
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn()
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function waitForProtectedCanvas() {
  await waitFor(() =>
    expect(document.querySelector("svg image")).toHaveAttribute("href", "blob:authenticated-drawing")
  );
  return screen.getByRole("img", { name: "Drawing annotation canvas" });
}

async function addTextNote() {
  const user = setupUser();
  const canvas = await waitForProtectedCanvas();
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
  await user.click(screen.getByRole("button", { name: "Text" }));
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 250, clientY: 320 });
  const textDialog = screen.getByRole("dialog", { name: "Add text note" });
  await user.type(within(textDialog).getByLabelText("Text note"), "Shift this door");
  await user.click(within(textDialog).getByRole("button", { name: "Add note" }));
}

describe("EstimateDrawingPreviewDialog", () => {
  it("shows deduplicated request history without prefilling or resubmitting it", async () => {
    const user = setupUser();
    const onSubmitChangeRequest = vi.fn();
    render(<EstimateDrawingPreviewDialog {...previewProps({
      annotations: markedDocument,
      sharedComments: [
        { id: "request-1", summary: "Move the cabinet left", status: "open", source: "plan" },
        { id: "request-1", summary: "Move the cabinet left", status: "open", source: "plan" },
        { id: "request-blank", summary: "   ", status: "open", source: "drawing" }
      ],
      onSubmitChangeRequest
    })} />);

    expect(screen.getByRole("heading", { name: "Requested changes" })).toBeVisible();
    expect(screen.getAllByText("Move the cabinet left")).toHaveLength(1);
    expect(screen.getByLabelText("Change summary")).toHaveValue("");

    await user.type(screen.getByLabelText("Change summary"), "Use the revised width");
    await user.click(screen.getByRole("button", { name: "Submit change request" }));
    expect(onSubmitChangeRequest).toHaveBeenCalledWith(markedDocument, "Use the revised width");
    expect(JSON.stringify(onSubmitChangeRequest.mock.calls[0])).not.toContain("Move the cabinet left");
  });

  it("edits one existing client request instead of offering another submission", async () => {
    const user = setupUser();
    const onSubmitChangeRequest = vi.fn();
    const onUpdateChangeRequest = vi.fn();
    render(<EstimateDrawingPreviewDialog {...previewProps({
      annotations: markedDocument,
      editableRequest: { id: "request-1", version: 3, summary: "Move the cabinet left" },
      sharedComments: [{ id: "request-1", summary: "Move the cabinet left", status: "open", source: "plan" }],
      onSubmitChangeRequest,
      onUpdateChangeRequest
    })} />);

    expect(screen.queryByText("Requested changes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit change request" })).not.toBeInTheDocument();
    const summary = screen.getByLabelText("Change summary");
    expect(summary).toHaveValue("Move the cabinet left");
    await user.clear(summary);
    await user.type(summary, "Use the revised cabinet width");
    await user.click(screen.getByRole("button", { name: "Update change request" }));

    expect(onUpdateChangeRequest).toHaveBeenCalledWith("request-1", 3, markedDocument, "Use the revised cabinet width");
    expect(onSubmitChangeRequest).not.toHaveBeenCalled();
  });

  it("renders projected annotations read-only without persisting them in the editable draft", async () => {
    const user = setupUser();
    const onSaveDraft = vi.fn();
    render(<EstimateDrawingPreviewDialog {...previewProps({
      sharedAnnotations: [{
        id: "shared-note",
        type: "text",
        x: 0.5,
        y: 0.5,
        text: "Shared extracted note",
        color: "#ef4444",
        strokeWidth: 2
      }],
      onSaveDraft
    })} />);

    await addTextNote();
    const shared = screen.getByText("Shared extracted note");
    expect(shared).toHaveAttribute("data-shared", "true");
    expect(shared).toHaveStyle({ pointerEvents: "none" });
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({
      elements: [expect.objectContaining({ type: "text", text: "Shift this door" })]
    }));
    expect(JSON.stringify(onSaveDraft.mock.calls[0]?.[0])).not.toContain("shared-note");
  });

  it("enables Save as draft after the first default rectangle drag", async () => {
    render(<EstimateDrawingPreviewDialog {...previewProps()} />);
    const canvas = await waitForProtectedCanvas();
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    expect(screen.getByRole("button", { name: "Save as draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save as draft" })).toHaveClass("button", "button--secondary");

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 300 });

    expect(screen.getByRole("button", { name: "Save as draft" })).toBeEnabled();
  });

  it("traps focus and restores it to the opener when a clean preview closes", async () => {
    const user = setupUser();
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "Open drawing" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Ground floor plan preview" });
    const close = within(dialog).getByRole("button", { name: "Close Ground floor plan preview" });
    await waitFor(() => expect(close).toHaveFocus());

    within(dialog).getByLabelText("Change summary").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    await user.click(close);
    expect(screen.queryByRole("dialog", { name: "Ground floor plan preview" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("reuses one authenticated image source across view changes and revokes it on unmount", async () => {
    const user = setupUser();
    const props = previewProps();
    const { unmount } = render(<EstimateDrawingPreviewDialog {...props} />);
    const canvas = await waitForProtectedCanvas();

    expect(apiClient.getBlob).toHaveBeenCalledTimes(1);
    expect(apiClient.getBlob).toHaveBeenCalledWith(props.imageUrl);
    const initialViewBox = canvas.getAttribute("viewBox");
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(canvas.getAttribute("viewBox")).not.toBe(initialViewBox);
    expect(screen.queryByRole("button", { name: /pan/i })).not.toBeInTheDocument();
    fireEvent.wheel(screen.getByTestId("map-viewport-surface"), { deltaY: -100, clientX: 100, clientY: 100 });
    expect(apiClient.getBlob).toHaveBeenCalledTimes(1);

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:authenticated-drawing");
  });

  it.each(["estimator", "approved client"] as const)(
    "renders immutable overlays without mounting editor controls for %s preview",
    async () => {
      const { container } = render(
        <EstimateDrawingPreviewDialog
          {...previewProps({ annotations: markedDocument, canAnnotate: false })}
        />
      );
      await waitForProtectedCanvas();

      expect(screen.getByText("Keep this opening")).toBeVisible();
      expect(screen.queryByRole("toolbar", { name: "Annotation tools" })).not.toBeInTheDocument();
      expect(container.querySelector(".annotation-editor")).not.toBeInTheDocument();
      expect(container.querySelector(".annotation-overlay")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save as draft" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Zoom in" })).toBeVisible();
    }
  );

  it("confirms before closing with unsaved annotations and lets the client continue editing", async () => {
    const user = setupUser();
    const onClose = vi.fn();
    render(<EstimateDrawingPreviewDialog {...previewProps({ onClose })} />);
    await addTextNote();

    const preview = screen.getByRole("dialog", { name: "Ground floor plan preview" });
    await user.click(within(preview).getByRole("button", { name: "Close Ground floor plan preview" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Discard unsaved annotations?" });
    expect(onClose).not.toHaveBeenCalled();
    expect(preview).toHaveAttribute("inert");
    await user.click(within(confirmation).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(preview).not.toHaveAttribute("inert");
    expect(within(preview).getByRole("button", { name: "Close Ground floor plan preview" })).toHaveFocus();
    expect(screen.getByText("Shift this door")).toBeVisible();

    await user.click(within(preview).getByRole("button", { name: "Close Ground floor plan preview" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("contains confirmation focus and uses Escape to continue editing", async () => {
    const user = setupUser();
    render(<EstimateDrawingPreviewDialog {...previewProps()} />);
    await addTextNote();
    const preview = screen.getByRole("dialog", { name: "Ground floor plan preview" });
    const close = within(preview).getByRole("button", { name: "Close Ground floor plan preview" });
    await user.click(close);
    const confirmation = screen.getByRole("alertdialog", { name: "Discard unsaved annotations?" });
    const keepEditing = within(confirmation).getByRole("button", { name: "Keep editing" });
    const discard = within(confirmation).getByRole("button", { name: "Discard changes" });

    await waitFor(() => expect(keepEditing).toHaveFocus());
    discard.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(keepEditing).toHaveFocus();
    keepEditing.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(discard).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog", { name: "Discard unsaved annotations?" })).not.toBeInTheDocument();
    expect(preview).not.toHaveAttribute("inert");
    expect(close).toHaveFocus();
  });

  it("saves a draft and submits a summary with the current annotation document", async () => {
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const onSubmitChangeRequest = vi.fn().mockResolvedValue(undefined);
    const user = setupUser();
    render(
      <EstimateDrawingPreviewDialog
        {...previewProps({ onSaveDraft, onSubmitChangeRequest })}
      />
    );
    await addTextNote();

    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledOnce());
    expect(onSaveDraft.mock.calls[0]![0].elements[0]).toMatchObject({
      type: "text",
      text: "Shift this door"
    });
    const summary = screen.getByLabelText("Change summary");
    await user.type(summary, "Please shift the highlighted door.");
    await user.click(screen.getByRole("button", { name: "Submit change request" }));
    await waitFor(() => expect(onSubmitChangeRequest).toHaveBeenCalledOnce());
    expect(onSubmitChangeRequest.mock.calls[0]![0].elements).toHaveLength(1);
    expect(onSubmitChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: 1 }),
      "Please shift the highlighted door."
    );
  });

  it("blocks persistence callbacks when annotations exceed the UTF-8 payload limit", async () => {
    const user = setupUser();
    const annotations = makeOversizedDocument();
    const onSaveDraft = vi.fn();
    const onSubmitChangeRequest = vi.fn();
    expect(new TextEncoder().encode(JSON.stringify(annotations)).byteLength).toBeGreaterThan(256 * 1024);
    render(
      <EstimateDrawingPreviewDialog
        {...previewProps({ annotations, onSaveDraft, onSubmitChangeRequest })}
      />
    );
    await user.type(screen.getByLabelText("Change summary"), "Please update the marked areas.");
    await user.click(screen.getByRole("button", { name: "Submit change request" }));

    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(onSubmitChangeRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Annotations exceed the 256 KiB limit");
  });

  it("has no automated accessibility violations in the editable preview", async () => {
    render(<EstimateDrawingPreviewDialog {...previewProps()} />);
    await waitForProtectedCanvas();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });
});
