import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { DesignUploadsWorkspace } from "./DesignUploadsWorkspace";

const version = {
  id: "version-1",
  projectId: "project-1",
  floorId: "floor-1",
  stageId: "stage-1",
  taskId: "task-1",
  versionNumber: 1,
  originalFilename: "plans.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1200,
  uploaderId: "designer-1",
  uploadedAt: "2026-07-27T00:00:00.000Z",
  approvalStatus: "draft",
  reviewerId: null,
  approvedAt: null,
  clientVisible: false,
  extractionStatus: "designer_review",
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z"
};

const page = {
  id: "page-1",
  designVersionId: "version-1",
  pageNumber: 1,
  width: 800,
  height: 600,
  imageUrl: "/api/v1/design-source-pages/page-1/image",
  createdAt: "2026-07-27T00:00:00.000Z"
};
const secondPage = { ...page, id: "page-2", pageNumber: 2, width: 1000, height: 700, imageUrl: "/api/v1/design-source-pages/page-2/image" };

const section = {
  id: "section-1",
  designVersionId: "version-1",
  sourcePageId: "page-1",
  label: "Elevation",
  active: true,
  source: "ocr",
  ocrConfidence: 0.55,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  revision: {
    id: "revision-1",
    sectionId: "section-1",
    revisionNumber: 1,
    sourcePageId: "page-1",
    crop: { x: 0, y: 0, width: 200, height: 100 },
    label: "Elevation",
    reviewStatus: "draft",
    submittedAt: null,
    reviewerId: null,
    reviewedAt: null,
    rejectionComment: null,
    createdAt: "2026-07-27T00:00:00.000Z",
    imageReference: "/api/v1/design-section-revisions/revision-1/image"
  }
};

function response(data: unknown, init?: ResponseInit) {
  return Response.json({ data }, init);
}

function installApi(status = "designer_review", mutation?: "network" | "conflict") {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/v1/projects/project-1/design-versions?")) {
      return response({
        items: [{ ...version, extractionStatus: status }],
        pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
      });
    }
    if (url === "/api/v1/design-versions/version-1/sections" && method === "GET") {
      return response({
        extractionStatus: status,
        pages: status === "processing" || status === "queued" ? [] : [page, secondPage],
        sections: status === "designer_review" ? [section] : []
      });
    }
    if (url.includes("/api/v1/design-source-pages/") || url.includes("/api/v1/design-section-revisions/")) {
      return new Response(new Blob(["image"], { type: "image/png" }), {
        headers: { "Content-Type": "image/png" }
      });
    }
    if (method !== "GET") {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });
      if (mutation === "network") throw new TypeError("offline");
      if (mutation === "conflict") {
        return Response.json(
          { error: { code: "CONFLICT", message: "The section changed." } },
          { status: 409 }
        );
      }
      if (method === "PATCH") {
        return response({
          ...section,
          label: (body as { label?: string }).label ?? section.label,
          revision: {
            ...section.revision,
            id: "revision-2",
            revisionNumber: 2,
            label: (body as { label?: string }).label ?? section.label,
            crop: (body as { crop?: typeof section.revision.crop }).crop ?? section.revision.crop,
            imageReference: "/api/v1/design-section-revisions/revision-2/image"
          }
        });
      }
      if (method === "POST" && url.endsWith("/sections")) {
        return response({ ...section, id: "manual-1", label: "Kitchen" }, { status: 201 });
      }
      return response({ extractionStatus: "submitted", submittedCount: 1 });
    }
    throw new Error(`Unhandled request: ${method} ${url}`);
  });
  return requests;
}

describe("DesignUploadsWorkspace", () => {
  it("shows processing and failed extraction states with retry", async () => {
    installApi("processing");
    const { unmount } = renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    expect(await screen.findByText(/OCR is processing/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /submit sections/i })).toBeDisabled();
    unmount();

    const requests = installApi("processing_failed");
    renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    expect(await screen.findByText(/couldn't extract/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /retry extraction/i }));
    expect(requests).toContainEqual(expect.objectContaining({
      url: "/api/v1/design-versions/version-1/retry-extraction",
      method: "POST"
    }));
  });

  it("warns about low confidence and supports rename, remove, and manual add", async () => {
    const requests = installApi();
    const user = userEvent.setup();
    renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    expect(await screen.findByText(/low OCR confidence/i)).toBeVisible();

    const label = screen.getByLabelText("Section label");
    await user.clear(label);
    await user.type(label, "Front elevation");
    await user.click(screen.getByRole("button", { name: "Save Front elevation" }));
    await user.click(screen.getByRole("button", { name: "Remove Front elevation" }));
    await user.click(screen.getByRole("button", { name: "Add missing section" }));
    await user.type(screen.getByLabelText("New section label"), "Kitchen");
    await user.click(screen.getByRole("button", { name: "Create section" }));

    expect(requests.map(({ method }) => method)).toEqual(["PATCH", "DELETE", "POST"]);
  });

  it("supports exact numeric and keyboard crop editing and refreshes the preview", async () => {
    installApi();
    const user = userEvent.setup();
    renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    const crop = await screen.findByRole("group", { name: "Elevation crop boundaries" });
    within(crop).getByLabelText("Crop x coordinate").focus();
    await user.keyboard("{ArrowRight}");
    within(crop).getByLabelText("Crop y coordinate").focus();
    await user.keyboard("{ArrowDown}");
    expect(within(crop).getByLabelText("Crop x coordinate")).toHaveValue(1);
    expect(within(crop).getByLabelText("Crop y coordinate")).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "Save Elevation" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Elevation crop preview" }))
        .toHaveAttribute("data-revision", "2")
    );
  });

  it("retains a draft after network failure and offers refresh after a conflict", async () => {
    const user = userEvent.setup();
    installApi("designer_review", "network");
    const first = renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    const label = await screen.findByLabelText("Section label");
    await user.clear(label);
    await user.type(label, "Draft survives");
    await user.click(screen.getByRole("button", { name: "Save Draft survives" }));
    expect(await screen.findByText(/not saved/i)).toBeVisible();
    expect(label).toHaveValue("Draft survives");
    first.unmount();

    installApi("designer_review", "conflict");
    renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    const conflictLabel = await screen.findByLabelText("Section label");
    await user.clear(conflictLabel);
    await user.type(conflictLabel, "Still retained");
    await user.click(screen.getByRole("button", { name: "Save Still retained" }));
    const refresh = await screen.findByRole("button", { name: "Refresh server version" });
    await user.click(refresh);
    expect(conflictLabel).toHaveValue("Still retained");
  });

  it("blocks submission for dirty local edits and locks approved sections", async () => {
    installApi();
    const user = userEvent.setup();
    const first = renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    const submit = await screen.findByRole("button", { name: /submit sections/i });
    await user.type(screen.getByLabelText("Section label"), " changed");
    expect(submit).toBeDisabled();
    first.unmount();

    const approved = { ...section, revision: { ...section.revision, reviewStatus: "approved" as const } };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/v1/projects/project-1/design-versions?")) return response({ items: [{ ...version, extractionStatus: "changes_requested" }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false } });
      if (url.endsWith("/sections")) return response({ extractionStatus: "changes_requested", pages: [page], sections: [approved] });
      return new Response(new Blob(["image"], { type: "image/png" }));
    });
    renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    expect(await screen.findByLabelText("Section label")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save Elevation/ })).not.toBeInTheDocument();
  });

  it("lets a designer choose the source page and crop for a missing section", async () => {
    const requests = installApi();
    const user = userEvent.setup();
    renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    await user.click(await screen.findByRole("button", { name: "Add missing section" }));
    await user.selectOptions(screen.getByLabelText("Source page"), "page-2");
    await user.type(screen.getByLabelText("New section label"), "Kitchen");
    const crop = screen.getByRole("group", { name: "Kitchen crop boundaries" });
    await user.clear(within(crop).getByLabelText("Crop width"));
    await user.type(within(crop).getByLabelText("Crop width"), "300");
    await user.click(screen.getByRole("button", { name: "Create section" }));
    expect(requests.at(-1)?.body).toMatchObject({
      sourcePageId: "page-2",
      crop: { width: 300 }
    });
  });

  it("submits only when processing is complete and an active section exists", async () => {
    const requests = installApi();
    renderWithQuery(<DesignUploadsWorkspace projectId="project-1" />);
    const submit = await screen.findByRole("button", { name: /submit sections/i });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(requests).toContainEqual(expect.objectContaining({
      url: "/api/v1/design-versions/version-1/submit-sections",
      method: "POST"
    }));
  });
});
