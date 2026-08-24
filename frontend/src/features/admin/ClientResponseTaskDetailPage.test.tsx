import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { tokenStorage } from "../../api/client";
import type { PermissionCode } from "../../api/authorization-contract";
import type { EstimateClientResponseTaskDetail } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const pendingDetail: EstimateClientResponseTaskDetail = {
  id: "round-1",
  version: 3,
  sendGeneration: 2,
  project: { id: "project-1", name: "Aurora Villa" },
  client: { name: "Priya Shah", email: "priya@example.com" },
  estimate: { id: "estimate-1", version: 4, total: 1416 },
  assignedAdmin: { id: "admin-1", name: "Meera Admin" },
  deliveryStatus: "sent",
  deliveryAttemptCount: 1,
  deliveryAttemptedAt: "2026-08-23T10:00:01.000Z",
  deliveredAt: "2026-08-23T10:00:02.000Z",
  status: "pending",
  decision: null,
  proofAvailable: false,
  createdAt: "2026-08-23T10:00:00.000Z",
  estimateSnapshot: {
    clientName: "Priya Shah",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "Villa",
    lineItems: [
      {
        catalogueId: "FC01",
        roomName: "Living Room",
        specification: "Premium finish",
        unit: "sqft",
        rate: 120,
        quantity: 10,
        included: true,
        amount: 1200
      },
      {
        catalogueId: "EL02",
        roomName: "Kitchen",
        specification: "Pendant lights",
        unit: "each",
        rate: 600,
        quantity: 2,
        included: false,
        amount: 1200
      }
    ],
    subtotal: 1200,
    gst: 216,
    total: 1416
  },
  pdf: {
    filename: "estimate-v4.pdf",
    mimeType: "application/pdf",
    byteSize: 2048,
    sha256: "a".repeat(64)
  },
  decisionSource: null,
  decisionNote: null,
  decidedAt: null
};

function installAdmin(
  permissions: readonly PermissionCode[] = [
    "identity.self.read",
    "identity.authorization.read",
    "estimation.client_response_tasks.read",
    "estimation.client_response_tasks.decide",
    "estimation.client_response_proof.read"
  ]
) {
  tokenStorage.set("admin-client-response-detail-token");
  server.use(
    http.get("/api/v1/auth/me", () =>
      HttpResponse.json({
        data: {
          id: "admin-1",
          name: "Meera Admin",
          email: "meera@lisno.example",
          role: "admin"
        }
      })
    ),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({ data: authorizationFor("admin", permissions) })
    )
  );
}

describe("ClientResponseTaskDetailPage", () => {
  it("renders only the immutable snapshot line items and totals", async () => {
    installAdmin();
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks/round-1", () =>
        HttpResponse.json({ data: pendingDetail })
      )
    );

    renderApp(["/admin/client-responses/round-1"]);
    expect(await screen.findByRole("heading", { name: "Priya Shah response" })).toBeVisible();
    const estimate = screen.getByRole("region", { name: "Immutable estimate snapshot" });
    expect(within(estimate).getByText("Aurora Villa")).toBeVisible();
    expect(within(estimate).getByText("Living Room")).toBeVisible();
    expect(within(estimate).getByText("Premium finish")).toBeVisible();
    expect(within(estimate).getAllByText("₹1,200")).toHaveLength(3);
    expect(within(estimate).getByText("₹216")).toBeVisible();
    expect(within(estimate).getByText("₹1,416")).toBeVisible();
    expect(within(estimate).getByText("Not included")).toBeVisible();
    expect(within(estimate).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(estimate).queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("offers exact PDF and pending decision controls, with proof only when available", async () => {
    installAdmin();
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks/round-1", () =>
        HttpResponse.json({ data: pendingDetail })
      )
    );

    renderApp(["/admin/client-responses/round-1"]);
    expect(await screen.findByRole("button", { name: "Download exact estimate PDF" })).toBeVisible();
    expect(screen.getByText("estimate-v4.pdf")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reject" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Download decision proof" })).not.toBeInTheDocument();
  });

  it("keeps an open decision pinned to its selected task version after a pending refetch", async () => {
    installAdmin();
    let detailRequests = 0;
    let decisionPosts = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks/round-1", async () => {
        detailRequests += 1;
        if (detailRequests === 1) {
          return HttpResponse.json({ data: pendingDetail });
        }
        await refreshGate;
        return HttpResponse.json({
          data: {
            ...pendingDetail,
            version: 4,
            deliveryAttemptCount: 2
          }
        });
      }),
      http.post(
        "/api/v1/admin/estimate-client-response-tasks/round-1/decision",
        () => {
          decisionPosts += 1;
          return HttpResponse.json({ data: {} });
        }
      )
    );
    const user = userEvent.setup();
    const { queryClient } = renderApp(["/admin/client-responses/round-1"]);

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("dialog", { name: "Approve Client response" });
    await user.upload(
      within(dialog).getByLabelText("Decision proof"),
      new File(["proof"], "proof.pdf", { type: "application/pdf" })
    );

    let refresh: Promise<void> | undefined;
    act(() => {
      refresh = queryClient.invalidateQueries({
        queryKey: ["estimate-client-responses", "detail", "round-1"]
      });
    });
    await waitFor(() => expect(detailRequests).toBe(2));
    expect(within(dialog).getByRole("button", { name: "Approve" })).toBeEnabled();

    await act(async () => {
      releaseRefresh();
      await refresh;
    });
    await waitFor(() =>
      expect(screen.getByText("Delivery attempts").parentElement).toHaveTextContent(
        "Delivery attempts2"
      )
    );

    expect(within(dialog).getByText("Task version").parentElement).toHaveTextContent(
      "Task version3"
    );
    expect(
      within(dialog).getByText("This task is no longer pending in the current inbox view.")
    ).toBeVisible();
    const approve = within(dialog).getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    await user.click(approve);
    expect(decisionPosts).toBe(0);
  });

  it("renders a terminal task read-only with its persisted decision and proof", async () => {
    installAdmin();
    const terminal: EstimateClientResponseTaskDetail = {
      ...pendingDetail,
      version: 4,
      status: "changes_requested",
      decision: "request_changes",
      proofAvailable: true,
      decisionSource: "admin_proof",
      decisionNote: "Please revise the kitchen finish.",
      decidedAt: "2026-08-24T08:30:00.000Z"
    };
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks/round-1", () =>
        HttpResponse.json({ data: terminal })
      )
    );

    renderApp(["/admin/client-responses/round-1"]);
    expect(await screen.findByText("Changes requested")).toBeVisible();
    expect(screen.getByText("Please revise the kitchen finish.")).toBeVisible();
    expect(screen.getByText("Recorded with Admin proof")).toBeVisible();
    expect(screen.getByRole("button", { name: "Download decision proof" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("keeps decision actions hidden when decide permission is absent", async () => {
    installAdmin([
      "identity.self.read",
      "identity.authorization.read",
      "estimation.client_response_tasks.read"
    ] as const);
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks/round-1", () =>
        HttpResponse.json({ data: pendingDetail })
      )
    );

    renderApp(["/admin/client-responses/round-1"]);
    expect(await screen.findByText("Pending")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("uses the task-scoped 404 message without exposing lookup details", async () => {
    installAdmin();
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks/foreign-round", () =>
        HttpResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "The requested resource was not found."
            }
          },
          { status: 404 }
        )
      )
    );

    renderApp(["/admin/client-responses/foreign-round"]);
    expect(await screen.findByText("The requested Client response task was not found.")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/foreign|assigned|project grant/i);
  });

  it("reports PDF and proof failures on their own download controls", async () => {
    installAdmin();
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks/round-1", () =>
        HttpResponse.json({
          data: { ...pendingDetail, proofAvailable: true }
        })
      ),
      http.get("/api/v1/admin/estimate-client-response-tasks/round-1/pdf", () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "The requested resource was not found." } },
          { status: 404 }
        )
      ),
      http.get("/api/v1/admin/estimate-client-response-tasks/round-1/proof", () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "The requested resource was not found." } },
          { status: 404 }
        )
      )
    );
    const user = userEvent.setup();

    renderApp(["/admin/client-responses/round-1"]);
    await user.click(await screen.findByRole("button", { name: "Download exact estimate PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This task's exact estimate PDF could not be downloaded."
    );
    await user.click(screen.getByRole("button", { name: "Download decision proof" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.at(-1)).toHaveTextContent("This task's decision proof could not be downloaded.");
  });
});
