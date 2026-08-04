import { afterEach, describe, expect, it } from "vitest";

import { focusAfterRemoval } from "./focus";

const mountedElements: HTMLElement[] = [];

function button(label: string) {
  const element = document.createElement("button");
  element.textContent = label;
  document.body.append(element);
  mountedElements.push(element);
  return element;
}

describe("focusAfterRemoval", () => {
  afterEach(() => {
    mountedElements.splice(0).forEach((element) => element.remove());
  });

  it("focuses the next connected enabled item now occupying the removed index", () => {
    const previous = button("Previous");
    const next = button("Next");

    focusAfterRemoval([previous, next], 1);

    expect(next).toHaveFocus();
  });

  it("focuses the previous final item when no next item remains", () => {
    const previous = button("Previous");

    focusAfterRemoval([previous], 1);

    expect(previous).toHaveFocus();
  });

  it("ignores disconnected and disabled items before applying removal order", () => {
    const previous = button("Previous");
    const disconnected = button("Disconnected");
    const disabled = button("Disabled");
    const next = button("Next");
    disconnected.remove();
    disabled.disabled = true;

    focusAfterRemoval([previous, disconnected, disabled, next], 1);

    expect(next).toHaveFocus();
  });

  it("focuses the owning heading when no remaining item can receive focus", () => {
    const heading = document.createElement("h2");
    heading.textContent = "Team members";
    document.body.append(heading);
    mountedElements.push(heading);

    focusAfterRemoval([], 0, heading);

    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("does nothing when no focus target exists", () => {
    expect(() => focusAfterRemoval([], 0)).not.toThrow();
  });
});
