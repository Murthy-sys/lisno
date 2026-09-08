import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { KnowledgeBasketQualityPanel } from "./KnowledgeBasketQualityPanel";
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
const callbacks = { onDirtyChange: vi.fn(), onSavingChange: vi.fn() };
function setup(canUpdate = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><main><KnowledgeBasketQualityPanel item={item} revisionId="item-revision" canUpdate={canUpdate} {...callbacks} /></main></QueryClientProvider>);
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
