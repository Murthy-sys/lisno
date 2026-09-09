import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import axe from "axe-core";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { KnowledgeBasketQualityPanel } from "./KnowledgeBasketQualityPanel";
import type { KnowledgePendingChangesSnapshot } from "./knowledgePendingChanges";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import * as api from "./knowledgeApi";
import * as workbook from "./knowledgeQualityWorkbook";
import type { KnowledgeBasketQuality, KnowledgeItemDetail, KnowledgeJsonObject } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ getKnowledgeBasketQuality: vi.fn(), updateKnowledgeBasketQuality: vi.fn(), getKnowledgeSection: vi.fn() }));
vi.mock("./knowledgeQualityWorkbook", async (importOriginal) => ({
  ...await importOriginal<typeof import("./knowledgeQualityWorkbook")>(),
  readQualityWorkbook: vi.fn(),
  downloadQualityChecklist: vi.fn(),
  downloadQualityTemplate: vi.fn()
}));
const item = { id: "electrical-point", mainLineId: "electrical-point", mainLineName: "Electrical points", basketId: "electrical", basketName: "Electrical", status: "active", itemType: "main_line" } as KnowledgeItemDetail;
const saved: KnowledgeBasketQuality = { basketId: "electrical", basketName: "Electrical", basketStatus: "active", version: 7, revisionId: "quality-v2", revisionNumber: 2, contentDigest: "digest-v2", updatedAt: "2026-09-08T00:00:00Z", parameters: [{ id: "check-photo", type: "boolean", label: "Are installed fittings aligned?", required: true, active: true }] };
const callbacks = { onDirtyChange: vi.fn(), onSavingChange: vi.fn(), onPendingChanges: vi.fn<(snapshot: KnowledgePendingChangesSnapshot) => void>() };
function setup(canUpdate = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><main><KnowledgeBasketQualityPanel item={item} revisionId="item-revision" canUpdate={canUpdate} pendingChangesSourceKey="electrical-session" {...callbacks} /></main></QueryClientProvider>);
  return { ...view, client };
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue(saved); vi.mocked(api.updateKnowledgeBasketQuality).mockImplementation(async (_id, input) => ({ ...saved, version: 8, revisionId: "quality-v3", revisionNumber: 3, parameters: input.parameters })); });

describe("shared Main Basket quality checklist", () => {
  it("imports the painting check beside two incomplete drafts, then requires completing or deleting them before saving", async () => {
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ ...saved, revisionId: null, parameters: [] });
    const painting: KnowledgeJsonObject = {
      id: "imported-painting", label: "is Painting done", type: "radio", allowedValues: ["Pass", "Fail", "Not applicable"],
      acceptanceCriteria: "photos to be uploaded after painting", required: true, active: true,
      evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 1 }
    };
    vi.mocked(workbook.readQualityWorkbook).mockResolvedValue({ parameters: [painting], issues: [] });
    const user = userEvent.setup(); setup();
    await screen.findByRole("button", { name: "Add Quality parameter" });
    await user.click(screen.getByRole("button", { name: "Add Quality parameter" }));
    await user.click(screen.getByRole("button", { name: "Add Quality parameter" }));
    for (const type of screen.getAllByRole("combobox", { name: "Answer type" })) await user.selectOptions(type, "");
    await user.click(screen.getByRole("button", { name: "Import Excel" }));
    await user.upload(screen.getByLabelText("Excel workbook"), new File(["parser boundary"], "painting.xlsx"));
    expect(await screen.findByText("is Painting done")).toBeVisible();
    const addChecks = screen.getByRole("button", { name: "Add 1 check to checklist" });
    expect(addChecks).toBeEnabled();
    await user.click(addChecks);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Question / check" }).map(field => (field as HTMLTextAreaElement).value)).toEqual(["", "", "is Painting done"]);
    expect(screen.getByRole("spinbutton", { name: "Required photos" })).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter nonempty text up to 240 characters.");
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove Quality parameters entry 1" }));
    await user.click(screen.getByRole("button", { name: "Remove Quality parameters entry 1" }));
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText("Shared checklist saved for all items in Electrical.");
    expect(api.updateKnowledgeBasketQuality).toHaveBeenCalledExactlyOnceWith("electrical", { expectedVersion: 7, parameters: [painting] });
  });

  it("exports saved parameters while keeping unsaved edits out of the download", async () => {
    const user = userEvent.setup(); setup();
    const question = await screen.findByRole("textbox", { name: "Question / check" });
    await user.clear(question);
    await user.type(question, "Unsaved inspection question");
    expect(screen.getByText("Download Excel uses the saved checklist. Save your changes to include them.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Download Excel" }));
    expect(workbook.downloadQualityChecklist).toHaveBeenLastCalledWith("Electrical", saved.parameters);
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
    expect(question).toHaveValue("Unsaved inspection question");

    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText("Shared checklist saved for all items in Electrical.");
    await user.click(screen.getByRole("button", { name: "Download Excel" }));
    expect(workbook.downloadQualityChecklist).toHaveBeenLastCalledWith("Electrical", [expect.objectContaining({ label: "Unsaved inspection question" })]);
  });

  it.each([null, "empty-revision"])("shows the saved download only after saving rows when the prior revision is %s", async revisionId => {
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ ...saved, revisionId, parameters: [] });
    const user = userEvent.setup(); setup();
    await screen.findByRole("button", { name: "Download Excel template" });
    expect(screen.queryByRole("button", { name: "Download Excel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Quality parameter" }));
    await user.type(screen.getByRole("textbox", { name: "Question / check" }), "Is the finish acceptable?");
    await user.selectOptions(screen.getByRole("combobox", { name: "Answer type" }), "boolean");
    expect(screen.queryByRole("button", { name: "Download Excel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    expect(await screen.findByRole("button", { name: "Download Excel" })).toBeVisible();
  });

  it("keeps the saved download until removing all rows has been saved", async () => {
    const user = userEvent.setup(); setup();
    await screen.findByRole("button", { name: "Download Excel" });
    await user.click(screen.getByRole("button", { name: /^Remove Quality parameters/u }));
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Download Excel" })).not.toBeInTheDocument());
  });

  it("prevents duplicate downloads while pending and allows retry after an export error", async () => {
    let rejectDownload: (reason: Error) => void = () => undefined;
    vi.mocked(workbook.downloadQualityChecklist).mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectDownload = reject; }));
    const user = userEvent.setup(); setup();
    const download = await screen.findByRole("button", { name: "Download Excel" });
    await user.click(download);
    expect(download).toBeDisabled();
    expect(download).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Download Excel template" })).toBeDisabled();
    await user.click(download);
    expect(workbook.downloadQualityChecklist).toHaveBeenCalledTimes(1);
    await act(async () => rejectDownload(new Error("The saved checklist could not be downloaded. Try again.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("The saved checklist could not be downloaded. Try again.");
    expect(download).toBeEnabled();
    await user.click(download);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(workbook.downloadQualityChecklist).toHaveBeenCalledTimes(2);
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
  });

  it("saves every existing row as mandatory and active when a previously optional checklist is edited", async () => {
    const parameters: KnowledgeJsonObject[] = [{ ...saved.parameters[0], required: false, active: false },
      { id: "check-second", type: "boolean", label: "Is the fixing secure?" }];
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ ...saved, parameters });
    const user = userEvent.setup(); setup();
    const questions = await screen.findAllByRole("textbox", { name: "Question / check" });
    expect(screen.queryByRole("checkbox", { name: "Required" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Active" })).not.toBeInTheDocument();
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
    await user.type(questions[0]!, " Check all locations.");
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await waitFor(() => expect(api.updateKnowledgeBasketQuality).toHaveBeenCalledWith("electrical", {
      expectedVersion: 7,
      parameters: [expect.objectContaining({ id: "check-photo", required: true, active: true }),
        expect.objectContaining({ id: "check-second", required: true, active: true })]
    }));
    expect(parameters[0]).toMatchObject({ required: false, active: false });
  });

  it("saves essential criteria and photo evidence with the basket CAS version", async () => {
    const user = userEvent.setup(); setup();
    await screen.findByRole("textbox", { name: "Question / check" });
    await user.type(screen.getByRole("textbox", { name: "Acceptance criteria" }), "Fixings match the approved detail.");
    await user.click(screen.getByRole("checkbox", { name: "Photo evidence" }));
    expect(screen.getByRole("spinbutton", { name: "Required photos" })).toHaveValue(1);
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await waitFor(() => expect(api.updateKnowledgeBasketQuality).toHaveBeenCalledWith("electrical", {
      expectedVersion: 7,
      parameters: [expect.objectContaining({ id: "check-photo", acceptanceCriteria: "Fixings match the approved detail.", evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 1 } })]
    }));
    expect(await screen.findByText("Shared checklist saved for all items in Electrical.")).toBeVisible();
    expect(api.getKnowledgeSection).not.toHaveBeenCalled();
    expect(callbacks.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("saves a multiple-photo requirement and can change it back to a single photo", async () => {
    const user = userEvent.setup(); setup();
    await screen.findByRole("textbox", { name: "Question / check" });
    await user.click(screen.getByRole("checkbox", { name: "Photo evidence" }));
    const count = screen.getByRole("spinbutton", { name: "Required photos" });
    await user.clear(count); await user.type(count, "6");
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText("Shared checklist saved for all items in Electrical.");
    expect(api.updateKnowledgeBasketQuality).toHaveBeenLastCalledWith("electrical", {
      expectedVersion: 7, parameters: [expect.objectContaining({ evidence: expect.objectContaining({ photos: true, minPhotosPerSample: 6 }) })]
    });
    const savedCount = screen.getByRole("spinbutton", { name: "Required photos" });
    expect(savedCount).toHaveValue(6);
    await user.clear(savedCount); await user.type(savedCount, "1");
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText("Shared checklist saved for all items in Electrical.");
    expect(api.updateKnowledgeBasketQuality).toHaveBeenLastCalledWith("electrical", {
      expectedVersion: 8, parameters: [expect.objectContaining({ evidence: expect.objectContaining({ photos: true, minPhotosPerSample: 1 }) })]
    });
  });

  it.each(["", "0", "-1", "1.5", "101"])("blocks invalid required photo count %s without saving", async countValue => {
    const user = userEvent.setup(); setup();
    await screen.findByRole("textbox", { name: "Question / check" });
    await user.click(screen.getByRole("checkbox", { name: "Photo evidence" }));
    const count = screen.getByRole("spinbutton", { name: "Required photos" });
    await user.clear(count);
    if (countValue) await user.type(count, countValue);
    expect(count).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter 1 to 100 photos per sampled unit.");
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
  });

  it("adds and deletes extra questions without changing another question's photo requirement", async () => {
    const original = { ...saved.parameters[0], evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 5 } };
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ ...saved, parameters: [original,
      { id: "old-check", type: "text", label: "Old question", required: true, active: true }] });
    const user = userEvent.setup(); setup();
    await screen.findByRole("button", { name: "Add Quality parameter" });
    await user.click(screen.getByRole("button", { name: "Add Quality parameter" }));
    await user.type(screen.getAllByRole("textbox", { name: "Question / check" })[2]!, "Are switches labelled?");
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Answer type" })[2]!, "boolean");
    await user.click(screen.getAllByRole("checkbox", { name: "Photo evidence" })[2]!);
    await user.click(screen.getByRole("button", { name: "Remove Quality parameters entry 2" }));
    expect(screen.getAllByRole("textbox", { name: "Question / check" })).toHaveLength(2);
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText("Shared checklist saved for all items in Electrical.");
    expect(api.updateKnowledgeBasketQuality).toHaveBeenLastCalledWith("electrical", {
      expectedVersion: 7,
      parameters: [original, expect.objectContaining({ id: expect.any(String), label: "Are switches labelled?", type: "boolean", required: true, active: true, evidence: expect.objectContaining({ photos: true, minPhotosPerSample: 1 }) })]
    });
    const parameters = vi.mocked(api.updateKnowledgeBasketQuality).mock.calls[0]![1].parameters;
    expect(parameters[0]!.id).not.toBe(parameters[1]!.id);
  });

  it("blocks an empty required question without writing", async () => {
    const user = userEvent.setup(); setup();
    await user.clear(await screen.findByRole("textbox", { name: "Question / check" }));
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Enter nonempty text/u);
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
  });

  it("keeps stale edits for review and cannot overwrite a newer basket checklist", async () => {
    const user = userEvent.setup(); setup();
    const question = await screen.findByRole("textbox", { name: "Question / check" });
    await user.clear(question); await user.type(question, "My unsaved check");
    vi.mocked(api.updateKnowledgeBasketQuality).mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere"));
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ ...saved, version: 8, parameters: [{ ...saved.parameters[0], label: "New saved check" }] });
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    expect(await screen.findByText(/Your changes are still here/)).toBeVisible();
    expect(question).toHaveValue("My unsaved check");
    expect(screen.queryByRole("button", { name: "Save shared checklist" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard edits and reload saved checklist" }));
    expect(screen.getByRole("textbox", { name: "Question / check" })).toHaveValue("New saved check");
    expect(api.updateKnowledgeBasketQuality).toHaveBeenCalledTimes(1);
  });

  it("shares cached saved changes between regular and temporary items in the basket", async () => {
    const user = userEvent.setup(); const { rerender, client } = setup();
    const question = await screen.findByRole("textbox", { name: "Question / check" });
    await user.clear(question); await user.type(question, "Shared inspection");
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText("Shared checklist saved for all items in Electrical.");
    rerender(<QueryClientProvider client={client}><main><KnowledgeBasketQualityPanel item={{ ...item, id: "temp", mainLineId: "temp", mainLineName: "Temporary fitting", itemType: "temporary" }} canUpdate {...callbacks} /></main></QueryClientProvider>);
    expect(screen.getByRole("textbox", { name: "Question / check" })).toHaveValue("Shared inspection");
    expect(api.getKnowledgeBasketQuality).toHaveBeenCalledWith("electrical");
  });

  it("hides mutation actions when the actor cannot update configuration", async () => {
    const user = userEvent.setup();
    setup(false);
    expect(await screen.findByRole("textbox", { name: "Question / check" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Import Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save shared checklist" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Quality parameter" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download Excel" }));
    expect(workbook.downloadQualityChecklist).toHaveBeenCalledWith("Electrical", saved.parameters);
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
    const accessibility = await axe.run(screen.getByRole("main"), { rules: { "color-contrast": { enabled: false } } });
    expect(accessibility.violations).toEqual([]);
  });
});

const pending = () => callbacks.onPendingChanges.mock.lastCall?.[0];
const pendingEntries = () => pending()?.groups.flatMap(group => group.entries) ?? [];

describe("shared checklist session-only publication", () => {
  it("starts empty, previews one field, and removes a complete revert despite the dirty marker", async () => {
    const user = userEvent.setup(); setup();
    const criteria = await screen.findByRole("textbox", { name: "Acceptance criteria" });
    expect(pending()).toEqual({ sourceKey: "electrical-session", groups: [] });
    await user.type(criteria, "Check alignment with the ceiling layout");
    expect(criteria).toHaveFocus();
    expect(pending()?.groups[0]?.label).toBe("Shared checklist · Electrical");
    expect(pendingEntries()).toEqual([expect.objectContaining({
      title: "Are installed fittings aligned?", kind: "updated",
      fields: [{ key: "acceptanceCriteria", label: "Acceptance criteria", value: "Check alignment with the ceiling layout" }]
    })]);
    await user.clear(criteria);
    expect(pendingEntries()).toEqual([]);
    expect(callbacks.onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("previews answer options and incomplete required photo counts without saved answer fields", async () => {
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ ...saved, parameters: [{ ...saved.parameters[0], type: "radio", allowedValues: ["Pass", "Fail"], evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 3 } }] });
    const user = userEvent.setup(); setup();
    const count = await screen.findByRole("spinbutton", { name: "Required photos" });
    await user.clear(count);
    expect(pendingEntries()[0]).toMatchObject({ incomplete: true, fields: [{ key: "photoCount", value: "", cleared: true }] });
    await user.type(count, "4");
    expect(pendingEntries()[0]).toMatchObject({ incomplete: false, fields: [{ key: "photoCount", value: "4" }] });
    const choices = screen.getByRole("textbox", { name: "Options" });
    await user.clear(choices); await user.type(choices, "Pass, Fail, Not applicable");
    expect(pendingEntries()[0]?.fields).toContainEqual({ key: "allowedValues", label: "Answer options", value: "Pass, Fail, Not applicable" });
    expect(pendingEntries()[0]?.fields.some(field => field.key === "type")).toBe(false);
  });

  it("shows a blank addition, cancels add-then-remove, and shows a saved removal", async () => {
    const user = userEvent.setup(); setup();
    await user.click(await screen.findByRole("button", { name: "Add Quality parameter" }));
    expect(pendingEntries()).toEqual([expect.objectContaining({ title: "New quality check", kind: "added", incomplete: true })]);
    await user.click(screen.getByRole("button", { name: "Remove Quality parameters entry 2" }));
    expect(pendingEntries()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Remove Quality parameters entry 1" }));
    expect(pendingEntries()).toEqual([{ key: "id:saved:check-photo", title: "Are installed fittings aligned?", kind: "removed", fields: [] }]);
  });

  it("adds only accepted imported rows and excludes downloaded/saved item history", async () => {
    const imported = { id: "imported", type: "boolean", label: "Is the circuit identified?", required: true, active: true };
    vi.mocked(workbook.readQualityWorkbook).mockResolvedValue({ parameters: [imported], issues: [] });
    vi.mocked(api.getKnowledgeSection).mockResolvedValue({ id: "legacy-quality", mainLineId: item.mainLineId, revisionId: "item-revision", sectionKey: "quality", applicability: "configured", version: 1,
      createdById: "test-author", updatedById: "test-author", createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:00Z",
      payload: { parameters: [{ label: "Historical saved question", type: "text" }] } });
    const user = userEvent.setup(); setup();
    await user.click(await screen.findByRole("button", { name: "Download Excel" }));
    expect(pendingEntries()).toEqual([]);
    await user.click(screen.getByText("Previous item-specific quality parameters"));
    await screen.findByText("Historical saved question");
    expect(pendingEntries()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Import Excel" }));
    await user.upload(screen.getByLabelText("Excel workbook"), new File(["fixture"], "quality.xlsx"));
    await screen.findByText("Is the circuit identified?");
    expect(pendingEntries()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Add 1 check to checklist" }));
    expect(pendingEntries()).toEqual([expect.objectContaining({ title: "Is the circuit identified?", kind: "added" })]);
    expect(JSON.stringify(pending())).not.toContain("Historical saved question");
    expect(JSON.stringify(pending())).not.toContain("Are installed fittings aligned?");
  });

  it("freezes the original baseline across refetch and conflict then clears accepted discard", async () => {
    const user = userEvent.setup(); const { client } = setup();
    await user.type(await screen.findByRole("textbox", { name: "Acceptance criteria" }), "My local criteria");
    const expected = pending();
    const newer = { ...saved, version: 8, parameters: [{ ...saved.parameters[0], label: "Another actor's saved question", acceptanceCriteria: "Another actor's criteria" }] };
    act(() => client.setQueryData(knowledgeQueryKeys.basketQuality("electrical"), newer));
    expect(pending()).toEqual(expected);
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue(newer);
    vi.mocked(api.updateKnowledgeBasketQuality).mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere"));
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText(/Your changes are still here/);
    expect(pending()).toEqual(expected);
    expect(api.updateKnowledgeBasketQuality).toHaveBeenCalledWith("electrical", expect.objectContaining({ expectedVersion: 7 }));
    await user.click(screen.getByRole("button", { name: "Discard edits and reload saved checklist" }));
    expect(pendingEntries()).toEqual([]);
    expect(screen.getByRole("textbox", { name: "Question / check" })).toHaveValue("Another actor's saved question");
  });

  it("retains failed saves and clears confirmed changes before delayed refresh", async () => {
    const user = userEvent.setup(); const { client } = setup();
    await user.type(await screen.findByRole("textbox", { name: "Acceptance criteria" }), "Pending fixings check");
    vi.mocked(api.updateKnowledgeBasketQuality).mockRejectedValueOnce(new Error("Connection lost"));
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText("Connection lost");
    expect(pendingEntries()).toHaveLength(1);
    let finishRefresh: () => void = () => undefined;
    const refresh = new Promise<void>(resolve => { finishRefresh = resolve; });
    vi.spyOn(client, "invalidateQueries").mockReturnValue(refresh);
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    await screen.findByText("Shared checklist saved for all items in Electrical.");
    expect(callbacks.onSavingChange).toHaveBeenLastCalledWith(true);
    expect(pendingEntries()).toEqual([]);
    await act(async () => finishRefresh());
    expect(callbacks.onSavingChange).toHaveBeenLastCalledWith(false);
  });

  it("resets between distinct baskets and ignores a late save from the old editor", async () => {
    let finishOldSave: (value: KnowledgeBasketQuality) => void = () => undefined;
    vi.mocked(api.updateKnowledgeBasketQuality).mockReturnValueOnce(new Promise(resolve => { finishOldSave = resolve; }));
    const otherBasket = { ...saved, basketId: "carpentry", basketName: "Carpentry", version: 3, parameters: [{ id: "carpentry-check", label: "Are hinges aligned?", type: "boolean" }] };
    const user = userEvent.setup(); const { rerender, client } = setup();
    await user.type(await screen.findByRole("textbox", { name: "Acceptance criteria" }), "Old basket unsaved criteria");
    await user.click(screen.getByRole("button", { name: "Save shared checklist" }));
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue(otherBasket);
    rerender(<QueryClientProvider client={client}><main><KnowledgeBasketQualityPanel item={{ ...item, mainLineId: "wardrobe", basketId: "carpentry", basketName: "Carpentry" }} revisionId="other-revision" canUpdate pendingChangesSourceKey="carpentry-session" {...callbacks} /></main></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Question / check" })).toHaveValue("Are hinges aligned?"));
    expect(pending()).toEqual({ sourceKey: "carpentry-session", groups: [] });
    await user.type(screen.getByRole("textbox", { name: "Acceptance criteria" }), "New basket criteria");
    const expected = pending();
    await act(async () => finishOldSave({ ...saved, version: 8 }));
    expect(pending()).toEqual(expected);
    expect(pending()?.groups[0]?.label).toBe("Shared checklist · Carpentry");
    expect(JSON.stringify(pending())).not.toContain("Old basket unsaved criteria");
  });

  it("publishes empty cleanup with the same source and suppresses permission loss", async () => {
    const user = userEvent.setup(); const { rerender, unmount, client } = setup();
    await user.type(await screen.findByRole("textbox", { name: "Acceptance criteria" }), "Local criteria");
    expect(pendingEntries()).toHaveLength(1);
    rerender(<QueryClientProvider client={client}><main><KnowledgeBasketQualityPanel item={item} revisionId="item-revision" canUpdate={false} pendingChangesSourceKey="electrical-session" {...callbacks} /></main></QueryClientProvider>);
    expect(pending()).toEqual({ sourceKey: "electrical-session", groups: [] });
    unmount();
    expect(pending()).toEqual({ sourceKey: "electrical-session", groups: [] });
  });

  it("publishes under StrictMode and clears a changed revision even within the same basket", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    const view = (revisionId: string, source: string) => <StrictMode><QueryClientProvider client={client}><KnowledgeBasketQualityPanel item={item} revisionId={revisionId} canUpdate pendingChangesSourceKey={source} {...callbacks} /></QueryClientProvider></StrictMode>;
    const { rerender } = render(view("revision-one", "session-one"));
    await user.type(await screen.findByRole("textbox", { name: "Acceptance criteria" }), "Revision one pending criteria");
    expect(pendingEntries()).toHaveLength(1);
    expect(pending()?.sourceKey).toBe("session-one");
    rerender(view("revision-two", "session-two"));
    expect(screen.getByRole("textbox", { name: "Acceptance criteria" })).toHaveValue("");
    expect(pending()).toEqual({ sourceKey: "session-two", groups: [] });
    await user.click(screen.getByRole("checkbox", { name: "Photo evidence" }));
    expect(pending()?.sourceKey).toBe("session-two");
    expect(pendingEntries()[0]?.fields).toEqual([
      { key: "photos", label: "Photo evidence", value: "Required" },
      { key: "photoCount", label: "Required photos", value: "1" }
    ]);
  });
});
