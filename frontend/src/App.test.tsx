import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the Lisno application shell", () => {
    render(<App />);

    expect(screen.getByText("Design operations, clearly delivered.")).toBeVisible();
  });
});
