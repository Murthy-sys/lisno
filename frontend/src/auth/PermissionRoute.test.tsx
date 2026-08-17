import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import type { PermissionCode, Role } from "../api/authorization-contract";
import { authorizationFor } from "../test/authFixtures";
import { AuthProvider } from "./AuthProvider";
import { ProtectedRoute } from "./ProtectedRoute";
import { PermissionRoute } from "./PermissionRoute";

const user = {
  id: "designer-1",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

function renderGuardedRoute({
  role = "designer",
  permissions = ["identity.self.read"],
  authorizationResponse
}: {
  role?: Role;
  permissions?: readonly PermissionCode[];
  authorizationResponse?: () => Promise<Response>;
} = {}) {
  tokenStorage.set("guard-token");
  const currentUser = { ...user, role };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path === "/api/v1/auth/me") {
      return Response.json({ data: currentUser });
    }
    if (path === "/api/v1/auth/authorization") {
      return authorizationResponse
        ? authorizationResponse()
        : Response.json({ data: authorizationFor(role, permissions) });
    }
    throw new Error(`Unexpected request: ${path}`);
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/guarded"]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/guarded"
              element={
                <ProtectedRoute>
                  <PermissionRoute
                    permission="projects.list"
                    presentationRoles={["designer"]}
                  >
                    <h1>Protected designer content</h1>
                  </PermissionRoute>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<h1>Login destination</h1>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PermissionRoute", () => {
  it("keeps protected content hidden while authorization is still loading", async () => {
    renderGuardedRoute({
      authorizationResponse: () => new Promise<Response>(() => undefined)
    });

    expect(
      await screen.findByRole("heading", { name: "Opening your workspace" })
    ).toBeVisible();
    expect(screen.getByText("Restoring your session…")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Protected designer content" })
    ).not.toBeInTheDocument();
  });

  it("keeps protected content behind the authorization error state", async () => {
    renderGuardedRoute({
      authorizationResponse: async () =>
        Response.json(
          { error: { code: "POLICY_UNAVAILABLE", message: "Unavailable." } },
          { status: 500 }
        )
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't restore your session."
    );
    expect(
      screen.queryByRole("heading", { name: "Protected designer content" })
    ).not.toBeInTheDocument();
  });

  it("renders content only when both permission and presentation role allow it", async () => {
    renderGuardedRoute({ permissions: ["identity.self.read", "projects.list"] });

    expect(
      await screen.findByRole("heading", { name: "Protected designer content" })
    ).toBeVisible();
  });

  it("renders Access Denied without redirecting when permission is missing", async () => {
    renderGuardedRoute();

    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Login destination" })).not.toBeInTheDocument();
    expect(window.location.pathname).not.toBe("/login");
  });

  it("enforces presentation roles even when the snapshot grants the read permission", async () => {
    renderGuardedRoute({
      role: "super_admin",
      permissions: ["identity.self.read", "projects.list"]
    });

    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Protected designer content" })
    ).not.toBeInTheDocument();
  });
});
