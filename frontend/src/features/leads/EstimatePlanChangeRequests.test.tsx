import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../test/server";
import * as api from "./estimateDesignApi";
import { EstimatePlanChangeRequests } from "./EstimatePlanChangeRequests";

beforeEach(() => {
  vi.spyOn(api, "getEstimatePlanChangeRequests").mockResolvedValue([{ id: "request-1", estimateId: "estimate-1", uploadId: "upload-1", sourcePageId: "page-1", clientId: "client-1", version: 2, summary: "Lower the ceiling", status: "open", unassigned: false, targetCount: 1, targets: [{ drawingId: "drawing-a", status: "open" }], createdAt: "2026-08-03T10:00:00.000Z" }]);
  vi.spyOn(api, "getEstimatePlanChangeRequest").mockResolvedValue({ id: "request-1", sourcePageId: "page-1", version: 2, summary: "Lower the ceiling", annotations: { schemaVersion: 1, imageWidth: 1000, imageHeight: 800, elements: [] }, targets: [{ drawingId: "drawing-a", requestedRevisionId: "revision-a", status: "open", resolvedByRevisionId: null }], unassigned: false, status: "open", resolutionNote: null, currentImageUrl: "/estimate-plan-pages/page-1/current-image", drawingTargets: [{ drawingId: "drawing-a", title: "False Ceiling", latestRevisionId: "revision-a", latestRevisionNumber: 3, status: "open" }], drawingCandidates: [] } as never);
  vi.spyOn(api, "replaceEstimateDrawing").mockResolvedValue({} as never);
});

describe("EstimatePlanChangeRequests", () => {
  it("opens request detail and uploads a replacement only for its selected drawing", async () => {
    server.use(
      http.get("/api/v1/estimate-plan-pages/page-1/current-image", () =>
        new HttpResponse(new Blob(["current design page"], { type: "image/png" }), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimatePlanChangeRequests estimateId="estimate-1" /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Lower the ceiling/ }));
    expect(await screen.findByText("False Ceiling")).toBeVisible();
    const file = new File(["replacement"], "ceiling.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Replacement for False Ceiling"), file);
    await userEvent.click(screen.getByRole("button", { name: "Upload False Ceiling replacement" }));
    expect(api.replaceEstimateDrawing).toHaveBeenCalledWith("drawing-a", 3, file);
  });
});
