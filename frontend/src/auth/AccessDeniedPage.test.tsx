import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import type { PermissionCode, Role } from "../api/authorization-contract";
import { authorizationFor } from "../test/authFixtures";
import { AccessDeniedPage } from "./AccessDeniedPage";
import { AuthProvider } from "./AuthProvider";

function renderDeniedPage({
  role = "designer",
  permissions = ["identity.self.read"],
  requestContext
}: {
  role?: Role;
  permissions?: readonly PermissionCode[];
  requestContext?: { projectId: string; module: "design" };
} = {}) {
  tokenStorage.set("denied-token");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path === "/api/v1/auth/me") {
      return Response.json({
        data: {
          id: `${role}-1`,
          name: "Denied User",
          email: `${role}@lisno.example`,
          role
        }
      });
    }
    if (path === "/api/v1/auth/authorization") {
      return Response.json({ data: authorizationFor(role, permissions) });
    }
    throw new Error(`Unexpected request: ${path}`);
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <AccessDeniedPage requestContext={requestContext} />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AccessDeniedPage", () => {
  it("keeps a generic direct denial free of access-request actions", async () => {
    renderDeniedPage();

    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Request access" })).not.toBeInTheDocument();
  });

  it("links only validated known project context for an eligible requester", async () => {
    renderDeniedPage({
      permissions: ["identity.self.read", "access_request.create"],
      requestContext: { projectId: "project-safe-17", module: "design" }
    });

    expect(
      await screen.findByRole("link", { name: "Request access" })
    ).toHaveAttribute(
      "href",
      "/access-requests/mine?projectId=project-safe-17&module=design"
    );
  });

  it("does not offer a request when the role cannot request the module", async () => {
    renderDeniedPage({
      role: "admin",
      permissions: ["identity.self.read", "access_request.create"],
      requestContext: { projectId: "project-safe-17", module: "design" }
    });

    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Request access" })).not.toBeInTheDocument();
  });
});
