import axe from "axe-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { BrowserRouter } from "react-router-dom";

import { tokenStorage } from "../../api/client";
import { AuthProvider } from "../../auth/AuthProvider";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import "../../styles/index.css";
import "../../styles/role-themes.css";
import {
  counterSurface,
  longSurface,
  retiredSurface,
  runningFoot,
  squareFoot,
  SurfaceQaPage,
  SURFACE_QA_STATES,
  wallSurface,
  type SurfaceQaState
} from "./SurfaceQaPage";

const requested = new URLSearchParams(window.location.search).get("qaState");
const state: SurfaceQaState = SURFACE_QA_STATES.includes(requested as SurfaceQaState)
  ? requested as SurfaceQaState
  : "panel";

const duplicateName = new URLSearchParams(window.location.search).get("qaFetch") === "duplicate";
const managementSurfaces = state === "management-empty"
  ? []
  : [wallSurface, counterSurface, longSurface, retiredSurface];

function page<TItem>(items: readonly TItem[]) {
  return {
    data: {
      items,
      pagination: { limit: 100, offset: 0, total: items.length, hasMore: false }
    }
  };
}

/* The harness never reaches a server: every Surface state under review is a
   client-rendered projection, and a stubbed transport keeps the matrix
   deterministic across viewports. The session is stubbed the same way, because
   the management list gates its actions on real permission codes. */
tokenStorage.set("surface-qa-token");

window.fetch = async (input, init) => {
  const path = typeof input === "string"
    ? input
    : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? "GET").toUpperCase();

  if (path.includes("/auth/me")) {
    return Response.json({
      data: {
        id: "user-super-admin",
        name: "Sole Super Admin",
        email: "super-admin@lisno.example",
        role: "super_admin"
      }
    });
  }
  if (path.includes("/auth/authorization")) {
    return Response.json({
      data: {
        role: "super_admin",
        policyVersion: "surface-qa",
        permissions: [
          "ai_estimator_knowledge.configuration.read",
          "ai_estimator_knowledge.configuration.create",
          "ai_estimator_knowledge.configuration.update",
          "ai_estimator_knowledge.configuration.lifecycle"
        ]
      }
    });
  }
  if (method !== "GET") {
    return duplicateName
      ? Response.json(
          {
            error: {
              code: "DUPLICATE_IDENTITY",
              message: "A non-archived knowledge resource already uses that identity."
            }
          },
          { status: 409 }
        )
      : Response.json({ data: wallSurface });
  }
  if (path.includes("/uoms")) return Response.json(page([squareFoot, runningFoot]));
  if (path.includes("/surfaces")) return Response.json(page(managementSurfaces));
  if (path.includes("/ai-estimator-knowledge/")) return Response.json(page([]));
  return Response.json(
    { error: { code: "QA_REQUEST_BLOCKED", message: "The Surface QA harness blocks other requests." } },
    { status: 404 }
  );
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
});

const management = state === "management" || state === "management-empty";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <FeedbackProvider>
          <main className="app-main ui-app-shell" data-role="super_admin">
            <div className={management
              ? "knowledge-page"
              : "knowledge-page knowledge-page--item-workspace"}>
              <SurfaceQaPage state={state} />
            </div>
          </main>
        </FeedbackProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

const MINIMUM_TARGET = 44;

function smallTargets() {
  const selector = "button, [role=\"option\"], input, textarea, select, a[href]";
  return [...document.querySelectorAll<HTMLElement>(selector)]
    .filter((element) => element.offsetParent !== null || element === document.activeElement)
    .map((element) => {
      const box = element.getBoundingClientRect();
      return {
        label: (element.getAttribute("aria-label")
          ?? element.textContent?.trim()
          ?? element.tagName).slice(0, 60),
        width: Math.round(box.width),
        height: Math.round(box.height)
      };
    })
    .filter(({ width, height }) => width > 0 && height > 0)
    .filter(({ width, height }) => width < MINIMUM_TARGET || height < MINIMUM_TARGET);
}

declare global {
  interface Window {
    /* The driver re-reads the page after it interacts with it, so the report has
       to be callable rather than a one-shot snapshot taken at load. */
    __surfaceQaReport?: () => Promise<string>;
  }
}

async function report() {
  /* Remove the previous report before scanning: left in place it sits outside
     the page's landmarks and axe would flag the harness, not the product. */
  document.getElementById("surface-qa-report")?.remove();
  const results = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false } }
  });
  const element = document.createElement("pre");
  element.id = "surface-qa-report";
  element.textContent = JSON.stringify({
    state,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    smallTargets: smallTargets(),
    axeViolations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length
    }))
  });
  document.body.append(element);
  return element.textContent ?? "";
}

window.__surfaceQaReport = report;
window.setTimeout(() => { void report(); }, management ? 1200 : 300);
