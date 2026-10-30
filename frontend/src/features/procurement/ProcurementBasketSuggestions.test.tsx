import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProcurementBasketSuggestions } from "./ProcurementBasketSuggestions";
import type { PMVendorSuggestion } from "../project-manager/pmEstimateTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "procurement-a", role: "procurement" } }) }));

const approvedSource = { estimateId: "estimate-a", estimateVersion: 2, estimateReviewRoundId: "round-a", designPlanVersion: 1, phase: "legacy" as const, sourceSnapshotId: null, sourceDigest: null };
function recommendation(id: string, name: string): PMVendorSuggestion {
  return { id, projectId: "project-a", source: approvedSource, storedSource: approvedSource, scope: "main_line", mainLine: { mainLineId: "line-a", mainLineName: "Timber panelling", mainBasketId: "basket-a", mainBasketName: "Joinery", scopeDigest: "a".repeat(64), occurrences: [{ sourceLineItemKey: "source-line-a", sectionId: "room-a", roomId: "room-a", roomName: "Living Room" }], canSuggest: true, unavailableReason: null },
    vendor: { id: `vendor-${id}`, code: id, name }, note: "Long recommendation context stays in a disclosure.", status: "suggested", version: 1,
    suggestedBy: { id: "pm-a", name: "Project Manager A" }, updatedBy: { id: "pm-a", name: "Project Manager A" }, createdAt: "2026-10-28T10:00:00Z", updatedAt: "2026-10-28T10:00:00Z",
    sourceState: "current", canEdit: false, editUnavailableReason: null, bidEligible: true, readinessReasons: [], activity: { availability: "available", items: [], truncated: false } };
}
const path = "/api/v1/procurement/projects/project-a/baskets/basket-a/vendor-suggestions";
function Harness({ onChange }: { onChange: (id: string, checked: boolean) => void }) {
  const [ids, setIds] = useState<string[]>([]);
  return <ProcurementBasketSuggestions projectId="project-a" basketId="basket-a" sourceKey="prepared-a" disabled={false} isSelected={id => ids.includes(id)} onToggle={(vendor, checked) => {
    onChange(vendor.vendorId, checked); setIds(current => checked ? [...new Set([...current, vendor.vendorId])] : current.filter(id => id !== vendor.vendorId));
  }} />;
}

describe("Procurement Main Line suggestion discovery", () => {
  it("explains removed or unverifiable Configuration links without blocking another eligible recommendation", async () => {
    const removed = { ...recommendation("removed", "Previously linked supplier"), bidEligible: false,
      readinessReasons: ["Vendor is no longer linked to this Main Line in Configuration."] };
    const unavailable = { ...recommendation("unavailable", "Unverifiable supplier"), bidEligible: false,
      readinessReasons: ["Current Main Line vendor Configuration is unavailable."] };
    const ready = recommendation("ready", "Currently linked supplier");
    server.use(http.get(path, () => HttpResponse.json({ data: { items: [removed, unavailable, ready], total: 3, offset: 0, limit: 20, mainLines: [{ id: "line-a", name: "Timber panelling" }] } })));
    const changed = vi.fn(); renderWithQuery(<Harness onChange={changed} />);
    expect(await screen.findByRole("checkbox", { name: /Previously linked supplier/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Unverifiable supplier/ })).toBeDisabled();
    for (const record of [removed, unavailable]) {
      const row = screen.getByRole("article", { name: `${record.vendor.name} suggested for Timber panelling` });
      await userEvent.click(within(row).getByText("Readiness details"));
      expect(within(row).getByText(record.readinessReasons[0]!)).toBeVisible();
    }
    await userEvent.click(screen.getByRole("checkbox", { name: /Currently linked supplier/ }));
    expect(changed).toHaveBeenCalledExactlyOnceWith("vendor-ready", true);
  });

  it("pages across recommendations independently of vendor-directory pagination and retains checked state", async () => {
    const requests: URL[] = [];
    const first = recommendation("first", "First supplier"), later = recommendation("later", "Later supplier");
    server.use(http.get(path, ({ request }) => {
      const url = new URL(request.url); requests.push(url);
      return HttpResponse.json({ data: { items: url.searchParams.get("offset") === "20" ? [later] : [first], total: 21, limit: 20, offset: Number(url.searchParams.get("offset")), mainLines: [{ id: "line-a", name: "Timber panelling" }] } });
    }));
    const changed = vi.fn(); renderWithQuery(<Harness onChange={changed} />);
    const firstBox = await screen.findByRole("checkbox", { name: /First supplier/ });
    expect(firstBox).not.toBeChecked(); expect(changed).not.toHaveBeenCalled();
    await userEvent.click(firstBox);
    await userEvent.click(screen.getByRole("button", { name: "Next suggestions" }));
    const secondBox = await screen.findByRole("checkbox", { name: /Later supplier/ });
    await userEvent.click(secondBox);
    expect(changed).toHaveBeenNthCalledWith(2, "vendor-later", true);
    await userEvent.click(screen.getByRole("button", { name: "Previous suggestions" }));
    expect(await screen.findByRole("checkbox", { name: /First supplier/ })).toBeChecked();
    expect(requests.some(request => request.searchParams.get("offset") === "20")).toBe(true);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Suggested item" }), "line-a");
    await waitFor(() => expect(requests.at(-1)!.searchParams.get("mainLineId")).toBe("line-a"));
    expect(requests.at(-1)!.searchParams.get("offset")).toBe("0");
  });

  it("keeps blocked, withdrawn and previous-source recommendations visible but unselectable", async () => {
    const blocked = { ...recommendation("blocked", "Blocked supplier"), bidEligible: false, readinessReasons: ["Missing verified contact."] };
    const historical = { ...recommendation("historical", "Earlier supplier"), sourceState: "historical" as const };
    const withdrawn = { ...recommendation("withdrawn", "Withdrawn supplier"), status: "withdrawn" as const };
    server.use(http.get(path, () => HttpResponse.json({ data: { items: [blocked, historical, withdrawn], total: 3, offset: 0, limit: 20, mainLines: [{ id: "line-a", name: "Timber panelling" }] } })));
    const changed = vi.fn(); renderWithQuery(<Harness onChange={changed} />);
    await screen.findByRole("checkbox", { name: /Blocked supplier/ });
    for (const input of screen.getAllByRole("checkbox")) expect(input).toBeDisabled();
    const blockedRow = screen.getByRole("article", { name: "Blocked supplier suggested for Timber panelling" });
    expect(within(blockedRow).getByText("Missing verified contact.")).not.toBeVisible();
    await userEvent.click(within(blockedRow).getByText("Readiness details"));
    expect(within(blockedRow).getByText("Missing verified contact.")).toBeVisible();
    expect(within(blockedRow).getByText("Long recommendation context stays in a disclosure.")).not.toBeVisible();
    expect(changed).not.toHaveBeenCalled();
  });

  it("identifies temporary-item suggestions and still requires Procurement selection and bid readiness", async () => {
    const ready = recommendation("temporary", "Temporary work supplier");
    ready.mainLine!.itemType = "temporary";
    const blocked = recommendation("unready", "Unready temporary supplier");
    blocked.mainLine!.itemType = "temporary";
    blocked.bidEligible = false;
    blocked.readinessReasons = ["Activate the current Configuration before requesting bids."];
    server.use(http.get(path, () => HttpResponse.json({ data: { items: [ready, blocked], total: 2, offset: 0, limit: 20, mainLines: [{ id: "line-a", name: "Timber panelling" }] } })));
    const changed = vi.fn(); renderWithQuery(<Harness onChange={changed} />);
    const row = await screen.findByRole("article", { name: "Temporary work supplier suggested for Timber panelling" });
    expect(within(row).getByText("Temporary item")).toBeVisible();
    const checkbox = within(row).getByRole("checkbox");
    expect(checkbox).toBeEnabled();
    expect(checkbox).not.toBeChecked();
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Unready temporary supplier/ })).toBeDisabled();
    await userEvent.click(checkbox);
    expect(changed).toHaveBeenCalledExactlyOnceWith("vendor-temporary", true);
  });

  it("rejects another project's response before exposing recommendation content", async () => {
    const foreign = { ...recommendation("foreign", "Foreign private supplier"), projectId: "other-project" };
    server.use(http.get(path, () => HttpResponse.json({ data: { items: [foreign], total: 1, offset: 0, limit: 20, mainLines: [] } })));
    renderWithQuery(<Harness onChange={vi.fn()} />);
    expect(await screen.findByText("Vendor suggestions could not be loaded.")).toBeVisible();
    expect(screen.queryByText("Foreign private supplier")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry suggestions" })).toBeVisible();
  });
});
