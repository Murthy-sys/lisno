import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnnotationDocumentV1,
  EstimateDesignClientRevision
} from "../../api/types";
import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const client = {
  id: "client-1",
  name: "Aurora Homes",
  email: "client@lisno.example",
  role: "client" as const
};
const page = {
  id: "page-1",
  uploadId: "upload-1",
  pageNumber: 1,
  width: 1_000,
  height: 800
};
const emptyAnnotations: AnnotationDocumentV1 = {
  schemaVersion: 1,
  imageWidth: 1_000,
  imageHeight: 800,
  elements: []
};
const markedAnnotations: AnnotationDocumentV1 = {
  ...emptyAnnotations,
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

function estimate(id: string, projectName: string, status = "sent_to_client") {
  return {
    id,
    leadId: `lead-${id}`,
    propertyType: "3BHK",
    rooms: [
      { id: "room-living", label: "Living Room", icon: "🛋️", typeId: "living", sqft: 200 },
      { id: "room-bedroom", label: "Bedroom", icon: "🛏️", typeId: "bedroom", sqft: 160 }
    ],
    scopes: ["FC", "EL"],
    lineItems: [{
      catalogueId: "FC01",
      roomName: "Living Room",
      specification: "plain_gyp",
      unit: "sqft",
      rate: 95,
      quantity: 100,
      included: true
    }],
    subtotal: 100_000,
    gst: 18_000,
    total: 118_000,
    status,
    approvalRequired: true,
    projectId: null,
    lead: {
      _id: `lead-${id}`,
      clientName: "Aurora Homes",
      clientEmail: "client@lisno.example",
      projectName,
      location: "Bengaluru"
    }
  };
}

function drawing(
  id: string,
  title: string,
  roomId: string,
  scopeSectionId: string
) {
  return {
    id,
    uploadId: "upload-1",
    sourcePageId: "page-1",
    estimateId: "estimate-a",
    active: true,
    verified: true,
    roomId,
    scopeSectionId,
    catalogueId: "FC01",
    mappingStatus: "auto_mapped" as const,
    detectedTitle: title,
    displayTitle: title,
    source: "ocr",
    roomConfidence: 0.98,
    scopeConfidence: 0.98,
    ocrConfidence: 0.98,
    roomEvidence: [{ value: roomId }],
    scopeEvidence: [{ value: scopeSectionId }]
  };
}

function revision(
  id: string,
  drawingId: string,
  label: string,
  roomId: string,
  scopeSectionId: string,
  reviewStatus: "submitted" | "approved" | "changes_requested",
  annotations: AnnotationDocumentV1 | null = null
) {
  return {
    id,
    drawingId,
    revisionNumber: 1,
    sourcePageId: "page-1",
    crop: { x: 0, y: 0, width: 1_000, height: 800 },
    roomId,
    scopeSectionId,
    catalogueId: "FC01",
    mappingStatus: "auto_mapped" as const,
    label,
    reviewStatus,
    submittedAt: "2026-07-30T00:00:00.000Z",
    reviewerId: reviewStatus === "submitted" ? null : "client-1",
    reviewedAt: reviewStatus === "submitted" ? null : "2026-07-30T01:00:00.000Z",
    changeSummary: reviewStatus === "changes_requested" ? "Move the opening left." : null,
    annotationLayerId: reviewStatus === "changes_requested" ? "layer-1" : null,
    annotations,
    replacementUploadId: null,
    replacesRevisionId: null,
    annotationDraft: null
  };
}

const drawings = [
  drawing("drawing-living", "Living ceiling", "room-living", "FC"),
  drawing("drawing-detail", "Living detail", "room-living", "FC"),
  drawing("drawing-electrical", "Bedroom electrical", "room-bedroom", "EL")
];
const revisions = [
  revision("revision-living", "drawing-living", "Living ceiling", "room-living", "FC", "submitted"),
  revision("revision-detail", "drawing-detail", "Living detail", "room-living", "FC", "approved"),
  revision(
    "revision-electrical",
    "drawing-electrical",
    "Bedroom electrical",
    "room-bedroom",
    "EL",
    "changes_requested",
    markedAnnotations
  )
];

function workspace(
  nextRevisions: EstimateDesignClientRevision[] = revisions,
  readiness = {
    ready: false,
    total: 3,
    approved: 1,
    awaitingReview: 1,
    changesRequested: 1
  }
) {
  return {
    uploads: [],
    pages: [page],
    drawings,
    revisions: nextRevisions,
    readiness
  };
}

function json(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}

function commonResponse(url: string) {
  if (url.endsWith("/api/v1/auth/me")) return json(client);
  if (url.includes("/api/v1/client/project-summaries?")) {
    return json({
      items: [],
      pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
    });
  }
  if (url.endsWith("/api/v1/client/latest-approved-versions")) return json([]);
  return undefined;
}

beforeEach(() => {
  tokenStorage.set("client-token");
  vi.stubGlobal("PointerEvent", MouseEvent);
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function waitForCanvas() {
  await waitFor(() =>
    expect(document.querySelector("svg image")).toHaveAttribute(
      "href",
      "blob:authenticated-drawing"
    )
  );
  return screen.getByRole("img", { name: "Drawing annotation canvas" });
}

async function addTextNote() {
  const user = userEvent.setup();
  const canvas = await waitForCanvas();
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1_000,
    height: 800,
    right: 1_000,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  await user.click(screen.getByRole("button", { name: "Text" }));
  fireEvent.pointerDown(canvas, {
    pointerId: 1,
    clientX: 250,
    clientY: 320
  });
  const noteDialog = screen.getByRole("dialog", { name: "Add text note" });
  await user.type(within(noteDialog).getByLabelText("Text note"), "Shift this door");
  await user.click(within(noteDialog).getByRole("button", { name: "Add note" }));
}

describe("client estimate drawings", () => {
  it("loads drawings only inside the matching expanded estimate and keeps preview expansion state", async () => {
    const estimates = [
      estimate("estimate-a", "Aurora Villa"),
      estimate("estimate-b", "Cedar Loft", "client_approved")
    ];
    const requestedWorkspaces: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const common = commonResponse(url);
      if (common) return common;
      if (url.endsWith("/api/v1/client/estimates")) return json(estimates);
      if (url.endsWith("/api/v1/client/estimates/estimate-a/design-drawings")) {
        requestedWorkspaces.push("estimate-a");
        return json(workspace());
      }
      if (url.endsWith("/api/v1/client/estimates/estimate-b/design-drawings")) {
        requestedWorkspaces.push("estimate-b");
        return json(workspace([
          revision(
            "revision-living",
            "drawing-living",
            "Living ceiling",
            "room-living",
            "FC",
            "submitted"
          )
        ], {
          ready: false,
          total: 1,
          approved: 0,
          awaitingReview: 1,
          changesRequested: 0
        }));
      }
      if (url.includes("/api/v1/estimate-design-revisions/") && url.endsWith("/image")) {
        return new Response(new Blob(["image"], { type: "image/png" }));
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp(["/client"]);
    const villa = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    const loft = screen.getByRole("heading", {
      name: "Cedar Loft",
      level: 3
    }).closest("article")!;
    expect(within(villa).queryByText("Living ceiling")).not.toBeInTheDocument();
    expect(within(loft).queryByText("Living ceiling")).not.toBeInTheDocument();

    const villaToggle = within(villa).getByRole("button", { name: /Aurora Villa/ });
    await user.click(villaToggle);

    const ceilingGroup = await within(villa).findByRole("region", {
      name: "Living Room, False Ceiling drawings"
    });
    expect(within(ceilingGroup).getByText("Living ceiling")).toBeVisible();
    expect(within(ceilingGroup).getByText("Living detail")).toBeVisible();
    expect(within(villa).getByRole("region", {
      name: "Bedroom, Electrical drawings"
    })).toHaveTextContent("Bedroom electrical");
    expect(within(loft).queryByText("Living ceiling")).not.toBeInTheDocument();
    expect(requestedWorkspaces).toEqual(["estimate-a"]);

    await user.click(within(ceilingGroup).getByRole("button", {
      name: "Preview Living ceiling"
    }));
    await waitForCanvas();
    expect(screen.getByRole("toolbar", { name: "Annotation tools" })).toBeVisible();
    await user.click(within(screen.getByRole("dialog", {
      name: "Living ceiling preview"
    })).getByRole("button", {
      name: "Close Living ceiling preview"
    }));
    expect(villaToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(within(ceilingGroup).getByRole("button", {
      name: "Preview Living detail"
    }));
    await waitForCanvas();
    expect(screen.queryByRole("toolbar", { name: "Annotation tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save as draft" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog", {
      name: "Living detail preview"
    })).getByRole("button", {
      name: "Close Living detail preview"
    }));

    await user.click(within(loft).getByRole("button", { name: /Cedar Loft/ }));
    const finalRow = await within(loft).findByRole("article", {
      name: "Living ceiling drawing"
    });
    await user.click(within(finalRow).getByRole("button", {
      name: "Preview Living ceiling"
    }));
    await waitForCanvas();
    expect(screen.queryByRole("toolbar", { name: "Annotation tools" })).not.toBeInTheDocument();
    expect(requestedWorkspaces).toEqual(["estimate-a", "estimate-b"]);
  });

  it("shows a submitted true-null mapping in a client Misc group", async () => {
    const miscDrawing = {
      ...drawing("drawing-misc", "Unassigned TV detail", "", ""),
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc" as const
    };
    const miscRevision = {
      ...revision(
        "revision-misc",
        "drawing-misc",
        "Unassigned TV detail",
        "",
        "",
        "submitted"
      ),
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc" as const
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const common = commonResponse(url);
      if (common) return common;
      if (url.endsWith("/api/v1/client/estimates")) {
        return json([estimate("estimate-a", "Aurora Villa")]);
      }
      if (url.endsWith(
        "/api/v1/client/estimates/estimate-a/design-drawings"
      )) {
        return json({
          uploads: [],
          pages: [page],
          drawings: [miscDrawing],
          revisions: [miscRevision],
          readiness: {
            ready: false,
            total: 1,
            approved: 0,
            awaitingReview: 1,
            changesRequested: 0
          }
        });
      }
      if (url.includes("/estimate-design-revisions/")) {
        return new Response(new Blob(["image"], { type: "image/png" }));
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    const user = userEvent.setup();
    renderApp(["/client"]);
    const card = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Aurora Villa/ }));

    const misc = await within(card).findByRole("region", {
      name: "Miscellaneous drawings"
    });
    expect(within(misc).getByRole("heading", {
      name: "Miscellaneous",
      level: 5
    })).toBeVisible();
    expect(misc).toHaveTextContent(
      "This drawing was submitted without an estimate-item assignment."
    );
    expect(within(misc).getByRole("article", {
      name: "Unassigned TV detail drawing"
    })).toBeVisible();
    expect(within(misc).getByRole("button", {
      name: "Approve Unassigned TV detail"
    })).toBeEnabled();
  });

  it("uses the exact plural copy for multiple client Misc drawings", async () => {
    const miscDrawings = [
      {
        ...drawing("drawing-misc-one", "Unassigned TV detail", "", ""),
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc" as const
      },
      {
        ...drawing("drawing-misc-two", "Unassigned profile detail", "", ""),
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc" as const
      }
    ];
    const miscRevisions = [
      {
        ...revision(
          "revision-misc-one",
          "drawing-misc-one",
          "Unassigned TV detail",
          "",
          "",
          "submitted"
        ),
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc" as const
      },
      {
        ...revision(
          "revision-misc-two",
          "drawing-misc-two",
          "Unassigned profile detail",
          "",
          "",
          "submitted"
        ),
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc" as const
      }
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const common = commonResponse(url);
      if (common) return common;
      if (url.endsWith("/api/v1/client/estimates")) {
        return json([estimate("estimate-a", "Aurora Villa")]);
      }
      if (url.endsWith(
        "/api/v1/client/estimates/estimate-a/design-drawings"
      )) {
        return json({
          uploads: [],
          pages: [page],
          drawings: miscDrawings,
          revisions: miscRevisions,
          readiness: {
            ready: false,
            total: 2,
            approved: 0,
            awaitingReview: 2,
            changesRequested: 0
          }
        });
      }
      if (url.includes("/estimate-design-revisions/")) {
        return new Response(new Blob(["image"], { type: "image/png" }));
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    const user = userEvent.setup();
    renderApp(["/client"]);
    const card = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Aurora Villa/ }));

    const misc = await within(card).findByRole("region", {
      name: "Miscellaneous drawings"
    });
    expect(misc).toHaveTextContent(
      "These drawings were submitted without an estimate-item assignment."
    );
  });

  it("restores a saved annotation draft after the estimate workspace remounts and submits one marked change request independently", async () => {
    let currentRevisions = revisions.map((item) => {
      if (item.id === "revision-living") {
        return {
          ...item,
          crop: { x: 100, y: 50, width: 400, height: 300 }
        };
      }
      return item.id === "revision-electrical"
        ? revision(
            "revision-electrical",
            "drawing-electrical",
            "Bedroom electrical",
            "room-bedroom",
            "EL",
            "submitted"
          )
        : item;
    });
    const requests: Array<{ url: string; body?: unknown }> = [];
    let savedDraft: AnnotationDocumentV1 | null = null;
    let draftVersion = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const common = commonResponse(url);
      if (common) return common;
      if (url.endsWith("/api/v1/client/estimates")) {
        return json([estimate("estimate-a", "Aurora Villa")]);
      }
      if (url.endsWith("/api/v1/client/estimates/estimate-a/design-drawings")) {
        const approved = currentRevisions.filter((item) => item.reviewStatus === "approved").length;
        const changesRequested = currentRevisions.filter(
          (item) => item.reviewStatus === "changes_requested"
        ).length;
        return json(workspace(currentRevisions.map((item) =>
          item.id === "revision-living"
            ? {
                ...item,
                annotationDraft: savedDraft
                  ? {
                      id: "draft-revision-living",
                      revisionId: "revision-living",
                      version: draftVersion,
                      annotations: savedDraft
                    }
                  : null
              }
            : item
        ), {
          ready: approved === currentRevisions.length,
          total: currentRevisions.length,
          approved,
          awaitingReview: currentRevisions.length - approved - changesRequested,
          changesRequested
        }));
      }
      if (url.includes("/api/v1/estimate-design-revisions/") && url.endsWith("/image")) {
        return new Response(new Blob(["image"], { type: "image/png" }));
      }
      if (url.endsWith("/api/v1/client/estimate-design-revisions/revision-living/annotation-draft")) {
        const body = JSON.parse(String(init?.body));
        expect(body.version).toBe(draftVersion);
        requests.push({ url, body });
        savedDraft = body.annotations;
        draftVersion += 1;
        return json({
          id: "draft-revision-living",
          revisionId: "revision-living",
          version: draftVersion,
          annotations: savedDraft
        });
      }
      if (url.endsWith("/api/v1/client/estimate-design-revisions/revision-living/decision")) {
        const body = JSON.parse(String(init?.body));
        requests.push({ url, body });
        currentRevisions = currentRevisions.map((item) =>
          item.id === "revision-living"
            ? {
                ...item,
                reviewStatus: "changes_requested" as const,
                changeSummary: body.summary,
                annotations: body.annotations
              }
            : item
        );
        return json(currentRevisions.find((item) => item.id === "revision-living"));
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp(["/client"]);
    const card = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Aurora Villa/ }));
    const livingRow = await within(card).findByRole("article", {
      name: "Living ceiling drawing"
    });
    const electricalRow = within(card).getByRole("article", {
      name: "Bedroom electrical drawing"
    });
    await user.click(within(livingRow).getByRole("button", {
      name: "Preview Living ceiling"
    }));
    await addTextNote();
    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(requests[0]?.body).toEqual({
      version: 0,
      annotations: expect.objectContaining({
        schemaVersion: 1,
        imageWidth: 400,
        imageHeight: 300,
        elements: [expect.objectContaining({ type: "text", text: "Shift this door" })]
      })
    }));
    expect(within(livingRow).getByText("Awaiting client review")).toBeVisible();
    expect(within(electricalRow).getByText("Awaiting client review")).toBeVisible();

    await user.click(within(screen.getByRole("dialog", {
      name: "Living ceiling preview"
    })).getByRole("button", {
      name: "Close Living ceiling preview"
    }));
    await user.click(within(card).getByRole("button", { name: /Aurora Villa/ }));
    await user.click(within(card).getByRole("button", { name: /Aurora Villa/ }));

    const restoredLivingRow = await within(card).findByRole("article", {
      name: "Living ceiling drawing"
    });
    const restoredElectricalRow = within(card).getByRole("article", {
      name: "Bedroom electrical drawing"
    });
    await user.click(within(restoredLivingRow).getByRole("button", {
      name: "Preview Living ceiling"
    }));
    await waitForCanvas();
    expect(within(screen.getByRole("dialog", {
      name: "Living ceiling preview"
    })).getByText("Shift this door")).toBeVisible();

    await addTextNote();
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(requests[1]?.body).toEqual({
      version: 1,
      annotations: expect.objectContaining({
        elements: [
          expect.objectContaining({ type: "text", text: "Shift this door" }),
          expect.objectContaining({ type: "text", text: "Shift this door" })
        ]
      })
    }));

    await user.type(screen.getByLabelText("Change summary"), "Shift the door left.");
    await user.click(screen.getByRole("button", { name: "Submit change request" }));

    await waitFor(() => expect(requests[2]?.body).toEqual({
      version: 1,
      decision: "request_changes",
      summary: "Shift the door left.",
      annotations: expect.objectContaining({
        imageWidth: 400,
        imageHeight: 300,
        elements: [
          expect.objectContaining({ type: "text", text: "Shift this door" }),
          expect.objectContaining({ type: "text", text: "Shift this door" })
        ]
      })
    }));
    expect(await within(card).findByText("Changes requested")).toBeVisible();
    expect(within(restoredElectricalRow).getByText("Awaiting client review")).toBeVisible();
  });

  it("keeps an in-flight drawing approval scoped to its own row", async () => {
    let resolveApproval: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const common = commonResponse(url);
      if (common) return common;
      if (url.endsWith("/api/v1/client/estimates")) {
        return json([estimate("estimate-a", "Aurora Villa")]);
      }
      if (url.endsWith("/api/v1/client/estimates/estimate-a/design-drawings")) {
        return json(workspace());
      }
      if (url.includes("/api/v1/estimate-design-revisions/") && url.endsWith("/image")) {
        return new Response(new Blob(["image"], { type: "image/png" }));
      }
      if (
        url.endsWith("/api/v1/client/estimate-design-revisions/revision-living/decision") &&
        init?.method === "POST"
      ) {
        return new Promise<Response>((resolve) => {
          resolveApproval = resolve;
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp(["/client"]);
    const card = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Aurora Villa/ }));
    const livingRow = await within(card).findByRole("article", {
      name: "Living ceiling drawing"
    });
    const electricalRow = within(card).getByRole("article", {
      name: "Bedroom electrical drawing"
    });
    await user.click(within(livingRow).getByRole("button", {
      name: "Approve Living ceiling"
    }));

    expect(within(livingRow).getByRole("button", {
      name: "Approving Living ceiling"
    })).toBeDisabled();
    expect(within(electricalRow).getByRole("button", {
      name: "Review changes for Bedroom electrical"
    })).toBeEnabled();

    resolveApproval?.(json(revisions[0]));
  });

  it("uses backend readiness for final approval and preserves a concurrent conflict", async () => {
    let workspaceReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const common = commonResponse(url);
      if (common) return common;
      if (url.endsWith("/api/v1/client/estimates")) {
        return json([estimate("estimate-a", "Aurora Villa")]);
      }
      if (url.endsWith("/api/v1/client/estimates/estimate-a/design-drawings")) {
        workspaceReads += 1;
        return json(workspace(revisions.map((item) => ({
          ...item,
          reviewStatus: "approved" as const
        })), workspaceReads === 1 ? {
          ready: true,
          total: 3,
          approved: 3,
          awaitingReview: 0,
          changesRequested: 0
        } : {
          ready: false,
          total: 3,
          approved: 2,
          awaitingReview: 1,
          changesRequested: 0
        }));
      }
      if (
        url.endsWith("/api/v1/client/estimates/estimate-a/decision") &&
        init?.method === "POST"
      ) {
        return Response.json({
          error: {
            code: "ESTIMATE_DRAWINGS_UNRESOLVED",
            message: "Every submitted drawing must be approved before approving the estimate."
          }
        }, { status: 409 });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp(["/client"]);
    const card = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Aurora Villa/ }));
    const approve = await within(card).findByRole("button", {
      name: "Approve estimate"
    });
    expect(approve).toBeEnabled();
    expect(within(card).getByText("3 of 3 drawings approved.")).toBeVisible();

    await user.click(approve);

    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "Every submitted drawing must be approved before approving the estimate."
    );
    await waitFor(() => expect(approve).toBeDisabled());
    const explanationId = approve.getAttribute("aria-describedby");
    expect(explanationId).toBeTruthy();
    expect(document.getElementById(explanationId!)).toHaveTextContent(
      "1 drawing unresolved: 1 awaiting review."
    );
  });
});
