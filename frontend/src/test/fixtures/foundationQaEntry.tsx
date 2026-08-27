import axe from "axe-core";
import { createRoot } from "react-dom/client";

import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import "../../styles/index.css";
import { FoundationQaPage, type FoundationQaState } from "./FoundationQaPage";

declare global {
  interface Window {
    __lisnoRunAxe?: () => Promise<axe.AxeResults>;
  }
}

type FoundationQaAxeScanner = (
  target: Document | HTMLElement
) => Promise<axe.AxeResults>;

export interface FoundationQaAxeController {
  attachIframe(iframe: HTMLIFrameElement | null): void;
  markIframeLoaded(iframe: HTMLIFrameElement): void;
  run(): Promise<axe.AxeResults>;
}

const foundationStates = new Set<FoundationQaState>([
  "default",
  "loading",
  "empty",
  "error",
  "conflict",
  "session-expired",
  "toast",
  "drawer"
]);

function fullyDecode(value: string) {
  let decoded = value;

  for (let pass = 0; pass < 5; pass += 1) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) return decoded;
    decoded = next;
  }

  return null;
}

export function resolveFoundationQaTarget(target: string | null, origin: string) {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
    return null;
  }

  let decodedTarget: string | null;
  try {
    decodedTarget = fullyDecode(target);
  } catch {
    return null;
  }
  if (!decodedTarget || /^\/{2,}/.test(decodedTarget) || decodedTarget.includes("\\")) return null;

  let base: URL;
  let parsed: URL;
  try {
    base = new URL(origin);
    parsed = new URL(target, base);
  } catch {
    return null;
  }
  if (parsed.origin !== base.origin) return null;

  let decodedPath: string | null;
  try {
    decodedPath = fullyDecode(parsed.pathname);
  } catch {
    return null;
  }
  if (!decodedPath || /^\/{2,}/.test(decodedPath) || decodedPath.includes("\\")) return null;
  const canonicalPath = decodedPath.replace(/\/{2,}/g, "/");
  if (canonicalPath.startsWith("/qa/ui-foundation.html")) return null;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function loadedIframeDocument(iframe: HTMLIFrameElement, expectedHref: string) {
  const iframeDocument = iframe.contentDocument;
  if (!iframeDocument?.body || iframeDocument.readyState !== "complete") return null;

  try {
    if (iframe.contentWindow?.location.href !== expectedHref) return null;
  } catch {
    return null;
  }

  return iframeDocument;
}

export function createFoundationQaAxeController(
  requestedTarget: string | null,
  origin: string,
  scan: FoundationQaAxeScanner = (target) => axe.run(target)
): FoundationQaAxeController {
  const expectedHref = requestedTarget
    ? new URL(requestedTarget, origin).href
    : null;
  let iframe: HTMLIFrameElement | null = null;
  let readyDocument: Document | null = null;

  return {
    attachIframe(nextIframe) {
      if (nextIframe === iframe) return;
      iframe = nextIframe;
      readyDocument = null;
    },
    markIframeLoaded(loadedIframe) {
      if (loadedIframe !== iframe || !expectedHref) return;
      readyDocument = loadedIframeDocument(loadedIframe, expectedHref);
    },
    run() {
      if (!expectedHref) return scan(document.body);

      const currentDocument = iframe
        ? loadedIframeDocument(iframe, expectedHref)
        : null;
      if (!readyDocument || currentDocument !== readyDocument) {
        readyDocument = null;
        return Promise.reject(
          new Error("UI foundation target iframe is not ready.")
        );
      }

      return scan(readyDocument);
    }
  };
}

export function installFoundationQaAxeHook(
  controller: FoundationQaAxeController
) {
  window.__lisnoRunAxe = () => controller.run();
}

const root = document.getElementById("root");
const parameters = new URLSearchParams(window.location.search);
const target = resolveFoundationQaTarget(
  parameters.get("target"),
  window.location.origin
);
const axeController = createFoundationQaAxeController(
  target,
  window.location.origin
);

if (root) {
  const requestedState = parameters.get("state") as FoundationQaState | null;
  const state = requestedState && foundationStates.has(requestedState)
    ? requestedState
    : "default";

  createRoot(root).render(
    <FeedbackProvider>
      {target ? (
        <iframe
          ref={(iframe) => axeController.attachIframe(iframe)}
          onLoad={(event) => axeController.markIframeLoaded(event.currentTarget)}
          title="UI foundation target"
          src={target}
        />
      ) : (
        <FoundationQaPage state={state} />
      )}
    </FeedbackProvider>
  );
}

installFoundationQaAxeHook(axeController);
