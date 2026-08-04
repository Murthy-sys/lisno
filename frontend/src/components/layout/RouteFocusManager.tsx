import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export interface RouteFocusManagerProps {
  mainId?: string;
  headingSelector?: string;
}

const terminalStateSelector = [
  '[data-page-state="error"]',
  '[data-page-state="empty"]',
  '[data-section-state="error"]',
  '[data-section-state="empty"]'
].join(",");

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
    !element.matches(focusableSelector) ||
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
    if (style.display === "none" || style.visibility === "hidden") return false;
    current = current.parentElement;
  }

  return true;
}

function routeMain(mainId: string) {
  const identifiedMain = document.getElementById(mainId);
  if (identifiedMain instanceof HTMLElement && identifiedMain.tagName === "MAIN") {
    return identifiedMain;
  }

  if (mainId !== "main-content") return null;
  const mains = document.querySelectorAll<HTMLElement>("main");
  return mains.length === 1 ? mains[0] ?? null : null;
}

function focusElement(element: HTMLElement, addTabIndex = false) {
  if (addTabIndex && !element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
}

export function RouteFocusManager({
  mainId = "main-content",
  headingSelector = "h1"
}: RouteFocusManagerProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousKey = useRef<string | null>(null);
  const savedFocus = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const locationKey = location.key;
    if (previousKey.current === locationKey) return;

    const isInitialLocation = previousKey.current === null;
    previousKey.current = locationKey;
    let observer: MutationObserver | null = null;
    let observerDisconnected = false;

    const disconnectObserver = () => {
      if (!observer || observerDisconnected) return;
      observer.disconnect();
      observerDisconnected = true;
    };

    const saveCurrentFocus = () => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement !== document.body) {
        savedFocus.current.set(locationKey, activeElement);
      }
    };

    if (isInitialLocation) return saveCurrentFocus;

    const main = routeMain(mainId);
    const markedReplace =
      navigationType === "REPLACE" &&
      (location.state as { routeFocus?: unknown } | null)?.routeFocus === true;

    if (!main || (navigationType === "REPLACE" && !markedReplace)) {
      return saveCurrentFocus;
    }

    const focusDestination = () => {
      const heading = main.querySelector<HTMLElement>(headingSelector);
      if (heading) {
        focusElement(heading, true);
        disconnectObserver();
        return true;
      }

      if (main.querySelector(terminalStateSelector)) {
        focusElement(main);
        disconnectObserver();
        return true;
      }

      return false;
    };

    if (navigationType === "POP") {
      const savedElement = savedFocus.current.get(locationKey);
      if (savedElement && isAvailable(savedElement)) {
        focusElement(savedElement);
        return saveCurrentFocus;
      }
    }

    if (!focusDestination()) {
      observer = new MutationObserver(() => {
        focusDestination();
      });
      observer.observe(main, { childList: true, subtree: true });
    }

    return () => {
      disconnectObserver();
      saveCurrentFocus();
    };
  }, [headingSelector, location.key, location.state, mainId, navigationType]);

  return null;
}
