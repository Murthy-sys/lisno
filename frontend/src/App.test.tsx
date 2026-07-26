import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("routes an unauthenticated visitor to the Lisno sign-in screen", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
    expect(screen.getByLabelText("Email address")).toBeEnabled();
  });
});
