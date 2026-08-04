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

function mount<T extends HTMLElement>(element: T) {
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

  it("keeps removedIndex in the original array when earlier items are unavailable", () => {
    const disabledBefore = button("Disabled before");
    const expectedNext = button("Expected next");
    const later = button("Later");
    disabledBefore.disabled = true;

    focusAfterRemoval([disabledBefore, expectedNext, later], 1);

    expect(expectedNext).toHaveFocus();
  });

  it("scans forward then backward through original positions for an available item", () => {
    const previous = button("Previous");
    const disabledAtIndex = button("Disabled at index");
    const next = button("Next");
    disabledAtIndex.disabled = true;

    focusAfterRemoval([previous, disabledAtIndex, next], 1);
    expect(next).toHaveFocus();

    next.disabled = true;
    document.body.focus();
    focusAfterRemoval([previous, disabledAtIndex, next], 1);
    expect(previous).toHaveFocus();
  });

  it("skips non-focusable, unavailable, and failed-focus candidates to reach a valid item", () => {
    const plainDiv = mount(document.createElement("div"));
    const hidden = button("Hidden");
    hidden.hidden = true;
    const displayNone = button("Display none");
    displayNone.style.display = "none";
    const visibilityHidden = button("Visibility hidden");
    visibilityHidden.style.visibility = "hidden";

    const ariaHiddenParent = mount(document.createElement("div"));
    ariaHiddenParent.setAttribute("aria-hidden", "true");
    const ariaHiddenChild = document.createElement("button");
    ariaHiddenParent.append(ariaHiddenChild);

    const inertParent = mount(document.createElement("div"));
    inertParent.setAttribute("inert", "");
    const inertChild = document.createElement("button");
    inertParent.append(inertChild);

    const disabled = button("Disabled");
    disabled.disabled = true;
    const ariaDisabled = button("ARIA disabled");
    ariaDisabled.setAttribute("aria-disabled", "true");
    const negativeTabIndex = button("Negative tabindex");
    negativeTabIndex.tabIndex = -1;
    const failedFocus = button("Failed focus");
    failedFocus.focus = () => undefined;
    const valid = button("Valid");

    focusAfterRemoval(
      [
        plainDiv,
        hidden,
        displayNone,
        visibilityHidden,
        ariaHiddenChild,
        inertChild,
        disabled,
        ariaDisabled,
        negativeTabIndex,
        failedFocus,
        valid
      ],
      0
    );

    expect(valid).toHaveFocus();
  });

  it("reaches the heading fallback when no remaining candidate can actually focus", () => {
    const plainDiv = mount(document.createElement("div"));
    const failedFocus = button("Failed focus");
    failedFocus.focus = () => undefined;
    const heading = mount(document.createElement("h2"));

    focusAfterRemoval([plainDiv, failedFocus], 0, heading);

    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("focuses the owning heading when no remaining item can receive focus", () => {
    const heading = document.createElement("h2");
    heading.textContent = "Team members";
    mount(heading);

    focusAfterRemoval([], 0, heading);

    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("does nothing when no focus target exists", () => {
    expect(() => focusAfterRemoval([], 0)).not.toThrow();
  });
});
