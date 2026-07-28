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

function installApi(options: { failList?: boolean; failDecision?: boolean; reviewData?: DesignSectionReviewData } = {}) {
  let current = structuredClone(options.reviewData ?? review);
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

function getProgressStat(progress: HTMLElement, label: string) {
  const stat = within(progress).getByText(label).closest(".design-review__stat");
  if (!(stat instanceof HTMLElement)) throw new Error(`Missing progress stat for ${label}.`);
  return stat;
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

    const progress = await screen.findByRole("group", { name: "0 approved, 0 rejected, 2 awaiting review, 2 total" });
    const approvedStat = getProgressStat(progress, "Approved");
    const rejectedStat = getProgressStat(progress, "Rejected");
    const awaitingStat = getProgressStat(progress, "Awaiting review");
    const totalStat = getProgressStat(progress, "Total");
    expect(approvedStat).toHaveClass("design-review__stat--approved");
    expect(rejectedStat).toHaveClass("design-review__stat--rejected");
    expect(awaitingStat).toHaveClass("design-review__stat--awaiting");
    expect(totalStat).toHaveClass("design-review__stat--total");
    expect(within(approvedStat).getByText("0")).toBeVisible();
    expect(within(rejectedStat).getByText("0")).toBeVisible();
    expect(within(awaitingStat).getByText("2")).toBeVisible();
    expect(within(totalStat).getByText("2")).toBeVisible();
    expect(within(approvedStat).queryByText("0 approved")).not.toBeInTheDocument();
    expect(within(awaitingStat).queryByText("2 awaiting review")).not.toBeInTheDocument();
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
    const progress = await screen.findByRole("group", { name: "1 approved, 0 rejected, 1 awaiting review, 2 total" });
    expect(within(getProgressStat(progress, "Approved")).getByText("1")).toBeVisible();
    expect(within(getProgressStat(progress, "Awaiting review")).getByText("1")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve Front elevation" })).not.toBeInTheDocument();
  });

  it("uses the first source page in API order when the highest versions tie", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:tied-source-preview"),
      revokeObjectURL: vi.fn()
    });
    const tiedReview = structuredClone(review);
    tiedReview.sections = tiedReview.sections.map((section) => ({ ...section, versionNumber: 4 }));
    const api = installApi({ reviewData: tiedReview });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    const sourceTrigger = await screen.findByRole("button", { name: "View source image" });
    await waitFor(() => expect(sourceTrigger).toBeEnabled());
    expect(api.mock.calls.filter(([input]) => String(input) === "/api/v1/design-source-pages/page-1/image")).toHaveLength(1);
    expect(api.mock.calls.some(([input]) => String(input) === "/api/v1/design-source-pages/page-2/image")).toBe(false);
  });

  it("omits the source trigger when source URLs are absent or empty", async () => {
    const noSourceReview = structuredClone(review);
    delete (noSourceReview.sections[0] as { sourcePageUrl?: string }).sourcePageUrl;
    noSourceReview.sections[1]!.sourcePageUrl = "";
    const api = installApi({ reviewData: noSourceReview });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    await screen.findByRole("article", { name: "Front elevation review" });
    expect(screen.queryByRole("button", { name: "View source image" })).not.toBeInTheDocument();
    expect(api.mock.calls.some(([input]) => String(input).includes("/api/v1/design-source-pages/"))).toBe(false);
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
