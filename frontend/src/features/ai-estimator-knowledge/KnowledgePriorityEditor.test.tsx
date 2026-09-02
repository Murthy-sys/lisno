import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  KnowledgePriorityEditor,
  type KnowledgePriorityEditorProps
} from "./KnowledgePriorityEditor";
import type {
  KnowledgeMaster,
  KnowledgePrioritySemanticTier
} from "./knowledgeTypes";

const metadata = {
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-09-02T08:00:00.000Z",
  updatedAt: "2026-09-02T08:00:00.000Z"
} as const;

function priority(
  id: string,
  name: string,
  semanticTier?: KnowledgePrioritySemanticTier,
  status: KnowledgeMaster["status"] = "active"
): KnowledgeMaster {
  return {
    id,
    masterType: "priorities",
    code: id.toUpperCase(),
    name,
    description: null,
    displayOrder: 999,
    status,
    semanticTier,
    ...metadata
  };
}

const canonical = [
  priority("priority-low-stable", "Low", "low"),
  priority("priority-high-stable", "High", "high"),
  priority("priority-non-negotiable-stable", "Non Negotiable", "non_negotiable"),
  priority("priority-medium-stable", "Medium", "medium")
] as const;

function renderEditor(overrides: Partial<KnowledgePriorityEditorProps> = {}) {
  const props: KnowledgePriorityEditorProps = {
    priorityId: "",
    priorities: canonical,
    catalogState: { status: "ready" },
    sectionState: { status: "ready" },
    readOnly: false,
    saving: false,
    dirty: false,
    onChange: vi.fn(),
    ...overrides
  };
  const view = render(<main><KnowledgePriorityEditor {...props} /></main>);
  return { ...view, props };
}

describe("KnowledgePriorityEditor", () => {
  it("orders canonical active choices by semantic tier and emits only the stable ID", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({
      priorities: [
        canonical[0],
        priority("priority-custom", "Urgent custom"),
        canonical[1],
        canonical[2],
        canonical[3]
      ],
      onChange
    });

    const select = screen.getByRole("combobox", { name: "Priority" });
    expect(within(select).getAllByRole("option").map((option) => ({
      label: option.textContent,
      value: (option as HTMLOptionElement).value
    }))).toEqual([
      { label: "Select priority", value: "" },
      { label: "Non Negotiable", value: "priority-non-negotiable-stable" },
      { label: "High", value: "priority-high-stable" },
      { label: "Medium", value: "priority-medium-stable" },
      { label: "Low", value: "priority-low-stable" }
    ]);
    expect(select).toHaveAccessibleDescription(
      "Set the priority for this Main Line so the estimator can identify it. Applies to all Specifications."
    );
    expect(screen.queryByRole("button", { name: /Add Priority/iu })).not.toBeInTheDocument();

    await user.selectOptions(select, "priority-high-stable");
    expect(onChange).toHaveBeenCalledWith("priority-high-stable");

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("preserves an unavailable saved selection without exposing its ID", () => {
    const unavailable = priority(
      "private-retired-priority-id",
      "Legacy urgent",
      undefined,
      "inactive"
    );
    renderEditor({
      priorityId: unavailable.id,
      priorities: [...canonical, unavailable]
    });

    const select = screen.getByRole("combobox", { name: "Priority" });
    expect(select).toHaveValue(unavailable.id);
    expect(screen.getByRole("option", { name: "Legacy urgent" })).toBeDisabled();
    expect(document.body).not.toHaveTextContent(unavailable.id);
  });

  it("renders accessible loading, empty, error/retry, stale, saving, and read-only states", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const view = renderEditor({
      priorities: [],
      catalogState: { status: "loading" }
    });
    expect(screen.getByRole("combobox", { name: "Priority" })).toBeDisabled();
    expect(screen.getByText("Loading Priority options…")).toHaveAttribute("role", "status");

    view.rerender(
      <main>
        <KnowledgePriorityEditor
          {...view.props}
          priorities={[]}
          catalogState={{ status: "ready" }}
        />
      </main>
    );
    expect(screen.getByText("No Priority options are configured.")).toBeVisible();

    view.rerender(
      <main>
        <KnowledgePriorityEditor
          {...view.props}
          priorities={[canonical[3]]}
          catalogState={{ status: "ready" }}
        />
      </main>
    );
    expect(screen.getByRole("combobox", { name: "Priority" })).toBeDisabled();
    expect(screen.getByText("No Priority options are configured.")).toBeVisible();

    view.rerender(
      <main>
        <KnowledgePriorityEditor
          {...view.props}
          priorities={canonical}
          catalogState={{ status: "error", onRetry: retry }}
        />
      </main>
    );
    expect(screen.getByText("Priority options could not be loaded.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry Priority" }));
    expect(retry).toHaveBeenCalledOnce();

    view.rerender(
      <main>
        <KnowledgePriorityEditor
          {...view.props}
          priorities={canonical}
          catalogState={{ status: "ready", refreshing: true }}
        />
      </main>
    );
    expect(screen.getByText("Priority options may be out of date.")).toHaveAttribute("role", "status");
    expect(screen.getByRole("combobox", { name: "Priority" })).toBeEnabled();

    view.rerender(
      <main>
        <KnowledgePriorityEditor
          {...view.props}
          priorityId=""
          priorities={canonical}
          catalogState={{ status: "ready" }}
          readOnly
          saving={false}
        />
      </main>
    );
    expect(screen.getByRole("combobox", { name: "Priority" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Not configured" })).toBeInTheDocument();
    expect(screen.getByText("Read-only revision")).toBeVisible();
  });
});
