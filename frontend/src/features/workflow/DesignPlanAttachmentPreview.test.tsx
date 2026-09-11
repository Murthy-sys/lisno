import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesignPlanAttachmentPreview } from "./DesignPlanAttachmentPreview";
import { downloadDesignPlanReviewAttachment } from "./projectWorkflowApi";

vi.mock("./projectWorkflowApi", () => ({ downloadDesignPlanReviewAttachment: vi.fn() }));
const fetchAttachment = vi.mocked(downloadDesignPlanReviewAttachment);
const createUrl = vi.fn(() => "blob:shared-design");
const revokeUrl = vi.fn();
const props = { roundId: "round-project-a", attachmentIndex: 0, filename: "living-room.png" };
const file = (type = "image/png") => ({ blob: new Blob(["shared-file"], { type }), filename: props.filename });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  fetchAttachment.mockResolvedValue(file());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DesignPlanAttachmentPreview", () => {
  it("loads the selected submitted attachment on demand and releases it when closed", async () => {
    const user = userEvent.setup();
    render(<DesignPlanAttachmentPreview {...props} />);
    expect(fetchAttachment).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "View living-room.png" }));
    const dialog = await screen.findByRole("dialog", { name: props.filename });
    expect(await within(dialog).findByRole("img", { name: "Designer upload: living-room.png" })).toHaveAttribute("src", "blob:shared-design");
    expect(fetchAttachment).toHaveBeenCalledWith("round-project-a", 0);
    await user.click(within(dialog).getByRole("button", { name: "Close living-room.png" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(revokeUrl).toHaveBeenCalledWith("blob:shared-design");
  });

  it("previews a PDF using its actual response type", async () => {
    fetchAttachment.mockResolvedValue(file("application/pdf"));
    const user = userEvent.setup();
    const { unmount } = render(<DesignPlanAttachmentPreview {...props} filename="plan.pdf" />);
    await user.click(screen.getByRole("button", { name: "View plan.pdf" }));
    expect(await screen.findByTitle("Designer upload: plan.pdf")).toHaveAttribute("src", "blob:shared-design");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    unmount();
    expect(revokeUrl).toHaveBeenCalledWith("blob:shared-design");
  });

  it("shows a recoverable loading error and retries the same attachment", async () => {
    fetchAttachment.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    render(<DesignPlanAttachmentPreview {...props} />);
    await user.click(screen.getByRole("button", { name: "View living-room.png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("img", { name: "Designer upload: living-room.png" })).toBeVisible();
    expect(fetchAttachment).toHaveBeenCalledTimes(2);
  });

  it.each(["text/html", "image/svg+xml"])("does not render an unsupported %s response", async (type) => {
    fetchAttachment.mockResolvedValue(file(type));
    const user = userEvent.setup();
    render(<DesignPlanAttachmentPreview {...props} />);
    await user.click(screen.getByRole("button", { name: "View living-room.png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use Download");
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each(["close", "switch"])("ignores a late previous attachment after %s", async (action) => {
    let resolve!: (value: ReturnType<typeof file>) => void;
    fetchAttachment.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const user = userEvent.setup();
    const { rerender } = render(<DesignPlanAttachmentPreview {...props} />);
    await user.click(screen.getByRole("button", { name: "View living-room.png" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading design attachment");
    if (action === "switch") rerender(<DesignPlanAttachmentPreview {...props} roundId="round-project-b" />);
    else await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close living-room.png" }));
    await act(async () => resolve(file()));
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
