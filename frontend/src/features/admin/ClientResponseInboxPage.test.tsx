import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { tokenStorage } from "../../api/client";
import type { EstimateClientResponseTaskListItem } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { estimateClientResponseKeys } from "./estimateClientResponsesApi";

const pendingTask: EstimateClientResponseTaskListItem = {
  id: "round-pending",
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
  createdAt: "2026-08-23T10:00:00.000Z"
};

function installAdmin() {
  tokenStorage.set("admin-client-response-token");
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
      HttpResponse.json({
        data: authorizationFor("admin", [
          "identity.self.read",
          "identity.authorization.read",
          "estimation.client_response_tasks.read",
          "estimation.client_response_tasks.decide",
          "estimation.client_response_proof.read"
        ])
      })
    )
  );
}

function page(
  items: EstimateClientResponseTaskListItem[],
  { limit = 20, offset = 0, total = items.length, hasMore = false } = {}
) {
  return { data: { items, pagination: { limit, offset, total, hasMore } } };
}

describe("ClientResponseInboxPage", () => {
  it("marks the inbox busy while loading and renders its server-scoped empty state", async () => {
    installAdmin();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks", async ({ request }) => {
        expect(new URL(request.url).search).toBe("?status=pending&limit=20&offset=0");
        await pending;
        return HttpResponse.json(page([]));
      })
    );

    renderApp(["/admin/client-responses"]);

    const inbox = await screen.findByRole("region", { name: "Client responses" });
    expect(inbox).toHaveAttribute("aria-busy", "true");
    expect(
      within(inbox).getByRole("status", { name: "Content status" })
    ).toHaveTextContent("Loading client responses");

    release();
    expect(
      await screen.findByText("There are no pending Client responses assigned to you.")
    ).toBeVisible();
    expect(inbox).toHaveAttribute("aria-busy", "false");
  });

  it("renders a retryable scoped error without leaking stale rows", async () => {
    installAdmin();
    let requests = 0;
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks", () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json(
              { error: { code: "FAILED", message: "Client responses unavailable." } },
              { status: 503 }
            )
          : HttpResponse.json(page([pendingTask]));
      })
    );
    const user = userEvent.setup();

    renderApp(["/admin/client-responses"]);
    expect(await screen.findByText("Client responses unavailable.")).toBeVisible();
    expect(screen.queryByText("Priya Shah")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Priya Shah")).toBeVisible();
    expect(requests).toBe(2);
  });

  it("maps every history filter to the server and keeps pagination stable", async () => {
    installAdmin();
    const requests: string[] = [];
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks", ({ request }) => {
        const url = new URL(request.url);
        requests.push(url.search);
        const status = url.searchParams.get("status");
        const offset = Number(url.searchParams.get("offset"));
        const item = {
          ...pendingTask,
          id: `${status ?? "all"}-${offset}`,
          status:
            status === "approved"
              ? ("approved" as const)
              : status === "changes_requested"
                ? ("changes_requested" as const)
                : ("pending" as const),
          decision:
            status === "approved"
              ? ("approve" as const)
              : status === "changes_requested"
                ? ("request_changes" as const)
                : null
        };
        return HttpResponse.json(
          page([item], {
            offset,
            total: status === "approved" ? 21 : 1,
            hasMore: status === "approved" && offset === 0
          })
        );
      })
    );
    const user = userEvent.setup();

    renderApp(["/admin/client-responses"]);
    expect(await screen.findByText("Priya Shah")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Approved history" }));
    expect(await screen.findByText("Approved")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(requests).toContain("?status=approved&limit=20&offset=20")
    );
    await user.click(screen.getByRole("button", { name: "Changes requested history" }));
    expect(await screen.findByText("Changes requested")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "All" }));

    await waitFor(() =>
      expect(requests).toEqual([
        "?status=pending&limit=20&offset=0",
        "?status=approved&limit=20&offset=0",
        "?status=approved&limit=20&offset=20",
        "?status=changes_requested&limit=20&offset=0",
        "?limit=20&offset=0"
      ])
    );
  });

  it("locks both pagination controls until the requested page becomes canonical", async () => {
    installAdmin();
    const requests: string[] = [];
    let releaseSecondPage!: () => void;
    const secondPageGate = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks", async ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset"));
        requests.push(url.search);
        if (offset === 20) await secondPageGate;
        return HttpResponse.json(
          page(
            [
              {
                ...pendingTask,
                id: `round-${offset}`,
                client: {
                  ...pendingTask.client,
                  name: offset === 0 ? "First page Client" : "Second page Client"
                }
              }
            ],
            {
              offset,
              total: 40,
              hasMore: offset === 0
            }
          )
        );
      })
    );
    const user = userEvent.setup();

    renderApp(["/admin/client-responses"]);
    expect(await screen.findByText("First page Client")).toBeVisible();
    const next = screen.getByRole("button", { name: "Next page" });
    await user.click(next);
    await waitFor(() =>
      expect(requests).toContain("?status=pending&limit=20&offset=20")
    );

    try {
      expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Next page" }));
      expect(requests).toEqual([
        "?status=pending&limit=20&offset=0",
        "?status=pending&limit=20&offset=20"
      ]);
    } finally {
      await act(async () => releaseSecondPage());
    }

    expect(await screen.findByText("Second page Client")).toBeVisible();
    expect(screen.getByText("Showing 21–21 of 40")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("returns to a valid page when a nonzero server page becomes empty", async () => {
    installAdmin();
    const requests: string[] = [];
    let firstPageRequests = 0;
    let secondPageRequests = 0;
    let releaseCorrectedPage!: () => void;
    const correctedPageGate = new Promise<void>((resolve) => {
      releaseCorrectedPage = resolve;
    });
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks", async ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset"));
        requests.push(url.search);
        if (offset === 20) {
          secondPageRequests += 1;
          return HttpResponse.json(secondPageRequests === 1
            ? page([{
                ...pendingTask,
                id: "round-second-page",
                client: { ...pendingTask.client, name: "Second page Client" }
              }], { offset: 20, total: 21, hasMore: false })
            : page([], { offset: 20, total: 20, hasMore: false }));
        }

        firstPageRequests += 1;
        if (firstPageRequests > 1) await correctedPageGate;
        return HttpResponse.json(
          page([{
            ...pendingTask,
            client: { ...pendingTask.client, name: "First page Client" }
          }], {
            offset: 0,
            total: firstPageRequests === 1 ? 21 : 20,
            hasMore: firstPageRequests === 1
          })
        );
      })
    );
    const user = userEvent.setup();

    const { queryClient } = renderApp(["/admin/client-responses"]);
    expect(await screen.findByText("First page Client")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Second page Client")).toBeVisible();

    const firstPageKey = estimateClientResponseKeys.list("pending", {
      limit: 20,
      offset: 0
    });
    const secondPageKey = estimateClientResponseKeys.list("pending", {
      limit: 20,
      offset: 20
    });
    queryClient.removeQueries({ queryKey: firstPageKey, exact: true });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: secondPageKey, exact: true });
    });

    try {
      await waitFor(() =>
        expect(requests).toEqual([
          "?status=pending&limit=20&offset=0",
          "?status=pending&limit=20&offset=20",
          "?status=pending&limit=20&offset=20",
          "?status=pending&limit=20&offset=0"
        ])
      );
      expect(screen.getByText("Loading previous Client responses…")).toBeVisible();
      expect(
        screen.getByRole("region", { name: "Client responses" })
      ).toHaveAttribute("aria-busy", "true");
      expect(
        screen.queryByText("There are no pending Client responses assigned to you.")
      ).not.toBeInTheDocument();
    } finally {
      await act(async () => releaseCorrectedPage());
    }

    expect(await screen.findByText("First page Client")).toBeVisible();
    expect(screen.getByText("Showing 1–1 of 20")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  });

  it("shows persisted delivery/task states, timestamps, and encoded detail links", async () => {
    installAdmin();
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks", () =>
        HttpResponse.json(page([pendingTask]))
      )
    );

    renderApp(["/admin/client-responses"]);
    const table = await screen.findByRole("table", { name: "Client response tasks" });
    const row = within(table).getByRole("row", { name: /Priya Shah/ });
    expect(within(row).getByText("Aurora Villa")).toBeVisible();
    expect(within(row).getByText("Pending")).toBeVisible();
    expect(within(row).getByText("Email sent")).toBeVisible();
    expect(within(row).getByText("23 Aug 2026, 10:00")).toBeVisible();
    expect(within(row).getByRole("link", { name: "Review Priya Shah response" })).toHaveAttribute(
      "href",
      "/admin/client-responses/round-pending"
    );
  });

  it("makes the horizontal task table a labeled keyboard focus target", async () => {
    installAdmin();
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks", () =>
        HttpResponse.json(page([pendingTask]))
      )
    );
    const user = userEvent.setup();

    renderApp(["/admin/client-responses"]);
    await screen.findByRole("table", { name: "Client response tasks" });
    const lastFilter = await screen.findByRole("button", { name: "All" });
    lastFilter.focus();
    await user.tab();

    expect(
      screen.getByRole("region", { name: "Client response tasks table" })
    ).toHaveFocus();
  });

  it("does not retarget or replay an open decision after the selected row refreshes", async () => {
    installAdmin();
    let row = pendingTask;
    let posts = 0;
    server.use(
      http.get("/api/v1/admin/estimate-client-response-tasks", () =>
        HttpResponse.json(page([row]))
      ),
      http.post(
        "/api/v1/admin/estimate-client-response-tasks/round-pending/decision",
        () => {
          posts += 1;
          row = {
            ...row,
            version: 4,
            status: "approved",
            decision: "approve",
            proofAvailable: true
          };
          return HttpResponse.json(
            {
              error: {
                code: "VERSION_CONFLICT",
                message: "The task changed elsewhere."
              }
            },
            { status: 409 }
          );
        }
      )
    );
    const user = userEvent.setup();

    renderApp(["/admin/client-responses"]);
    await user.click(
      await screen.findByRole("button", { name: "Approve Priya Shah response" })
    );
    const dialog = screen.getByRole("dialog", { name: "Approve Client response" });
    await user.upload(
      within(dialog).getByLabelText("Decision proof"),
      new File(["proof"], "proof.pdf", { type: "application/pdf" })
    );
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    expect(
      await within(dialog).findByText("This task is no longer pending in the current inbox view.")
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(await screen.findByText("Approved")).toBeVisible();
    expect(posts).toBe(1);
  });
});
