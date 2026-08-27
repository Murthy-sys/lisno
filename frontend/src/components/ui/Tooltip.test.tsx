import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
  it("opens on pointer hover and links its description without changing the control name", () => {
    render(
      <Tooltip label="Add a project" placement="right">
        <button type="button" aria-label="Add project">+</button>
      </Tooltip>
    );
    const button = screen.getByRole("button", { name: "Add project" });

    fireEvent.pointerEnter(button);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Add a project");
    expect(tooltip).toHaveClass("ui-tooltip--right");
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
    expect(screen.getByRole("button", { name: "Add project" })).toBe(button);
  });

  it("opens on focus and closes on blur or pointer leave", () => {
    render(
      <Tooltip label="Add a project">
        <button type="button">Add project</button>
      </Tooltip>
    );
    const button = screen.getByRole("button", { name: "Add project" });

    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.pointerEnter(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerLeave(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("merges an existing description while open and preserves it after close", () => {
    render(
      <Tooltip label="Add a project">
        <button type="button" aria-describedby="keyboard-shortcut">Add project</button>
      </Tooltip>
    );
    const button = screen.getByRole("button", { name: "Add project" });

    fireEvent.pointerEnter(button);
    const tooltip = screen.getByRole("tooltip");
    expect(button).toHaveAttribute("aria-describedby", `keyboard-shortcut ${tooltip.id}`);

    fireEvent.pointerLeave(button);
    expect(button).toHaveAttribute("aria-describedby", "keyboard-shortcut");
  });

  it("closes on Escape without moving focus or activating the child", () => {
    const onClick = vi.fn();
    render(
      <Tooltip label="Add a project">
        <button type="button" onClick={onClick}>Add project</button>
      </Tooltip>
    );
    const button = screen.getByRole("button", { name: "Add project" });
    button.focus();
    fireEvent.focus(button);

    fireEvent.keyDown(button, { key: "Escape" });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("preserves existing child interaction handlers", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <Tooltip label="Add a project">
        <button
          type="button"
          onFocus={onFocus}
          onBlur={onBlur}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onKeyDown={onKeyDown}
        >
          Add project
        </button>
      </Tooltip>
    );
    const button = screen.getByRole("button", { name: "Add project" });

    fireEvent.focus(button);
    fireEvent.blur(button);
    fireEvent.pointerEnter(button);
    fireEvent.pointerLeave(button);
    fireEvent.keyDown(button, { key: "Escape" });

    expect(onFocus).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
    expect(onPointerEnter).toHaveBeenCalledOnce();
    expect(onPointerLeave).toHaveBeenCalledOnce();
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("assigns unique IDs to same-label tooltips", () => {
    render(
      <>
        <Tooltip label="Add a project"><button type="button">First</button></Tooltip>
        <Tooltip label="Add a project"><button type="button">Second</button></Tooltip>
      </>
    );
    fireEvent.pointerEnter(screen.getByRole("button", { name: "First" }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Second" }));

    const tooltips = screen.getAllByRole("tooltip");
    expect(tooltips).toHaveLength(2);
    expect(tooltips[0].id).not.toBe(tooltips[1].id);
  });
});
