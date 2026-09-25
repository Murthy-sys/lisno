import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { PublicUser } from "../../api/types";
import { AccountMenu } from "./AccountMenu";
import { WorkspaceTopbar } from "./WorkspaceTopbar";

vi.mock("../../features/notifications/NotificationBell", () => ({
  NotificationBell: () => <button type="button">Notifications</button>
}));

const account: PublicUser = {
  id: "designer-1", name: "Ananya Rao", email: "ananya@lisno.example", role: "designer"
};

function renderAccount(onLogout: () => void | Promise<void> = vi.fn()) {
  return render(
    <MemoryRouter>
      <button type="button">Before account</button>
      <AccountMenu user={account} onLogout={onLogout} />
      <button type="button">After account</button>
      <p>Outside account</p>
    </MemoryRouter>
  );
}

describe("AccountMenu", () => {
  it("uses live identity and exposes only current account details and Sign out", async () => {
    renderAccount();
    const trigger = screen.getByRole("button", { name: account.name });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(within(trigger).getByText("AR")).toHaveAttribute("aria-hidden", "true");
    expect(within(trigger).getByText("Designer")).toBeVisible();
    expect(screen.queryByRole("group", { name: "Account" })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    const details = screen.getByRole("group", { name: "Account" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", details.id);
    expect(within(details).getByText(account.email)).toBeVisible();
    expect(within(details).getByText("Designer")).toBeVisible();
    expect(within(details).getAllByRole("button")).toHaveLength(1);
    expect(within(details).getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(within(details).queryByRole("link")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(screen.queryByRole("group", { name: "Account" })).not.toBeInTheDocument();
  });

  it("opens with Enter or Space, follows normal Tab order, and restores focus on Escape", async () => {
    const interaction = userEvent.setup();
    renderAccount();
    const trigger = screen.getByRole("button", { name: account.name });
    trigger.focus();
    await interaction.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await interaction.tab();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
    await interaction.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await interaction.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await interaction.tab();
    await interaction.tab();
    expect(screen.getByRole("button", { name: "After account" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    trigger.focus();
    await interaction.keyboard("{Enter}");
    await interaction.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Before account" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes for an outside pointer without stealing focus from the next control", async () => {
    renderAccount();
    const trigger = screen.getByRole("button", { name: account.name });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "After account" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "After account" })).toHaveFocus();

    await userEvent.click(trigger);
    fireEvent.pointerDown(screen.getByText("Outside account"));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("guards repeated sign-out until settlement and closes after success", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const onLogout = vi.fn(() => pending);
    renderAccount(onLogout);
    await userEvent.click(screen.getByRole("button", { name: account.name }));
    const button = screen.getByRole("button", { name: "Sign out" });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-busy", "true");
    expect(button).toHaveAccessibleName("Sign out");
    await userEvent.click(button);
    expect(onLogout).toHaveBeenCalledTimes(1);

    await act(async () => { finish(); await pending; });
    expect(screen.queryByRole("group", { name: "Account" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: account.name })).toHaveFocus();
  });

  it("handles a rejected sign-out with safe copy and an actionable retry", async () => {
    const onLogout = vi.fn()
      .mockRejectedValueOnce(new Error("Private transport failure details"))
      .mockResolvedValueOnce(undefined);
    renderAccount(onLogout);
    await userEvent.click(screen.getByRole("button", { name: account.name }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out. Please try again.");
    expect(screen.queryByText("Private transport failure details")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Account" })).not.toBeInTheDocument());
    expect(onLogout).toHaveBeenCalledTimes(2);
  });

  it("closes on route changes that do not involve an outside pointer", async () => {
    let navigate!: ReturnType<typeof useNavigate>;
    function RouteAccount() {
      navigate = useNavigate();
      return <AccountMenu user={account} onLogout={vi.fn()} />;
    }
    render(<MemoryRouter initialEntries={["/designer"]}><RouteAccount /></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: account.name });
    await userEvent.click(trigger);
    act(() => { navigate("/designer?view=projects"); });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(account.email)).not.toBeInTheDocument();
  });

  it("resets an open disclosure on identity replacement and ignores the prior logout rejection", async () => {
    let reject!: (reason: Error) => void;
    const onLogout = vi.fn(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const next: PublicUser = {
      id: "client-2", name: "Maya Patel", email: "maya@lisno.example", role: "client"
    };
    const view = (identity: PublicUser) => (
      <MemoryRouter><AccountMenu user={identity} onLogout={onLogout} /></MemoryRouter>
    );
    const { rerender } = render(view(account));
    await userEvent.click(screen.getByRole("button", { name: account.name }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    rerender(view(next));
    expect(screen.queryByText(account.email)).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: next.name });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(screen.getByText(next.email)).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    await act(async () => { reject(new Error("Old identity failure")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(next.email)).toBeVisible();
  });
});

describe("WorkspaceTopbar", () => {
  it("shares one notification and real account control while leaving search absent", () => {
    render(
      <MemoryRouter>
        <WorkspaceTopbar user={account} onLogout={vi.fn()} compact leading={<button>Open navigation</button>} />
      </MemoryRouter>
    );
    const header = screen.getByRole("banner", { name: "Workspace tools" });
    expect(header).toHaveClass("workspace-topbar", "workspace-topbar--compact");
    expect(within(header).getByRole("button", { name: "Open navigation" })).toBeVisible();
    expect(within(header).getAllByRole("button", { name: "Notifications" })).toHaveLength(1);
    expect(within(header).getByRole("button", { name: account.name })).toBeVisible();
    expect(within(header).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(header).queryByRole("textbox")).not.toBeInTheDocument();
  });
});
