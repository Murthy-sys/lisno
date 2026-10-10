import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyCriticalTasksPrompt } from "./DailyCriticalTasksPrompt";
import { projectChatApi } from "./projectChatApi";
import { ChatScheduleProvider, useChatSchedule } from "./ChatScheduleProvider";

const auth = vi.hoisted(() => ({ user: { id: "team-1", role: "procurement" }, authorization: { permissions: ["chat.read"] } }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("./projectChatApi", () => ({
  projectChatApi: { dailyCriticalTasks: vi.fn(), acknowledgeDailyCriticalTasks: vi.fn(), availability: vi.fn() },
  chatErrorMessage: (error: Error) => error.message
}));

const list = {
  timezone: "Asia/Kolkata" as const,
  localDate: "2026-09-29",
  scheduledAt: "2026-09-29T11:30:00.000Z",
  acknowledgedAt: null,
  items: [
    { kind: "chat_action" as const, id: "action-1", projectId: "project-a", projectName: "Project A", title: "Confirm the flooring quote", dueDate: "2026-09-29", messageId: "message-a" },
    { kind: "workflow_task" as const, id: "task-2", projectId: "project-b", projectName: "Project B", title: "Review materials", dueAt: "2026-09-28T09:00:00.000Z", status: "pending" }
  ]
};

function renderPrompt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ChatScheduleProvider><DailyCriticalTasksPrompt /><ScheduleProbe /></ChatScheduleProvider></MemoryRouter></QueryClientProvider>);
}
function ScheduleProbe() { const schedule = useChatSchedule(); return <button disabled={!schedule.canWrite} onClick={schedule.refresh}>Refresh chat schedule</button>; }

beforeEach(() => { vi.clearAllMocks(); auth.user.role = "procurement"; auth.authorization.permissions = ["chat.read"]; vi.mocked(projectChatApi.availability).mockResolvedValue({ timezone: "Asia/Kolkata", writable: true, nextOpenAt: null, nextChangeAt: "2099-01-01T00:00:00Z" }); });

describe("daily critical task prompt", () => {
  it.each(["vendor", "program_manager"])("does not poll staff chat endpoints for a %s without chat permission", async role => {
    auth.user.role = role; auth.authorization.permissions = [];
    renderPrompt();
    expect(screen.getByRole("button", { name: "Refresh chat schedule" })).toBeDisabled();
    expect(projectChatApi.availability).not.toHaveBeenCalled();
    expect(projectChatApi.dailyCriticalTasks).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "View daily critical tasks" })).not.toBeInTheDocument();
  });
  it("shows the authorized list, requires acknowledgment, and keeps it reopenable", async () => {
    const user = userEvent.setup();
    const acknowledged = { ...list, acknowledgedAt: "2026-09-29T11:32:00.000Z" };
    vi.mocked(projectChatApi.dailyCriticalTasks).mockResolvedValueOnce(list).mockResolvedValue(acknowledged);
    vi.mocked(projectChatApi.acknowledgeDailyCriticalTasks).mockResolvedValue(acknowledged);
    renderPrompt();
    const dialog = await screen.findByRole("alertdialog", { name: "Daily critical tasks" });
    expect(dialog).toHaveTextContent("Confirm the flooring quote");
    expect(dialog).toHaveTextContent("Review materials");
    expect(screen.getByRole("link", { name: "Open conversation" })).toHaveAttribute("href", "/projects/project-a/messages?message=message-a");
    await user.click(screen.getByRole("button", { name: "I have reviewed this list" }));
    await waitFor(() => expect(projectChatApi.acknowledgeDailyCriticalTasks).toHaveBeenCalledWith("2026-09-29"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "View daily critical tasks" }));
    expect(screen.getByRole("dialog", { name: "Daily critical tasks" })).toBeVisible();
  });

  it("shows no prompt before the first due date", async () => {
    vi.mocked(projectChatApi.dailyCriticalTasks).mockResolvedValue(null);
    renderPrompt();
    await waitFor(() => expect(projectChatApi.dailyCriticalTasks).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does not reopen cached task details when the current authorized read fails", async () => {
    const user = userEvent.setup();
    vi.mocked(projectChatApi.dailyCriticalTasks)
      .mockResolvedValueOnce({ ...list, acknowledgedAt: "2026-09-29T11:32:00.000Z" })
      .mockRejectedValue(new Error("Access changed"));
    renderPrompt();
    const button = await screen.findByRole("button", { name: "View daily critical tasks" });
    await user.click(button);
    await screen.findByRole("button", { name: "Retry critical tasks" });
    expect(screen.queryByRole("dialog", { name: "Daily critical tasks" })).not.toBeInTheDocument();
    expect(screen.queryByText("Confirm the flooring quote")).not.toBeInTheDocument();
  });
});
