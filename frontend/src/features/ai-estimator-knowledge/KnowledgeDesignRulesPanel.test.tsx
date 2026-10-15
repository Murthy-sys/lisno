import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { defaultDesignRules, DESIGN_RULE_QUESTIONS, type DesignRuleKey } from "../../../../shared/knowledge/designRules";
import { ApiError } from "../../api/client";
import { KnowledgeDesignRulesPanel, type KnowledgeDesignRulesPanelHandle } from "./KnowledgeDesignRulesPanel";
import * as api from "./knowledgeApi";
import type { KnowledgeItemDetail, KnowledgeMaster, KnowledgeSectionEnvelope } from "./knowledgeTypes";
vi.mock("./knowledgeApi", () => ({ getKnowledgeSection: vi.fn(), updateKnowledgeSection: vi.fn(), getKnowledgeItem: vi.fn() }));
vi.mock("./knowledgeMutationSync", () => ({ commitKnowledgeSectionMutation: vi.fn(), invalidateKnowledgeSectionMutation: vi.fn().mockResolvedValue(undefined) }));
const item = { mainLineId: "line-a", version: 4, draftRevision: { id: "revision-a" } } as KnowledgeItemDetail;
const section = (): KnowledgeSectionEnvelope => ({ id: "section-a", sectionKey: "design", mainLineId: "line-a", revisionId: "revision-a", version: 1, applicability: "not_configured", payload: defaultDesignRules(), createdById: "admin", updatedById: "admin", createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z" });
function setup(editable = true) {
  const dirty = vi.fn(), unknown = vi.fn(); const ref = createRef<KnowledgeDesignRulesPanelHandle>();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(<QueryClientProvider client={client}><KnowledgeDesignRulesPanel ref={ref} item={item} revisionId="revision-a" editable={editable} vendors={[{ id: "vendor-a", name: "Example vendor", status: "active" } as KnowledgeMaster]} vendorState={{ status: "ready", onRetry: vi.fn() }} onDirtyChange={dirty} onSavingChange={vi.fn()} onUnknownOutcomeChange={unknown} /></QueryClientProvider>);
  return { ...rendered, dirty, unknown, ref };
}
const answer = (key: DesignRuleKey, value: "Yes" | "No") => within(screen.getByRole("group", { name: (_name, el) => el.textContent?.includes(DESIGN_RULE_QUESTIONS[key]) ?? false })).getByRole("radio", { name: value });
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(api.getKnowledgeSection).mockResolvedValue(section()); vi.mocked(api.getKnowledgeItem).mockResolvedValue(item);
  vi.mocked(api.updateKnowledgeSection).mockImplementation(async (_line, _revision, _key, input) => ({ ...section(), version: 2, aggregateVersion: 5, payload: input.payload }));
});
describe("Design rules configuration", () => {
  it("renders fourteen native pairs; Custom defaults involvement and accepts explicit No", async () => {
    const user = userEvent.setup(); const view = setup(); await screen.findByRole("radio", { name: "Custom" });
    expect(screen.getAllByRole("radio", { name: "No", checked: true })).toHaveLength(14);
    await user.click(screen.getByRole("radio", { name: "Custom" })); expect(answer("designerVendorSelection", "Yes")).toBeChecked();
    await user.click(answer("designerVendorSelection", "No")); await user.click(screen.getByRole("button", { name: "Save Design rules" }));
    await waitFor(() => expect(api.updateKnowledgeSection).toHaveBeenCalledWith("line-a", "revision-a", "design", expect.objectContaining({ expectedVersion: 1, expectedAggregateVersion: 4, payload: expect.objectContaining({ itemNature: "custom", answers: expect.objectContaining({ designerVendorSelection: false }) }) })));
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("validates vendor discussion and stable PO checklist points", async () => {
    const user = userEvent.setup(); setup(); await screen.findByRole("radio", { name: "Custom" });
    await user.click(answer("vendorPreDiscussed", "Yes")); await user.click(screen.getByRole("button", { name: "Save Design rules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Select the discussed vendor");
    await user.selectOptions(screen.getByLabelText(/Discussed vendor/), "vendor-a"); await user.type(screen.getByLabelText(/Discussion notes/), "Reviewed samples");
    await user.click(answer("designerPoApproval", "Yes")); await user.click(screen.getByRole("button", { name: "Save Design rules" })); expect(screen.getByRole("alert")).toHaveTextContent("Add at least one");
    await user.click(screen.getByRole("button", { name: "Add approval point" })); await user.type(screen.getByLabelText(/Approval point 1/), "Verify finish");
    await user.click(screen.getByRole("button", { name: "Save Design rules" })); await waitFor(() => expect(api.updateKnowledgeSection).toHaveBeenCalledOnce());
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]?.[3].payload).toMatchObject({ discussedVendorId: "vendor-a", details: { vendorPreDiscussed: "Reviewed samples" }, poApprovalChecklist: [{ id: expect.stringMatching(/^point-/), text: "Verify finish" }] });
  });
  it("preserves a conflict choice until explicit reload and uses the new version", async () => {
    const user = userEvent.setup(); setup(); await screen.findByRole("radio", { name: "Custom" });
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed"));
    await user.click(answer("stockCheck", "Yes")); await user.click(screen.getByRole("button", { name: "Save Design rules" })); await screen.findByRole("button", { name: "Load current rules" });
    expect(answer("stockCheck", "Yes")).toBeChecked(); expect(screen.getByRole("button", { name: "Save Design rules" })).toBeDisabled();
    vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...section(), version: 3 }); await user.click(screen.getByRole("button", { name: "Load current rules" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Design rules" })).toBeEnabled()); await user.click(screen.getByRole("button", { name: "Save Design rules" }));
    await waitFor(() => expect(api.updateKnowledgeSection).toHaveBeenLastCalledWith("line-a", "revision-a", "design", expect.objectContaining({ expectedVersion: 3 })));
  });
  it("keeps uncertain same-version saves dirty and fences them with CAS confirmation", async () => {
    const user = userEvent.setup(); const view = setup(); await screen.findByRole("radio", { name: "Custom" }); vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("lost"));
    await user.click(answer("stockCheck", "Yes")); await user.click(screen.getByRole("button", { name: "Save Design rules" })); const confirm = await screen.findByRole("button", { name: "Confirm Design rules" });
    expect(view.ref.current?.discard()).toBe(false); await user.click(answer("stockCheck", "No")); expect(view.dirty).toHaveBeenLastCalledWith(true);
    await user.click(confirm); await screen.findByText("Design rules saved."); expect(view.unknown).toHaveBeenLastCalledWith(false);
  });
  it("keeps active history read-only", async () => { setup(false); expect(await screen.findByRole("radio", { name: "Custom" })).toBeDisabled(); expect(screen.queryByRole("button", { name: "Save Design rules" })).not.toBeInTheDocument(); });
  it("does not conceal malformed rules as all No", async () => { vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...section(), payload: { itemNature: "standard" } }); setup(); expect(await screen.findByRole("alert")).toHaveTextContent("Design rules are incomplete"); expect(screen.queryByRole("radio", { name: "Custom" })).not.toBeInTheDocument(); });
});
