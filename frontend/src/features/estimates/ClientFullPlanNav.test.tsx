import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import type { EstimatePlanClientWorkspace } from "../../api/types";
import { ClientFullPlanNav } from "./ClientFullPlanNav";

const workspace: EstimatePlanClientWorkspace = {
  pages: Array.from({ length: 6 }, (_, index) => ({
    id: `page-${index + 1}`, uploadId: "upload-1", pageNumber: index + 1,
    width: 1000, height: 800, currentRevisionId: `manifest-${index + 1}`,
    status: index === 1 ? "changes_requested" : "awaiting_review",
    thumbnailUrl: `/thumb-${index + 1}`, currentImageUrl: `/page-${index + 1}`,
    annotationDraft: null
  })),
  openRequests: []
};

describe("ClientFullPlanNav", () => {
  it("renders ordered compact pages and selection without owning the Ask Lisno launcher", async () => {
    vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "page.png" });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:thumb") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const onSelect = vi.fn();
    render(<ClientFullPlanNav workspace={workspace} selectedPageId="page-1" onSelectPage={onSelect} />);
    expect(screen.getAllByRole("button", { name: /preview design page/i })).toHaveLength(6);
    expect(screen.getByText("6 pages")).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview design page 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Changes requested")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ask Lisno" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Design pages").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Preview design page 4" }));
    expect(onSelect).toHaveBeenCalledWith(workspace.pages[3]);
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
    const large = { ...workspace, pages: Array.from({ length: 50 }, (_, index) => ({ ...workspace.pages[0]!, id: `large-${index}`, pageNumber: index + 1, thumbnailUrl: `/large-${index}` })) };
    render(<ClientFullPlanNav workspace={large} onSelectPage={vi.fn()} />);
    expect(getBlob).not.toHaveBeenCalled();
    await act(async () => {
      for (const item of observed.slice(0, 4)) item.callback([{ isIntersecting: true, target: item.element } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(getBlob).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();
  });
});
