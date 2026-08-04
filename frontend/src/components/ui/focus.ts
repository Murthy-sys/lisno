const focusableSelector = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]"
].join(",");

function isAvailable(element: HTMLElement) {
  if (
    !element.isConnected ||
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }

  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.hidden ||
      current.hasAttribute("inert") ||
      current.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return false;
    }
    current = current.parentElement;
  }

  return true;
}

function focus(element: HTMLElement, addTabIndex = false) {
  if (addTabIndex && !element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

function focusCandidate(element: HTMLElement | undefined) {
  return Boolean(
    element &&
      isAvailable(element) &&
      element.matches(focusableSelector) &&
      element.tabIndex >= 0 &&
      focus(element)
  );
}

export function focusAfterRemoval(
  remaining: readonly HTMLElement[],
  removedIndex: number,
  fallbackHeading?: HTMLElement | null
): void {
  const forwardStart = Math.max(0, removedIndex);
  for (let index = forwardStart; index < remaining.length; index += 1) {
    if (focusCandidate(remaining[index])) return;
  }

  const backwardStart = Math.min(remaining.length - 1, removedIndex - 1);
  for (let index = backwardStart; index >= 0; index -= 1) {
    if (focusCandidate(remaining[index])) return;
  }

  if (fallbackHeading && isAvailable(fallbackHeading)) {
    focus(fallbackHeading, true);
  }
}
