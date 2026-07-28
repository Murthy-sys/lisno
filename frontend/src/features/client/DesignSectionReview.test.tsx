import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import type { DesignSectionReviewData } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { DesignSectionReview } from "./DesignSectionReview";

const revision = {
  id: "revision-2",
  sectionId: "section-1",
  revisionNumber: 2,
  sourcePageId: "page-1",
  crop: { x: 10, y: 20, width: 600, height: 400 },
  label: "Front elevation",
  reviewStatus: "submitted" as const,
  submittedAt: "2026-07-27T10:00:00.000Z",
  reviewerId: null,
  reviewedAt: null,
  rejectionComment: null,
  createdAt: "2026-07-27T09:00:00.000Z",
  imageReference: "/api/v1/design-section-revisions/revision-2/image"
};

const secondRevision = {
  ...revision,
  id: "revision-3",
  sectionId: "section-2",
  sourcePageId: "page-2",
  label: "Site plan",
  imageReference: "/api/v1/design-section-revisions/revision-3/image"
};

const review: DesignSectionReviewData = {
  projectId: "project-1",
  progress: { approved: 0, rejected: 0, awaitingReview: 2, total: 2 },
  sections: [{
    id: "section-1",
    designVersionId: "version-1",
    sourcePageId: "page-1",
    label: "Front elevation",
    active: true,
    source: "ocr" as const,
    ocrConfidence: .93,
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    revision,
    versionNumber: 3,
    sourcePageUrl: "/api/v1/design-source-pages/page-1/image",
    history: [
      { ...revision, id: "revision-1", revisionNumber: 1, reviewStatus: "rejected" as const, rejectionComment: "Show the roof line.", reviewedAt: "2026-07-26T10:00:00.000Z" },
      revision
    ]
  }, {
    id: "section-2",
    designVersionId: "version-2",
    sourcePageId: "page-2",
    label: "Site plan",
    active: true,
    source: "ocr" as const,
    ocrConfidence: .91,
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    revision: secondRevision,
    versionNumber: 4,
    sourcePageUrl: "/api/v1/design-source-pages/page-2/image",
    history: [secondRevision]
  }]
};

function installApi(options: { failList?: boolean; failDecision?: boolean } = {}) {
  let current = structuredClone(review);
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/v1/client/projects/project-1/design-sections") {
      if (options.failList) return Response.json({ error: { code: "FAILED", message: "Nope" } }, { status: 500 });
      return Response.json({ data: current });
    }
    if (url === revision.imageReference || url === secondRevision.imageReference) return new Response(new Blob(["image"], { type: "image/png" }));
    if (url === "/api/v1/design-source-pages/page-1/image") return new Response(new Blob(["page"], { type: "image/png" }));
    if (url === "/api/v1/design-source-pages/page-2/image") return new Response(new Blob(["page"], { type: "image/png" }));
    if (url === "/api/v1/design-section-revisions/revision-2/decision") {
      if (options.failDecision) return Response.json({ error: { code: "CONFLICT", message: "Already reviewed." } }, { status: 409 });
      const body = JSON.parse(String(init?.body)) as { decision: "approved" | "rejected"; comment?: string };
      current = {
        ...current,
        progress: body.decision === "approved"
          ? { approved: 1, rejected: 0, awaitingReview: 1, total: 2 }
          : { approved: 0, rejected: 1, awaitingReview: 1, total: 2 },
        sections: current.sections.map((section) => ({
          ...section,
          revision: { ...section.revision, reviewStatus: body.decision, rejectionComment: body.comment ?? null }
        }))
      };
      return Response.json({ data: { revision: current.sections[0].revision, extractionStatus: body.decision === "approved" ? "approved" : "changes_requested", progress: current.progress } });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("DesignSectionReview", () => {
  it("shows submitted revisions with a project-level source modal, history, and semantic progress", async () => {
    tokenStorage.set("client-token");
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:section-preview"),
      revokeObjectURL: vi.fn()
    });
    const api = installApi();
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);
    const user = userEvent.setup();

    expect(await screen.findByText("0 approved")).toBeVisible();
    expect(screen.getByText("2 awaiting review")).toBeVisible();
    expect(screen.getByText("2 total")).toBeVisible();
    expect(screen.getByText("0 approved").closest(".design-review__stat")).toHaveClass("design-review__stat--approved");
    expect(screen.getByText("0 rejected").closest(".design-review__stat")).toHaveClass("design-review__stat--rejected");
    expect(screen.getByText("2 awaiting review").closest(".design-review__stat")).toHaveClass("design-review__stat--awaiting");
    expect(screen.getByText("2 total").closest(".design-review__stat")).toHaveClass("design-review__stat--total");
    const card = screen.getByRole("article", { name: "Front elevation review" });
    const thumbnail = await within(card).findByRole("button", { name: "Preview Front elevation" });
    expect(thumbnail).toHaveClass("section-review-card__thumbnail");
    expect(within(thumbnail).getByRole("img", { name: "Front elevation, revision 2" })).toHaveClass("section-review-card__thumbnail-image");
    expect(within(card).getByText("Design version 3 · Section revision 2")).toBeVisible();
    expect(within(card).getByText("Revision 1 · Rejected")).toBeVisible();
    expect(within(card).getByText("Show the roof line.")).toBeVisible();
    expect(within(card).getByRole("button", { name: "Approve Front elevation" })).toHaveClass("button--success");
    expect(within(card).getByRole("button", { name: "Reject Front elevation" })).toHaveClass("button--danger");
    await user.click(thumbnail);
    expect(screen.getByRole("dialog", { name: "Front elevation preview" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Full preview of Front elevation" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Front elevation preview" })).not.toBeInTheDocument();
    expect(thumbnail).toHaveFocus();
    expect(await screen.findAllByRole("button", { name: "View source image" })).toHaveLength(1);
    expect(screen.queryByText("View source page")).not.toBeInTheDocument();
    const sourceTrigger = screen.getByRole("button", { name: "View source image" });
    await waitFor(() => expect(sourceTrigger).toBeEnabled());
    const sourceRequests = () => api.mock.calls.filter(([input]) => String(input) === "/api/v1/design-source-pages/page-2/image");
    expect(sourceRequests()).toHaveLength(1);
    expect(api.mock.calls.some(([input]) => String(input) === "/api/v1/design-source-pages/page-1/image")).toBe(false);
    await user.click(sourceTrigger);
    expect(screen.getByRole("dialog", { name: "Project source image" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Project source image" })).toHaveAttribute("src", expect.stringContaining("blob:"));
    expect(sourceRequests()).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Project source image" })).not.toBeInTheDocument();
    expect(sourceTrigger).toHaveFocus();
    expect(screen.queryByText(/draft/i)).not.toBeInTheDocument();
  });

  it("confirms approval, disables the card while pending, and refreshes progress", async () => {
    const user = userEvent.setup();
    installApi();
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);
    const approve = await screen.findByRole("button", { name: "Approve Front elevation" });
    await user.click(approve);
    const dialog = screen.getByRole("dialog", { name: "Approve Front elevation?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("1 approved")).toBeVisible();
    expect(screen.getByText("1 awaiting review")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve Front elevation" })).not.toBeInTheDocument();
  });

  it("requires an associated rejection comment and surfaces decision failures", async () => {
    const user = userEvent.setup();
    installApi({ failDecision: true });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);
    await user.click(await screen.findByRole("button", { name: "Reject Front elevation" }));
    const dialog = screen.getByRole("dialog", { name: "Request changes for Front elevation" });
    const comment = within(dialog).getByLabelText("Modification comment");
    expect(comment).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(comment).toHaveAttribute("aria-invalid", "true");
    expect(comment).toHaveAccessibleDescription("Explain what the designer should modify.");
    await user.type(comment, "Include the full roof line.");
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Already reviewed.");
  });

  it("shows bounded loading and retryable error states", async () => {
    const api = installApi({ failList: true });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);
    expect(screen.getByText("Loading design sections…")).toBeVisible();
    expect(await screen.findByText("We couldn't load the design review.")).toBeVisible();
    api.mockRestore();
  });
});
