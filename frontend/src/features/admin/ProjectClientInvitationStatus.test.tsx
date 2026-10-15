import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { ProjectClientInvitationStatus as InvitationStatus } from "../../auth/projectClientInvitationsApi";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProjectClientInvitationStatus } from "./ProjectClientInvitationStatus";

const initial: InvitationStatus = {
  projectId: "project-one", status: "not_issued", deliveryAvailable: true,
  expectedVersion: 0, expiresAt: null, sentAt: null, acceptedAt: null, availableActions: ["send"]
};
const path = "/api/v1/projects/project-one/client-invitation";

describe("ProjectClientInvitationStatus", () => {
  it("keeps unavailable mail distinct from failed project creation and refreshes delivery availability", async () => {
    let available = false;
    server.use(http.get(path, () => HttpResponse.json({ data: { ...initial, deliveryAvailable: available } })));
    renderWithQuery(<ProjectClientInvitationStatus projectId="project-one" />);
    expect(await screen.findByText("Invitation unavailable")).toBeVisible();
    expect(screen.getByText(/The project is ready/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Send client invitation" })).toBeDisabled();
    available = true;
    await userEvent.click(screen.getByRole("button", { name: "Refresh invitation status" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send client invitation" })).toBeEnabled());
  });

  it("retries failed delivery once using the current server version and renders refreshed actions", async () => {
    let status: InvitationStatus = { ...initial, status: "delivery_failed", expectedVersion: 4, availableActions: ["resend", "revoke"] };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const resend = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ expectedVersion: 4 });
      await pending;
      status = { ...status, status: "pending", expectedVersion: 5 };
      return HttpResponse.json({ data: status });
    });
    server.use(http.get(path, () => HttpResponse.json({ data: status })), http.post(`${path}/resend`, resend));
    renderWithQuery(<ProjectClientInvitationStatus projectId="project-one" />);
    expect(await screen.findByText("Invitation delivery failed")).toBeVisible();
    const button = screen.getByRole("button", { name: "Resend client invitation" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(resend).toHaveBeenCalledOnce());
    expect(button).toBeDisabled();
    release();
    expect(await screen.findByText("Invitation sent")).toBeVisible();
  });

  it("uses backend actions and removes mutation controls after a stale accepted state refresh", async () => {
    let status: InvitationStatus = { ...initial, status: "pending", expectedVersion: 2, availableActions: ["resend", "revoke"] };
    server.use(
      http.get(path, () => HttpResponse.json({ data: status })),
      http.post(`${path}/revoke`, async ({ request }) => {
        expect(await request.json()).toEqual({ expectedVersion: 2 });
        status = { ...status, status: "accepted", expectedVersion: 3, availableActions: [] };
        return HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "Unsafe details" } }, { status: 409 });
      })
    );
    renderWithQuery(<ProjectClientInvitationStatus projectId="project-one" />);
    await userEvent.click(await screen.findByRole("button", { name: "Revoke invitation" }));
    expect(await screen.findByText("Client has joined")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Revoke invitation" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This invitation changed. Review the refreshed status before trying again.");
  });

  it("shows permission and status loading failures without inferring an invitation", async () => {
    server.use(http.get(path, () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Unsafe details" } }, { status: 403 })));
    renderWithQuery(<ProjectClientInvitationStatus projectId="project-one" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have access to manage this project's invitation.");
    expect(screen.queryByRole("button", { name: "Send client invitation" })).not.toBeInTheDocument();
    expect(screen.queryByText("Unsafe details")).not.toBeInTheDocument();
  });
});
