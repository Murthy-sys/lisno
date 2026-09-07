import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateKnowledgeItemDialog } from "./CreateKnowledgeItemDialog";
import * as api from "./knowledgeApi";
import type { KnowledgeBasket, KnowledgeItemDetail } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({
  listKnowledgeBaskets: vi.fn(), listKnowledgeSubBaskets: vi.fn(),
  createKnowledgeBasket: vi.fn(), createKnowledgeSubBasket: vi.fn(), createKnowledgeMainLine: vi.fn()
}));

const metadata = { version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };
const baskets: KnowledgeBasket[] = ["Carpentry", "Painting"].map((name, index) => ({ ...metadata, id: `basket-${index}`, name, displayOrder: index, status: "active", description: null }));
function page<T>(items: T[]) { return { items, pagination: { limit: 100, offset: 0, total: items.length, hasMore: false } }; }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onCreated = vi.fn(async () => {});
  const onClose = vi.fn();
  render(<QueryClientProvider client={client}><CreateKnowledgeItemDialog onClose={onClose} onCreated={onCreated} /></QueryClientProvider>);
  return { user: userEvent.setup(), client, onCreated, onClose };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listKnowledgeBaskets).mockResolvedValue(page(baskets));
  vi.mocked(api.createKnowledgeMainLine).mockResolvedValue({ mainLineId: "line-created" } as KnowledgeItemDetail);
});

describe("Main Line with a Sub Basket text field", () => {
  it("submits the typed Sub Basket with the selected Main Basket and exposes no add-basket buttons", async () => {
    const { user, onCreated } = setup();
    await screen.findByRole("option", { name: "Carpentry" });
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add main basket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add sub basket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Sub basket" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[0].id);
    await user.type(screen.getByRole("textbox", { name: "Main Line name" }), "Panelling");
    expect(screen.getByRole("button", { name: "Add estimation item" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Sub basket" }), "  Walls  ");
    const results = await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("line-created"));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledWith(baskets[0].id, { name: "Panelling", subBasketName: "Walls" });
    expect(api.listKnowledgeSubBaskets).not.toHaveBeenCalled();
    expect(api.createKnowledgeSubBasket).not.toHaveBeenCalled();
    expect(api.createKnowledgeBasket).not.toHaveBeenCalled();
  });

  it("keeps the typed name and maps it under the final selected Main Basket", async () => {
    const { user } = setup();
    await screen.findByRole("option", { name: "Carpentry" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[0].id);
    await user.type(screen.getByRole("textbox", { name: "Sub basket" }), "Walls");
    await user.type(screen.getByRole("textbox", { name: "Main Line name" }), "Panelling");
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[1].id);
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    await waitFor(() => expect(api.createKnowledgeMainLine).toHaveBeenCalledWith(baskets[1].id, { name: "Panelling", subBasketName: "Walls" }));
  });

  it("retains entered values on failure and supports retry and cancellation", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(new Error("Save failed"));
    const { user, onClose } = setup();
    await screen.findByRole("option", { name: "Carpentry" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[0].id);
    await user.type(screen.getByRole("textbox", { name: "Sub basket" }), "Walls");
    await user.type(screen.getByRole("textbox", { name: "Main Line name" }), "Panelling");
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByRole("textbox", { name: "Sub basket" })).toHaveValue("Walls");
    expect(screen.getByRole("textbox", { name: "Main Line name" })).toHaveValue("Panelling");
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    await waitFor(() => expect(api.createKnowledgeMainLine).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports unavailable or empty Main Baskets without offering creation buttons", async () => {
    vi.mocked(api.listKnowledgeBaskets).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(page([]));
    const { user } = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Main Baskets could not be loaded");
    await user.click(screen.getByRole("button", { name: "Retry Main Baskets" }));
    expect(await screen.findByText("Create a Main Basket from Configuration before adding a Main Line.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add estimation item" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add main basket" })).not.toBeInTheDocument();
  });

  it("loads later Main Basket pages", async () => {
    vi.mocked(api.listKnowledgeBaskets).mockImplementation(async (params) => params?.offset === 0
      ? { ...page([baskets[0]]), pagination: { limit: 100, offset: 0, total: 2, hasMore: true } }
      : { ...page([baskets[1]]), pagination: { limit: 100, offset: 1, total: 2, hasMore: false } });
    setup();
    expect(await screen.findByRole("option", { name: "Painting" })).toBeVisible();
  });

  it("supports keyboard entry and prevents duplicate submissions while saving", async () => {
    let resolveSave!: (item: KnowledgeItemDetail) => void;
    vi.mocked(api.createKnowledgeMainLine).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const { user, onCreated } = setup();
    await screen.findByRole("option", { name: "Carpentry" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[0].id);
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Sub basket" })).toHaveFocus();
    await user.keyboard("Walls");
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Main Line name" })).toHaveFocus();
    await user.keyboard("Panelling{Enter}");
    expect(screen.getByRole("textbox", { name: "Sub basket" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(api.createKnowledgeMainLine).toHaveBeenCalledOnce();
    await act(async () => { resolveSave({ mainLineId: "line-created" } as KnowledgeItemDetail); });
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });
});
