import type { PMApprovedSourceRef, PMEstimateLine, PMEstimateView, PMMainLineScope, PMVendorCandidate, PMVendorSuggestion,
  PMVendorSuggestionCreate, PMVendorSuggestionUpdate } from "../../features/project-manager/pmEstimateTypes";
import type { ProcurementBasketDetail } from "../../features/procurement/procurementBasketApi";

export function enterpriseBasketRecommendations(basket: ProcurementBasketDetail, params: URLSearchParams) {
  const source: PMApprovedSourceRef = { ...basket.estimateSource, estimateReviewRoundId: basket.estimateSource.estimateReviewRoundId ?? "synthetic-approved-round",
    phase: basket.preparationSource?.phase ?? "legacy", designPlanVersion: 1,
    sourceSnapshotId: basket.preparationSource?.sourceSnapshotId ?? null, sourceDigest: basket.preparationSource?.sourceDigest ?? null };
  const mainLines = basket.lines.filter(line => line.included && line.mainLineId).map(line => ({ id: line.mainLineId!, name: line.mainLineName }));
  const items: PMVendorSuggestion[] = basket.lines.filter(line => line.included && line.mainLineId).map((line, index) => ({
    id: `qa-recommendation-${index}`, projectId: basket.projectId, source, storedSource: source, scope: "main_line",
    mainLine: { mainLineId: line.mainLineId!, mainLineName: line.mainLineName, mainBasketId: basket.id, mainBasketName: basket.name,
      occurrences: [{ sourceLineItemKey: line.sourceLineItemKey, sectionId: "synthetic-section", roomId: line.roomId, roomName: line.roomName }],
      scopeDigest: "a".repeat(64), canSuggest: true, unavailableReason: null },
    vendor: { id: "vendor-joinery", code: "VEN-J01", name: "Sharma Interiors" }, note: "Suggested for the named Main Line. Procurement should confirm availability before requesting the complete basket BOQ.",
    status: "suggested", version: 1, suggestedBy: { id: "site_manager-1", name: "Project Manager" }, updatedBy: { id: "site_manager-1", name: "Project Manager" },
    createdAt: "2026-10-29T09:00:00.000Z", updatedAt: "2026-10-29T09:00:00.000Z", sourceState: "current", canEdit: false,
    editUnavailableReason: "Only the suggestion author can edit this recommendation.", bidEligible: true, readinessReasons: [],
    activity: { availability: "unavailable", items: [], truncated: false }
  }));
  const filtered = items.filter(row => params.get("source") !== "history" && (!params.get("mainLineId") || row.mainLine?.mainLineId === params.get("mainLineId")));
  const limit = Number(params.get("limit") ?? 20), offset = Number(params.get("offset") ?? 0);
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset, mainLines };
}

/** Explicit synthetic browser QA transport. No production endpoint or data is touched. */
export function createEnterprisePMEstimates(empty = false, initialLinkState: string | null = "ready") {
  const linkStates = ["ready", "empty", "unavailable", "removed", "blocked"] as const;
  type LinkState = typeof linkStates[number];
  const validLinkState = (value: unknown): value is LinkState => typeof value === "string" && linkStates.includes(value as LinkState);
  let linkState: LinkState = validLinkState(initialLinkState) ? initialLinkState : "ready";
  const source = { estimateId: "approved-cedar", estimateVersion: 3, estimateReviewRoundId: "approved-cedar-round-3",
    phase: "post" as const, designPlanVersion: 0, sourceSnapshotId: "approved-cedar-round-3", sourceDigest: "a".repeat(64) };
  const at = "2026-10-29T09:00:00.000Z";
  const line = (id: string, room: string, mainLineId: string, name: string, quantity: number, ratePaise: number, included = true): PMEstimateLine => ({
    sourceLineItemKey: id, sectionId: `section-${room}`, roomId: room, roomName: room === "living" ? "Living & dining" : "Primary bedroom",
    mainLineId, itemType: mainLineId === "line-storage" ? "temporary" : "main_line", mainLineName: name, mainBasketId: "basket-ceiling", mainBasketName: "Interior works",
    specification: mainLineId === "line-ceiling" ? "Suspended gypsum ceiling with coordinated access panels and perimeter detailing. Confirm the saved finish specification with the approved room scope before site installation." : "Full-height storage with the approved internal fittings and finished panels.",
    included, quantity, unit: "sqft", ratePaise, amountPaise: quantity * ratePaise,
    dimensions: [{ label: "Length", value: "2.500", unit: "m" }, { label: "Width", value: "3.000", unit: "m" }] });
  const lines = [line("scope-living-ceiling", "living", "line-ceiling", "Gypsum false ceiling", 20, 1000000),
    line("scope-bedroom-ceiling", "bedroom", "line-ceiling", "Gypsum false ceiling", 15, 1000000),
    line("scope-storage", "bedroom", "line-storage", "Full-height fitted storage", 30, 3000000),
    line("scope-excluded", "living", "line-storage", "Additional storage option", 5, 3000000, false)];
  const mainLines: PMMainLineScope[] = ["line-ceiling", "line-storage"].map(id => ({ mainLineId: id, itemType: id === "line-storage" ? "temporary" : "main_line",
    mainLineName: lines.find(row => row.mainLineId === id)!.mainLineName, mainBasketId: "basket-ceiling", mainBasketName: "Interior works",
    occurrences: lines.filter(row => row.mainLineId === id && row.included).map(row => ({ sourceLineItemKey: row.sourceLineItemKey,
      sectionId: row.sectionId, roomId: row.roomId, roomName: row.roomName })), scopeDigest: id === "line-ceiling" ? "b".repeat(64) : "c".repeat(64), canSuggest: true, unavailableReason: null }));
  const vendors: PMVendorCandidate[] = [
    { id: "vendor-ceiling", code: "VEN001", name: "Cedar ceiling and interior works", classification: ["Interior works"], canSuggest: true, bidEligible: true, reasons: [] },
    { id: "vendor-joinery", code: "VEN002", name: "Workshop joinery and architectural finishing team", classification: ["Interior works"], canSuggest: true, bidEligible: true, reasons: [] },
    { id: "vendor-contact", code: "VEN003", name: "North workshop", classification: ["Interior works"], canSuggest: true, bidEligible: false, reasons: ["Procurement must confirm a bid-request email before inviting this vendor."] },
    { id: "vendor-inactive", code: "VEN004", name: "Retained ceiling contractor", classification: ["Interior works"], canSuggest: false, bidEligible: false, reasons: ["Vendor is inactive."] }
  ];
  const linkedIds: Record<string, string[]> = { "line-ceiling": ["vendor-ceiling", "vendor-contact", "vendor-inactive"], "line-storage": ["vendor-joinery", "vendor-contact"] };
  const linkedCandidates = (mainLineId: string) => linkState === "empty" || linkState === "removed" ? [] : vendors
    .filter(vendor => linkedIds[mainLineId]?.includes(vendor.id)).map(vendor => linkState === "blocked"
      ? { ...vendor, canSuggest: false, bidEligible: false, reasons: ["Vendor activation is incomplete."] } : vendor);
  const unavailableReason = "Current Main Line vendor Configuration is unavailable. Review Configuration before continuing.";
  const removedReason = "Vendor is no longer linked to this Main Line in Configuration.";
  const estimate: PMEstimateView = { project: { id: "pm-cedar", name: "Cedar residence" }, availability: empty ? "unavailable" : "available",
    reason: empty ? "No approved estimate is available yet." : null, source: empty ? null : source, approvedAt: empty ? null : at,
    lines: empty ? [] : lines, mainLines: empty ? [] : mainLines,
    totals: empty ? { subtotalPaise: null, gstPaise: null, totalPaise: null } : { subtotalPaise: 125000000, gstPaise: 22500000, totalPaise: 147500000 },
    writeAvailability: { available: !empty, reason: empty ? "An approved source is required." : null } };
  const rows: PMVendorSuggestion[] = empty ? [] : [{ id: "suggestion-ceiling", projectId: "pm-cedar", source, storedSource: source,
    scope: "main_line", mainLine: mainLines[0]!, vendor: vendors[0]!, note: "Completed comparable ceiling work. Ask Procurement to review availability and the approved room scope before inviting.",
    status: "suggested", version: 1, suggestedBy: { id: "site_manager-1", name: "Project Manager" }, updatedBy: { id: "site_manager-1", name: "Project Manager" },
    createdAt: at, updatedAt: at, sourceState: "current", canEdit: true, editUnavailableReason: null, bidEligible: true, readinessReasons: [],
    activity: { availability: "available", truncated: false, items: [{ enquiryId: "enquiry-ceiling", basketId: "basket-ceiling", revisionId: "revision-1", revision: 1,
      invitationId: "invitation-ceiling", requestedAt: "2026-10-29T10:00:00.000Z", deliveryStatus: "sent", deliveredAt: "2026-10-29T10:01:00.000Z", bidReceivedAt: null,
      lineResponded: false, respondedSourceLineItemKeys: [], coveredSourceLineItemKeys: ["scope-living-ceiling"], coverage: "partial", sourceRelation: "exact" }] } }];
  const fail = (status: number, message: string, code = "SYNTHETIC_ESTIMATE_CONFLICT") => Response.json({ error: { code, message } }, { status });
  const bounds = (params: URLSearchParams) => ({ offset: Number(params.get("offset") || 0), limit: Number(params.get("limit") || 20) });
  const projectSuggestion = (row: PMVendorSuggestion): PMVendorSuggestion => {
    const vendor = linkedCandidates(row.mainLine!.mainLineId).find(candidate => candidate.id === row.vendor.id);
    const linkReason = linkState === "unavailable" ? unavailableReason : !vendor ? removedReason : null;
    const reinstateReason = row.status !== "withdrawn" ? "This suggestion is not withdrawn." : linkReason
      ?? (!vendor?.canSuggest ? vendor?.reasons[0] ?? "Vendor is unavailable." : null);
    return { ...row, bidEligible: row.status === "suggested" && !linkReason && vendor?.bidEligible === true,
      readinessReasons: [...new Set([...(linkReason ? [linkReason] : []), ...(vendor?.reasons ?? row.readinessReasons)])],
      reinstatementAvailability: { available: reinstateReason === null, reason: reinstateReason } };
  };
  return {
    setLinkState(value: unknown) { if (validLinkState(value)) linkState = value; },
    read(path: string, params: URLSearchParams): unknown {
      if (path === "/projects/pm-cedar/pm/estimate") return structuredClone(estimate);
      if (path === "/projects/pm-cedar/pm/vendor-suggestion-candidates") {
        const selected = mainLines.find(row => row.mainLineId === params.get("mainLineId"));
        if (!selected || empty) return fail(409, "Choose a current approved item.");
        if (linkState === "unavailable") return fail(409, unavailableReason, "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE");
        const { offset, limit } = bounds(params), q = (params.get("q") || "").toLowerCase();
        const items = linkedCandidates(selected.mainLineId).filter(row => [row.name, row.code].join(" ").toLowerCase().includes(q));
        return { source, mainLine: selected, items: items.slice(offset, offset + limit), total: items.length, offset, limit };
      }
      if (path === "/projects/pm-cedar/pm/vendor-suggestions") {
        const { offset, limit } = bounds(params);
        const items = rows.filter(row => (!params.get("mainLineId") || row.mainLine?.mainLineId === params.get("mainLineId")) && params.get("source") !== "history");
        return { source: estimate.source, items: structuredClone(items.slice(offset, offset + limit).map(projectSuggestion)), total: items.length, offset, limit, writeAvailability: estimate.writeAvailability };
      }
      return undefined;
    },
    mutate(method: string, path: string, body: unknown): unknown {
      if (method === "POST" && path === "/projects/pm-cedar/pm/vendor-suggestions") {
        const input = body as PMVendorSuggestionCreate;
        const selected = mainLines.find(row => row.mainLineId === input.mainLineId), vendor = vendors.find(row => row.id === input.vendorId);
        if (!selected || !vendor || empty) return fail(409, "Review the current approved scope and vendor.");
        if (linkState === "unavailable") return fail(409, unavailableReason, "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE");
        const linked = linkedCandidates(selected.mainLineId).find(candidate => candidate.id === vendor.id);
        if (!linked) return fail(409, removedReason, "VENDOR_SUGGESTION_VENDOR_NOT_LINKED");
        if (!linked.canSuggest) return fail(409, "Vendor activation is incomplete.");
        if (rows.some(row => row.mainLine?.mainLineId === selected.mainLineId && row.vendor.id === vendor.id)) return fail(409, "This vendor is already suggested for this Main Line.");
        const id = `synthetic-suggestion-${rows.length + 1}`;
        rows.push({ id, projectId: "pm-cedar", source, storedSource: source, scope: "main_line", mainLine: selected, vendor,
          note: input.note, status: "suggested", version: 1, suggestedBy: { id: "site_manager-1", name: "Project Manager" }, updatedBy: { id: "site_manager-1", name: "Project Manager" },
          createdAt: at, updatedAt: at, sourceState: "current", canEdit: true, editUnavailableReason: null, bidEligible: vendor.bidEligible, readinessReasons: vendor.reasons,
          activity: { availability: "available", truncated: false, items: [] } });
        return { id, version: 1, status: "suggested" };
      }
      if (method === "PATCH" && path.startsWith("/projects/pm-cedar/pm/vendor-suggestions/")) {
        const row = rows.find(item => item.id === decodeURIComponent(path.split("/").at(-1)!)), input = body as PMVendorSuggestionUpdate;
        if (!row || row.version !== input.expectedVersion) return fail(409, "This suggestion changed. Refresh and review it.");
        if (row.status === "withdrawn" && input.status === "suggested") {
          if (linkState === "unavailable") return fail(409, unavailableReason, "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE");
          const linked = linkedCandidates(row.mainLine!.mainLineId).find(candidate => candidate.id === row.vendor.id);
          if (!linked) return fail(409, removedReason, "VENDOR_SUGGESTION_VENDOR_NOT_LINKED");
          if (!linked.canSuggest) return fail(409, "Vendor activation is incomplete.");
        }
        row.note = input.note; row.status = input.status; row.version += 1;
        return { id: row.id, version: row.version, status: row.status };
      }
      return undefined;
    }
  };
}
