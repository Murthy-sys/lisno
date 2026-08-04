import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import type { DesignSectionReviewData } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { clientKeys } from "./clientApi";
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

function apiRequestPath(input: RequestInfo | URL): string {
  const requestUrl = input instanceof Request ? input.url : String(input);
  return requestUrl.replace(/^https?:\/\/[^/]+/i, "");
}

function installApi(options: {
  failList?: boolean;
  failDecision?: boolean;
  failRefetchAfterDecision?: boolean;
  refetchAfterDecision?: Promise<void>;
  reviewData?: DesignSectionReviewData;
} = {}) {
  let current = structuredClone(options.reviewData ?? review);
  let decisionSaved = false;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = apiRequestPath(input);
    if (url === "/api/v1/client/projects/project-1/design-sections") {
      if (decisionSaved) await options.refetchAfterDecision;
      if (decisionSaved && options.failRefetchAfterDecision) {
        return Response.json(
          { error: { code: "FAILED", message: "Review refresh failed." } },
          { status: 500 }
        );
      }
      if (options.failList) return Response.json({ error: { code: "FAILED", message: "Nope" } }, { status: 500 });
      return Response.json({ data: current });
    }
    if (/^\/api\/v1\/design-section-revisions\/.+\/image$/.test(url)) {
      return new Response(new Blob(["image"], { type: "image/png" }));
    }
    if (/^\/api\/v1\/design-source-pages\/.+\/image$/.test(url)) {
      return new Response(new Blob(["page"], { type: "image/png" }));
    }
    const revisionId = url.match(/^\/api\/v1\/design-section-revisions\/(.+)\/decision$/)?.[1];
    if (revisionId) {
      if (options.failDecision) return Response.json({ error: { code: "CONFLICT", message: "Already reviewed." } }, { status: 409 });
      const body = JSON.parse(String(init?.body)) as { decision: "approved" | "rejected"; comment?: string };
      const section = current.sections.find((item) => item.revision.id === revisionId);
      if (!section) throw new Error(`Unhandled decision: ${url}`);
      const sections = current.sections.map((item) => item.id === section.id
        ? { ...item, revision: { ...item.revision, reviewStatus: body.decision, rejectionComment: body.comment ?? null } }
        : item);
      const progress = sections.reduce((next, item) => {
        next.total += 1;
        if (item.revision.reviewStatus === "approved") next.approved += 1;
        else if (item.revision.reviewStatus === "rejected") next.rejected += 1;
        else next.awaitingReview += 1;
        return next;
      }, { approved: 0, rejected: 0, awaitingReview: 0, total: 0 });
      current = {
        ...current,
        progress,
        sections
      };
      decisionSaved = true;
      return Response.json({ data: { revision: current.sections.find((item) => item.id === section.id)!.revision, extractionStatus: body.decision === "approved" ? "approved" : "changes_requested", progress } });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

function getProgressStat(progress: HTMLElement, label: string) {
  const stat = within(progress).getByText(label).closest(".design-review__stat");
  if (!(stat instanceof HTMLElement)) throw new Error(`Missing progress stat for ${label}.`);
  return stat;
}

function ReviewDataHarness({ data }: { data: DesignSectionReviewData }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  }));

  return <QueryClientProvider client={queryClient}><CachedReview data={data} /></QueryClientProvider>;
}

function CachedReview({ data }: { data: DesignSectionReviewData }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.setQueryData(clientKeys.designSections("project-1"), data);
  }, [data, queryClient]);

  return <DesignSectionReview projectId="project-1" mode="client" />;
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
    expect(screen.getAllByRole("article", { name: /review$/ })).toHaveLength(1);
    const card = screen.getByRole("article", { name: "Front elevation review" });
    expect(screen.getByText("Plan 1 of 2")).toBeVisible();
    const previous = screen.getByRole("button", { name: "Previous plan" });
    const next = screen.getByRole("button", { name: "Next plan: Site plan" });
    expect(previous).toBeDisabled();
    const thumbnail = await within(card).findByRole("button", { name: "Preview Front elevation" });
    expect(thumbnail).toHaveClass("section-review-card__image-trigger");
    expect(within(card).getByText("Design version 3 · Section revision 2")).toBeVisible();
    expect(within(card).getByText("Revision 1 · Rejected")).toBeVisible();
    expect(within(card).getByText("Show the roof line.")).toBeVisible();
    expect(within(card).getByRole("button", { name: "Approve Front elevation" })).toHaveClass("button--success");
    expect(within(card).getByRole("button", { name: "Request changes for Front elevation" })).toHaveClass("button--danger");
    await user.click(thumbnail);
    expect(screen.getByRole("dialog", { name: "Front elevation preview" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Full preview of Front elevation" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Front elevation preview" })).not.toBeInTheDocument();
    expect(thumbnail).toHaveFocus();
    await user.click(next);
    expect(screen.getByRole("article", { name: "Site plan review" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Front elevation review" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next plan" })).toBeDisabled();
    expect(await screen.findAllByRole("button", { name: "View source image" })).toHaveLength(1);
    expect(screen.queryByText("View source page")).not.toBeInTheDocument();
    const sourceTrigger = screen.getByRole("button", { name: "View source image" });
    await waitFor(() => expect(sourceTrigger).toBeEnabled());
    const sourceRequests = () => api.mock.calls.filter(([input]) => apiRequestPath(input) === "/api/v1/design-source-pages/page-2/image");
    expect(sourceRequests()).toHaveLength(1);
    expect(api.mock.calls.some(([input]) => apiRequestPath(input) === "/api/v1/design-source-pages/page-1/image")).toBe(false);
    await user.click(sourceTrigger);
    expect(screen.getByRole("dialog", { name: "Project source image" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Project source image" })).toHaveAttribute("src", expect.stringContaining("blob:"));
    expect(sourceRequests()).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Project source image" })).not.toBeInTheDocument();
    expect(sourceTrigger).toHaveFocus();
    expect(screen.queryByText(/draft/i)).not.toBeInTheDocument();
  });

  it("prefers a submitted plan initially and preserves the selected plan across refreshed ordering", async () => {
    const user = userEvent.setup();
    const approvedFirstReview = structuredClone(review);
    approvedFirstReview.sections[0]!.revision.reviewStatus = "approved";
    approvedFirstReview.sections[0]!.history = [{ ...approvedFirstReview.sections[0]!.revision }];
    installApi({ reviewData: approvedFirstReview });
    const { rerender } = render(<ReviewDataHarness data={approvedFirstReview} />);

    expect(await screen.findByRole("article", { name: "Site plan review" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous plan: Front elevation" }));
    expect(screen.getByRole("article", { name: "Front elevation review" })).toBeVisible();

    const refreshedReview = structuredClone(approvedFirstReview);
    refreshedReview.sections.reverse();
    rerender(<ReviewDataHarness data={refreshedReview} />);

    expect(await screen.findByRole("article", { name: "Front elevation review" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Site plan review" })).not.toBeInTheDocument();
    expect(screen.getByText("Plan 2 of 2")).toBeVisible();
  });

  it("does not carry an open preview into the next plan", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:section-preview"),
      revokeObjectURL: vi.fn()
    });
    installApi();
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Preview Front elevation" }));
    expect(screen.getByRole("dialog", { name: "Front elevation preview" })).toBeVisible();

    flushSync(() => screen.getByRole("button", { name: "Next plan: Site plan" }).click());

    expect(screen.getByRole("article", { name: "Site plan review" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Site plan preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Full preview of Site plan" })).not.toBeInTheDocument();
  });

  it("keeps queue navigation focused and announces every manual plan change", async () => {
    const user = userEvent.setup();
    installApi();
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    const next = await screen.findByRole("button", { name: "Next plan: Site plan" });
    next.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("article", { name: "Site plan review" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next plan" })).toHaveFocus();
    expect(screen.getByRole("status", { name: "Design review updates" })).toHaveTextContent("Now showing Site plan.");

    const previous = screen.getByRole("button", { name: "Previous plan: Front elevation" });
    await user.click(previous);

    expect(screen.getByRole("article", { name: "Front elevation review" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous plan" })).toHaveFocus();
    expect(screen.getByRole("status", { name: "Design review updates" })).toHaveTextContent("Now showing Front elevation.");
  });

  it("keeps a decision settled through delayed synchronization and prevents duplicate submission", async () => {
    const user = userEvent.setup();
    let releaseRefetch: (() => void) | undefined;
    const refetchAfterDecision = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    const api = installApi({ refetchAfterDecision });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    await user.click(await screen.findByRole("button", { name: "Approve Front elevation" }));
    const dialog = screen.getByRole("dialog", { name: "Approve Front elevation?" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm approval" });
    await user.click(confirm);

    await waitFor(() => {
      expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    });
    expect(dialog).toBeVisible();
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next plan: Site plan" })).toBeDisabled();

    await user.click(confirm);
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);

    releaseRefetch?.();
    expect(await screen.findByRole("article", { name: "Site plan review" })).toBeVisible();
  });

  it("keeps the saved decision authoritative when its refetch fails", async () => {
    const user = userEvent.setup();
    const api = installApi({ failRefetchAfterDecision: true });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    await user.click(await screen.findByRole("button", { name: "Approve Front elevation" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));

    expect(await screen.findByRole("article", { name: "Site plan review" })).toBeVisible();
    expect(screen.queryByText("We couldn't load the design review.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Front elevation" })).not.toBeInTheDocument();
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("advances to the next submitted plan after approval", async () => {
    const user = userEvent.setup();
    installApi();
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);
    await user.click(await screen.findByRole("button", { name: "Approve Front elevation" }));
    const dialog = screen.getByRole("dialog", { name: "Approve Front elevation?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("status", { name: "Design review updates" })).toHaveTextContent("Review saved. Now showing Site plan, the next plan awaiting review.");
    expect(screen.getByRole("article", { name: "Site plan review" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve Front elevation" })).not.toBeInTheDocument();
  });

  it("advances to the next submitted plan after a rejection", async () => {
    const user = userEvent.setup();
    installApi();
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    await user.click(await screen.findByRole("button", { name: "Request changes for Front elevation" }));
    const dialog = screen.getByRole("dialog", { name: "Request changes for Front elevation" });
    await user.type(within(dialog).getByLabelText("Modification comment"), "Raise the roof line.");
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));

    expect(await screen.findByRole("status", { name: "Design review updates" })).toHaveTextContent("Review saved. Now showing Site plan, the next plan awaiting review.");
    expect(screen.getByRole("article", { name: "Site plan review" })).toBeVisible();
  });

  it("retains the failed rejection form and its chosen plan", async () => {
    const user = userEvent.setup();
    installApi({ failDecision: true });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    await user.click(await screen.findByRole("button", { name: "Request changes for Front elevation" }));
    const dialog = screen.getByRole("dialog", { name: "Request changes for Front elevation" });
    const comment = within(dialog).getByLabelText("Modification comment");
    await user.type(comment, "Include the full roof line.");
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Already reviewed.");
    expect(screen.getByRole("dialog", { name: "Request changes for Front elevation" })).toBeVisible();
    expect(comment).toHaveValue("Include the full roof line.");
    expect(screen.getByRole("article", { name: "Front elevation review" })).toBeVisible();
  });

  it("announces completion while retaining the decided plan in the queue", async () => {
    const user = userEvent.setup();
    const singleReview = structuredClone(review);
    singleReview.sections = [singleReview.sections[0]!];
    singleReview.progress = { approved: 0, rejected: 0, awaitingReview: 1, total: 1 };
    installApi({ reviewData: singleReview });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    await user.click(await screen.findByRole("button", { name: "Approve Front elevation" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));

    expect(await screen.findByRole("heading", { name: "Review complete" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Design review updates" })).toHaveTextContent("Review saved. Review complete. Now showing Front elevation.");
    expect(screen.getByRole("article", { name: "Front elevation review" })).toBeVisible();
  });

  it("emits distinct plan-labelled announcements for consecutive successful decisions", async () => {
    const user = userEvent.setup();
    const threePlanReview = structuredClone(review);
    const roofRevision = {
      ...secondRevision,
      id: "revision-4",
      sectionId: "section-3",
      sourcePageId: "page-3",
      label: "Roof plan",
      imageReference: "/api/v1/design-section-revisions/revision-4/image"
    };
    threePlanReview.sections.push({
      ...threePlanReview.sections[1]!,
      id: "section-3",
      designVersionId: "version-3",
      sourcePageId: "page-3",
      label: "Roof plan",
      revision: roofRevision,
      versionNumber: 5,
      sourcePageUrl: "/api/v1/design-source-pages/page-3/image",
      history: [roofRevision]
    });
    threePlanReview.progress = { approved: 0, rejected: 0, awaitingReview: 3, total: 3 };
    installApi({ reviewData: threePlanReview });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    await user.click(await screen.findByRole("button", { name: "Approve Front elevation" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    const firstAnnouncement = screen.getByRole("status", { name: "Design review updates" }).textContent;
    expect(firstAnnouncement).toContain("Site plan");

    await user.click(await screen.findByRole("button", { name: "Approve Site plan" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("article", { name: "Roof plan review" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Design review updates" })).toHaveTextContent("Roof plan");
    expect(screen.getByRole("status", { name: "Design review updates" }).textContent).not.toBe(firstAnnouncement);
  });

  it("keeps queue navigation but no decision actions in read-only mode", async () => {
    installApi();
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="read-only" />);

    await screen.findByRole("article", { name: "Front elevation review" });
    expect(screen.getByRole("button", { name: "Previous plan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next plan: Site plan" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request changes|Reject/ })).not.toBeInTheDocument();
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
    expect(api.mock.calls.filter(([input]) => apiRequestPath(input) === "/api/v1/design-source-pages/page-1/image")).toHaveLength(1);
    expect(api.mock.calls.some(([input]) => apiRequestPath(input) === "/api/v1/design-source-pages/page-2/image")).toBe(false);
  });

  it("omits the source trigger when source URLs are absent or empty", async () => {
    const noSourceReview = structuredClone(review);
    delete (noSourceReview.sections[0] as { sourcePageUrl?: string }).sourcePageUrl;
    noSourceReview.sections[1]!.sourcePageUrl = "";
    const api = installApi({ reviewData: noSourceReview });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    await screen.findByRole("article", { name: "Front elevation review" });
    expect(screen.queryByRole("button", { name: "View source image" })).not.toBeInTheDocument();
    expect(api.mock.calls.some(([input]) => apiRequestPath(input).includes("/api/v1/design-source-pages/"))).toBe(false);
  });

  it("shows only the editorial empty state when no review sections exist", async () => {
    const emptyReview: DesignSectionReviewData = {
      projectId: "project-1",
      progress: { approved: 0, rejected: 0, awaitingReview: 0, total: 0 },
      sections: []
    };
    installApi({ reviewData: emptyReview });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);

    expect(await screen.findByRole("heading", { name: "No plans ready for review" })).toBeVisible();
    expect(screen.getByText("No submitted design sections are awaiting review.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Review complete" })).not.toBeInTheDocument();
  });

  it("requires an associated rejection comment and surfaces decision failures", async () => {
    const user = userEvent.setup();
    installApi({ failDecision: true });
    renderWithQuery(<DesignSectionReview projectId="project-1" mode="client" />);
    await user.click(await screen.findByRole("button", { name: "Request changes for Front elevation" }));
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
