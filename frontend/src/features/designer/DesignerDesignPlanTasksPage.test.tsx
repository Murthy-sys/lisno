import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DesignPlanTask, EstimateDesignWorkspace } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { DesignerDesignPlanTasksPage } from "./DesignerDesignPlanTasksPage";

const assignedTask: DesignPlanTask = {
  id: "design-task-1",
  estimateId: "estimate-1",
  projectId: "project-1",
  projectName: "Aurora Villa",
  clientName: "Priya Shah",
  status: "assigned",
  designPlanVersion: 0,
  rooms: [{ id: "room-living", label: "Living Room" }],
  scopes: ["EL"],
  lineItems: [
    {
      catalogueId: "EL01",
      roomName: "Living Room",
      specification: "Lighting point",
      unit: "point",
      quantity: 6,
      included: true
    }
  ]
};

const secondTask: DesignPlanTask = {
  ...assignedTask,
  id: "design-task-2",
  estimateId: "estimate-2",
  projectId: "project-2",
  projectName: "Coastal Apartment",
  clientName: "Rhea Kapoor",
  status: "in_progress"
};

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:designer-extracted-image")
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn()
  });
});

function emptyWorkspace(): EstimateDesignWorkspace {
  return { uploads: [], pages: [], drawings: [], revisions: [] };
}

function renderPage(initialEntry = "/designer/design-plans") {
  return renderWithQuery(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DesignerDesignPlanTasksPage />
    </MemoryRouter>
  );
}

function extractedWorkspace(estimateId: string, title = "Living Room Electrical Plan"):
EstimateDesignWorkspace {
  return {
    uploads: [{
      id: `upload-${estimateId}`,
      estimateId,
      leadId: "lead-1",
      originalFilename: "client-design.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      uploaderId: "designer-1",
      uploadedAt: "2026-08-26T08:00:00.000Z",
      extractionStatus: "estimator_review",
      failureCode: null,
      failureMessage: null,
      canRetry: false
    }],
    pages: [{
      id: `page-${estimateId}`,
      uploadId: `upload-${estimateId}`,
      pageNumber: 1,
      width: 1200,
      height: 800
    }],
    drawings: [{
      id: `drawing-${estimateId}`,
      uploadId: `upload-${estimateId}`,
      sourcePageId: `page-${estimateId}`,
      estimateId,
      active: true,
      verified: false,
      roomId: "room-living",
      scopeSectionId: "EL",
      catalogueId: "EL01",
      mappingStatus: "auto_mapped",
      detectedTitle: title,
      displayTitle: title,
      source: "ocr",
      roomConfidence: 0.95,
      scopeConfidence: 0.96,
      ocrConfidence: 0.94,
      roomEvidence: [],
      scopeEvidence: []
    }],
    revisions: [{
      id: `revision-${estimateId}`,
      drawingId: `drawing-${estimateId}`,
      revisionNumber: 1,
      sourcePageId: `page-${estimateId}`,
      crop: { x: 0, y: 0, width: 1200, height: 800 },
      roomId: "room-living",
      scopeSectionId: "EL",
      catalogueId: "EL01",
      mappingStatus: "auto_mapped",
      label: title,
      reviewStatus: "draft",
      submittedAt: null,
      reviewerId: null,
      reviewedAt: null,
      changeSummary: null,
      annotationLayerId: null,
      annotations: null,
      replacementUploadId: null,
      replacesRevisionId: null
    }]
  };
}

describe("DesignerDesignPlanTasksPage", () => {
  it("makes the assigned project and Upload Design action the primary workspace", async () => {
    const requests: string[] = [];
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", ({ request }) => {
        requests.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: [assignedTask] });
      }),
      http.get("/api/v1/estimates/estimate-1/design-uploads", ({ request }) => {
        requests.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: emptyWorkspace() });
      })
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Design plan workspace" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute(
      "href",
      "/designer"
    );
    // The upload action lives on the workspace panel alone, never in the header.
    expect(screen.getAllByRole("button", { name: "Upload design" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Upload design" }))
      .not.toBeInTheDocument();
    const queue = screen.getByRole("region", { name: "Assigned projects" });
    expect(within(queue).getByRole("button", { name: /Aurora Villa.*Ready to upload/i }))
      .toHaveAttribute("aria-pressed", "true");
    const workspace = screen.getByRole("region", {
      name: "Selected project workspace"
    });
    expect(within(workspace).getByText("Upload the design plan")).toBeVisible();
    expect(
      within(workspace).getByRole("heading", { name: "Upload design" })
    ).toBeVisible();
    expect(screen.getByLabelText("Design plan file")).toHaveAttribute(
      "accept",
      expect.stringContaining("application/pdf")
    );
    expect(screen.getByRole("button", { name: "Upload design" })).toBeDisabled();
    expect(requests).toEqual([
      "/api/v1/designer/design-plan-tasks",
      "/api/v1/estimates/estimate-1/design-uploads"
    ]);
  });

  it("shows extracted images as a visible Designer gallery", async () => {
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [{ ...assignedTask, status: "in_progress" }] })
      ),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () =>
        HttpResponse.json({ data: extractedWorkspace("estimate-1") })
      ),
      http.get("/api/v1/estimate-design-revisions/revision-estimate-1/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Extracted images" })
    ).toBeVisible();
    expect(screen.getByText("1 image")).toBeVisible();
    expect(
      await screen.findByRole("img", { name: "Living Room Electrical Plan thumbnail" })
    ).toHaveAttribute("src", "blob:designer-extracted-image");
    const drawing = screen.getByRole("article", {
      name: "Living Room Electrical Plan drawing"
    });
    expect(within(drawing).getByRole("button", { name: "Preview" })).toBeEnabled();
  });

  it("does not render the same extracted crop twice during a workspace refresh", async () => {
    const workspace = extractedWorkspace("estimate-1");
    const drawing = workspace.drawings[0]!;
    const revision = workspace.revisions[0]!;
    workspace.drawings.push({ ...drawing, id: "duplicate-drawing" });
    workspace.revisions.push({ ...revision, id: "duplicate-revision", drawingId: "duplicate-drawing" });
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [{ ...assignedTask, status: "in_progress" }] })
      ),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () =>
        HttpResponse.json({ data: workspace })
      ),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );

    renderPage();

    expect(await screen.findByRole("heading", { name: "Extracted images" })).toBeVisible();
    expect(screen.getByText("1 image")).toBeVisible();
    expect(screen.getAllByRole("article", { name: /drawing$/i })).toHaveLength(1);
  });

  it("maps line items to the canonical room when the estimate label uses an alias", async () => {
    const aliasedTask: DesignPlanTask = {
      ...assignedTask,
      rooms: [{ id: "room-living", label: "Living Room", aliases: ["living-room"] }],
      lineItems: [{ ...assignedTask.lineItems[0]!, roomName: "  LIVING-ROOM  " }]
    };
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [{ ...aliasedTask, status: "in_progress" }] })
      ),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () =>
        HttpResponse.json({ data: extractedWorkspace("estimate-1") })
      ),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );
    const user = userEvent.setup();

    renderPage();

    const drawing = await screen.findByRole("article", { name: /drawing$/i });
    await user.click(within(drawing).getByRole("button", { name: /More actions/ }));
    await user.click(screen.getByRole("menuitem", { name: "Change estimate item" }));
    expect(await screen.findByRole("option", { name: /EL01.*Light \/ fan \/ switch points.*Electrical/i })).toBeVisible();
  });

  it("opens the exact estimate selected from the dashboard project list", async () => {
    const workspaceRequests: string[] = [];
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [assignedTask, secondTask] })
      ),
      http.get("/api/v1/estimates/:estimateId/design-uploads", ({ request }) => {
        workspaceRequests.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: emptyWorkspace() });
      })
    );

    renderPage("/designer/design-plans?estimate=estimate-2");

    expect(
      await screen.findByRole("heading", { name: "Coastal Apartment" })
    ).toBeVisible();
    expect(workspaceRequests).toEqual([
      "/api/v1/estimates/estimate-2/design-uploads"
    ]);
  });

  it("switches the active project without mounting every extraction workspace", async () => {
    const workspaceRequests: string[] = [];
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [assignedTask, secondTask] })
      ),
      http.get("/api/v1/estimates/:estimateId/design-uploads", ({ params, request }) => {
        workspaceRequests.push(new URL(request.url).pathname);
        return HttpResponse.json({
          data: params.estimateId === "estimate-2"
            ? extractedWorkspace("estimate-2", "Coastal Lighting Plan")
            : emptyWorkspace()
        });
      }),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );
    const user = userEvent.setup();

    renderPage();
    const queue = await screen.findByRole("region", { name: "Assigned projects" });
    expect(workspaceRequests).toEqual(["/api/v1/estimates/estimate-1/design-uploads"]);

    await user.click(
      within(queue).getByRole("button", { name: /Coastal Apartment.*Extraction in progress/i })
    );

    await waitFor(() => expect(workspaceRequests).toEqual([
      "/api/v1/estimates/estimate-1/design-uploads",
      "/api/v1/estimates/estimate-2/design-uploads"
    ]));
    expect(
      within(screen.getByRole("region", { name: "Selected project workspace" }))
        .getByRole("heading", { name: "Coastal Apartment" })
    ).toBeVisible();
    expect(await screen.findByText("Coastal Lighting Plan")).toBeVisible();
  });

  it("keeps submitted extracted images visible and read-only", async () => {
    const readyTask: DesignPlanTask = {
      ...assignedTask,
      status: "ready_for_client",
      designPlanVersion: 1
    };
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [readyTask] })
      ),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () =>
        HttpResponse.json({ data: extractedWorkspace("estimate-1") })
      ),
      http.get("/api/v1/estimate-design-revisions/revision-estimate-1/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );

    renderPage();

    expect(await screen.findByText(/Submitted to the Client/)).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Extracted images" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "View extracted images" }))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit drawings to client" }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/submitted design and extracted images are read-only/)).toBeVisible();
  });
});
