import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ClientVendorWorkReview } from "./ClientVendorWorkReview";

const review = (id: string, imageIds: string[] = []) => ({
  id, projectId: "project-a", assignmentId: `assignment-${id}`, round: 1, status: "pending" as const,
  version: 3, roomName: id === "joinery" ? "Living room" : "Kitchen", itemName: id === "joinery" ? "TV unit" : "Floor finish",
  scopeType: "execution", description: "Complete the approved section", sectionLabel: "Carpentry", note: "Ready for review", progress: 100,
  submittedAt: "2026-10-01T08:00:00.000Z", imageIds, decision: null
});

describe("ClientVendorWorkReview", () => {
  it("shows each section's images beside that section and requests actionable changes", async () => {
    const decisions: Array<Record<string, unknown>> = [];
    const imageFetch = vi.fn(() => new HttpResponse(new Blob(["image"], { type: "image/png" }), { headers: { "Content-Type": "image/png" } }));
    server.use(
      http.get("/api/v1/clients/projects/project-a/vendor-work-reviews", () => HttpResponse.json({ data: { items: [review("joinery", ["image-one"]), review("floor")], total: 2 } })),
      http.get("/api/v1/projects/project-a/vendor-work/assignment-joinery/images/image-one", imageFetch),
      http.post("/api/v1/clients/projects/project-a/vendor-work-reviews/joinery/decision", async ({ request }) => {
        decisions.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json({ data: { ...review("joinery"), status: "changes_requested" } });
      })
    );
    const original = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:work-image");
    URL.revokeObjectURL = vi.fn();
    try {
      renderWithQuery(<ClientVendorWorkReview projectId="project-a" />);
      const joinery = await screen.findByRole("heading", { name: "TV unit" });
      const section = joinery.closest("article")!;
      expect(within(section).getByRole("button", { name: "View images (1)" })).toBeVisible();
      expect(within(screen.getByRole("heading", { name: "Floor finish" }).closest("article")!).getByText("No images supplied for this section")).toBeVisible();
      await userEvent.click(within(section).getByRole("button", { name: "View images (1)" }));
      expect(await screen.findByRole("img", { name: "Work evidence 1" })).toBeVisible();
      expect(imageFetch).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole("button", { name: "Close images" }));
      await userEvent.click(within(section).getByRole("button", { name: "Request changes" }));
      expect(screen.getByRole("button", { name: "Send changes to vendor" })).toBeDisabled();
      await userEvent.type(screen.getByRole("textbox", { name: "Describe the changes needed" }), "Align the upper shelf with the approved drawing.");
      await userEvent.click(screen.getByRole("button", { name: "Send changes to vendor" }));
      await waitFor(() => expect(decisions).toHaveLength(1));
      expect(decisions[0]).toEqual(expect.objectContaining({ expectedVersion: 3, decision: "request_changes", reason: "Align the upper shelf with the approved drawing." }));
      expect(String(decisions[0].idempotencyKey).length).toBeGreaterThan(8);
    } finally {
      URL.createObjectURL = original;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("approves the exact pending section with its recorded version", async () => {
    const decision = vi.fn(async ({ request }: { request: Request }) => {
      const body = await request.json();
      return HttpResponse.json({ data: { ...review("joinery"), status: "approved" }, body });
    });
    server.use(
      http.get("/api/v1/clients/projects/project-a/vendor-work-reviews", () => HttpResponse.json({ data: { items: [review("joinery")], total: 1 } })),
      http.post("/api/v1/clients/projects/project-a/vendor-work-reviews/joinery/decision", decision)
    );
    renderWithQuery(<ClientVendorWorkReview projectId="project-a" />);
    await userEvent.click(await screen.findByRole("button", { name: "Approve section" }));
    await waitFor(() => expect(decision).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Work approved. The project team can see your decision.")).toBeVisible();
  });

  it("shows an older pending section and lets the Client reach later review history", async () => {
    const offsets: string[] = [];
    const pending = Array.from({ length: 50 }, (_, index) => ({ ...review(`pending-${index}`), itemName: `Pending section ${index}` }));
    const history = { ...review("history"), status: "approved" as const, itemName: "Earlier approved section" };
    server.use(http.get("/api/v1/clients/projects/project-a/vendor-work-reviews", ({ request }) => {
      const offset = new URL(request.url).searchParams.get("offset") ?? "";
      offsets.push(offset);
      return HttpResponse.json({ data: { items: offset === "0" ? pending : [history], total: 51, pendingTotal: 50, limit: 50, offset: Number(offset) } });
    }));
    renderWithQuery(<ClientVendorWorkReview projectId="project-a" />);
    expect(await screen.findByRole("heading", { name: "Pending section 0" })).toBeVisible();
    expect(screen.getByText("50 awaiting you")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Next reviews" }));
    expect(await screen.findByRole("heading", { name: "Earlier approved section" })).toBeVisible();
    expect(offsets).toEqual(["0", "50"]);
    expect(screen.getByText("50 awaiting you")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Previous reviews" }));
    expect(await screen.findByRole("heading", { name: "Pending section 0" })).toBeVisible();
  });
});
