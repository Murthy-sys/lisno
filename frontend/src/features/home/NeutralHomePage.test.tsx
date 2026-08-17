import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NeutralHomePage } from "./NeutralHomePage";

describe("NeutralHomePage", () => {
  it("renders explicit staged copy without an unimplemented action", () => {
    render(
      <NeutralHomePage
        title="Access requests"
        description="Access-request review is loading in the final Prompt 1 interface task."
      />
    );

    expect(screen.getByRole("heading", { name: "Access requests" })).toBeVisible();
    expect(
      screen.getByText(
        "Access-request review is loading in the final Prompt 1 interface task."
      )
    ).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
