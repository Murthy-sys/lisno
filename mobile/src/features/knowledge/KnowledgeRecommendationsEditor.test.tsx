import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { KnowledgeItemDetail, KnowledgeJsonObject } from "../../../../shared/knowledge/knowledgeTypes";
import { newRecommendationRule } from "../../../../shared/knowledge/knowledgeRecommendationPresentation";
import { KnowledgeRecommendationsEditor } from "./KnowledgeRecommendationsEditor";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
const current = { mainLineId: "source", basketId: "basket", status: "draft", priorityId: "priority-high", mainLineName: "Wall" } as KnowledgeItemDetail;
const target = { ...current, mainLineId: "related", mainLineName: "Framing", subBasketId: null, itemType: "temporary", version: 1 };
const page = (items: readonly unknown[]) => ({ items, pagination: { total: items.length, hasMore: false, offset: 0, limit: 100 } });
async function setup(initial: KnowledgeJsonObject, readOnly = false) {
  const changes = jest.fn();
  const validity = jest.fn();
  const context = { key: (...parts: readonly unknown[]) => ["test", "user", "knowledge", ...parts], scopeKey: "test:user:1", ready: true, canRead: true, canCreate: true, refresh: jest.fn(), api: { listKnowledgeItems: jest.fn(async () => page([current, target])), listKnowledgeBaskets: jest.fn(async () => page([{ id: "basket", name: "Joinery", status: "active" }])), listKnowledgeSubBaskets: jest.fn(async () => page([])) } } as unknown as KnowledgeMobileContext;
  function Harness() { const [payload, setPayload] = useState(initial); return <KnowledgeRecommendationsEditor item={current} context={context} payload={payload} onChange={next => { changes(next); setPayload(next); }} readOnly={readOnly} catalogsReady masters={{ priorities: [{ id: "priority-high", name: "High" } as never] }} onValidityChange={validity} />; }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  await waitFor(() => expect(screen.queryByText("Related items are loading…")).toBeNull());
  return { changes, validity, context };
}

it("adds native rules and carries stable IDs and target classification without overwriting payload", async () => {
  const view = await setup({ preserved: { legacy: true } });
  await fireEvent.press(screen.getByRole("button", { name: "Add Mandatory Item" }));
  await fireEvent.press(screen.getByRole("combobox", { name: "Main Basket" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Joinery" }));
  await fireEvent.press(screen.getByRole("combobox", { name: "Related item" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Framing (Temporary)" }));
  await fireEvent.changeText(screen.getByLabelText("Reason"), "Support the wall finish");
  await waitFor(() => expect(view.changes).toHaveBeenLastCalledWith(expect.objectContaining({ preserved: { legacy: true }, budgetAlterations: [expect.objectContaining({ targetKind: "main_line", targetType: "temporary", targetMainLineId: "related", targetBasketId: "basket", targetSubBasketId: null, trigger: "added", action: "add", requirement: "must", reason: "Support the wall finish" })] })));
  expect(view.validity).toHaveBeenLastCalledWith(true);
});

it("keeps unavailable saved IDs visible and blocks active unresolved rules, permitting explicit disabling", async () => {
  const rule = { ...newRecommendationRule("exclusions"), targetBasketId: "basket", targetMainLineId: "missing", targetSubBasketId: null, reason: "Exclude existing scope" };
  const view = await setup({ budgetAlterations: [rule] });
  await waitFor(() => expect(view.validity).toHaveBeenLastCalledWith(false));
  expect(screen.getByText("Unavailable saved target")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Edit rule 1" }));
  await fireEvent.press(screen.getByRole("checkbox", { name: "Rule enabled" }));
  expect(view.changes).toHaveBeenLastCalledWith({ budgetAlterations: [{ ...rule, active: false }] });
  await waitFor(() => expect(view.validity).toHaveBeenLastCalledWith(true));
});

it("offers only view controls for protected revisions", async () => {
  const rule = { ...newRecommendationRule("mandatory"), targetBasketId: "basket", targetMainLineId: "related", targetSubBasketId: null, targetType: "temporary", reason: "Required framing" };
  const view = await setup({ budgetAlterations: [rule] }, true);
  expect(screen.queryByRole("button", { name: "Add Mandatory Item" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "View rule 1" }));
  expect(screen.getByRole("combobox", { name: "Related action" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Remove rule" })).toBeNull();
  expect(view.changes).not.toHaveBeenCalled();
});
