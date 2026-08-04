import axe from "axe-core";
import { createRoot } from "react-dom/client";

import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import "../../styles/index.css";
import { FoundationQaPage, type FoundationQaState } from "./FoundationQaPage";

declare global {
  interface Window {
    __lisnoRunAxe?: () => ReturnType<typeof axe.run>;
  }
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
  if (decodedPath.startsWith("/qa/ui-foundation.html")) return null;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

const root = document.getElementById("root");

if (root) {
  const parameters = new URLSearchParams(window.location.search);
  const target = resolveFoundationQaTarget(parameters.get("target"), window.location.origin);
  const requestedState = parameters.get("state") as FoundationQaState | null;
  const state = requestedState && foundationStates.has(requestedState)
    ? requestedState
    : "default";

  createRoot(root).render(
    <FeedbackProvider>
      {target ? (
        <iframe title="UI foundation target" src={target} />
      ) : (
        <FoundationQaPage state={state} />
      )}
    </FeedbackProvider>
  );
}

window.__lisnoRunAxe = () => {
  const iframe = document.querySelector<HTMLIFrameElement>("iframe");
  const iframeDocument = iframe?.contentDocument;
  const target = iframeDocument?.readyState === "complete" && iframeDocument.body
    ? iframeDocument
    : document.body;

  return axe.run(target);
};
