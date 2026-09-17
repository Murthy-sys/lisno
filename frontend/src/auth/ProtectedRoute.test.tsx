import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { safeReturnPath } from "../app/routePaths";

vi.mock("./AuthProvider", () => ({ useAuth: () => ({ status: "unauthenticated", user: null, authorization: null }) }));

function LoginDestination() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <output aria-label="After login">{safeReturnPath("client", from)}</output>;
}

describe("notification login continuation", () => {
  it("preserves the project message query and fragment through the protected-route redirect", async () => {
    render(<MemoryRouter initialEntries={["/projects/project-42/messages?message=message-7#reply"]}><Routes>
      <Route path="/projects/:projectId/messages" element={<ProtectedRoute><div>Chat</div></ProtectedRoute>} />
      <Route path="/login" element={<LoginDestination />} />
    </Routes></MemoryRouter>);
    expect(await screen.findByLabelText("After login")).toHaveTextContent("/projects/project-42/messages?message=message-7#reply");
  });
});
