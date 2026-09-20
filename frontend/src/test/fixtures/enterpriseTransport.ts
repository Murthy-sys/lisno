import { tokenStorage } from "../../api/client";
import { ROLE_CODES, type Role, type PermissionCode } from "../../api/authorization-contract";
import { authorizationFor } from "../authFixtures";
import { enterpriseDataFor } from "./enterpriseRoutes";
import type { KnowledgePreviewRequest } from "../../features/ai-estimator-knowledge/knowledgeApi";
import type { KnowledgePreview } from "../../features/ai-estimator-knowledge/knowledgeTypes";

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

type InHouseSettings = NonNullable<KnowledgePreviewRequest["modeCalculation"]>;
type InHouseResult = NonNullable<KnowledgePreview["modeCalculation"]>;

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Synthetic QA received an invalid calculation denominator.");
  return (numerator + denominator / 2n) / denominator;
}

function parseScaledDecimal(value: string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) throw new Error("Synthetic QA received an invalid quantity scale.");
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(value);
  const fraction = match?.[2] ?? "";
  if (!match || fraction.length > scale) throw new Error("Synthetic QA received an invalid decimal quantity.");
  const factor = 10n ** BigInt(scale);
  return BigInt(match[1]!) * factor + BigInt(fraction.padEnd(scale, "0") || "0");
}

function inHouseModePreview(
  settings: InHouseSettings,
  request: Pick<KnowledgePreviewRequest, "quantity" | "quantityScale" | "modeCalculationMarkupBasis" | "modeCalculationDiscountBps">
): InHouseResult {
  const quantity = request.quantity ?? "0";
  const quantityScaled = parseScaledDecimal(quantity, request.quantityScale);
  const limitScaled = parseScaledDecimal(settings.lowQuantityLimit, request.quantityScale);
  const factor = 10n ** BigInt(request.quantityScale);
  const impactBps = settings.impactBps ?? 1_000;
  const appliedImpactBps = quantityScaled <= limitScaled ? impactBps : 0;
  const revisedUnitRate = divideHalfUp(BigInt(settings.baseRatePaise) * BigInt(10_000 + appliedImpactBps), 10_000n);
  const revisedAmount = divideHalfUp(revisedUnitRate * quantityScaled, factor);
  const priceAt = (marginBps: number) => divideHalfUp(revisedAmount * 10_000n, 10_000n - BigInt(marginBps));
  const floorPrice = priceAt(settings.minimumMarkupBps);
  const selectedMargin = request.modeCalculationMarkupBasis === "minimum"
    ? settings.minimumMarkupBps
    : settings.startingMarkupBps;
  const totalBeforeDiscount = priceAt(selectedMargin);
  const maximumDiscount = totalBeforeDiscount === 0n
    ? 0n
    : ((totalBeforeDiscount - floorPrice) * 10_000n) / totalBeforeDiscount;
  const discountBps = request.modeCalculationDiscountBps ?? 0;
  if (discountBps < 0 || BigInt(discountBps) > maximumDiscount) {
    throw new Error("Discount exceeds the synthetic In-house selling-price floor.");
  }
  const discountAmount = divideHalfUp(totalBeforeDiscount * BigInt(discountBps), 10_000n);
  const total = totalBeforeDiscount - discountAmount;
  const asNumber = (value: bigint) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error("Synthetic In-house result exceeds the safe money range.");
    return number;
  };
  return {
    revisedUnitRatePaise: asNumber(revisedUnitRate),
    revisedAmountPaise: asNumber(revisedAmount),
    floorPricePaise: asNumber(floorPrice),
    maximumDiscountBps: asNumber(maximumDiscount),
    discountBasis: "selling_price",
    totalPaise: asNumber(total),
    appliedImpactBps,
    ...(request.modeCalculationDiscountBps !== undefined ? { discount: {
      rateBps: discountBps,
      totalBeforeDiscountPaise: asNumber(totalBeforeDiscount),
      amountPaise: asNumber(discountAmount)
    } } : {})
  };
}

function inHousePreview(input: KnowledgePreviewRequest): KnowledgePreview {
  const common = {
    quantity: input.quantity,
    quantityScale: input.quantityScale,
    modeCalculationMarkupBasis: input.modeCalculationMarkupBasis,
    modeCalculationDiscountBps: input.modeCalculationDiscountBps
  };
  const modeCalculation = input.modeCalculation
    ? inHouseModePreview(input.modeCalculation, common)
    : undefined;
  const inHouseCalculation = input.inHouseCalculation
    ? (() => {
      const labor = inHouseModePreview(input.inHouseCalculation.labor, common);
      const material = inHouseModePreview(input.inHouseCalculation.material, common);
      return { labor, material, totalPaise: labor.totalPaise + material.totalPaise };
    })()
    : undefined;
  if (!modeCalculation && !inHouseCalculation) throw new Error("Synthetic QA expected an In-house preview request.");
  return {
    formulaVersion: "knowledge-preview-v1",
    effectivePriceVersionId: null,
    taxVersionId: null,
    effectiveUnitRatePaise: null,
    adjustedUnitRate: null,
    requiredQuantity: null,
    procurementQuantity: null,
    vendorPreTax: null,
    vendorTax: null,
    vendorTotal: null,
    startMargin: null,
    bottomMargin: null,
    pmcMarkup: null,
    duration: null,
    ...(modeCalculation ? { modeCalculation } : {}),
    ...(inHouseCalculation ? { inHouseCalculation } : {})
  };
}

async function jsonBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  if (typeof init?.body === "string") return JSON.parse(init.body);
  if (input instanceof Request) return input.clone().json();
  throw new Error("Synthetic QA expected a JSON request body.");
}

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
    const inHouseReady = new URL(scenario.route, window.location.origin).searchParams.get("qaInHouse") === "ready";
    if (method === "POST" && path === "/admin/ai-estimator-knowledge/preview" && inHouseReady) {
      try {
        const data = inHousePreview(await jsonBody(input, init) as KnowledgePreviewRequest);
        log(method, path, 200);
        return Response.json({ data });
      } catch (error) {
        log(method, path, 422);
        return failure(422, "INVALID_BASIS_POINTS", error instanceof Error ? error.message : "Synthetic In-house preview failed.");
      }
    }
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
