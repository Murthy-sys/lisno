import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotationPdfAction } from "./QuotationPdfViewer";

const create = vi.fn(() => "blob:quotation");
const revoke = vi.fn();
const file = { blob: new Blob(["%PDF-test"], { type: "application/pdf" }), filename: "draft.pdf" };
const props = { documentKey: "actor:project:draft:4", title: "Saved draft · Version 4" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Quotation PDF viewer", () => {
  it("opens on demand and downloads the same document, then releases it and returns focus", async () => {
    const user = userEvent.setup();
    const load = vi.fn().mockResolvedValue(file);
    render(<QuotationPdfAction {...props} getFile={load} note="Showing the last saved version." />);
    const open = screen.getByRole("button", { name: "View quotation PDF" });
    expect(load).not.toHaveBeenCalled();
    await user.click(open);
    const dialog = screen.getByRole("dialog", { name: props.title });
    expect(dialog).toHaveAccessibleDescription("Showing the last saved version.");
    expect(await within(dialog).findByTitle(props.title)).toHaveAttribute("src", "blob:quotation");
    expect(within(dialog).getByRole("link", { name: "Download PDF" })).toHaveAttribute("download", "draft.pdf");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(open).toHaveFocus();
    expect(revoke).toHaveBeenCalledWith("blob:quotation");
  });

  it("aborts a replaced document and ignores its late result", async () => {
    const user = userEvent.setup();
    let resolve!: (value: typeof file) => void;
    const load = vi.fn((_signal: AbortSignal) => new Promise<typeof file>(done => { resolve = done; }));
    const { rerender } = render(<QuotationPdfAction {...props} getFile={load} />);
    await user.click(screen.getByRole("button", { name: "View quotation PDF" }));
    rerender(<QuotationPdfAction {...props} documentKey="actor:project:round:5" getFile={load} />);
    expect(load.mock.calls[0]![0].aborted).toBe(true);
    await act(async () => resolve(file));
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("rejects a non-PDF response and can retry", async () => {
    const user = userEvent.setup();
    const load = vi.fn().mockResolvedValueOnce({ blob: new Blob(["error"], { type: "text/html" }) }).mockResolvedValue(file);
    render(<QuotationPdfAction {...props} getFile={load} />);
    await user.click(screen.getByRole("button", { name: "View quotation PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be opened");
    expect(create).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTitle(props.title)).toHaveAttribute("src", "blob:quotation");
  });
});
