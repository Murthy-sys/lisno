import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";

const response = (data: unknown) => Response.json({ data });

describe("LeadEstimateWorkspace", () => {
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
