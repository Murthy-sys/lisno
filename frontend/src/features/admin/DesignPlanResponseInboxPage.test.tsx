import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import type { DesignPlanReviewTask } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { DesignPlanResponseInboxPage } from "./DesignPlanResponseInboxPage";

const pendingReview: DesignPlanReviewTask = {
  id: "design-round-1",
  estimateId: "estimate-1",
  projectId: "project-1",
  projectName: "Aurora Villa",
  clientName: "Priya Shah",
  designPlanVersion: 2,
  status: "pending",
  deliveryStatus: "sent",
  submittedAt: "2026-08-25T08:15:00.000Z",
  version: 4,
  attachmentNames: ["ground-floor-plan.pdf"]
};

describe("DesignPlanResponseInboxPage", () => {
  it("submits the Admin-on-behalf design approval as multipart proof", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    let listRequests = 0;
    let submitted: FormData | undefined;
    let decisionPath = "";
    const getBlob = vi.spyOn(apiClient, "getBlob").mockImplementation(
      () => new Promise(() => undefined)
    );
    vi.spyOn(apiClient, "postMultipart").mockImplementation(
      async function <T>(path: string, body: FormData): Promise<T> {
        decisionPath = path;
        submitted = body;
        return { ...pendingReview, status: "approved" } as T;
      }
    );
    server.use(
      http.get("/api/v1/admin/design-plan-response-tasks", ({ request }) => {
        expect(new URL(request.url).search).toBe("?status=pending");
        listRequests += 1;
        return HttpResponse.json({ data: listRequests === 1 ? [pendingReview] : [] });
      })
    );
    const user = userEvent.setup();

    renderWithQuery(<DesignPlanResponseInboxPage />);

    expect(await screen.findByRole("heading", { name: "Aurora Villa" })).toBeVisible();
    expect(screen.getByText("Email sent")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry email" })).not.toBeInTheDocument();
    expect(
      screen.getByText("ground-floor-plan.pdf", { selector: "span" })
    ).toBeVisible();
    const download = screen.getByRole("button", {
      name: "Download ground-floor-plan.pdf"
    });
    expect(download).toBeVisible();
    await user.click(download);
    expect(getBlob).toHaveBeenCalledWith(
      "/admin/design-plan-response-tasks/design-round-1/attachments/0"
    );

    const proof = new File(["client approved"], "client-approval.pdf", {
      type: "application/pdf"
    });
    const proofInput = screen.getByLabelText("Client decision proof") as HTMLInputElement;
    await user.upload(proofInput, proof);
    expect(proofInput.files).toHaveLength(1);
    fireEvent.submit(
      screen.getByRole("button", { name: "Approve with proof" }).closest("form")!
    );

    await waitFor(() => expect(submitted).toBeDefined());
    expect(decisionPath).toBe(
      "/admin/design-plan-response-tasks/design-round-1/decision"
    );
    expect(submitted?.get("expectedVersion")).toBe("4");
    expect(submitted?.get("decision")).toBe("approve");
    expect(submitted?.get("note")).toBe("");
    expect((submitted?.get("proof") as File).name).toBe("client-approval.pdf");
    expect(
      await screen.findByText("No design plans are awaiting a Client response.")
    ).toBeVisible();
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-projects"] });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["project-finance", "projects"]
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["project-finance", "bucket", "project-1"]
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["project-finance", "entries", "project-1"]
      });
    });
  });

  it("retries a failed Design email with the displayed version and refreshes its status", async () => {
    const failedReview: DesignPlanReviewTask = {
      ...pendingReview,
      deliveryStatus: "failed",
      version: 7
    };
    const sentReview: DesignPlanReviewTask = {
      ...failedReview,
      deliveryStatus: "sent",
      version: 10
    };
    let listRequests = 0;
    let retryPath = "";
    let retryBody: unknown;
    vi.spyOn(apiClient, "post").mockImplementation(
      async function <T>(path: string, body: unknown): Promise<T> {
        retryPath = path;
        retryBody = body;
        return sentReview as T;
      }
    );
    server.use(
      http.get("/api/v1/admin/design-plan-response-tasks", () => {
        listRequests += 1;
        return HttpResponse.json({
          data: [listRequests === 1 ? failedReview : sentReview]
        });
      })
    );
    const user = userEvent.setup();

    renderWithQuery(<DesignPlanResponseInboxPage />);

    expect(await screen.findByText("Email delivery failed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry email" }));

    await waitFor(() => expect(retryPath).toBe(
      "/admin/design-plan-response-tasks/design-round-1/email/retry"
    ));
    expect(retryBody).toEqual({ expectedVersion: 7 });
    expect(await screen.findByText("Email sent")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry email" })).not.toBeInTheDocument();
  });
});
