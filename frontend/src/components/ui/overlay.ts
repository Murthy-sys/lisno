import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject
} from "react";
import { createPortal } from "react-dom";

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
  ancestors: readonly symbol[];
  containerRef: RefObject<HTMLElement | null>;
  presentationRef: RefObject<HTMLElement | null>;
  onCloseRef: RefObject<() => void>;
  busyRef: RefObject<boolean>;
  returnFocusTargets: () => Array<HTMLElement | null | undefined>;
}

interface UseOverlayOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  presentationRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  busy?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  defaultInitialFocusContainerRef?: RefObject<HTMLElement | null>;
}

const overlayStack: OverlayEntry[] = [];
const documentScrollLockOwners = new Set<symbol>();
let documentOverflowBeforeFirstLock: Array<{ property: string; value: string; priority: string }> = [];
let keydownListenerInstalled = false;
const isolatedElements = new Map<HTMLElement, string | null>();
let backgroundObserver: MutationObserver | undefined;
const OverlayAncestors = createContext<readonly symbol[]>([]);
export const OverlayScope = OverlayAncestors.Provider;

function firstSummary(details: HTMLElement) {
  return Array.from(details.children).find((child) => child.tagName === "SUMMARY");
}

function isImplicitlyFocusableSummary(element: HTMLElement) {
  if (element.tagName !== "SUMMARY" || element.hasAttribute("tabindex")) return true;
  const parent = element.parentElement;
  return parent?.tagName === "DETAILS" && firstSummary(parent) === element;
}

function isUnavailable(element: HTMLElement) {
  let detailsAncestor = element.parentElement;
  while (detailsAncestor) {
    if (
      detailsAncestor.tagName === "DETAILS" &&
      !detailsAncestor.hasAttribute("open") &&
      !firstSummary(detailsAncestor)?.contains(element)
    ) {
      return true;
    }
    detailsAncestor = detailsAncestor.parentElement;
  }

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

  return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
}

function isProgrammaticallyFocusable(element: HTMLElement, container: HTMLElement) {
  if (!element.isConnected || !container.contains(element) || isUnavailable(element)) {
    return false;
  }
  return isImplicitlyFocusableSummary(element) &&
    (element.hasAttribute("tabindex") || element.matches(focusableSelector));
}

function tabIndexValue(element: HTMLElement) {
  return element.hasAttribute("tabindex") ? element.tabIndex : 0;
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
    event.preventDefault();
    if (!topmost.busyRef.current) {
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

  if (!focusable.includes(active as HTMLElement)) {
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
  // A child's effect can register before its parent on the first React commit.
  // Keep logical nesting even when that child is a separate body portal.
  const descendantIndex = overlayStack.findIndex((candidate) => candidate.ancestors.includes(entry.id));
  if (descendantIndex >= 0) overlayStack.splice(descendantIndex, 0, entry);
  else overlayStack.push(entry);
  syncOverlayPresentation();
  syncKeydownListener();
}

// Isolate siblings along the active layer's ancestor path. Navigation drawers
// can live inside the shell; making that entire shell inert would also disable
// the drawer. Contextual panels and nested dialogs can instead be body portals.
function syncBackgroundIsolation() {
  for (const [element, originalInert] of isolatedElements) {
    if (originalInert === null) element.removeAttribute("inert");
    else element.setAttribute("inert", originalInert);
  }
  isolatedElements.clear();

  const activeLayer = overlayStack.at(-1)?.presentationRef.current;
  if (activeLayer?.isConnected) {
    let branch: HTMLElement = activeLayer;
    while (branch !== document.body && branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) {
        if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
        isolatedElements.set(sibling, sibling.getAttribute("inert"));
        sibling.setAttribute("inert", "");
      }
      branch = parent;
    }
  }

  if (overlayStack.length && !backgroundObserver) {
    backgroundObserver = new MutationObserver(syncBackgroundIsolation);
    backgroundObserver.observe(document.body, { childList: true, subtree: true });
  } else if (!overlayStack.length && backgroundObserver) {
    backgroundObserver.disconnect();
    backgroundObserver = undefined;
  }
}

function syncOverlayPresentation() {
  overlayStack.forEach((entry, stackOrder) => {
    const root = entry.presentationRef.current;
    if (!root) return;
    root.dataset.overlayLayer = String(stackOrder);
    root.style.setProperty("--ui-overlay-stack-order", String(stackOrder));
    root.style.zIndex = overlayZIndex;
  });
  syncBackgroundIsolation();
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

function acquireDocumentScrollLock(owner: symbol) {
  if (documentScrollLockOwners.has(owner)) return () => undefined;
  if (documentScrollLockOwners.size === 0) {
    const style = document.documentElement.style;
    documentOverflowBeforeFirstLock = ["overflow", "overflow-x", "overflow-y"].map((property) => ({
      property, value: style.getPropertyValue(property), priority: style.getPropertyPriority(property)
    }));
  }
  documentScrollLockOwners.add(owner);
  // Lock the viewport without making body a new scroll ancestor for sticky navigation.
  document.documentElement.style.overflow = "hidden";

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (!documentScrollLockOwners.delete(owner)) return;
    if (documentScrollLockOwners.size === 0) {
      const style = document.documentElement.style;
      for (const { property } of documentOverflowBeforeFirstLock) style.removeProperty(property);
      for (const { property, value, priority } of documentOverflowBeforeFirstLock) {
        if (value) style.setProperty(property, value, priority);
      }
      documentOverflowBeforeFirstLock = [];
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
  fallbackFocusRef,
  defaultInitialFocusContainerRef
}: UseOverlayOptions) {
  const instanceIdRef = useRef<symbol>(Symbol("overlay"));
  const ancestors = useContext(OverlayAncestors);
  const scope = useMemo(() => [...ancestors, instanceIdRef.current], [ancestors]);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  const requestClose = useCallback(() => {
    if (overlayStack.at(-1)?.id !== instanceIdRef.current || busyRef.current) return;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;

    const id = instanceIdRef.current;
    const priorFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const priorWorkspace = priorFocus?.closest<HTMLElement>("main[tabindex]");
    const parentReturnTargets = [...overlayStack].reverse()
      .find((candidate) => !candidate.ancestors.includes(id))?.returnFocusTargets;
    const entry: OverlayEntry = {
      id,
      ancestors,
      containerRef,
      presentationRef,
      onCloseRef,
      busyRef,
      returnFocusTargets: () => [
        returnFocusRef?.current,
        priorFocus,
        fallbackFocusRef?.current,
        ...(parentReturnTargets?.() ?? []),
        priorWorkspace
      ]
    };
    const releaseDocumentScrollLock = acquireDocumentScrollLock(id);
    addOverlay(entry);

    const focusInitial = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container || overlayStack.at(-1)?.id !== id || isUnavailable(container)) return;
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
      releaseDocumentScrollLock();
      if (!wasTopmost) return;

      const remainingContainer = overlayStack.at(-1)?.containerRef.current;
      const focusBoundary = remainingContainer ?? document.body;
      const returnTargets = entry.returnFocusTargets();
      if (remainingContainer) {
        returnTargets.push(...tabbableElements(remainingContainer), remainingContainer);
      }
      for (const target of returnTargets) {
        if (!target || !isProgrammaticallyFocusable(target, focusBoundary)) continue;
        target.focus();
        if (document.activeElement === target) break;
      }
    };
  }, [
    ancestors,
    containerRef,
    defaultInitialFocusContainerRef,
    fallbackFocusRef,
    initialFocusRef,
    open,
    presentationRef,
    returnFocusRef
  ]);

  return { requestClose, scope };
}

/*
 * Overlays mount on `document.body` instead of where they are declared. Role
 * themes give panels such as `.estimate-design-uploads` a `backdrop-filter`,
 * and a filtered ancestor becomes the containing block for `position: fixed`
 * descendants — which would centre a modal inside that panel rather than the
 * viewport and clip it at the panel edge.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
