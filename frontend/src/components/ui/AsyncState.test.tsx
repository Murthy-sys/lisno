import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { AsyncState } from "./AsyncState";
import { PageState, type PageStateProps } from "./PageState";
import { SectionState } from "./SectionState";

const stateComponents: Array<{
  name: string;
  Component: ComponentType<PageStateProps>;
  hook: "data-page-state" | "data-section-state";
}> = [
  { name: "PageState", Component: PageState, hook: "data-page-state" },
  { name: "SectionState", Component: SectionState, hook: "data-section-state" }
];

describe.each(stateComponents)("$name", ({ Component, hook }) => {
  it("owns one named polite loading message while keeping its skeleton visual hidden", () => {
    const { container } = render(
      <Component
        state="loading"
        message="Loading project details…"
        statusLabel="Project loading status"
      />
    );

    const root = container.querySelector(`[${hook}="loading"]`);
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(root?.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Project loading status" })
    ).toHaveTextContent("Loading project details…");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("uses the stable default status name and replaces the default skeleton when supplied", () => {
    const { container } = render(
      <Component
        state="loading"
        message="Restoring content…"
        skeleton={<div data-testid="project-layout">Incoming project layout</div>}
      />
    );

    expect(screen.getByRole("status", { name: "Content status" })).toHaveTextContent(
      "Restoring content…"
    );
    expect(screen.getByTestId("project-layout").parentElement).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(container.querySelector(".ui-skeleton")).not.toBeInTheDocument();
  });

  it("exposes one alert and the shared retry button for a recoverable error", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Component
        state="error"
        message="We couldn't load this content."
        action={{ label: "Try again", onAction: retry }}
      />
    );

    expect(container.querySelector(`[${hook}="error"]`)).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    const button = screen.getByRole("button", { name: "Try again" });
    expect(button).toHaveClass("ui-button");
    await user.click(button);
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("presents an empty result quietly with a terminal state hook", () => {
    const { container } = render(
      <Component state="empty" message="No projects match these filters." />
    );

    expect(container.querySelector(`[${hook}="empty"]`)).toHaveTextContent(
      "No projects match these filters."
    );
    expect(container.querySelector(`[${hook}="empty"] svg`)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});

describe("AsyncState compatibility", () => {
  it("preserves loading copy while delegating to a section state", () => {
    const { container } = render(
      <AsyncState state="loading" message="Loading the design review…" />
    );

    expect(screen.getByRole("status", { name: "Content status" })).toHaveTextContent(
      "Loading the design review…"
    );
    expect(container.querySelector('[data-section-state="loading"]')).toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("preserves error copy and its legacy retry action", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(
      <AsyncState
        state="error"
        message="The design review could not be loaded."
        actionLabel="Reload review"
        onAction={retry}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The design review could not be loaded."
    );
    await user.click(screen.getByRole("button", { name: "Reload review" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
