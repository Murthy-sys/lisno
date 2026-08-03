import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import type { EstimatePlanClientWorkspace } from "../../api/types";
import { ClientFullPlanNav } from "./ClientFullPlanNav";

const workspace: EstimatePlanClientWorkspace = {
  uploads: [],
  pages: Array.from({ length: 6 }, (_, index) => ({
    id: `page-${index + 1}`, uploadId: "upload-1", pageNumber: index + 1,
    width: 1000, height: 800, currentRevisionId: `manifest-${index + 1}`,
    status: index === 1 ? "changes_requested" : "awaiting_review",
    thumbnailUrl: `/thumb-${index + 1}`, currentImageUrl: `/page-${index + 1}`,
    annotationDraft: null
  })),
  openRequests: []
};

const uploadedPlanWorkspace = {
  ...workspace,
  uploads: [{
    id: "upload-1",
    originalFilename: "AMIT - FINAL 2D - pages 1-6.pdf",
    mimeType: "application/pdf",
    pageCount: 6,
    pages: workspace.pages
  }]
};

describe("ClientFullPlanNav", () => {
  it("renders one original uploaded plan instead of one card per PDF page", async () => {
    vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "page.png" });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:thumb") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const onSelect = vi.fn();
    render(<ClientFullPlanNav workspace={uploadedPlanWorkspace} selectedPageId="page-1" onSelectPage={onSelect} />);
    expect(screen.getAllByRole("button", { name: /open uploaded plan/i })).toHaveLength(1);
    expect(screen.getByText("AMIT - FINAL 2D - pages 1-6.pdf")).toBeVisible();
    expect(screen.getByText("PDF")).toBeVisible();
    expect(screen.getByText("6 pages")).toBeVisible();
    expect(screen.getByRole("button", { name: /open uploaded plan/i })).toHaveTextContent("PDF · 6 pages");
    expect(screen.queryByRole("button", { name: "Ask Lisno" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /open uploaded plan/i }));
    expect(onSelect).toHaveBeenCalledWith(workspace.pages[0]);
  });

  it("loads thumbnail bytes only when a page row becomes visible", async () => {
    const observed: Array<{ element: Element; callback: IntersectionObserverCallback }> = [];
    class Observer {
      callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
      observe(element: Element) { observed.push({ element, callback: this.callback }); }
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
      root = null; rootMargin = "0px"; thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", Observer);
    const getBlob = vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "page.png" });
    const pages = Array.from({ length: 50 }, (_, index) => ({ ...workspace.pages[0]!, id: `large-${index}`, pageNumber: index + 1, thumbnailUrl: `/large-${index}` }));
    const large = { ...workspace, pages, uploads: [{ ...uploadedPlanWorkspace.uploads[0], pageCount: 50, pages }] };
    render(<ClientFullPlanNav workspace={large} onSelectPage={vi.fn()} />);
    expect(getBlob).not.toHaveBeenCalled();
    await act(async () => {
      for (const item of observed) item.callback([{ isIntersecting: true, target: item.element } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(getBlob).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
