import { render, screen } from "@testing-library/react";
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
  it("renders ordered compact pages, selection, mobile drawer, and Ask Lisno last", async () => {
    vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "page.png" });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:thumb") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const onSelect = vi.fn();
    render(<ClientFullPlanNav workspace={workspace} selectedPageId="page-1" onSelectPage={onSelect} />);
    expect(screen.getAllByRole("button", { name: /open design page/i })).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Open design page 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Changes requested")).toBeVisible();
    expect(screen.getByText("Ask Lisno — coming soon")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ask Lisno" })).toBeDisabled();
    expect(screen.getAllByText("Design pages").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Open design page 4" }));
    expect(onSelect).toHaveBeenCalledWith(workspace.pages[3]);
  });
});
