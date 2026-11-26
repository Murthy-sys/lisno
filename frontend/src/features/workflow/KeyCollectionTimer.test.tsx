import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionAppointment, collectionStart } from "../../test/keyCollectionFixtures";
import { KeyCollectionTimer } from "./KeyCollectionTimer";

afterEach(() => vi.useRealTimers());
describe("KeyCollectionTimer", () => {
  it("uses saved server boundaries, advances quietly through exact zone changes and survives remount", () => {
    vi.useFakeTimers(); vi.setSystemTime("2030-01-01T00:00:00Z");
    const appointment = collectionAppointment(); const receivedAt = Date.now();
    const component = <KeyCollectionTimer appointment={appointment} serverNow="2026-11-26T08:59:59Z" receivedAt={receivedAt} />;
    const view = render(component);
    expect(screen.getByRole("timer")).toHaveTextContent("24:00:01 remaining");
    expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "off");
    expect(screen.getByRole("timer").parentElement).toHaveAttribute("data-zone", "green");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer").parentElement).toHaveAttribute("data-zone", "orange");
    expect(screen.getByText("Key collection · Attention")).toBeVisible();
    act(() => vi.advanceTimersByTime(12 * 3600_000));
    expect(screen.getByRole("timer")).toHaveTextContent("12:00:00 remaining");
    expect(screen.getByRole("timer").parentElement).toHaveAttribute("data-zone", "red");
    view.unmount(); render(component);
    expect(screen.getByRole("timer")).toHaveTextContent("12:00:00 remaining");
    act(() => vi.advanceTimersByTime(12 * 3600_000));
    expect(screen.getByRole("timer", { name: "Key collection due now" })).toHaveTextContent("00:00:00 · Due now");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer", { name: "Key collection overdue" })).toHaveTextContent("Overdue by 00:00:01");
    expect(screen.getByRole("timer").parentElement).toHaveAttribute("data-zone", "red");
  });

  it("uses the returned boundaries for a chosen appointment and reanchors after foreground recovery", () => {
    vi.useFakeTimers(); vi.setSystemTime(collectionStart);
    const appointment = { ...collectionAppointment(), mode: "chosen_datetime" as const, deadlineAt: "2026-11-25T13:00:00Z",
      timing: { ...collectionAppointment().timing!, orangeAt: "2026-11-25T11:00:00Z", redAt: "2026-11-25T12:00:00Z" } };
    const receivedAt = Date.now();
    const view = render(<KeyCollectionTimer appointment={appointment} serverNow={collectionStart} receivedAt={receivedAt} />);
    act(() => { vi.setSystemTime("2026-11-25T12:00:00Z"); document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.getByRole("timer")).toHaveTextContent("01:00:00 remaining");
    expect(screen.getByRole("timer").parentElement).toHaveAttribute("data-zone", "red");
    view.rerender(<KeyCollectionTimer appointment={appointment} serverNow="2026-11-25T12:10:00Z" receivedAt={Date.now()} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:50:00 remaining");
  });

  it.each([null, undefined, { ...collectionAppointment().timing!, redAt: "invalid" }])("shows unavailable without inventing timing for %s", timing => {
    render(<KeyCollectionTimer appointment={{ ...collectionAppointment(), timing }} serverNow={collectionStart} />);
    expect(screen.getByText("Key collection · Timing unavailable")).toBeVisible();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
