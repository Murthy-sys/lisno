import type {
  DesignerAssignmentInboxItem, DesignerAssignmentRequestSummary, DesignerSuggestion, DesignerSuggestionsPage
} from "../../../../shared/projects/designerAssignment";

const now = "2026-11-25T09:00:00.000Z";
const designers: DesignerSuggestion[] = [
  { id: "qa-designer-1", name: "Ananya Rao", activeProjectCount: 0, languagesKnown: ["english", "hindi"], preferredLanguage: "english", location: "Pune", languageMatch: "preferred", locationMatch: "same_location", eligible: true, blockedReason: null },
  { id: "qa-designer-2", name: "Dev Kumar", activeProjectCount: 1, languagesKnown: ["hindi", "english"], preferredLanguage: "hindi", location: "Pune, Baner", languageMatch: "known", locationMatch: "city_text", eligible: true, blockedReason: null },
  { id: "qa-designer-3", name: "Meera Subramanian Krishnamurthy", activeProjectCount: 3, languagesKnown: ["english", "tamil", "telugu", "hindi", "kannada"], preferredLanguage: "english", location: "Pune, Shivajinagar", languageMatch: "preferred", locationMatch: "city_text", eligible: true, blockedReason: null },
  { id: "qa-designer-4", name: "Rohan Das", activeProjectCount: 5, languagesKnown: [], preferredLanguage: null, location: null, languageMatch: "unknown", locationMatch: "unknown", eligible: true, blockedReason: null },
  { id: "qa-designer-5", name: "Nisha Menon", activeProjectCount: 8, languagesKnown: ["malayalam"], preferredLanguage: "malayalam", location: "Kochi", languageMatch: "none", locationMatch: "none", eligible: true, blockedReason: null }
];

/** Isolated UI fixtures only. No real request or project is ever changed. */
export function createEnterpriseDesignerAssignments(empty: boolean) {
  const projects = new Map<string, { requests: DesignerAssignmentRequestSummary[]; assigned: DesignerSuggestionsPage["currentDesigner"]; revision: number }>();
  const stateFor = (projectId: string) => {
    let state = projects.get(projectId);
    if (!state) { state = { requests: [], assigned: null, revision: 1 }; projects.set(projectId, state); }
    return state;
  };
  const conflict = () => Response.json({ error: { code: "DESIGNER_ASSIGNMENT_CONFLICT", message: "This request changed or has closed. Refresh the assignment." } }, { status: 409 });
  const accept = (projectId: string, designerId: string) => {
    const state = stateFor(projectId);
    const winner = state.requests.find(request => request.designer.id === designerId && request.status === "pending");
    if (!winner) return false;
    for (const request of state.requests.filter(item => item.status === "pending")) {
      request.status = request.id === winner.id ? "accepted" : "cancelled";
      request.closureReason = request.id === winner.id ? null : "assigned_elsewhere";
      request.version += 1; request.decidedAt = now;
    }
    state.assigned = winner.designer; state.revision += 1;
    return true;
  };
  return {
    accept,
    read(path: string, params: URLSearchParams) {
      const match = path.match(/^\/admin\/projects\/([^/]+)\/designer-suggestions$/);
      if (!match) return undefined;
      const projectId = decodeURIComponent(match[1]!);
      const state = stateFor(projectId);
      const search = (params.get("search") ?? "").toLocaleLowerCase();
      const limit = Number(params.get("limit") ?? 20);
      const offset = Number(params.get("offset") ?? 0);
      const candidates = empty ? [] : designers.filter(designer => designer.name.toLocaleLowerCase().includes(search));
      const pendingRequests = state.requests.filter(request => request.status === "pending");
      return {
        projectId, serverNow: now, sourceRevision: `qa-assignment-${projectId}-${state.revision}`,
        projectPreferredLanguage: "english", projectLocation: "Pune", projectCity: "Pune",
        currentDesigner: state.assigned, pendingRequests, pendingRequest: pendingRequests.length === 1 ? pendingRequests[0]! : null,
        canRequest: true, blockedReason: null,
        items: candidates.slice(offset, offset + limit).map(designer => ({ ...designer,
          eligible: designer.id !== state.assigned?.id, blockedReason: designer.id === state.assigned?.id ? "This Designer is already assigned." : null })),
        pagination: { limit, offset, total: candidates.length, hasMore: offset + limit < candidates.length }
      } satisfies DesignerSuggestionsPage;
    },
    mutate(method: string, path: string, input: unknown) {
      const match = path.match(/^\/admin\/projects\/([^/]+)\/designer-assignment-requests(?:\/([^/]+)\/cancel)?$/);
      if (!match || method !== "POST") return undefined;
      const projectId = decodeURIComponent(match[1]!);
      const state = stateFor(projectId);
      const body = input as { designerId?: string; expectedVersion?: number; expectedSourceRevision?: string; idempotencyKey?: string };
      if (!body.idempotencyKey) return conflict();
      if (match[2]) {
        const request = state.requests.find(item => item.id === match[2]);
        if (!request || request.status !== "pending" || request.version !== body.expectedVersion) return conflict();
        request.status = "cancelled"; request.closureReason = "cancelled_by_admin"; request.version += 1; request.decidedAt = now;
        return request;
      }
      const designer = designers.find(item => item.id === body.designerId);
      if (!designer || empty || designer.id === state.assigned?.id || body.expectedSourceRevision !== `qa-assignment-${projectId}-${state.revision}` ||
        state.requests.some(item => item.designer.id === designer.id && item.status === "pending")) return conflict();
      const request: DesignerAssignmentRequestSummary = {
        id: `qa-request-${projectId}-${state.requests.length + 1}`, projectId, projectName: "Synthetic assignment project",
        designer: { id: designer.id, name: designer.name }, status: "pending", version: 1, createdAt: now,
        decidedAt: null, note: null, closureReason: null
      };
      state.requests.push(request);
      return request;
    }
  };
}

/** Opt-in inbox for user-designer-ananya in the isolated browser QA transport. */
export function createEnterpriseDesignerInbox(count: number) {
  let unavailable = false;
  const items: DesignerAssignmentInboxItem[] = Array.from({ length: count }, (_, index) => ({
    id: `qa-inbox-${index + 1}`, projectId: `qa-inbox-project-${index + 1}`,
    projectName: index === 0 ? "Harbour Home" : index === 1 ? "Garden Apartment" : `Assignment project ${index + 1}`,
    projectLocation: index === 0 ? "Pune, Baner" : null, preferredLanguage: index === 0 ? "english" : null,
    scopeSummary: { itemCount: 8 + index, sectionCount: 3, roomCount: 2 }, status: "pending", version: 1,
    createdAt: now, decidedAt: null, canDecide: true, blockedReason: null, closureReason: null
  }));
  return {
    update(state: string) {
      unavailable = state === "error";
      if (state === "closed") for (const item of items) {
        if (item.status === "pending") { item.status = "cancelled"; item.closureReason = "assigned_elsewhere"; item.version += 1; }
      }
    },
    read(params: URLSearchParams) {
      if (unavailable) return Response.json({ error: { code: "SYNTHETIC_UNAVAILABLE", message: "Assignment requests could not be refreshed." } }, { status: 503 });
      const pending = items.filter(item => item.status === "pending");
      const offset = Number(params.get("offset") ?? 0), limit = Number(params.get("limit") ?? 20);
      return { items: pending.slice(offset, offset + limit), pagination: { offset, limit, total: pending.length, hasMore: offset + limit < pending.length } };
    },
    decide(id: string, input: unknown) {
      const body = input as { expectedVersion?: number; decision?: string; idempotencyKey?: string };
      const item = items.find(item => item.id === id);
      if (!item || item.status !== "pending" || body.expectedVersion !== item.version || !body.idempotencyKey || !["accept", "decline"].includes(body.decision ?? "")) {
        return Response.json({ error: { code: "DESIGNER_ASSIGNMENT_CONFLICT", message: "This request changed or has closed. Refresh the assignment." } }, { status: 409 });
      }
      item.status = body.decision === "accept" ? "accepted" : "declined";
      item.version += 1; item.decidedAt = now; item.canDecide = false;
      return item;
    }
  };
}
