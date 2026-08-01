import { screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";

const response = (data: unknown) => Response.json({ data });

describe("LeadEstimateWorkspace", () => {
  it("keeps assignment and manual selectors limited to saved rooms and lines until saving local edits", async () => {
    let savedIncludesLocalEdits = false;
    const room = { id: "room-living", label: "Living Room", icon: "🛋️", typeId: "living", sqft: 200, length: null, width: null };
    const savedStudy = { id: "room-study", label: "Home Office/Study", icon: "💻", typeId: "study", sqft: 120, length: null, width: null };
    const baseEstimate = () => ({
      id: "estimate-1", propertyType: "2BHK", rooms: savedIncludesLocalEdits ? [room, savedStudy] : [room], scopes: ["FC", "CA"],
      lineItems: [
        { catalogueId: "FC01", roomName: "Living Room", specification: "Gypsum plain", unit: "sqft", rate: 95, quantity: 200, included: true },
        ...(savedIncludesLocalEdits ? [{ catalogueId: "CA01", roomName: "Living Room", specification: "BWR ply + lacquer paint", unit: "lot", rate: 32000, quantity: 1, included: true }] : [])
      ], subtotal: 0, gst: 0, total: 0, status: "draft", approvalRequired: false
    });
    const miscDrawing = { id: "drawing-misc", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1", active: true, verified: true, roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", detectedTitle: "TV UNIT", displayTitle: "TV UNIT", source: "ocr", roomConfidence: null, scopeConfidence: null, ocrConfidence: null, roomEvidence: [], scopeEvidence: [] };
    const miscRevision = { id: "revision-misc", drawingId: "drawing-misc", revisionNumber: 1, sourcePageId: "page-1", crop: { x: 0, y: 0, width: 400, height: 300 }, label: "TV UNIT", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", reviewStatus: "draft", submittedAt: null, reviewerId: null, reviewedAt: null, changeSummary: null, annotationLayerId: null, annotations: null, replacementUploadId: null, replacesRevisionId: null };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) return response({ id: "lead-1", clientName: "Asha Shah", projectName: "Asha home", location: "Pune", propertyType: "2BHK" });
      if (url.endsWith("/leads/lead-1/estimate") && init?.method === "PUT") {
        savedIncludesLocalEdits = true;
        return response(baseEstimate());
      }
      if (url.endsWith("/leads/lead-1/estimate")) return response(baseEstimate());
      if (url.endsWith("/estimates/estimate-1/design-uploads")) return response({
        uploads: [{ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "estimator_review", failureCode: null, failureMessage: null, canRetry: false }],
        pages: [{ id: "page-1", uploadId: "upload-1", pageNumber: 1, width: 800, height: 600 }], drawings: [miscDrawing], revisions: [miscRevision]
      });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}><Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes></MemoryRouter>);

    await screen.findByRole("heading", { name: "Upload design plans" });
    await user.click(screen.getByRole("button", { name: "⚙ Rooms" }));
    await user.click(screen.getByRole("button", { name: /Home Office\/Study/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection →" }));
    await user.click(screen.getByRole("checkbox", { name: /CA01/ }));

    await user.click(await screen.findByRole("button", { name: "More actions for TV UNIT" }));
    await user.click(screen.getByRole("menuitem", { name: "Assign estimate item" }));
    await user.selectOptions(screen.getByLabelText("Room"), "room-living");
    expect(screen.getByRole("option", { name: /FC01/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /CA01/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Home Office/Study" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Add missing drawing" }));
    const manual = screen.getByRole("dialog", { name: "Add missing drawing" });
    await user.selectOptions(within(manual).getByLabelText("Room"), "room-living");
    expect(within(manual).queryByRole("option", { name: /CA01/ })).not.toBeInTheDocument();
    expect(within(manual).queryByRole("option", { name: "Home Office/Study" })).not.toBeInTheDocument();
    await user.click(within(manual).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    await user.click(screen.getByRole("button", { name: "Add missing drawing" }));
    const savedManual = screen.getByRole("dialog", { name: "Add missing drawing" });
    await user.selectOptions(within(savedManual).getByLabelText("Room"), "room-living");
    expect(await within(savedManual).findByRole("option", { name: /CA01/ })).toBeVisible();
    expect(within(savedManual).getByRole("option", { name: "Home Office/Study" })).toBeVisible();
    await user.click(within(savedManual).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "More actions for TV UNIT" }));
    await user.click(screen.getByRole("menuitem", { name: "Assign estimate item" }));
    await user.selectOptions(screen.getByLabelText("Room"), "room-living");
    expect(screen.getByRole("option", { name: /CA01/ })).toBeVisible();
    expect(screen.getByRole("option", { name: "Home Office/Study" })).toBeVisible();
  });

  it("shows the design upload and review surface only after an estimate exists", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) {
        return response({ id: "lead-1", clientName: "Asha Shah", projectName: "Asha home", location: "Pune", propertyType: "2BHK" });
      }
      if (url.endsWith("/leads/lead-1/estimate")) {
        return response({ id: "estimate-1", propertyType: "2BHK", rooms: [{ id: "room-living", label: "Living Room", icon: "🛋️", typeId: "living", sqft: 200, length: null, width: null }], scopes: ["FC"], lineItems: [], subtotal: 0, gst: 0, total: 0, status: "draft", approvalRequired: false });
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) return response({ uploads: [], pages: [], drawings: [], revisions: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWithQuery(
      <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
        <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Upload design plans" })).toBeVisible();
  });
});
