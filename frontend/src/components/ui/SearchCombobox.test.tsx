import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchCombobox } from "./SearchCombobox";

interface Manager {
  id: string;
  name: string;
  email: string;
  mobile?: string;
}

const managers: Manager[] = [
  { id: "manager-aarav", name: "Aarav Mehta", email: "aarav@lisno.example", mobile: "+91 90000 00001" },
  { id: "manager-meera", name: "Meera Bose", email: "meera@lisno.example", mobile: "+91 90000 00002" }
];

function ManagerCombobox({
  items = managers,
  loading = false,
  error = false,
  onRetry = vi.fn()
}: {
  items?: Manager[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const [value, setValue] = useState<Manager | null>(null);
  const [query, setQuery] = useState("");
  return (
    <SearchCombobox
      label="Project manager"
      value={value}
      onChange={setValue}
      query={query}
      onQueryChange={setQuery}
      items={items}
      itemKey={(manager) => manager.id}
      itemLabel={(manager) => manager.name}
      renderItem={(manager) => (
        <span>
          <strong>{manager.name}</strong>
          <small>{manager.email} · {manager.mobile}</small>
        </span>
      )}
      loading={loading}
      error={error ? "Managers are unavailable." : undefined}
      onRetry={onRetry}
    />
  );
}

describe("SearchCombobox", () => {
  it("uses the combobox and listbox ARIA pattern while selecting one option by keyboard", async () => {
    const user = userEvent.setup();
    render(<ManagerCombobox />);

    const input = screen.getByRole("combobox", { name: "Project manager" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    await user.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "Project manager options" });
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Aarav Mehta");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.click(input);
    expect(screen.getByRole("option", { name: /Aarav Mehta/i })).toHaveAttribute("aria-selected", "true");
  });

  it("moves to the last option with ArrowUp before making a keyboard selection", async () => {
    const user = userEvent.setup();
    render(<ManagerCombobox />);
    const input = screen.getByRole("combobox", { name: "Project manager" });
    await user.click(input);
    await user.keyboard("{ArrowUp}{Enter}");
    expect(input).toHaveValue("Meera Bose");
  });

  it("keeps its selected option when a refreshed search result list no longer contains it", async () => {
    const user = userEvent.setup();
    function RefreshingCombobox() {
      const [items, setItems] = useState(managers);
      return (
        <>
          <ManagerCombobox items={items} />
          <button type="button" onClick={() => setItems([managers[1]!])}>Refresh</button>
        </>
      );
    }
    render(<RefreshingCombobox />);
    const input = screen.getByRole("combobox", { name: "Project manager" });
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(input).toHaveValue("Aarav Mehta");
  });

  it("clears an active option that disappears while the popup remains open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ManagerCombobox />);
    const input = screen.getByRole("combobox", { name: "Project manager" });
    await user.click(input);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("manager-meera"));

    rerender(<ManagerCombobox items={[managers[0]!]} />);

    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(input).toHaveFocus();
  });

  it("supports Escape and exposes loading, empty, and retryable error states", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<ManagerCombobox loading />);
    const input = screen.getByRole("combobox", { name: "Project manager" });
    await user.click(input);
    const loading = screen.getByRole("status");
    expect(loading).toHaveTextContent("Loading options…");
    expect(loading.closest('[role="listbox"]')).toBeNull();
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");

    rerender(<ManagerCombobox items={[]} />);
    await user.click(input);
    const empty = screen.getByRole("status");
    expect(empty).toHaveTextContent("No options found.");
    expect(empty.closest('[role="listbox"]')).toBeNull();

    rerender(<ManagerCombobox error onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Managers are unavailable.");
    expect(alert.closest('[role="listbox"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
