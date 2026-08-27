import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthRouteState } from "./AuthRouteState";

describe("AuthRouteState", () => {
  it("keeps one route-owned main and stable page heading around the local state region", () => {
    render(
      <AuthRouteState
        title="Opening your workspace"
        state="loading"
        message="Restoring your session…"
      />
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Opening your workspace" })
    ).toBeVisible();
    expect(
      document.querySelector('main [data-page-state="loading"]')
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Content status" })).toHaveTextContent(
      "Restoring your session…"
    );
  });
});
