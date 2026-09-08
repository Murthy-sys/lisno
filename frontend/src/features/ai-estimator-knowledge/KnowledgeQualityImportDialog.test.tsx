import { useState } from "react";
import axe from "axe-core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeQualityImportDialog } from "./KnowledgeQualityImportDialog";
import { readQualityWorkbook, type QualityImportResult } from "./knowledgeQualityWorkbook";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

vi.mock("./knowledgeQualityWorkbook", () => ({ readQualityWorkbook: vi.fn() }));
const readWorkbook = vi.mocked(readQualityWorkbook);
const imported: KnowledgeJsonObject = {
  id: "new-check", label: "Are the sampled fixtures securely fixed?", type: "dropdown",
  allowedValues: ["Pass", "Fail"], required: true, active: true, stage: "After fixing",
  acceptanceCriteria: "Fixings match the approved detail.",
  sampling: { method: "percentage", value: 10, unit: "installed fixtures" },
  evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 1 }
};
const result = (parameters: KnowledgeJsonObject[] = [imported]): QualityImportResult => ({ parameters, issues: [] });
const workbook = (name = "electrical.xlsx") => new File(["mocked parser boundary"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const applyButton = () => screen.getByRole("button", { name: /checks? to checklist/u });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { readWorkbook.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("Main Basket quality Excel preview", () => {
  it("shows the parsed questions and evidence for review before explicitly applying rows", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onClose = vi.fn();
    readWorkbook.mockResolvedValue(result());
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[]} disabled={false} onImport={onImport} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Import quality checks" });
    expect(dialog).toHaveAccessibleDescription(expect.stringContaining("shared checklist"));
    expect(screen.getByRole("button", { name: "Choose Excel file" })).toBeEnabled();
    expect(applyButton()).toHaveAccessibleName("Add checks to checklist");
    expect(applyButton()).toBeDisabled();
    await user.upload(screen.getByLabelText("Excel workbook"), workbook());
    expect(await within(dialog).findByText(String(imported.label))).toBeVisible();
    expect(within(dialog).getByText(/10% of installed fixtures, rounded up/u)).toBeVisible();
    expect(within(dialog).getByText("1 photo per sampled unit")).toBeVisible();
    expect(within(dialog).getByText("Acceptance criteria")).toBeVisible();
    expect(within(dialog).getByText("Pass · Fail")).toBeVisible();
    expect(onImport).not.toHaveBeenCalled();
    expect(applyButton()).toHaveAccessibleName("Add 1 check to checklist");
    expect(applyButton()).toBeEnabled();
    await user.click(applyButton());
    expect(onImport).toHaveBeenCalledExactlyOnceWith([imported]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens the native file picker from the explicit button with Enter and Space", async () => {
    const user = userEvent.setup();
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[]} disabled={false} onImport={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Excel workbook") as HTMLInputElement;
    const choose = screen.getByRole("button", { name: "Choose Excel file" });
    expect(choose.tagName).toBe("BUTTON");
    expect(input).toHaveAttribute("tabindex", "-1");
    const openPicker = vi.spyOn(input, "click").mockImplementation(() => {});
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Close Import quality checks" })).toHaveFocus());
    choose.focus();
    expect(choose).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(openPicker).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(openPicker).toHaveBeenCalledTimes(2);
    expect(readWorkbook).not.toHaveBeenCalled();
  });

  it("shows long filenames and permits retrying the exact same file after a read error", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const filename = `Painting-checks-${"site-and-apartment-details-".repeat(8)}September.xlsx`;
    const selected = workbook(filename);
    readWorkbook.mockResolvedValueOnce({ parameters: [], issues: [{ row: null, message: "Read failed; choose the file again." }] }).mockResolvedValueOnce(result());
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[]} disabled={false} onImport={onImport} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Excel workbook") as HTMLInputElement;
    expect(screen.getByRole("dialog")).toHaveTextContent(/5 MiB/u);
    await user.upload(input, selected);
    expect(await screen.findByRole("alert")).toHaveTextContent("Read failed; choose the file again.");
    expect(screen.getByText(filename)).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveTextContent(/\d+ KB · Excel workbook/u);
    expect(screen.getByRole("button", { name: "Change file" })).toBeEnabled();
    expect(input.value).toBe("");
    await user.upload(input, selected);
    expect(await screen.findByText(String(imported.label))).toBeVisible();
    expect(readWorkbook).toHaveBeenCalledTimes(2);
    expect(readWorkbook.mock.calls.map(call => call[0])).toEqual([selected, selected]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(applyButton()).toBeEnabled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("names a multi-check action correctly and keeps the empty and populated dialog accessible", async () => {
    const user = userEvent.setup();
    const additional = { ...imported, id: "second-check", label: "Are the switch plates aligned?" };
    readWorkbook.mockResolvedValue(result([imported, additional]));
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[]} disabled={false} onImport={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Import quality checks" });
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.upload(screen.getByLabelText("Excel workbook"), workbook());
    expect(await screen.findByRole("button", { name: "Add 2 checks to checklist" })).toBeEnabled();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("blocks apply when a parser issue exists even when preview rows were recovered", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    readWorkbook.mockResolvedValue({ parameters: [imported], issues: [{ row: 3, column: "Sample value", message: "Use a percentage at most 100." }] });
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[]} disabled={false} onImport={onImport} onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Excel workbook"), workbook());
    expect(await screen.findByRole("alert")).toHaveTextContent("Row 3 · Sample value: Use a percentage at most 100.");
    expect(applyButton()).toBeDisabled();
    await user.click(applyButton());
    expect(onImport).not.toHaveBeenCalled();
  });

  it("allows the painting Excel check with two incomplete existing questions and identifies those questions separately", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const painting: KnowledgeJsonObject = {
      id: "painting-check", label: "is Painting done", type: "radio", allowedValues: ["Pass", "Fail", "Not applicable"],
      acceptanceCriteria: "photos to be uploaded after painting", required: true, active: true,
      evidence: { photos: true, minPhotosPerSample: 1, documents: false, video: false }
    };
    const existing = [
      { id: "blank-one", label: "", type: "", required: true, active: true },
      { id: "blank-two", label: "", type: "", required: true, active: true }
    ];
    const before = JSON.stringify(existing);
    readWorkbook.mockResolvedValue(result([painting]));
    const props = { basketName: "Painting", disabled: false, onImport, onClose: vi.fn() };
    const view = render(<KnowledgeQualityImportDialog {...props} currentParameters={existing} />);
    expect(screen.queryByText(/Existing questions 1, 2 need attention/u)).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Excel workbook"), workbook("painting.xlsx"));
    expect(await screen.findByText("is Painting done")).toBeVisible();
    expect(screen.getByText("1 photo per checked unit")).toBeVisible();
    expect(screen.getByText("Existing questions 1, 2 need attention. You can add these Excel checks, then complete or delete those questions before saving.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(applyButton()).toBeEnabled();
    await user.click(applyButton());
    expect(onImport).toHaveBeenCalledExactlyOnceWith([painting]);
    expect(JSON.stringify(existing)).toBe(before);
    view.rerender(<KnowledgeQualityImportDialog {...props} currentParameters={existing.map((row, index) => ({ ...row, label: `Existing check ${index + 1}`, type: "boolean" }))} />);
    expect(screen.queryByText(/Existing questions 1, 2 need attention/u)).not.toBeInTheDocument();
    expect(applyButton()).toBeEnabled();
  });

  it("still blocks a new invalid check when the existing checklist also has an incomplete question", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    readWorkbook.mockResolvedValue(result([{ ...imported, label: "" }]));
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[{ id: "blank-existing", label: "", type: "" }]} disabled={false} onImport={onImport} onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Excel workbook"), workbook());
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter nonempty text up to 240 characters.");
    expect(screen.queryByText(/You can add these Excel checks/u)).not.toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
    await user.click(applyButton());
    expect(onImport).not.toHaveBeenCalled();
  });

  it("names duplicate questions and revalidates the combined checklist when current rows change", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    readWorkbook.mockResolvedValue(result());
    const props = { basketName: "Electrical", disabled: false, onImport, onClose: vi.fn() };
    const view = render(<KnowledgeQualityImportDialog {...props} currentParameters={[]} />);
    await user.upload(screen.getByLabelText("Excel workbook"), workbook());
    expect(await screen.findByText(String(imported.label))).toBeVisible();
    expect(applyButton()).toBeEnabled();
    view.rerender(<KnowledgeQualityImportDialog {...props} currentParameters={[{ ...imported, id: "existing-check", label: " ARE THE SAMPLED FIXTURES SECURELY FIXED? " }]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(`“${imported.label}” already exists for the same stage`);
    expect(applyButton()).toBeDisabled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("blocks an import that would exceed the shared 200-check limit", async () => {
    const user = userEvent.setup();
    readWorkbook.mockResolvedValue(result());
    const existing = Array.from({ length: 200 }, (_, i) => ({ id: `check-${i}`, label: `Existing question ${i}`, type: "text" }));
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={existing} disabled={false} onImport={vi.fn()} onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Excel workbook"), workbook());
    expect(await screen.findByRole("alert")).toHaveTextContent("at most 200 quality parameters");
    expect(screen.queryByText(/Existing questions?.*attention/u)).not.toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
  });

  it("cancels the previous read and ignores its late result after selecting another workbook", async () => {
    const user = userEvent.setup();
    const old = deferred<QualityImportResult>();
    const fresh = deferred<QualityImportResult>();
    readWorkbook.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[]} disabled={false} onImport={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Excel workbook");
    await user.upload(input, workbook("old.xlsx"));
    const oldSignal = readWorkbook.mock.calls[0][1]!;
    expect(screen.getByRole("status")).toHaveTextContent(/Reading/u);
    expect(screen.getByText("old.xlsx")).toBeVisible();
    expect(screen.getByRole("button", { name: "Change file" })).toBeEnabled();
    await user.upload(input, workbook("new.xlsx"));
    expect(oldSignal.aborted).toBe(true);
    expect(applyButton()).toBeDisabled();
    await act(async () => { fresh.resolve(result([{ ...imported, id: "fresh-check", label: "Fresh workbook question" }])); });
    expect(screen.getByText("Fresh workbook question")).toBeVisible();
    await act(async () => { old.resolve(result([{ ...imported, label: "Stale workbook question" }])); });
    expect(screen.queryByText("Stale workbook question")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh workbook question")).toBeVisible();
    expect(applyButton()).toBeEnabled();
  });

  it("aborts a pending parser on Cancel without applying its late result", async () => {
    const user = userEvent.setup();
    const pending = deferred<QualityImportResult>();
    const onImport = vi.fn();
    readWorkbook.mockReturnValue(pending.promise);
    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? <KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[]} disabled={false} onImport={onImport} onClose={() => setOpen(false)} /> : <p>Checklist unchanged</p>;
    }
    render(<Harness />);
    await user.upload(screen.getByLabelText("Excel workbook"), workbook());
    const signal = readWorkbook.mock.calls[0][1]!;
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => { pending.resolve(result()); });
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByText("Checklist unchanged")).toBeVisible();
  });

  it("disables file selection and applying a prepared preview while saving or read-only", async () => {
    const user = userEvent.setup();
    readWorkbook.mockResolvedValue(result());
    const props = { basketName: "Electrical", currentParameters: [], onImport: vi.fn(), onClose: vi.fn() };
    const view = render(<KnowledgeQualityImportDialog {...props} disabled />);
    expect(screen.getByLabelText("Excel workbook")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose Excel file" })).toBeDisabled();
    expect(applyButton()).toBeDisabled();
    view.rerender(<KnowledgeQualityImportDialog {...props} disabled={false} />);
    await user.upload(screen.getByLabelText("Excel workbook"), workbook());
    expect(await screen.findByText(String(imported.label))).toBeVisible();
    expect(applyButton()).toBeEnabled();
    view.rerender(<KnowledgeQualityImportDialog {...props} disabled />);
    expect(applyButton()).toBeDisabled();
    expect(screen.getByLabelText("Excel workbook")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change file" })).toBeDisabled();
    await user.click(applyButton());
    expect(props.onImport).not.toHaveBeenCalled();
  });

  it("shows a recoverable error if the reader unexpectedly fails", async () => {
    const user = userEvent.setup();
    readWorkbook.mockRejectedValueOnce(new Error("Parser failure")).mockResolvedValueOnce(result());
    render(<KnowledgeQualityImportDialog basketName="Electrical" currentParameters={[]} disabled={false} onImport={vi.fn()} onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Excel workbook"), workbook("bad.xlsx"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The workbook could not be read. Choose the file again.");
    expect(applyButton()).toBeDisabled();
    await user.upload(screen.getByLabelText("Excel workbook"), workbook("fixed.xlsx"));
    expect(await screen.findByText(String(imported.label))).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(applyButton()).toBeEnabled();
  });
});
