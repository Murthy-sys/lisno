import {
  useEffect,
  useRef,
  type RefObject
} from "react";

export const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

interface OverlayEntry {
  id: symbol;
  containerRef: RefObject<HTMLElement | null>;
  onCloseRef: RefObject<() => void>;
  busyRef: RefObject<boolean>;
}

interface UseOverlayOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  busy?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  defaultInitialFocus?: () => HTMLElement | null;
}

const overlayStack: OverlayEntry[] = [];
const bodyScrollLockOwners = new Set<symbol>();
let bodyOverflowBeforeFirstLock = "";
let keydownListenerInstalled = false;

function connected(element: HTMLElement | null | undefined) {
  return element?.isConnected ? element : null;
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.isConnected
  );
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

  const focusable = focusableElements(container);
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
  syncKeydownListener();
}

function removeOverlay(id: symbol) {
  const index = overlayStack.findIndex((entry) => entry.id === id);
  const wasTopmost = index === overlayStack.length - 1;
  if (index >= 0) overlayStack.splice(index, 1);
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
  onClose,
  busy = false,
  initialFocusRef,
  returnFocusRef,
  defaultInitialFocus
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
      onCloseRef,
      busyRef
    };
    const releaseBodyScrollLock = acquireBodyScrollLock(id);
    addOverlay(entry);

    const focusInitial = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const target =
        connected(initialFocusRef?.current) ??
        connected(container.querySelector<HTMLElement>("[data-dialog-initial-focus]")) ??
        connected(defaultInitialFocus?.()) ??
        focusableElements(container)[0] ??
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
  }, [containerRef, defaultInitialFocus, initialFocusRef, open, returnFocusRef]);
}
