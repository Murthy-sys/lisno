import {
  useEffect,
  useRef,
  type RefObject
} from "react";

export const focusableSelector = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "iframe",
  "object",
  "embed",
  "audio[controls]",
  "video[controls]",
  "summary:first-of-type",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]"
].join(",");

const overlayZIndex = "calc(var(--z-modal) + var(--ui-overlay-stack-order))";

interface OverlayEntry {
  id: symbol;
  containerRef: RefObject<HTMLElement | null>;
  presentationRef: RefObject<HTMLElement | null>;
  onCloseRef: RefObject<() => void>;
  busyRef: RefObject<boolean>;
}

interface UseOverlayOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  presentationRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  busy?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  defaultInitialFocusContainerRef?: RefObject<HTMLElement | null>;
}

const overlayStack: OverlayEntry[] = [];
const bodyScrollLockOwners = new Set<symbol>();
let bodyOverflowBeforeFirstLock = "";
let keydownListenerInstalled = false;

function connected(element: HTMLElement | null | undefined) {
  return element?.isConnected ? element : null;
}

function isUnavailable(element: HTMLElement) {
  const closedDetails = element.closest("details:not([open])");
  const visibleSummary = closedDetails?.querySelector(":scope > summary");
  if (closedDetails && !visibleSummary?.contains(element)) return true;

  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.hidden ||
      current.hasAttribute("inert") ||
      current.getAttribute("aria-hidden")?.toLowerCase() === "true"
    ) {
      return true;
    }

    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
      return true;
    }
    current = current.parentElement;
  }

  return element.matches(":disabled");
}

function isProgrammaticallyFocusable(element: HTMLElement, container: HTMLElement) {
  if (!element.isConnected || !container.contains(element) || isUnavailable(element)) {
    return false;
  }
  return element.hasAttribute("tabindex") || element.matches(focusableSelector);
}

function tabIndexValue(element: HTMLElement) {
  const attribute = element.getAttribute("tabindex");
  if (attribute === null) return 0;
  const parsed = Number(attribute);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tabbableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .map((element, domOrder) => ({ element, domOrder, tabIndex: tabIndexValue(element) }))
    .filter(({ element, tabIndex }) => tabIndex >= 0 && isProgrammaticallyFocusable(element, container))
    .sort((left, right) => {
      const leftGroup = left.tabIndex > 0 ? 0 : 1;
      const rightGroup = right.tabIndex > 0 ? 0 : 1;
      return leftGroup - rightGroup || left.tabIndex - right.tabIndex || left.domOrder - right.domOrder;
    })
    .map(({ element }) => element);
}

function handleOverlayKeyDown(event: KeyboardEvent) {
  const topmost = overlayStack.at(-1);
  const container = topmost?.containerRef.current;
  if (!topmost || !container) return;

  if (event.key === "Escape") {
    if (!topmost.busyRef.current) {
      event.preventDefault();
      topmost.onCloseRef.current?.();
    }
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = tabbableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;

  if (!container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function syncKeydownListener() {
  if (overlayStack.length > 0 && !keydownListenerInstalled) {
    document.addEventListener("keydown", handleOverlayKeyDown);
    keydownListenerInstalled = true;
  } else if (overlayStack.length === 0 && keydownListenerInstalled) {
    document.removeEventListener("keydown", handleOverlayKeyDown);
    keydownListenerInstalled = false;
  }
}

function addOverlay(entry: OverlayEntry) {
  const existingIndex = overlayStack.findIndex((candidate) => candidate.id === entry.id);
  if (existingIndex >= 0) overlayStack.splice(existingIndex, 1);
  overlayStack.push(entry);
  syncOverlayPresentation();
  syncKeydownListener();
}

function syncOverlayPresentation() {
  overlayStack.forEach((entry, stackOrder) => {
    const root = entry.presentationRef.current;
    if (!root) return;
    root.dataset.overlayLayer = String(stackOrder);
    root.style.setProperty("--ui-overlay-stack-order", String(stackOrder));
    root.style.zIndex = overlayZIndex;
  });
}

function removeOverlay(id: symbol) {
  const index = overlayStack.findIndex((entry) => entry.id === id);
  const wasTopmost = index === overlayStack.length - 1;
  if (index >= 0) {
    const root = overlayStack[index]?.presentationRef.current;
    root?.removeAttribute("data-overlay-layer");
    root?.style.removeProperty("--ui-overlay-stack-order");
    root?.style.removeProperty("z-index");
    overlayStack.splice(index, 1);
    syncOverlayPresentation();
  }
  syncKeydownListener();
  return wasTopmost;
}

function acquireBodyScrollLock(owner: symbol) {
  if (bodyScrollLockOwners.has(owner)) return () => undefined;
  if (bodyScrollLockOwners.size === 0) {
    bodyOverflowBeforeFirstLock = document.body.style.overflow;
  }
  bodyScrollLockOwners.add(owner);
  document.body.style.overflow = "hidden";

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (!bodyScrollLockOwners.delete(owner)) return;
    if (bodyScrollLockOwners.size === 0) {
      document.body.style.overflow = bodyOverflowBeforeFirstLock;
      bodyOverflowBeforeFirstLock = "";
    }
  };
}

export function useOverlay({
  open,
  containerRef,
  presentationRef,
  onClose,
  busy = false,
  initialFocusRef,
  returnFocusRef,
  defaultInitialFocusContainerRef
}: UseOverlayOptions) {
  const instanceIdRef = useRef<symbol>(Symbol("overlay"));
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;

    const id = instanceIdRef.current;
    const priorFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const entry: OverlayEntry = {
      id,
      containerRef,
      presentationRef,
      onCloseRef,
      busyRef
    };
    const releaseBodyScrollLock = acquireBodyScrollLock(id);
    addOverlay(entry);

    const focusInitial = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const markedInitialFocus = Array.from(
        container.querySelectorAll<HTMLElement>("[data-dialog-initial-focus]")
      ).find((element) => isProgrammaticallyFocusable(element, container));
      const explicitInitialFocus = initialFocusRef?.current;
      const defaultInitialFocusContainer = defaultInitialFocusContainerRef?.current;
      const target =
        (explicitInitialFocus && isProgrammaticallyFocusable(explicitInitialFocus, container)
          ? explicitInitialFocus
          : null) ??
        markedInitialFocus ??
        (defaultInitialFocusContainer
          ? tabbableElements(defaultInitialFocusContainer)[0]
          : null) ??
        tabbableElements(container)[0] ??
        container;
      target.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusInitial);
      const wasTopmost = removeOverlay(id);
      releaseBodyScrollLock();
      if (!wasTopmost) return;

      const returnTarget =
        connected(returnFocusRef?.current) ?? connected(priorFocus);
      returnTarget?.focus();
    };
  }, [
    containerRef,
    defaultInitialFocusContainerRef,
    initialFocusRef,
    open,
    presentationRef,
    returnFocusRef
  ]);
}
