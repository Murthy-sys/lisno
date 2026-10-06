import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ClientSiteCompletionReview } from "./ClientSiteCompletionReview";

const pending = () => ({
  projectId: "project-a", projectStatus: "active", version: 2, progress: 100, note: "Completed on site",
  status: "pending_client", currentRound: 1, canSubmit: false, blockers: ["Completion is awaiting Client review."],
  review: { id: "site-review-a", projectId: "project-a", round: 1, version: 1, status: "pending",
    progress: 100, note: "Completed on site", submittedAt: "2026-10-01T10:00:00.000Z",
    sections: [{ assignmentId: "work-a", sourceSectionId: "CA", sectionLabel: "Carpentry",
      roomName: "Living room", itemName: "Cabinet", scopeType: "execution", imageIds: ["image-a"] }],
    decision: null }
});

describe("ClientSiteCompletionReview", () => {
  it("shows an unspecified scope in a completion review", async () => {
    const current = pending();
    server.use(http.get("/api/v1/clients/projects/project-a/site-completion", () => HttpResponse.json({
      data: { ...current, review: { ...current.review, sections: [{ ...current.review.sections[0], scopeType: null }] } }
    })));
    renderWithQuery(<ClientSiteCompletionReview projectId="project-a" />);
    expect(await screen.findByText("Not specified")).toBeVisible();
  });

  it("enables Client acceptance after Site Manager submission and closes the review after acceptance", async () => {
    let current = pending();
    const decisions: Array<Record<string, unknown>> = [];
    server.use(
      http.get("/api/v1/clients/projects/project-a/site-completion", () => HttpResponse.json({ data: current })),
      http.post("/api/v1/clients/projects/project-a/site-completion/decision", async ({ request }) => {
        decisions.push(await request.json() as Record<string, unknown>);
        current = { ...current, status: "client_approved", review: { ...current.review, status: "approved" } };
        return HttpResponse.json({ data: current });
      })
    );
    renderWithQuery(<ClientSiteCompletionReview projectId="project-a" />);
    expect(await screen.findByRole("heading", { name: "Project completion review" })).toBeVisible();
    expect(screen.getByRole("button", { name: "View images (1)" })).toBeVisible();
    const accept = screen.getByRole("button", { name: "Accept completion" });
    expect(accept).toBeEnabled();
    await userEvent.click(accept);
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toMatchObject({ expectedVersion: 1, decision: "approve", reason: null });
    expect(await screen.findByText("You accepted this completion. Super Admin will close the project.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Accept completion" })).not.toBeInTheDocument();
  });

  it("requires a reason before sending requested changes", async () => {
    const decisions: Array<Record<string, unknown>> = [];
    server.use(
      http.get("/api/v1/clients/projects/project-a/site-completion", () => HttpResponse.json({ data: pending() })),
      http.post("/api/v1/clients/projects/project-a/site-completion/decision", async ({ request }) => {
        decisions.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json({ data: { ...pending(), status: "changes_requested" } });
      })
    );
    renderWithQuery(<ClientSiteCompletionReview projectId="project-a" />);
    await userEvent.click(await screen.findByRole("button", { name: "Request changes" }));
    const send = screen.getByRole("button", { name: "Send changes to Site Manager" });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Describe the changes needed" }), "Repair the edge trim");
    await userEvent.click(send);
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toMatchObject({ decision: "request_changes", reason: "Repair the edge trim" });
  });
});
