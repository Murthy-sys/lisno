import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnotationDocumentV1 } from "../../api/types";
import { tokenStorage } from "../../api/client";
import { EstimateDesignUploads } from "../leads/EstimateDesignUploads";
import { renderApp, renderWithQuery } from "../../test/render";


const stylesheet = readFileSync("src/styles/index.css", "utf8");
const rooms = [
  { id: "room-living", label: "Living Room" },
  { id: "room-bedroom", label: "Bedroom" },
];
const scopes = [
  { id: "FC", label: "False Ceiling" },
  { id: "FL", label: "Flooring" },
];
const page = {
  id: "page-1",
  uploadId: "upload-1",
  pageNumber: 1,
  width: 1_000,
  height: 800,
};
const emptyAnnotations: AnnotationDocumentV1 = {
  schemaVersion: 1,
  imageWidth: 1_000,
  imageHeight: 800,
  elements: [],
};
const requestedAnnotations: AnnotationDocumentV1 = {
  ...emptyAnnotations,
  elements: [{
    id: "door-note",
    type: "text",
    x: 0.25,
    y: 0.4,
    text: "Align with doorway",
    color: "#ef4444",
    strokeWidth: 2,
  }],
};

const livingDrawing = {
  id: "drawing-living",
  uploadId: "upload-1",
  sourcePageId: "page-1",
  estimateId: "estimate-journey",
  active: true,
  verified: true,
  roomId: "room-living",
  scopeSectionId: "FC",
  detectedTitle: "LIVING ROOM — FALSE-CEILING PLAN",
  displayTitle: "Living Room False Ceiling",
  source: "ocr" as const,
  roomConfidence: 1,
  scopeConfidence: 1,
  ocrConfidence: 0.99,
  roomEvidence: [{ value: "living room" }],
  scopeEvidence: [{ value: "false ceiling" }],
};
const bedroomDrawing = {
  ...livingDrawing,
  id: "drawing-bedroom",
  roomId: "room-bedroom",
  scopeSectionId: "FL",
  detectedTitle: "Bedroom Floorimg",
  displayTitle: "Bedroom Flooring",
  roomConfidence: 0.88,
  scopeConfidence: 0.88,
  ocrConfidence: 0.91,
  roomEvidence: [{ value: "bedroom" }],
  scopeEvidence: [{ value: "flooring" }],
};

function revision(
  id: string,
  drawingId: string,
  label: string,
  roomId: string,
  scopeSectionId: string,
  revisionNumber: number,
  reviewStatus: "submitted" | "approved" | "changes_requested" | "draft",
  changes: Partial<Record<string, unknown>> = {},
) {
  return {
    id,
    drawingId,
    revisionNumber,
    sourcePageId: "page-1",
    crop: { x: 0, y: 0, width: 1_000, height: 800 },
    roomId,
    scopeSectionId,
    label,
    reviewStatus,
    submittedAt: reviewStatus === "draft" ? null : "2026-07-30T12:00:00.000Z",
    reviewerId: reviewStatus === "approved" || reviewStatus === "changes_requested"
      ? "client-1"
      : null,
    reviewedAt: reviewStatus === "approved" || reviewStatus === "changes_requested"
      ? "2026-07-30T13:00:00.000Z"
      : null,
    changeSummary: null,
    annotationLayerId: null,
    annotations: null,
    replacementUploadId: null,
    replacesRevisionId: null,
    annotationDraft: null,
    ...changes,
  };
}

const livingApproved = revision(
  "revision-living",
  livingDrawing.id,
  livingDrawing.displayTitle,
  livingDrawing.roomId,
  livingDrawing.scopeSectionId,
  1,
  "approved",
);
const bedroomSubmitted = revision(
  "revision-bedroom-1",
  bedroomDrawing.id,
  bedroomDrawing.displayTitle,
  bedroomDrawing.roomId,
  bedroomDrawing.scopeSectionId,
  1,
  "submitted",
);
const bedroomRequested = {
  ...bedroomSubmitted,
  reviewStatus: "changes_requested" as const,
  reviewerId: "client-1",
  reviewedAt: "2026-07-30T13:00:00.000Z",
  changeSummary: "Align the flooring boundary with the doorway.",
  annotationLayerId: "layer-bedroom-1",
  annotations: requestedAnnotations,
};
const bedroomReplacement = revision(
  "revision-bedroom-2",
  bedroomDrawing.id,
  bedroomDrawing.displayTitle,
  bedroomDrawing.roomId,
  bedroomDrawing.scopeSectionId,
  2,
  "draft",
  { replacesRevisionId: bedroomRequested.id },
);
const bedroomApproved = {
  ...bedroomReplacement,
  reviewStatus: "approved" as const,
  submittedAt: "2026-07-30T14:00:00.000Z",
  reviewerId: "client-1",
  reviewedAt: "2026-07-30T15:00:00.000Z",
};

function upload(extractionStatus: string) {
  return {
    id: "upload-1",
    estimateId: "estimate-journey",
    leadId: "lead-journey",
    originalFilename: "estimate-review-sheet.png",
    mimeType: "image/png",
    sizeBytes: 12,
    uploaderId: "estimator-1",
    uploadedAt: "2026-07-30T12:00:00.000Z",
    extractionStatus,
    failureCode: null,
    failureMessage: null,
  };
}

function estimate(status: "sent_to_client" | "client_approved") {
  return {
    id: "estimate-journey",
    leadId: "lead-journey",
    propertyType: "Apartment",
    rooms,
    scopes: ["FC", "FL"],
    lineItems: [{
      catalogueId: "FC01",
      roomName: "Living Room",
      specification: "plain_gyp",
      unit: "sqft",
      rate: 95,
      quantity: 100,
      included: true,
    }],
    subtotal: 9_500,
    gst: 1_710,
    total: 11_210,
    status,
    approvalRequired: false,
    projectId: status === "client_approved" ? "project-journey" : null,
    lead: {
      _id: "lead-journey",
      clientName: "Journey Client",
      clientEmail: "client@lisno.example",
      projectName: "Estimate Drawing Journey",
      location: "Bengaluru",
    },
  };
}

function json(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}

function cssRule(selector: string) {
  const start = stylesheet.indexOf(selector);
  if (start < 0) throw new Error(`Missing CSS selector: ${selector}`);
  const opening = stylesheet.indexOf("{", start);
  const closing = stylesheet.indexOf("}", opening);
  return stylesheet.slice(opening + 1, closing);
}

beforeEach(() => {
  tokenStorage.set("client-token");
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:journey-drawing"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("estimate drawing review journey", () => {
  it("keeps placement, tools, immutable replacement history, and read-only approval in one journey", async () => {
    expect(cssRule(".estimate-drawing-row__thumbnail")).toMatch(
      /width:\s*40px;\s*height:\s*40px/,
    );
    expect(cssRule(".client-estimate-drawing__thumbnail")).toMatch(
      /width:\s*40px;\s*height:\s*40px/,
    );
    expect(stylesheet).toMatch(
      /\.annotation-toolbar\s*\{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;/,
    );

    let clientPhase: "submitted" | "requested" | "approved" = "submitted";
    const clientFetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/me")) {
          return json({
            id: "client-1",
            name: "Journey Client",
            email: "client@lisno.example",
            role: "client",
          });
        }
        if (url.includes("/api/v1/client/project-summaries?")) {
          return json({
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
          });
        }
        if (url.endsWith("/api/v1/client/latest-approved-versions")) return json([]);
        if (url.endsWith("/api/v1/client/estimates")) {
          return json([
            estimate(clientPhase === "approved" ? "client_approved" : "sent_to_client"),
          ]);
        }
        if (
          url.endsWith(
            "/api/v1/client/estimates/estimate-journey/design-drawings",
          )
        ) {
          const bedroom = clientPhase === "submitted"
            ? bedroomSubmitted
            : clientPhase === "requested"
              ? bedroomRequested
              : bedroomApproved;
          return json({
            uploads: [upload(clientPhase === "approved" ? "approved" : clientPhase)],
            pages: [page],
            drawings: [livingDrawing, bedroomDrawing],
            revisions: clientPhase === "approved"
              ? [livingApproved, bedroomRequested, bedroomApproved]
              : [livingApproved, bedroom],
            readiness: clientPhase === "approved"
              ? {
                  ready: true,
                  total: 2,
                  approved: 2,
                  awaitingReview: 0,
                  changesRequested: 0,
                }
              : {
                  ready: false,
                  total: 2,
                  approved: 1,
                  awaitingReview: clientPhase === "submitted" ? 1 : 0,
                  changesRequested: clientPhase === "requested" ? 1 : 0,
                },
          });
        }
        if (
          url.includes("/api/v1/estimate-design-revisions/") &&
          url.endsWith("/image")
        ) {
          return new Response(new Blob(["drawing"], { type: "image/png" }));
        }
        if (
          url.endsWith(
            "/api/v1/client/estimate-design-revisions/revision-bedroom-1/decision",
          ) &&
          init?.method === "POST"
        ) {
          const body = JSON.parse(String(init.body));
          expect(body).toEqual({
            version: 1,
            decision: "request_changes",
            summary: "Align the flooring boundary with the doorway.",
            annotations: expect.objectContaining({
              elements: [
                expect.objectContaining({
                  type: "text",
                  text: "Align with doorway",
                }),
              ],
            }),
          });
          clientPhase = "requested";
          return json(bedroomRequested);
        }
        throw new Error(`Unhandled client request: ${url}`);
      },
    );
    const user = userEvent.setup();
    const initialClient = renderApp(["/client"]);
    const card = (await screen.findByRole("heading", {
      name: "Estimate Drawing Journey",
      level: 3,
    })).closest("article")!;
    await user.click(
      within(card).getByRole("button", { name: /Estimate Drawing Journey/ }),
    );

    const livingGroup = await within(card).findByRole("region", {
      name: "Living Room, False Ceiling drawings",
    });
    const bedroomGroup = within(card).getByRole("region", {
      name: "Bedroom, Flooring drawings",
    });
    expect(within(livingGroup).getByRole("article", {
      name: "Living Room False Ceiling drawing",
    })).toBeVisible();
    expect(within(bedroomGroup).getByRole("article", {
      name: "Bedroom Flooring drawing",
    })).toBeVisible();
    expect(within(livingGroup).getByRole("img", {
      name: "Living Room False Ceiling thumbnail",
    })).toHaveClass("client-estimate-drawing__thumbnail");

    await user.click(within(bedroomGroup).getByRole("button", {
      name: "Preview Bedroom Flooring",
    }));
    await waitFor(() =>
      expect(document.querySelector("svg image")).toHaveAttribute(
        "href",
        "blob:journey-drawing",
      ),
    );
    const tools = screen.getByRole("toolbar", { name: "Annotation tools" });
    for (const tool of [
      "Select",
      "Rectangle",
      "Ellipse",
      "Arrow",
      "Freehand",
      "Text",
      "Undo",
      "Redo",
      "Delete selected",
    ]) {
      expect(within(tools).getByRole("button", { name: tool })).toBeVisible();
    }
    expect(screen.getByRole("toolbar", { name: "Zoom and pan" })).toBeVisible();

    const canvas = screen.getByRole("img", {
      name: "Drawing annotation canvas",
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 1_000,
      height: 800,
      right: 1_000,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    await user.click(within(tools).getByRole("button", { name: "Text" }));
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      clientX: 250,
      clientY: 320,
    });
    const noteDialog = screen.getByRole("dialog", { name: "Add text note" });
    await user.type(
      within(noteDialog).getByLabelText("Text note"),
      "Align with doorway",
    );
    await user.click(
      within(noteDialog).getByRole("button", { name: "Add note" }),
    );
    await user.type(
      screen.getByLabelText("Change summary"),
      "Align the flooring boundary with the doorway.",
    );
    await user.click(
      screen.getByRole("button", { name: "Submit change request" }),
    );
    expect(
      await within(card).findByText("Changes requested"),
    ).toBeVisible();
    initialClient.unmount();
    clientFetch.mockRestore();

    let replaced = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (
        url.endsWith(
          "/api/v1/estimate-design-drawings/drawing-bedroom/replacement",
        ) &&
        init?.method === "POST"
      ) {
        const body = init.body as FormData;
        expect(body.get("version")).toBe("1");
        expect((body.get("file") as File).name).toBe("bedroom-flooring-v2.png");
        replaced = true;
        return json({
          ...bedroomDrawing,
          verified: false,
          revision: bedroomReplacement,
        }, 201);
      }
      if (
        url.endsWith("/api/v1/estimates/estimate-journey/design-uploads")
      ) {
        return json({
          uploads: [upload(replaced ? "estimator_review" : "changes_requested")],
          pages: [page],
          drawings: [{ ...bedroomDrawing, verified: !replaced }],
          revisions: replaced
            ? [bedroomRequested, bedroomReplacement]
            : [bedroomRequested],
        });
      }
      if (
        url.includes("/api/v1/estimate-design-revisions/") &&
        url.endsWith("/image")
      ) {
        return new Response(new Blob(["drawing"], { type: "image/png" }));
      }
      throw new Error(`Unhandled estimator request: ${url}`);
    });
    const estimator = renderWithQuery(
      <EstimateDesignUploads
        estimateId="estimate-journey"
        rooms={rooms}
        scopes={scopes}
      />,
    );
    const requestedRow = await screen.findByRole("article", {
      name: "Bedroom Flooring drawing",
    });
    expect(within(requestedRow).getByText(
      "Align the flooring boundary with the doorway.",
    )).toBeVisible();
    await user.click(within(requestedRow).getByRole("button", {
      name: "More actions for Bedroom Flooring",
    }));
    await user.click(screen.getByRole("menuitem", {
      name: "Upload replacement",
    }));
    await user.upload(
      screen.getByLabelText("Replacement drawing file"),
      new File(["replacement"], "bedroom-flooring-v2.png", {
        type: "image/png",
      }),
    );
    await user.click(screen.getByRole("button", {
      name: "Upload replacement",
    }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Revision 2 awaits verification.",
    );
    const replacementRow = await screen.findByRole("article", {
      name: "Bedroom Flooring drawing",
    });
    await user.click(within(replacementRow).getByRole("button", {
      name: "More actions for Bedroom Flooring",
    }));
    await user.click(screen.getByRole("menuitem", { name: "History" }));
    const history = screen.getByRole("dialog", { name: "Drawing history" });
    expect(within(history).getByText(/Revision 2 · draft/)).toBeVisible();
    expect(
      within(history).getByText(/Revision 1 · changes requested/),
    ).toBeVisible();
    expect(within(history).getByText(
      "Align the flooring boundary with the doorway.",
    )).toBeVisible();
    estimator.unmount();
    vi.restoreAllMocks();

    clientPhase = "approved";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) {
        return json({
          id: "client-1",
          name: "Journey Client",
          email: "client@lisno.example",
          role: "client",
        });
      }
      if (url.includes("/api/v1/client/project-summaries?")) {
        return json({
          items: [],
          pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
        });
      }
      if (url.endsWith("/api/v1/client/latest-approved-versions")) return json([]);
      if (url.endsWith("/api/v1/client/estimates")) {
        return json([estimate("client_approved")]);
      }
      if (
        url.endsWith(
          "/api/v1/client/estimates/estimate-journey/design-drawings",
        )
      ) {
        return json({
          uploads: [upload("approved")],
          pages: [page],
          drawings: [livingDrawing, bedroomDrawing],
          revisions: [livingApproved, bedroomRequested, bedroomApproved],
          readiness: {
            ready: true,
            total: 2,
            approved: 2,
            awaitingReview: 0,
            changesRequested: 0,
          },
        });
      }
      if (
        url.includes("/api/v1/estimate-design-revisions/") &&
        url.endsWith("/image")
      ) {
        return new Response(new Blob(["drawing"], { type: "image/png" }));
      }
      throw new Error(`Unhandled approved request: ${url}`);
    });
    renderApp(["/client"]);
    const approvedCard = (await screen.findByRole("heading", {
      name: "Estimate Drawing Journey",
      level: 3,
    })).closest("article")!;
    await user.click(within(approvedCard).getByRole("button", {
      name: /Estimate Drawing Journey/,
    }));
    const approvedBedroom = await within(approvedCard).findByRole("article", {
      name: "Bedroom Flooring drawing",
    });
    expect(within(approvedBedroom).getByText("Approved")).toBeVisible();
    await user.click(within(approvedBedroom).getByRole("button", {
      name: "Preview Bedroom Flooring",
    }));
    await waitFor(() =>
      expect(document.querySelector("svg image")).toHaveAttribute(
        "href",
        "blob:journey-drawing",
      ),
    );
    expect(
      screen.queryByRole("toolbar", { name: "Annotation tools" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save draft" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit change request" }),
    ).not.toBeInTheDocument();
  });
});
