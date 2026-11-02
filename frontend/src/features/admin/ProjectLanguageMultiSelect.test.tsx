import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectLanguageMultiSelect } from "./ProjectLanguageMultiSelect";
import type { ProjectLanguage } from "../../../../shared/projects/projectInitiation";

function Example({ onEscape = vi.fn() }: { onEscape?: () => void }) {
  const [value, setValue] = useState<ProjectLanguage[]>([]);
  return <div onKeyDown={(event) => { if (event.key === "Escape") onEscape(); }}>
    <label htmlFor="languages">Languages Known</label>
    <ProjectLanguageMultiSelect id="languages" value={value} onChange={setValue} />
    <button type="button">Outside</button>
  </div>;
}

describe("ProjectLanguageMultiSelect", () => {
  it("supports keyboard selection, removal, boundaries, and Escape without closing its parent", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    render(<Example onEscape={onEscape} />);
    const trigger = screen.getByRole("button", { name: "Languages Known" });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("option", { name: "Assamese" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{Enter}{End} ");
    expect(screen.getByRole("option", { name: "Bengali" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Urdu" })).toHaveFocus();
    expect(screen.getByRole("option", { name: "Urdu" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard(" {Home}{ArrowDown}{Enter}{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAccessibleDescription("0 languages selected");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("keeps selections on dismissal and clears them with the explicit action", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Languages Known" });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(trigger).toHaveTextContent("English");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "English" })).toHaveFocus();
    expect(within(screen.getByRole("listbox")).getAllByRole("option", { selected: true })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Clear languages" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(trigger).toHaveTextContent("Select languages");
    expect(trigger).toHaveFocus();
  });
});
