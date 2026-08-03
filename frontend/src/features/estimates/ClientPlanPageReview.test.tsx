import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import type { EstimatePlanPage } from "../../api/types";
import { ClientPlanPageReview } from "./ClientPlanPageReview";

const page: EstimatePlanPage = { id: "page-1", uploadId: "upload-1", pageNumber: 1, width: 1000, height: 800, currentRevisionId: "manifest-1", status: "awaiting_review", thumbnailUrl: "/thumb", currentImageUrl: "/current", annotationDraft: null };

beforeEach(() => {
  vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "page.png" });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:plan") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("ClientPlanPageReview", () => {
  it("shows projected drawing annotations on the original page as a shared layer", async () => {
    render(<ClientPlanPageReview page={page} sharedAnnotations={[{ id: "drawing:revision-1:note", type: "text", x: 0.4, y: 0.3125, text: "Projected drawing note", color: "#ef4444", strokeWidth: 2 }]} canReview onClose={vi.fn()} saveDraft={vi.fn()} previewTargets={vi.fn()} submitRequest={vi.fn()} />);
    const shared = await screen.findByText("Projected drawing note");
    expect(shared).toHaveAttribute("data-shared", "true");
  });

  it("navigates every page of the original upload in order", async () => {
    const pages = [page, { ...page, id: "page-2", pageNumber: 2, currentImageUrl: "/current-2" }];
    const onSelectPage = vi.fn();
    render(<ClientPlanPageReview page={page} pages={pages} onSelectPage={onSelectPage} canReview onClose={vi.fn()} saveDraft={vi.fn()} previewTargets={vi.fn()} submitRequest={vi.fn()} />);

    const navigation = screen.getByRole("navigation", { name: "Uploaded plan pages" });
    expect(navigation).toBeVisible();
    expect(within(navigation).getAllByRole("button")).toHaveLength(2);
    expect(within(navigation).getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(navigation).getByRole("button", { name: "Page 2" }));
    expect(onSelectPage).toHaveBeenCalledWith(pages[1]);
  });

  it("saves canonical drafts and confirms detected targets before one request", async () => {
    const saveDraft = vi.fn().mockResolvedValue({});
    const previewTargets = vi.fn().mockResolvedValue({ pageRevisionNumber: 1, targets: [{ drawingId: "drawing-a", title: "False Ceiling", reason: "anchor_inside" }], snapshotToken: "a".repeat(64) });
    const submitRequest = vi.fn().mockResolvedValue({});
    render(<ClientPlanPageReview page={page} canReview onClose={vi.fn()} saveDraft={saveDraft} previewTargets={previewTargets} submitRequest={submitRequest} />);
    const canvas = await screen.findByTestId("annotation-canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    await userEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 300 });
    await userEvent.type(screen.getByLabelText("Change summary"), "Lower this ceiling");
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ imageWidth: 1000, imageHeight: 800 }));
    await userEvent.click(screen.getByRole("button", { name: "Submit change request" }));
    const confirmation = await screen.findByRole("dialog", { name: "Confirm affected drawings" });
    expect(within(confirmation).getByRole("checkbox", { name: /False Ceiling/ })).toBeChecked();
    await userEvent.click(within(confirmation).getByRole("button", { name: "Request changes" }));
    expect(submitRequest).toHaveBeenCalledWith(expect.objectContaining({ targetDrawingIds: ["drawing-a"], snapshotToken: "a".repeat(64) }));
  });
});
