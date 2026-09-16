import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMediaProvider, ChatMessageAttachments } from "./ChatMessageAttachments";
import { projectChatApi } from "./projectChatApi";
import { ChatTransferPool } from "./chatTransfers";
import type { ChatAttachment } from "./projectChatTypes";

const identity = vi.hoisted(() => ({ current: true }));
vi.mock("./ProjectChatProvider", () => ({ useProjectChat: () => access }));
let pool = new ChatTransferPool();
const access = { isCurrent: () => () => identity.current, transfer: <T,>(operation: () => Promise<T>, signal: AbortSignal) => pool.run(operation, signal), verifyAccess: vi.fn() };
const file = (id = "photo"): ChatAttachment => ({ id, kind: "image", filename: `${id}.png`, mimeType: "image/png", byteSize: 1024, preview: { byteSize: 256, mimeType: "image/webp", width: 400, height: 300 } });
const observers: Array<{ callback: IntersectionObserverCallback; element?: Element; options?: IntersectionObserverInit }> = [];
beforeEach(() => {
  identity.current = true; pool = new ChatTransferPool(); observers.length = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:synthetic-${Math.random()}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.stubGlobal("IntersectionObserver", class { entry: typeof observers[number]; constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.entry = { callback, options }; observers.push(this.entry); } observe(element: Element) { this.entry.element = element; } disconnect() {} });
  vi.spyOn(projectChatApi, "attachmentBlob").mockResolvedValue({ blob: new Blob(["synthetic"], { type: "image/png" }), filename: "photo.png" });
});
function Media({ files = [file()] }: { files?: ChatAttachment[] }) { return <ChatMediaProvider projectId="project-a"><div className="project-chat-timeline"><ChatMessageAttachments attachments={files} /></div></ChatMediaProvider>; }
describe("authenticated media rendering", () => {
  it("loads previews only near the actual transcript and originals only on explicit view", async () => {
    const view = render(<Media />);
    expect(projectChatApi.attachmentBlob).not.toHaveBeenCalled();
    expect(observers[0].options?.root).toBe(document.querySelector(".project-chat-timeline"));
    act(() => observers[0].callback([{ target: observers[0].element!, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await waitFor(() => expect(projectChatApi.attachmentBlob).toHaveBeenCalledOnce());
    expect(vi.mocked(projectChatApi.attachmentBlob).mock.calls[0][2]).toBe("preview");
    await userEvent.click(screen.getByRole("button", { name: "View photo.png" }));
    await screen.findByRole("img", { name: "photo.png" });
    expect(vi.mocked(projectChatApi.attachmentBlob).mock.calls[1][2]).toBe("content");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    view.unmount();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2));
  });
  it("bounds live preview URLs and releases every lease on unmount", async () => {
    const view = render(<Media files={Array.from({ length: 24 }, (_, index) => file(`photo-${index}`))} />);
    act(() => observers.forEach(observer => observer.callback([{ target: observer.element!, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(16));
    expect(projectChatApi.attachmentBlob).toHaveBeenCalledTimes(16);
    view.unmount();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(16));
  });
  it("aborts a closed original request and ignores a late result from the old project", async () => {
    let complete!: (value: { blob: Blob; filename: string }) => void;
    vi.mocked(projectChatApi.attachmentBlob).mockReturnValue(new Promise(resolve => { complete = resolve; }));
    render(<Media />);
    await userEvent.click(screen.getByRole("button", { name: "View photo.png" }));
    await waitFor(() => expect(projectChatApi.attachmentBlob).toHaveBeenCalledOnce());
    const signal = vi.mocked(projectChatApi.attachmentBlob).mock.calls[0][3];
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(signal.aborted).toBe(true);
    identity.current = false;
    await act(async () => complete({ blob: new Blob(["late"]), filename: "private.png" }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("does not fetch documents or audio before an explicit user action", () => {
    render(<Media files={[{ ...file("document"), kind: "document", filename: "notes.pdf", mimeType: "application/pdf", preview: null }, { ...file("voice"), kind: "audio", filename: "voice.webm", mimeType: "audio/webm", preview: null }]} />);
    expect(screen.getByRole("button", { name: "Download notes.pdf" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Load audio" })).toBeVisible();
    expect(projectChatApi.attachmentBlob).not.toHaveBeenCalled();
    expect(document.querySelector("audio[autoplay]")).toBeNull();
  });
});
