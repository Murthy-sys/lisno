import { ApiError } from "../../core/http/apiClient";
import { normalizeIntake as normalizedIntake } from "./ProposalIntakeFields";
import { proposalUncertain } from "./proposalRuntime";
import type { ProposalApi } from "./proposalApi";
import type { ProposalDecisionInput, ProposalDetail, ProposalIntakeContent, ProposalIntakeInput, ProposalScope, ProposalSubmitInput } from "./proposalTypes";
export type ProposalCommand = {
  kind: "save" | "submit" | "approve" | "reject" | "revise";
  basis: ProposalDetail; save?: ProposalIntakeInput; saved?: ProposalDetail;
  uncertainSave?: boolean;
  idempotencyKey: string; reason?: string; input?: ProposalSubmitInput | ProposalDecisionInput;
};

function sameIntake(expected: ProposalIntakeContent | undefined, actual: ProposalIntakeContent | undefined, previousIds?: Set<string>) {
  if (!expected || !actual || Boolean(expected.basket) !== Boolean(actual.basket)) return false;
  const left = normalizedIntake(expected);
  const right = normalizedIntake(actual);
  if (left.basket?.name !== right.basket?.name || left.basket?.description !== right.basket?.description
    || left.subBasket.name !== right.subBasket.name || left.subBasket.description !== right.subBasket.description
    || left.mainLines.length !== right.mainLines.length) return false;
  const seenIds = new Set<string>();
  return left.mainLines.every((line, index) => {
    const savedLine = right.mainLines[index];
    if (!savedLine || line.name !== savedLine.name || !savedLine.resourceId || seenIds.has(savedLine.resourceId)) return false;
    seenIds.add(savedLine.resourceId);
    return line.resourceId ? line.resourceId === savedLine.resourceId : Boolean(previousIds && !previousIds.has(savedLine.resourceId));
  });
}

/** Resolve only this save's immediate, exact content transition; later or differing writes require review. */
function reconcileUncertainSave(current: ProposalCommand, latest: ProposalDetail, scope: ProposalScope): "saved" | "unchanged" | "conflict" {
  const basis = current.basis;
  const oldTarget = basis.target ?? { kind: "new_main_basket" };
  const newTarget = latest.target ?? { kind: "new_main_basket" };
  const contextMatches = latest.id === basis.id && latest.requesterId === basis.requesterId
    && latest.requestId === basis.requestId && latest.basketId === basis.basketId && latest.status === basis.status
    && latest.requestMode === "hierarchy_intake" && latest.requestMode === basis.requestMode
    && oldTarget.kind === newTarget.kind
    && (oldTarget.kind !== "new_sub_basket" || (newTarget.kind === "new_sub_basket" && oldTarget.basketId === newTarget.basketId))
    && latest.head.id === basis.head.id;
  if (!contextMatches) return "conflict";
  if (latest.version === basis.version && latest.requestVersion === basis.requestVersion
    && latest.head.version === basis.head.version && latest.head.digest === basis.head.digest
    && sameIntake(basis.intake, latest.intake)) return "unchanged";
  const expectedRequestVersion = scope === "admin" && basis.requestVersion !== null ? basis.requestVersion + 1 : basis.requestVersion;
  const previousIds = new Set(basis.intake?.mainLines.flatMap(line => line.resourceId ? [line.resourceId] : []) ?? []);
  return latest.version === basis.version + 1 && latest.requestVersion === expectedRequestVersion
    && latest.head.version === basis.head.version + 1 && Boolean(latest.head.digest) && latest.head.digest !== basis.head.digest
    && sameIntake(current.save?.intake, latest.intake, previousIds) ? "saved" : "conflict";
}

export async function executeProposalCommand(api: ProposalApi, scope: ProposalScope, current: ProposalCommand, isCurrent: () => boolean = () => true) {
  const proposalId = current.basis.id;
  if (current.save && !current.saved) {
    if (current.uncertainSave) {
      const latest = await api.getProposal(scope, proposalId);
      const resolution = reconcileUncertainSave(current, latest, scope);
      if (resolution === "conflict") throw new ApiError(409, "VERSION_CONFLICT", "The saved request differs from this action. Reload and review it before continuing.");
      if (resolution === "saved") current.saved = latest;
    }
    if (!isCurrent()) throw new Error("This request session has ended.");
    if (!current.saved) {
      try { current.saved = await api.saveProposalIntake(scope, proposalId, current.save); current.uncertainSave = false; }
      catch (error) { current.uncertainSave = proposalUncertain(error); throw error; }
    }
  }
  if (!isCurrent()) throw new Error("This request session has ended.");
  const saved = current.saved ?? current.basis;
  if (current.kind === "save") return { kind: "save", detail: saved } as const;
  current.input ??= { expectedVersion: saved.version, ...(saved.requestVersion !== null ? { expectedRequestVersion: saved.requestVersion } : {}), idempotencyKey: current.idempotencyKey, ...(current.kind === "approve" || current.kind === "reject" ? { decision: current.kind === "approve" ? "approve" as const : "reject" as const, reason: current.reason ?? null } : {}) };
  if (current.kind === "approve" || current.kind === "reject") return { kind: "decision", result: await api.decideProposal(proposalId, current.input as ProposalDecisionInput) } as const;
  return { kind: current.kind, detail: await (current.kind === "submit" ? api.submitProposal : api.reviseProposal)(proposalId, current.input) } as const;
}
