import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ClientEstimateRequirements } from "./ClientEstimateRequirements";
import { estimateRequirementsKeys, type EstimateRequirement, type EstimateRequirementsDetail } from "./estimateRequirementsApi";

const path = "/api/v1/projects/project-one/estimate-requirements";
const request: EstimateRequirement = {
  id: "request-one", projectId: "project-one", phase: "pre", mainBasketId: "basket-one", roomId: null,
  text: "Tall storage with adjustable shelves.", authorId: "client-one", version: 2, status: "open", lineItemIds: [],
  reason: "", supersededById: null, createdAt: "2026-10-13T10:00:00Z", updatedAt: "2026-10-13T10:00:00Z", resolvedAt: null, canEdit: true
};
const empty: EstimateRequirementsDetail = {
  projectId: "project-one", requirementsVersion: 3, estimateVersion: null, phase: "pre", editingAllowed: true,
  editingBlockReason: null, canResolve: false, requirements: [],
  mainBaskets: [{ id: "basket-one", name: "Joinery" }, { id: "basket-two", name: "Lighting" }],
  rooms: [], indicativeTotalPaise: null, pricingComplete: false
};

function setup(initial: EstimateRequirementsDetail = structuredClone(empty), initialStatus = 200) {
  const state = { detail: initial, status: initialStatus };
  let queryClient!: QueryClient;
  function CaptureQueryClient() { queryClient = useQueryClient(); return null; }
  server.use(http.get(path, () => state.status === 200 ? HttpResponse.json({ data: state.detail })
    : HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Private provider detail" } }, { status: state.status })));
  const rendered = renderWithQuery(<><CaptureQueryClient /><ClientEstimateRequirements projectId="project-one" /></>);
  return { state, queryClient, ...rendered };
}

async function addDraft() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add requirement" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-one");
  await user.type(screen.getByRole("textbox", { name: "What would you like?" }), "  Tall storage with adjustable shelves.  ");
  return user;
}

describe("ClientEstimateRequirements", () => {
  it("refreshes stale Main Line options after a server validation rejection without losing the draft", async () => {
    const { state } = setup({ ...empty, mainLines: [{ id: "line-one", name: "Wall storage", mainBasketId: "basket-one", subBasketId: null, subBasketName: null }] });
    server.use(http.post(path, () => {
      state.detail = { ...state.detail, mainLines: [] };
      return HttpResponse.json({ error: { code: "ESTIMATE_REQUIREMENT_MAIN_LINE_INVALID", message: "Select an available Main Line." } }, { status: 400 });
    }));
    const user = await addDraft();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Line (optional)" }), "line-one");
    await user.click(screen.getByRole("button", { name: "Send requirement" }));
    expect(await screen.findByText(/The selected Main Line is no longer available/)).toBeVisible();
    await waitFor(() => expect(screen.queryByText("Wall storage")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "What would you like?" })).toHaveValue(`  ${request.text}  `);
    expect(screen.getByRole("combobox", { name: "Main Line (optional)" })).toHaveFocus();
  });

  it("offers only server-projected Main Lines for the selected basket and sends the stable optional selection", async () => {
    const mainLines = [
      { id: "line-one", name: "Wall storage", mainBasketId: "basket-one", subBasketId: "sub-one", subBasketName: "Storage" },
      { id: "line-two", name: "Pendant light", mainBasketId: "basket-two", subBasketId: null, subBasketName: null }
    ];
    const { state } = setup({ ...empty, mainLines });
    server.use(http.post(path, async ({ request: incoming }) => {
      expect(await incoming.json()).toEqual({ mainBasketId: "basket-one", mainLineId: "line-one", roomId: null,
        text: request.text, expectedRequirementsVersion: 3, idempotencyKey: expect.any(String) });
      state.detail = { ...state.detail, requirementsVersion: 4, requirements: [{ ...request, mainLineId: "line-one" }] };
      return HttpResponse.json({ data: state.detail });
    }));
    const user = await addDraft();
    const selection = screen.getByRole("combobox", { name: "Main Line (optional)" });
    expect(within(selection).queryByRole("option", { name: /Pendant light/ })).not.toBeInTheDocument();
    await user.selectOptions(selection, "line-one");
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-two");
    expect(selection).toHaveValue("");
    expect(within(selection).queryByRole("option", { name: /Wall storage/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-one");
    await user.selectOptions(selection, "line-one");
    expect((await axe.run(screen.getByRole("form"), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Send requirement" }));
    expect(await screen.findByText("Requested Main Line: Wall storage")).toBeVisible();
    expect(screen.queryByLabelText(/Price|Rate|Quantity/)).not.toBeInTheDocument();
  });

  it("preserves unavailable historical references without exposing names and allows explicit clearing", async () => {
    const { state } = setup({ ...empty, mainLines: [], requirements: [{ ...request, mainLineId: "private-line" }] });
    const patch = vi.fn(async ({ request: incoming }: { request: Request }) => {
      expect(await incoming.json()).toEqual({ expectedRequirementsVersion: 3, expectedVersion: 2,
        mainBasketId: "basket-one", mainLineId: null, roomId: null, text: request.text });
      state.detail = { ...state.detail, requirements: [{ ...request, mainLineId: null, version: 3 }], requirementsVersion: 4 };
      return HttpResponse.json({ data: state.detail });
    });
    server.use(http.patch(`${path}/request-one`, patch));
    expect(await screen.findByText("Requested Main Line: Selected item unavailable")).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit requirement 1" }));
    await user.click(screen.getByRole("button", { name: "Save requirement" }));
    expect(patch).not.toHaveBeenCalled();
    const selection = screen.getByRole("combobox", { name: "Main Line (optional)" });
    expect(selection).toHaveFocus();
    expect(selection).toHaveAccessibleDescription(/Choose an available Main Line/);
    await user.selectOptions(selection, "");
    await user.click(screen.getByRole("button", { name: "Save requirement" }));
    expect(await screen.findByText("Your requirement was updated.")).toBeVisible();
    expect(patch).toHaveBeenCalledOnce();
  });

  it("requires replacing a selected Main Line removed by a background refresh", async () => {
    const { state, queryClient } = setup({ ...empty, mainLines: [{ id: "line-one", name: "Wall storage", mainBasketId: "basket-one", subBasketId: null, subBasketName: null }] });
    const user = await addDraft();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Line (optional)" }), "line-one");
    state.detail = { ...state.detail, mainLines: [] };
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateRequirementsKeys.detail("project-one") }); });
    await waitFor(() => expect(screen.queryByText("Wall storage")).not.toBeInTheDocument());
    expect(screen.getByRole("option", { name: "Selected item unavailable" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send requirement" }));
    expect(screen.getByRole("combobox", { name: "Main Line (optional)" })).toHaveFocus();
    expect(screen.getByText("Choose an available Main Line or continue with a general request.")).toBeVisible();
  });

  it("works before an estimate exists using only baskets and text, with no editable prices or internal item catalogue", async () => {
    setup();
    expect(await screen.findByText("Awaiting estimate")).toBeVisible();
    expect(screen.queryByText(/₹0/)).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    const form = screen.getByRole("form", { name: "Add estimate requirement" });
    expect(within(form).getAllByRole("combobox")).toHaveLength(2);
    expect(within(form).getByRole("combobox", { name: "Main Basket" })).toHaveFocus();
    expect(within(form).getByRole("combobox", { name: "Room (optional)" })).toHaveValue("");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Sub Basket|Main Line|Price|Rate|Quantity/)).not.toBeInTheDocument();
    expect((await axe.run(form, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(within(form).getByRole("button", { name: "Send requirement" }));
    expect(within(form).getByRole("combobox", { name: "Main Basket" })).toHaveFocus();
    expect(screen.getByText("Select an available Main Basket.")).toBeVisible();
  });

  it("sends one strict versioned request, trims text, and refreshes every affected client view", async () => {
    const { state } = setup();
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const post = vi.fn(async ({ request: incoming }: { request: Request }) => {
      expect(await incoming.json()).toEqual({ mainBasketId: "basket-one", roomId: null,
        text: request.text, expectedRequirementsVersion: 3, idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/) });
      await pending;
      state.detail = { ...empty, requirementsVersion: 4, requirements: [request] };
      return HttpResponse.json({ data: state.detail }, { status: 201 });
    });
    server.use(http.post(path, post));
    await addDraft();
    const form = screen.getByRole("form", { name: "Add estimate requirement" });
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Send requirement" })).toBeDisabled();
    release();
    expect(await screen.findByText("Your requirement was sent to the team.")).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByText(request.text)).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: estimateRequirementsKeys.detail("project-one") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["client", "estimates"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["client", "projects"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["leads"] });
  });

  it("shows server-calculated paise as read-only and allows only own open requests to be edited", async () => {
    setup({ ...empty, phase: "post", estimateVersion: 9, indicativeTotalPaise: 1180700,
      requirements: [request, { ...request, id: "other", authorId: "other", canEdit: false }, { ...request, id: "included", status: "included", canEdit: false, reason: "Added to the wardrobe scope." }] });
    expect(await screen.findByText("₹11,807.00")).toBeVisible();
    expect(screen.getByText("Added to the wardrobe scope.", { exact: false })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^Edit requirement/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Withdraw requirement/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Edit requirement 1" }));
    expect(screen.getByRole("textbox", { name: "What would you like?" })).toHaveValue(request.text);
    expect(screen.getByRole("combobox", { name: "Main Basket" })).toHaveValue("basket-one");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("requires explicit refreshed-version acknowledgement after a conflict and preserves the draft", async () => {
    const { state } = setup({ ...empty, requirements: [request], rooms: [{ id: "room-one", label: "Bedroom 1" }] });
    const bodies: unknown[] = [];
    server.use(http.patch(`${path}/request-one`, async ({ request: incoming }) => {
      bodies.push(await incoming.json());
      if (bodies.length === 1) {
        state.detail = { ...state.detail, requirementsVersion: 4, requirements: [{ ...request, version: 3, text: "Current server request." }] };
        return HttpResponse.json({ error: { code: "ESTIMATE_REQUIREMENTS_CHANGED", message: "Changed" } }, { status: 409 });
      }
      state.detail = { ...state.detail, requirementsVersion: 5, requirements: [{ ...request, version: 4, text: "My revised request.", roomId: "room-one" }] };
      return HttpResponse.json({ data: state.detail });
    }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit requirement 1" }));
    const text = screen.getByRole("textbox", { name: "What would you like?" });
    await user.clear(text); await user.type(text, "My revised request.");
    await user.selectOptions(screen.getByRole("combobox", { name: "Room (optional)" }), "room-one");
    await user.click(screen.getByRole("button", { name: "Save requirement" }));
    expect(await screen.findByText("Current server request.")).toBeVisible();
    expect(text).toHaveValue("My revised request.");
    expect(screen.getByRole("button", { name: "Save requirement" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Continue with refreshed requests" }));
    await user.click(screen.getByRole("button", { name: "Save requirement" }));
    expect(await screen.findByText("Your requirement was updated.")).toBeVisible();
    expect(bodies).toEqual([
      { expectedRequirementsVersion: 3, expectedVersion: 2, mainBasketId: "basket-one", roomId: "room-one", text: "My revised request." },
      { expectedRequirementsVersion: 4, expectedVersion: 3, mainBasketId: "basket-one", roomId: "room-one", text: "My revised request." }
    ]);
  });

  it("retries an uncertain create with the same idempotency key", async () => {
    const { state } = setup();
    const bodies: Array<Record<string, unknown>> = [];
    server.use(http.post(path, async ({ request: incoming }) => {
      bodies.push(await incoming.json() as Record<string, unknown>);
      if (bodies.length === 1) return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Private detail" } }, { status: 503 });
      state.detail = { ...empty, requirements: [request], requirementsVersion: 4 };
      return HttpResponse.json({ data: state.detail });
    }));
    const user = await addDraft();
    await user.click(screen.getByRole("button", { name: "Send requirement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is preserved");
    expect(screen.getByRole("textbox", { name: "What would you like?" })).toHaveValue(`  ${request.text}  `);
    await user.click(screen.getByRole("button", { name: "Send requirement" }));
    expect(await screen.findByText("Your requirement was sent to the team.")).toBeVisible();
    expect(bodies[0]?.idempotencyKey).toBe(bodies[1]?.idempotencyKey);
  });

  it("confirms withdrawal with version fences and retains the withdrawn history", async () => {
    const { state } = setup({ ...empty, requirements: [request] });
    server.use(http.patch(`${path}/request-one`, async ({ request: incoming }) => {
      expect(await incoming.json()).toEqual({ expectedRequirementsVersion: 3, expectedVersion: 2, withdraw: true });
      state.detail = { ...state.detail, requirementsVersion: 4, requirements: [{ ...request, status: "withdrawn", canEdit: false, version: 3 }] };
      return HttpResponse.json({ data: state.detail });
    }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Withdraw requirement 1" }));
    const dialog = screen.getByRole("dialog", { name: "Withdraw this requirement?" });
    expect(within(dialog).getByRole("button", { name: "Keep requirement" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw requirement 1" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Withdraw requirement 1" }));
    await user.click(screen.getByRole("button", { name: "Withdraw requirement" }));
    expect(await screen.findByText("Your request was withdrawn.")).toBeVisible();
    expect(screen.getByText(request.text)).toBeVisible();
    expect(screen.getByText("Withdrawn")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit requirement 1" })).not.toBeInTheDocument();
  });

  it.each(["review_pending", "closed"] as const)("respects the server %s editing block", async (reason) => {
    setup({ ...empty, editingAllowed: false, editingBlockReason: reason, requirements: [{ ...request, canEdit: false }] });
    expect(await screen.findByText(reason === "review_pending" ? "Estimate review in progress" : "Requirements are read-only")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add requirement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit requirement 1" })).not.toBeInTheDocument();
    if (reason === "review_pending") expect(screen.getByRole("link", { name: "Review the submitted estimate" })).toHaveAttribute("href", "#estimate-review-title");
  });

  it("hides cached request content if project access is denied on refresh", async () => {
    const { state, queryClient } = setup({ ...empty, requirements: [request] });
    expect(await screen.findByText(request.text)).toBeVisible();
    state.status = 403;
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateRequirementsKeys.detail("project-one") }); });
    await waitFor(() => expect(screen.queryByText(request.text)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Add requirement" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Requirements are unavailable for this project or your access has changed.");
  });

  it("offers retry after unavailable reads and no creation when no baskets are available", async () => {
    const { state } = setup({ ...empty, mainBaskets: [] }, 503);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your requirements.");
    state.status = 200;
    await userEvent.click(screen.getByRole("button", { name: "Refresh requirements" }));
    expect(await screen.findByRole("button", { name: "Add requirement" })).toBeDisabled();
    expect(screen.getByText(/make a Main Basket available/)).toBeVisible();
  });
});
