import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the unauthenticated Lisno sign-in shell through the application router", async () => {
    window.history.replaceState(null, "", "/login");
    try {
      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Welcome back" })
      ).toBeVisible();
      expect(screen.getByLabelText("Email address")).toBeEnabled();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});
