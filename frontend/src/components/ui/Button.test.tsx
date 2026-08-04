import { createRef } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArrowRight, Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";
import { Spinner } from "./Spinner";

const primitives = readFileSync(resolve(process.cwd(), "src/styles/primitives.css"), "utf8");

describe("Button and Spinner", () => {
  it.each([
    ["primary", "compact"],
    ["secondary", "default"],
    ["quiet", "large"],
    ["destructive", "default"],
  ] as const)("applies the %s variant and %s size classes", (variant, size) => {
    render(<Button variant={variant} size={size}>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      `ui-button--${variant}`,
      `ui-button--${size}`
    );
  });

  it("renders icon slots and defaults to a safe button type", () => {
    render(
      <Button leadingIcon={<Plus />} trailingIcon={<ArrowRight />}>
        Create project
      </Button>
    );

    const button = screen.getByRole("button", { name: "Create project" });
    expect(button).toHaveClass("ui-button--primary");
    expect(button).toHaveAttribute("type", "button");
    expect(button.querySelectorAll("svg")).toHaveLength(2);
  });

  it("preserves native button attributes, handlers, and its forwarded ref", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button
        ref={ref}
        type="submit"
        name="project-action"
        value="create"
        form="new-project"
        aria-controls="project-panel"
        onClick={onClick}
      >
        Create project
      </Button>
    );

    const button = screen.getByRole("button", { name: "Create project" });
    fireEvent.click(button);

    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("name", "project-action");
    expect(button).toHaveAttribute("value", "create");
    expect(button).toHaveAttribute("form", "new-project");
    expect(button).toHaveAttribute("aria-controls", "project-panel");
    expect(ref.current).toBe(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps its original accessible name while exposing a visible busy status", () => {
    const { rerender } = render(<Button>Create project</Button>);

    rerender(<Button busy busyLabel="Creating project">Create project</Button>);
    const button = screen.getByRole("button", { name: "Create project" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Creating project");
    expect(button.querySelector(".ui-button__content")).not.toHaveAttribute("aria-hidden");
    expect(button.querySelector(".ui-button__busy")).toHaveAttribute("aria-hidden", "true");
    expect(button.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });

  it("prevents activation while busy even without a disabled prop", () => {
    const onClick = vi.fn();
    render(<Button busy onClick={onClick}>Create project</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("offers a full-width modifier", () => {
    render(<Button fullWidth>Continue</Button>);

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass("ui-button--full-width");
  });

  it("keeps the spinner decorative and limited to its visual sizing contract", () => {
    const { container } = render(<Spinner size="small" className="custom-spinner" />);
    const spinner = container.firstElementChild;

    expect(spinner).toHaveClass("ui-spinner", "ui-spinner--small", "custom-spinner");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner).not.toHaveAttribute("role");
    expect(spinner).not.toHaveAttribute("aria-live");
  });

  it("uses the medium size when no spinner size is specified", () => {
    const { container } = render(<Spinner />);

    expect(container.firstElementChild).toHaveClass("ui-spinner", "ui-spinner--medium");
  });

  it("uses the tokenized cursor, target, and transition rules for shared controls", () => {
    expect(primitives).toMatch(/\.ui-button\[data-busy\]\s*\{[^}]*cursor:\s*progress/s);
    expect(primitives).toMatch(/\.ui-button:disabled\s*\{[^}]*cursor:\s*default/s);
    expect(primitives).toMatch(/\.ui-icon-button\s*\{[^}]*min-(?:inline-)?size:\s*44px/s);
    expect(primitives).toMatch(/transition:[^;]*var\(--duration-fast\)/);
    expect(primitives).not.toMatch(/transition:[^;]*(?:140ms|220ms)/);
  });
});
