function canReceiveFocus(element: HTMLElement) {
  return (
    element.isConnected &&
    !element.matches(":disabled") &&
    element.getAttribute("aria-disabled") !== "true"
  );
}

function focus(element: HTMLElement, addTabIndex = false) {
  if (addTabIndex && !element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
}

export function focusAfterRemoval(
  remaining: readonly HTMLElement[],
  removedIndex: number,
  fallbackHeading?: HTMLElement | null
): void {
  const available = remaining.filter(canReceiveFocus);
  const target = available[removedIndex] ?? available.at(-1);

  if (target) {
    focus(target);
  } else if (fallbackHeading && canReceiveFocus(fallbackHeading)) {
    focus(fallbackHeading, true);
  }
}
