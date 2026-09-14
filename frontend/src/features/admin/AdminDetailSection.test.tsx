import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { AdminDetailSection } from "./AdminDetailSection";

it("keeps collapsed detail content outside keyboard and assistive navigation until expanded", async () => {
  const user = userEvent.setup();
  render(<AdminDetailSection icon={null} tone="warm" title="Project information" subtitle="Client details"><a href="/client">Client workspace</a></AdminDetailSection>);
  const trigger = screen.getByRole("button", { name: "Project information" });
  const body = document.getElementById(trigger.getAttribute("aria-controls")!)!;
  expect(body).toHaveAttribute("inert");
  expect(screen.queryByRole("link", { name: "Client workspace" })).not.toBeInTheDocument();
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(body).not.toHaveAttribute("inert");
  expect(screen.getByRole("link", { name: "Client workspace" })).toBeVisible();
  await user.click(trigger);
  expect(body).toHaveAttribute("inert");
});
