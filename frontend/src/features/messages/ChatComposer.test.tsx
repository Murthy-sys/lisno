import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";
import { chatTestPeople, chatTestPolicy } from "./projectChatFixtures";
import { emptyChatDraft, type ChatDraft } from "./projectChatState";

beforeEach(() => { window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }); });
function ComposerHarness({ onSend = vi.fn(), initial = emptyChatDraft() }: { onSend?: (draft: ChatDraft) => void; initial?: ChatDraft }) {
  const [draft, setDraft] = useState(initial);
  return <ChatComposer draft={draft} onChange={setDraft} onSend={() => onSend(draft)} disabled={false} participants={chatTestPeople} policy={chatTestPolicy()} />;
}
describe("project message composer", () => {
  it("keeps the shared-client audience visible and associated with the input", () => {
    render(<ComposerHarness />);
    const audience = screen.getByText("Shared with the client and project team");
    expect(audience).toBeVisible();
    expect(audience.closest(".sr-only")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Message the project team" })).toHaveAccessibleDescription(/Shared with the client and project team/);
  });
  it("selects duplicate names by role/stable ID with keyboard and sends Unicode", async () => {
    const sent = vi.fn(); render(<ComposerHarness onSend={sent} />);
    const input = screen.getByRole("textbox", { name: "Message the project team" });
    await userEvent.type(input, "Hi @Alex");
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Hi @Alex Team ");
    await userEvent.type(input, "नमस्ते 👋");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sent.mock.calls[0][0]).toMatchObject({ body: "Hi @Alex Team नमस्ते 👋", mentions: [{ userId: "worker-b", start: 3, end: 13 }] });
  });
  it("dismisses suggestions with Escape and does not convert typed text into mentions", async () => {
    const sent = vi.fn(); render(<ComposerHarness onSend={sent} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Message the project team" }), "@Alex");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sent.mock.calls[0][0].mentions).toEqual([]);
  });
  it("does not send during IME composition, supports Shift+Enter and desktop Enter", () => {
    const sent = vi.fn(); render(<ComposerHarness onSend={sent} initial={{ ...emptyChatDraft(), body: "Draft" }} />);
    const input = screen.getByRole("textbox", { name: "Message the project team" });
    fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.compositionEnd(input); fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(sent).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" }); expect(sent).toHaveBeenCalledOnce();
  });
  it("keeps Enter multiline on touch input and exposes a visible Send button", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    const sent = vi.fn(); render(<ComposerHarness onSend={sent} initial={{ ...emptyChatDraft(), body: "Draft" }} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message the project team" }), { key: "Enter" });
    expect(sent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send" })); expect(sent).toHaveBeenCalledOnce();
  });
  it("blocks stale mention targets and the message length limit", () => {
    const { rerender } = render(<ChatComposer draft={{ ...emptyChatDraft(), body: "@Removed", mentions: [{ userId: "removed", start: 0, end: 8 }] }} participants={chatTestPeople} disabled={false} onChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText(/no longer available/)).toBeVisible();
    rerender(<ChatComposer draft={{ ...emptyChatDraft(), body: "x".repeat(4001) }} participants={chatTestPeople} disabled={false} onChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
  it("quotes explicitly and keeps importance distinct from mentions", async () => {
    const sent = vi.fn(); render(<ComposerHarness onSend={sent} initial={{ ...emptyChatDraft(), body: "Please help", reply: { id: "reply-a", author: chatTestPeople[1], body: "Original query" } }} />);
    expect(screen.getByText("Replying to Alex Team")).toBeVisible();
    const importance = screen.getByRole("button", { name: "Message importance" });
    await userEvent.click(importance);
    await userEvent.selectOptions(screen.getByLabelText("Importance"), "critical");
    await userEvent.selectOptions(screen.getByLabelText("Responsible person (optional)"), "worker-a");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(importance).toHaveFocus();
    expect(screen.getByRole("button", { name: "Critical · Alex Team" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sent.mock.calls[0][0]).toMatchObject({ priority: "critical", responsibleUserId: "worker-a", mentions: [], reply: { id: "reply-a" } });
  });
  it("inserts a picker emoji at the saved caret and shifts stable mention offsets", async () => {
    const sent = vi.fn();
    render(<ComposerHarness onSend={sent} initial={{ ...emptyChatDraft(), body: "Hi @Alex Team", mentions: [{ userId: "worker-a", start: 3, end: 13 }] }} />);
    const input = screen.getByRole("textbox", { name: "Message the project team" }) as HTMLTextAreaElement;
    input.focus(); input.setSelectionRange(0, 0); fireEvent.select(input);
    await userEvent.click(screen.getByRole("button", { name: "Emoji" }));
    await userEvent.type(screen.getByLabelText("Search emojis"), "thumbs up");
    await userEvent.click(screen.getByRole("button", { name: "thumbs up" }));
    expect(input).toHaveValue("👍Hi @Alex Team");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sent.mock.calls[0][0].mentions).toEqual([{ userId: "worker-a", start: 5, end: 15 }]);
  });
  it("queues attachment-only drafts, removes a selection, and does not publish rejected files", async () => {
    const sent = vi.fn(); render(<ComposerHarness onSend={sent} />);
    const file = new File(["synthetic"], "document.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("Choose attachments"), file);
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Remove document.pdf" }));
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.upload(screen.getByLabelText("Choose attachments"), new File(["script"], "unsafe.html", { type: "text/html" }));
    expect(screen.getByText(/supported formats are/)).toBeVisible();
    expect(screen.queryByRole("list", { name: "Selected attachments" })).not.toBeInTheDocument();
    expect(sent).not.toHaveBeenCalled();
  });
  it("shows a useful attachment-only reply summary", () => {
    render(<ComposerHarness initial={{ ...emptyChatDraft(), reply: { id: "photo", author: chatTestPeople[1], body: "", attachmentSummary: { count: 1, kind: "image", filename: "kitchen.jpg" } } }} />);
    expect(screen.getByText("Photo")).toBeVisible();
  });
});
