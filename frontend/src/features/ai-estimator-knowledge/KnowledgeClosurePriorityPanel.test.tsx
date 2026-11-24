import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { KnowledgeClosurePriorityPanel, type ClosureEditorHandle } from "./KnowledgeClosurePriorityPanel";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import * as sync from "./knowledgeMutationSync";
import type { KnowledgeItemDetail, KnowledgeSectionEnvelope, KnowledgeJsonObject } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ getKnowledgeSection: vi.fn(), getKnowledgeItem: vi.fn(), updateKnowledgeSection: vi.fn() }));
const line = { mainLineId: "line", version: 4, draftRevisionId: "draft" } as KnowledgeItemDetail;
const overview: KnowledgeSectionEnvelope<KnowledgeJsonObject> = {
  id: "overview", sectionKey: "overview", mainLineId: "line", revisionId: "draft", version: 2,
  applicability: "not_configured", payload: {}, createdById: "editor", updatedById: "editor",
  createdAt: "2026-11-23", updatedAt: "2026-11-23"
};
const save = () => screen.getByRole("button", { name: "Save closure priority" });
function setup() {
  const client = new QueryClient();
  const ref = createRef<ClosureEditorHandle>();
  function Editor() {
    const section = useQuery({ queryKey: knowledgeQueryKeys.section("line", "draft", "overview"), initialData: overview, enabled: false });
    const item = useQuery({ queryKey: knowledgeQueryKeys.item("line"), initialData: line, enabled: false });
    return <KnowledgeClosurePriorityPanel item={item.data} overview={section.data} ref={ref} editable
      onDirtyChange={vi.fn()} onSavingChange={vi.fn()} onUnknownOutcomeChange={vi.fn()} />;
  }
  render(<QueryClientProvider client={client}><Editor /></QueryClientProvider>);
  return { user: userEvent.setup(), ref };
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.mocked(api.getKnowledgeItem).mockResolvedValue(line);
  vi.mocked(api.getKnowledgeSection).mockResolvedValue(overview);
  vi.mocked(api.updateKnowledgeSection).mockImplementation(async (_id, _revision, _key, input) => ({
    ...overview, payload: input.payload, version: input.expectedVersion + 1, aggregateVersion: 6
  }));
});

it("preserves a local choice and reviews the latest Overview before retrying a conflict", async () => {
  const { user } = setup();
  vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed"));
  vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...overview, version: 3, payload: { closurePriority: "P3", uomId: "new-unit" } });
  vi.mocked(api.getKnowledgeItem).mockResolvedValue({ ...line, version: 5 });
  await user.click(screen.getByRole("radio", { name: "P1" }));
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "P2" })).toBeChecked();
  await user.click(save());
  expect(save()).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Load current closure priority" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Current saved closure priority: P3");
  expect(screen.getByRole("radio", { name: "P2" })).toBeChecked();
  await user.click(save());
  expect(api.updateKnowledgeSection).toHaveBeenLastCalledWith("line", "draft", "overview", {
    expectedVersion: 3, expectedAggregateVersion: 5, applicability: "not_configured", payload: { closurePriority: "P2", uomId: "new-unit" }
  });
});

it("protects an unconfirmed write until a fresh read verifies the saved choice", async () => {
  const { user, ref } = setup();
  vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("Lost response"));
  await user.click(screen.getByRole("radio", { name: "P1" }));
  await user.click(save());
  expect(ref.current?.discard()).toBe(false);
  vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...overview, version: 3, payload: { closurePriority: "P1" } });
  await user.click(screen.getByRole("button", { name: "Load current closure priority" }));
  expect(await screen.findByText("Closure priority saved.")).toBeVisible();
  expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
  expect(save()).toBeDisabled();
});

it("distinguishes failed view refresh from failed persistence", async () => {
  const { user } = setup();
  vi.spyOn(sync, "invalidateKnowledgeSectionMutation").mockRejectedValueOnce(new Error("Refresh unavailable"));
  await user.click(screen.getByRole("radio", { name: "P2" }));
  await user.click(save());
  expect(await screen.findByText("Closure priority saved. Reload to refresh related views.")).toBeVisible();
  expect(screen.getByRole("radio", { name: "P2" })).toBeChecked();
  expect(save()).toBeDisabled();
});
