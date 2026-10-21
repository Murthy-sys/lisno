import { createRef, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeBasketCard } from "./KnowledgeBasketCard";

const base = {
  variant: "main" as const,
  name: "Functional Lights Supply and Installation",
  panelId: "basket-lights",
  imageUrl: "/assets/lights.webp",
  countText: "2 items on this page",
  expanded: false,
  onToggle: vi.fn(),
  children: <a href="/items/light">Recessed downlights</a>
};

describe("KnowledgeBasketCard", () => {
  it("exposes a named section and controlled disclosure without exposing collapsed content", () => {
    const toggleRef = createRef<HTMLButtonElement>();
    const { rerender } = render(<KnowledgeBasketCard {...base} toggleRef={toggleRef} description="Includes fittings and installation." />);
    const card = screen.getByRole("region", { name: base.name });
    const toggle = within(card).getByRole("button", { name: base.name });
    expect(within(card).getByRole("heading", { name: base.name, level: 2 })).toContainElement(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", base.panelId);
    expect(toggleRef.current).toBe(toggle);
    expect(screen.getByText(base.countText)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Recessed downlights" })).not.toBeInTheDocument();
    expect(screen.getByText("Includes fittings and installation.")).not.toBeVisible();

    rerender(<KnowledgeBasketCard {...base} expanded toggleRef={toggleRef} description="Includes fittings and installation." />);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Recessed downlights" })).toBeVisible();
    expect(screen.getByText("Includes fittings and installation.")).toBeVisible();
    expect(screen.getAllByText("Includes fittings and installation.")).toHaveLength(1);
    expect(document.getElementById(base.panelId)).not.toContainElement(screen.getByText("Includes fittings and installation."));
  });

  it.each(["main", "sub", "direct"] as const)("supports Enter and Space on %s while keeping focus on the same button", async (variant) => {
    const user = userEvent.setup();
    function ControlledCard() {
      const [expanded, setExpanded] = useState(false);
      return <KnowledgeBasketCard {...base} variant={variant} expanded={expanded} onToggle={() => setExpanded((value) => !value)} />;
    }
    render(<ControlledCard />);
    const toggle = screen.getByRole("button", { name: base.name });
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("keeps creation and management actions independent from the disclosure", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onCreate = vi.fn();
    render(<KnowledgeBasketCard {...base} onToggle={onToggle}
      creationActions={<button type="button" onClick={onCreate}>Add estimation item</button>}
      actions={<>
      <button type="button" onClick={onEdit}>Edit basket</button>
      <button type="button" onClick={onDelete}>Delete basket</button>
    </>} />);
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    await user.click(screen.getByRole("button", { name: "Edit basket" }));
    await user.click(screen.getByRole("button", { name: "Delete basket" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit basket" }).closest("h2")).toBeNull();
    expect(screen.getByRole("button", { name: "Add estimation item" }).closest("h2")).toBeNull();
    await user.click(screen.getByRole("button", { name: base.name }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("uses a decorative lazy photo and replaces failures without losing any controls", async () => {
    const onToggle = vi.fn();
    const { container, rerender } = render(<KnowledgeBasketCard {...base} onToggle={onToggle} />);
    const image = container.querySelector("img")!;
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("width", "160");
    expect(image).toHaveAttribute("height", "208");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.error(image);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".knowledge-basket-card__photo-placeholder")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: base.name }));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<KnowledgeBasketCard {...base} imageUrl="/assets/updated-lights.webp" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/assets/updated-lights.webp");
  });

  it.each(["sub", "direct"] as const)("renders %s as a named nested section without an image area, even if given a photo", (variant) => {
    const { container, rerender } = render(<KnowledgeBasketCard {...base} variant={variant} />);
    expect(screen.getByRole("heading", { name: base.name, level: 3 })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".knowledge-basket-card__photo")).toBeNull();
    expect(container.querySelector(".knowledge-basket-card__photo-placeholder")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    rerender(<KnowledgeBasketCard {...base} variant={variant} imageUrl={null} expanded />);
    expect(container.querySelector(".knowledge-basket-card__photo-placeholder")).toBeNull();
    expect(screen.getByRole("link", { name: "Recessed downlights" })).toBeVisible();
  });

  it("labels each basket level without changing configured names or labelling direct items as a basket", () => {
    render(<>
      <KnowledgeBasketCard {...base} name="Electrical Works" />
      <KnowledgeBasketCard {...base} variant="sub" name="Lighting accessories" panelId="sub-accessories" />
      <KnowledgeBasketCard {...base} variant="direct" name="Items directly under Main Basket" panelId="direct-items" />
    </>);
    const subBasket = screen.getByRole("region", { name: "Lighting accessories" });
    expect(screen.getAllByText("Main Basket", { exact: true })).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "Electrical Works" })).getByText("Main Basket", { exact: true })).toBeVisible();
    expect(screen.getAllByText("Sub-Basket")).toHaveLength(1);
    expect(within(subBasket).getByText("Sub-Basket")).toBeVisible();
    expect(within(subBasket).getByRole("heading", { name: "Lighting accessories", level: 3 })).toBeInTheDocument();
    expect(within(subBasket).getByRole("button", { name: "Lighting accessories" })).toHaveAccessibleName("Lighting accessories");
    expect(within(screen.getByRole("region", { name: "Electrical Works" })).queryByText("Sub-Basket")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Items directly under Main Basket" })).queryByText("Sub-Basket")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Items directly under Main Basket" })).queryByText("Main Basket", { exact: true })).not.toBeInTheDocument();
  });

  it("keeps a parent photo separate from its named Sub-Basket and Main Line", () => {
    render(<KnowledgeBasketCard {...base} name="POP / Gypsum" expanded>
      <KnowledgeBasketCard {...base} variant="sub" name="Gypsum ceilings" panelId="sub-ceilings" expanded>
        <a href="/items/gypsum-ceiling">Gypsum false ceiling</a>
      </KnowledgeBasketCard>
    </KnowledgeBasketCard>);
    const parent = screen.getByRole("region", { name: "POP / Gypsum" });
    const group = within(parent).getByRole("region", { name: "Gypsum ceilings" });
    expect(parent.querySelectorAll("img")).toHaveLength(1);
    expect(group.querySelector("img")).toBeNull();
    expect(within(group).getByRole("link", { name: "Gypsum false ceiling" })).toHaveAttribute("href", "/items/gypsum-ceiling");
  });

  it("keeps same-named sections linked to their own panels and callbacks", async () => {
    const user = userEvent.setup();
    const firstToggle = vi.fn();
    const secondToggle = vi.fn();
    render(<>
      <KnowledgeBasketCard {...base} panelId="first-basket" onToggle={firstToggle} />
      <KnowledgeBasketCard {...base} panelId="second-basket" onToggle={secondToggle} expanded />
    </>);
    const [first, second] = screen.getAllByRole("button", { name: base.name });
    expect(first).toHaveAttribute("aria-controls", "first-basket");
    expect(second).toHaveAttribute("aria-controls", "second-basket");
    await user.click(second);
    expect(firstToggle).not.toHaveBeenCalled();
    expect(secondToggle).toHaveBeenCalledOnce();
  });
});
