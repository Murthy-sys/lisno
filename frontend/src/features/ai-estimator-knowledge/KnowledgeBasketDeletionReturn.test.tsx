import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import type { PermissionCode } from "../../api/authorization-contract";
import { CONFIGURATION_PATH } from "./basketDeletionNavigation";
import { KnowledgeBasketDeletionReturn } from "./KnowledgeBasketDeletionReturn";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeSubBasket } from "./knowledgeTypes";

let permissions: readonly PermissionCode[] | undefined;
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", permissions) }) }));
vi.mock("./knowledgeApi", async (original) => ({ ...await original<typeof import("./knowledgeApi")>(),
  listKnowledgeBaskets: vi.fn(), listKnowledgeSubBaskets: vi.fn(), getKnowledgeItem: vi.fn(), listKnowledgeMainLines: vi.fn(),
  getKnowledgeSubBasketDeletionImpact: vi.fn(), permanentlyDeleteKnowledgeSubBasket: vi.fn()
}));
const timestamp = "2026-11-03T08:00:00.000Z";
const basket: KnowledgeBasket = { id: "basket-target", name: "Current basket name", description: null, displayOrder: 2, status: "active", version: 4, createdById: "admin-one", updatedById: "admin-one", createdAt: timestamp, updatedAt: timestamp };
const subBasket: KnowledgeSubBasket = { ...basket, id: "sub-target", basketId: basket.id, name: "Current child name", version: 8 };
const target = { path: CONFIGURATION_PATH, basketId: basket.id, subBasketId: subBasket.id };
const impact = { basketId: basket.id, subBasketId: subBasket.id, subBasketName: subBasket.name, version: 8, mainLineCount: 0, referenceCount: 0, vendorReferenceCount: 0, impactToken: "fresh-impact" };
const page = <T,>(items: T[], offset = 0, hasMore = false) => ({ items, pagination: { limit: 100, offset, total: hasMore ? 2 : offset + items.length, hasMore } });
const completeness = { percentage: 0, sections: [], blockers: [], warnings: [] };
const source: KnowledgeItemDetail = {
  id: "item-one", mainLineId: "item-one", mainLineName: "Source Main Line", basketId: "source-basket", basketName: "Source basket", subBasketId: "source-sub",
  completionRequired: false, description: null, status: "draft", activeRevisionId: null, draftRevisionId: "draft-one", revisionNumber: 1,
  uomId: null, priorityId: null, modeIds: [], surfaceIds: [], vendorIds: [], completeness, allowedActions: ["update_section"],
  activeRevision: null, draftRevision: { id: "draft-one", mainLineId: "item-one", revisionNumber: 1, status: "draft", sourceRevisionId: null,
    contentDigest: null, completeness, activatedAt: null, activatedById: null, supersededAt: null, supersededById: null,
    version: 1, createdById: "admin-one", updatedById: "admin-one", createdAt: timestamp, updatedAt: timestamp },
  blockers: [], warnings: [], version: 1, createdById: "admin-one", updatedById: "admin-one", createdAt: timestamp, updatedAt: timestamp
};
const inlinePath = `${CONFIGURATION_PATH}/items/item-one`;

function ReturnHarness() {
  const focus = useRef<HTMLButtonElement>(null);
  return <><button ref={focus}>Configuration list</button><KnowledgeBasketDeletionReturn fallbackFocusRef={focus}
    renderMain={(current, close) => <section aria-label="Restored Main Basket"><p>{current.id}: {current.name} version {current.version}</p><button onClick={close}>Close Main Basket preview</button></section>} /></>;
}

function start(context: unknown = target, path = CONFIGURATION_PATH, initialClient?: QueryClient) {
  const client = initialClient ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: CONFIGURATION_PATH, element: <ReturnHarness /> },
    { path: `${CONFIGURATION_PATH}/items/:itemId`, element: <ReturnHarness /> },
    { path: "/away", element: <h1>Away</h1> }
  ], { initialEntries: [{ pathname: path, state: { basketDeletionTarget: context, unrelated: "preserved", confirmationName: "Old confirmation" } }] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { client, router };
}

beforeEach(() => {
  permissions = undefined; vi.resetAllMocks();
  vi.mocked(api.listKnowledgeBaskets).mockResolvedValue(page([basket]));
  vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([subBasket]));
  vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockResolvedValue(impact);
  vi.mocked(api.getKnowledgeItem).mockResolvedValue(source);
  vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([]));
  vi.mocked(api.permanentlyDeleteKnowledgeSubBasket).mockResolvedValue({ basketId: basket.id, subBasketId: subBasket.id,
    deleted: true, deletedAt: timestamp, deletedMainLineIds: [], deletedReferenceCount: 0 });
});

describe("return to basket deletion", () => {
  it("finds the exact child through fresh paginated catalogs and clears old confirmation", async () => {
    vi.mocked(api.listKnowledgeBaskets).mockImplementation(async (params) => params?.offset === 0
      ? page([{ ...basket, id: "basket-other", name: basket.name }], 0, true) : page([basket], 1));
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (_id, params) => params?.offset === 0
      ? page([{ ...subBasket, id: "sub-other", name: subBasket.name }], 0, true) : page([subBasket], 1));
    const { router } = start(); const dialog = await screen.findByRole("alertdialog", { name: "Delete Sub-Basket?" });
    const name = await within(dialog).findByRole("textbox", { name: "Type Sub-Basket name to confirm" });
    expect(name).toHaveValue(""); expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveValue("");
    expect(api.listKnowledgeBaskets).toHaveBeenNthCalledWith(2, { limit: 100, offset: 1, includeArchived: true });
    expect(api.listKnowledgeSubBaskets).toHaveBeenNthCalledWith(2, basket.id, { limit: 100, offset: 1 });
    expect(api.getKnowledgeSubBasketDeletionImpact).toHaveBeenCalledExactlyOnceWith(basket.id, subBasket.id);
    expect(within(dialog).getByRole("button", { name: "Delete Sub-Basket" })).toBeDisabled();
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
    await waitFor(() => expect(router.state.location.state).toEqual({ unrelated: "preserved", confirmationName: "Old confirmation" }));
  });

  it("requires a fresh impact even when the query cache contains an earlier preview", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(knowledgeQueryKeys.subBasketDeletionImpact(basket.id, subBasket.id), { ...impact, subBasketName: "Earlier child", impactToken: "old-impact" });
    let resolve!: (value: typeof impact) => void;
    vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockImplementation(() => new Promise((done) => { resolve = done; }));
    start(target, CONFIGURATION_PATH, client);
    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => expect(api.getKnowledgeSubBasketDeletionImpact).toHaveBeenCalledOnce());
    expect(within(dialog).getByRole("button", { name: "Delete Sub-Basket" })).toBeDisabled();
    expect(within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" })).toBeDisabled();
    await act(async () => resolve(impact));
    expect(await within(dialog).findByText(subBasket.name, { selector: "strong" })).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" })).toHaveValue("");
  });

  it("restores a Main Basket by current ID and name rather than a prior label", async () => {
    start({ path: CONFIGURATION_PATH, basketId: basket.id });
    const restored = await screen.findByRole("region", { name: "Restored Main Basket" });
    expect(restored).toHaveTextContent("basket-target: Current basket name version 4");
    expect(api.listKnowledgeSubBaskets).not.toHaveBeenCalled();
  });

  it("consumes the return target once and closing does not reopen on a later visit", async () => {
    const { router } = start(); const user = userEvent.setup();
    await screen.findByRole("textbox", { name: "Type Sub-Basket name to confirm" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Configuration list" })).toHaveFocus());
    await act(async () => { await router.navigate("/away"); await router.navigate(-1); });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.listKnowledgeBaskets).toHaveBeenCalledOnce();
    expect(api.getKnowledgeSubBasketDeletionImpact).toHaveBeenCalledOnce();
  });

  it.each([null, { ...target, path: "https://example.invalid" }, { ...target, path: `${CONFIGURATION_PATH}/items/another` }])("ignores absent, invalid, or route-mismatched state %#", (context) => {
    start(context); expect(api.listKnowledgeBaskets).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("denies restoration without lifecycle access and does not fetch target data", async () => {
    permissions = ["ai_estimator_knowledge.configuration.read"];
    start(); expect(screen.getByText("Basket deletion could not reopen")).toBeVisible();
    expect(screen.getByText("You no longer have permission to delete this basket.")).toBeVisible();
    expect(api.listKnowledgeBaskets).not.toHaveBeenCalled(); expect(api.getKnowledgeSubBasketDeletionImpact).not.toHaveBeenCalled();
  });

  it.each(["missing parent", "missing child", "wrong parent", "archived parent"])("handles %s with a safe Configuration fallback", async (scenario) => {
    if (scenario === "missing parent") vi.mocked(api.listKnowledgeBaskets).mockResolvedValue(page([]));
    if (scenario === "missing child") vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([]));
    if (scenario === "wrong parent") vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([{ ...subBasket, basketId: "unrelated" }]));
    if (scenario === "archived parent") vi.mocked(api.listKnowledgeBaskets).mockResolvedValue(page([{ ...basket, status: "archived" }]));
    const path = `${CONFIGURATION_PATH}/items/item-one`;
    const { router } = start({ ...target, path }, path);
    expect(await screen.findByText("Basket deletion could not reopen")).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.getKnowledgeSubBasketDeletionImpact).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Back to Configuration" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(CONFIGURATION_PATH));
    expect(router.state.location.state).toBeNull();
  });

  it("retries a failed fresh lookup without reusing stale target data", async () => {
    vi.mocked(api.listKnowledgeBaskets).mockRejectedValueOnce(new Error("Catalog unavailable"));
    start(); expect(await screen.findByText("Catalog unavailable")).toBeVisible();
    expect(api.getKnowledgeSubBasketDeletionImpact).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry basket lookup" }));
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    await screen.findByRole("textbox", { name: "Type Sub-Basket name to confirm" });
    expect(api.getKnowledgeSubBasketDeletionImpact).toHaveBeenCalledWith(basket.id, subBasket.id);
  });

  it("restores inline deletion only after fresh source/member checks and retains draftOnly in the command", async () => {
    vi.mocked(api.listKnowledgeMainLines).mockImplementation(async (_basketId, params) => params?.offset === 0
      ? page([{ ...source, name: source.mainLineName, displayOrder: 1, id: "other-child-item", mainLineId: "other-child-item", basketId: basket.id, subBasketId: "unrelated-child", status: "active" as const }], 0, true)
      : page([{ ...source, name: source.mainLineName, displayOrder: 1, id: "target-draft-item", mainLineId: "target-draft-item", basketId: basket.id, subBasketId: subBasket.id }], 1));
    start({ ...target, path: inlinePath }, inlinePath);
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Sub-Basket?" }); const user = userEvent.setup();
    expect(api.getKnowledgeItem).toHaveBeenCalledExactlyOnceWith("item-one");
    expect(api.listKnowledgeMainLines).toHaveBeenNthCalledWith(1, basket.id, { includeArchived: true, limit: 100, offset: 0 });
    expect(api.listKnowledgeMainLines).toHaveBeenNthCalledWith(2, basket.id, { includeArchived: true, limit: 100, offset: 1 });
    const name = await within(dialog).findByRole("textbox", { name: "Type Sub-Basket name to confirm" });
    expect(name).toHaveValue(""); await user.type(name, subBasket.name);
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Remove duplicate draft group");
    await user.click(within(dialog).getByRole("button", { name: "Remove permanently" }));
    expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenCalledExactlyOnceWith(basket.id, subBasket.id, {
      expectedVersion: impact.version, confirmationName: subBasket.name, reason: "Remove duplicate draft group", impactToken: impact.impactToken, draftOnly: true
    });
  });

  it.each(["active", "inactive", "archived"] as const)("rejects inline restoration when a later-page target member is %s", async (status) => {
    vi.mocked(api.listKnowledgeMainLines).mockImplementation(async (_basketId, params) => params?.offset === 0
      ? page([{ ...source, name: source.mainLineName, displayOrder: 1, id: "target-draft", mainLineId: "target-draft", basketId: basket.id, subBasketId: subBasket.id }], 0, true)
      : page([{ ...source, name: source.mainLineName, displayOrder: 1, id: "frozen-item", mainLineId: "frozen-item", basketId: basket.id, subBasketId: subBasket.id, status }], 1));
    start({ ...target, path: inlinePath }, inlinePath);
    expect(await screen.findByText(/This Sub-Basket is frozen because/)).toBeVisible();
    expect(api.listKnowledgeMainLines).toHaveBeenCalledTimes(2);
    expect(api.getKnowledgeSubBasketDeletionImpact).not.toHaveBeenCalled();
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it.each(["archived source", "missing draft", "non-draft revision", "missing update action", "wrong source identity"])("rejects inline restoration for %s", async (scenario) => {
    const current: KnowledgeItemDetail = { ...source,
      ...(scenario === "archived source" ? { status: "archived" as const } : {}),
      ...(scenario === "missing draft" ? { draftRevision: null } : {}),
      ...(scenario === "non-draft revision" ? { draftRevision: { ...source.draftRevision!, status: "active" as const } } : {}),
      ...(scenario === "missing update action" ? { allowedActions: [] } : {}),
      ...(scenario === "wrong source identity" ? { mainLineId: "unrelated-source" } : {})
    };
    vi.mocked(api.getKnowledgeItem).mockResolvedValue(current);
    start({ ...target, path: inlinePath }, inlinePath);
    expect(await screen.findByText(/The source item is no longer editable/)).toBeVisible();
    expect(api.listKnowledgeMainLines).not.toHaveBeenCalled();
    expect(api.getKnowledgeSubBasketDeletionImpact).not.toHaveBeenCalled();
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
  });

  it("rejects inline restoration when the source has been deleted", async () => {
    vi.mocked(api.getKnowledgeItem).mockRejectedValue(new Error("Source Main Line no longer exists."));
    start({ ...target, path: inlinePath }, inlinePath);
    expect(await screen.findByText("Source Main Line no longer exists.")).toBeVisible();
    expect(api.getKnowledgeSubBasketDeletionImpact).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("rejects inline deletion of the child that now contains the current source", async () => {
    vi.mocked(api.getKnowledgeItem).mockResolvedValue({ ...source, basketId: basket.id, subBasketId: subBasket.id });
    start({ ...target, path: inlinePath }, inlinePath);
    expect(await screen.findByText(/This Sub-Basket contains the item whose recommendations you were editing/)).toBeVisible();
    expect(api.listKnowledgeMainLines).not.toHaveBeenCalled();
    expect(api.getKnowledgeSubBasketDeletionImpact).not.toHaveBeenCalled();
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
  });

  it.each(["ai_estimator_knowledge.configuration.read", "ai_estimator_knowledge.configuration.update"] as const)("does not restore an inline preview after %s is revoked", (revoked) => {
    permissions = (["ai_estimator_knowledge.configuration.read", "ai_estimator_knowledge.configuration.update", "ai_estimator_knowledge.configuration.lifecycle"] as const).filter((permission) => permission !== revoked);
    start({ ...target, path: inlinePath }, inlinePath);
    expect(screen.getByText("You no longer have permission to delete this basket.")).toBeVisible();
    expect(api.listKnowledgeBaskets).not.toHaveBeenCalled(); expect(api.getKnowledgeItem).not.toHaveBeenCalled();
    expect(api.getKnowledgeSubBasketDeletionImpact).not.toHaveBeenCalled();
  });
});
