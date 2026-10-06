import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { VendorWorkProgressPanel } from "./VendorWorkProgressPanel";

describe("VendorWorkProgressPanel", () => {
  it("shows missing tender work details without changing specified details", async () => {
    const base = {
      projectId: "project-one", vendorId: "vendor-one", orderId: "order-one", sectionLabel: "Ceiling",
      roomName: "Living room", description: "Approved work", status: "ready", progress: 0,
      displayProgress: 0, progressSource: "vendor", note: "", imageCount: 0, imageIds: [],
      requestedChangeReason: null, submittedAt: null, acceptedAt: null
    };
    server.use(http.get("/api/v1/projects/project-one/vendor-work-progress", () => HttpResponse.json({ data: {
      projectId: "project-one", pendingOwner: "vendor", assignments: [
        { ...base, id: "missing", itemName: "POP ceiling", scopeType: null, targetDate: null },
        { ...base, id: "specified", itemName: "Gypsum cove", scopeType: "execution", targetDate: "2026-11-01" }
      ]
    } })));
    renderWithQuery(<VendorWorkProgressPanel projectId="project-one" />);
    const missing = (await screen.findByRole("heading", { name: "POP ceiling" })).closest("article")!;
    expect(within(missing).getAllByText("Not specified")).toHaveLength(2);
    const specified = screen.getByRole("heading", { name: "Gypsum cove" }).closest("article")!;
    expect(within(specified).getByText("execution")).toBeVisible();
    expect(within(specified).getByText("2026-11-01")).toBeVisible();
  });
});
