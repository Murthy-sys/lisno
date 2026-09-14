import { tokenStorage } from "../../api/client";
import { ROLE_CODES, type Role, type PermissionCode } from "../../api/authorization-contract";
import { authorizationFor } from "../authFixtures";
import { enterpriseDataFor } from "./enterpriseRoutes";

export type EnterpriseState = "populated" | "empty" | "error" | "denied" | "loading" | "mutation-error";
export interface EnterpriseScenario { route: string; role: Role; state: EnterpriseState; }
export interface EnterpriseRequest { method: string; path: string; status: number; unexpected: boolean; }
const extraPermissions: Partial<Record<Role, readonly PermissionCode[]>> = {
  super_admin: ["estimation.client_response_tasks.read", "estimation.client_response_tasks.decide", "estimation.client_response_proof.read", "projects.design_workflow.read", "projects.design_workflow.payments.read", "access_request.review.decide", "project_access_grant.revoke"],
  admin: ["design.plan_assignment.manage", "design.plan_response_tasks.read", "estimation.client_response_tasks.read", "estimation.client_response_tasks.decide", "projects.design_workflow.read"],
};
export function readEnterpriseScenario(search: string): EnterpriseScenario {
  const params = new URLSearchParams(search);
  const requestedRole = params.get("role") ?? "super_admin";
  const requestedState = params.get("state") ?? "populated";
  const route = params.get("route") ?? "/admin/dashboard";
  if (!route.startsWith("/") || route.startsWith("//")) throw new Error("QA route must be a local path.");
  if (!ROLE_CODES.includes(requestedRole as Role)) throw new Error("Unknown synthetic QA role.");
  if (!["populated", "empty", "error", "denied", "loading", "mutation-error"].includes(requestedState)) throw new Error("Unknown synthetic QA state.");
  return { route, role: requestedRole as Role, state: requestedState as EnterpriseState };
}
function failure(status: number, code: string, message: string) { return Response.json({ error: { code, message } }, { status }); }
export function installEnterpriseTransport(scenario: EnterpriseScenario) {
  const requests: EnterpriseRequest[] = [];
  const originals = { fetch: window.fetch, get: tokenStorage.get, set: tokenStorage.set, clear: tokenStorage.clear, open: XMLHttpRequest.prototype.open, send: XMLHttpRequest.prototype.send, setRequestHeader: XMLHttpRequest.prototype.setRequestHeader, abort: XMLHttpRequest.prototype.abort };
  const publicRoute = /^\/(login|signup|forgot-password|reset-password|accept-invitation)(?:\?|$)/.test(scenario.route);
  let token: string | null = publicRoute ? null : "synthetic-enterprise-session";
  tokenStorage.get = () => token;
  tokenStorage.set = (next) => { token = next; };
  tokenStorage.clear = () => { token = null; };
  const alert = document.createElement("pre");
  alert.dataset.enterpriseTransportError = "true";
  alert.hidden = true;
  alert.setAttribute("role", "alert");
  Object.assign(alert.style, { whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxInlineSize: "100%" });
  // The diagnostics sibling stays outside the product DOM and appears only on unexpected traffic.
  document.body.append(alert);
  const log = (method: string, path: string, status: number, unexpected = false) => {
    requests.push({ method, path, status, unexpected });
    if (unexpected) { alert.hidden = false; alert.textContent = `Synthetic QA blocked unexpected request: ${method} ${path}`; }
  };
  window.fetch = async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.pathname.replace(/^\/api\/v1(?=\/|$)/, "");
    if (method !== "GET") { log(method, path, 422); return failure(422, "SYNTHETIC_MUTATION_FAILURE", "Synthetic QA: the change was not saved. Your values remain available to review."); }
    if (path === "/auth/me") { log(method, path, 200); return Response.json({ data: { id: scenario.role === "designer" ? "user-designer-ananya" : `${scenario.role}-1`, name: "Synthetic workspace reviewer", email: "reviewer@lisno.example", role: scenario.role } }); }
    if (path === "/auth/authorization") {
      const base = authorizationFor(scenario.role);
      const permissions = scenario.state === "denied" ? ["identity.self.read", "identity.authorization.read"] as const : [...new Set([...base.permissions, ...(extraPermissions[scenario.role] ?? [])])];
      log(method, path, 200); return Response.json({ data: authorizationFor(scenario.role, permissions) });
    }
    const data = enterpriseDataFor(path, url.searchParams, scenario);
    if (data === undefined) { log(method, path, 501, true); return failure(501, "UNEXPECTED_QA_REQUEST", `No synthetic response registered for ${path}.`); }
    if (scenario.state === "loading") { log(method, path, 0); return new Promise<Response>((_resolve, reject) => { const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined); if (signal?.aborted) reject(new DOMException("Aborted", "AbortError")); signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }); }); }
    if (scenario.state === "error") { log(method, path, 503); return failure(503, "SYNTHETIC_UNAVAILABLE", "Synthetic QA: this information could not be loaded."); }
    log(method, path, data instanceof Response ? data.status : 200);
    return data instanceof Response ? data : Response.json({ data });
  };
  const xhrRequests = new WeakMap<XMLHttpRequest, { method: string; path: string }>();
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL) { xhrRequests.set(this, { method, path: new URL(String(url), location.origin).pathname }); };
  XMLHttpRequest.prototype.setRequestHeader = function() {};
  XMLHttpRequest.prototype.send = function() { const request = xhrRequests.get(this) ?? { method: "UNKNOWN", path: "unknown-upload" }; log(request.method, request.path, 0); queueMicrotask(() => this.dispatchEvent(new ProgressEvent("error"))); };
  XMLHttpRequest.prototype.abort = function() { this.dispatchEvent(new ProgressEvent("abort")); };
  return { requests, restore: () => { window.fetch = originals.fetch; tokenStorage.get = originals.get; tokenStorage.set = originals.set; tokenStorage.clear = originals.clear; XMLHttpRequest.prototype.open = originals.open; XMLHttpRequest.prototype.send = originals.send; XMLHttpRequest.prototype.setRequestHeader = originals.setRequestHeader; XMLHttpRequest.prototype.abort = originals.abort; alert.remove(); } };
}
