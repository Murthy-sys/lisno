import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackProvider, useFeedback } from "./FeedbackProvider";

const primitivesCss = readFileSync(
  resolve(process.cwd(), "src/styles/primitives.css"),
  "utf8"
);

function FeedbackHarness() {
  const feedback = useFeedback();
  const [ids, setIds] = useState<string[]>([]);
  const [removableTriggerVisible, setRemovableTriggerVisible] = useState(true);

  const showSuccess = (
    durationMs?: number,
    title = "Project saved.",
    message = "Your changes are ready."
  ) => {
    const id = feedback.success({
      title,
      message,
      durationMs
    });
    setIds((current) => [...current, id]);
  };

  return (
    <>
      <button type="button" onClick={() => feedback.announce("Project saved.")}>
        Announce project
      </button>
      <button type="button" onClick={() => feedback.announce("Upload complete.")}>
        Announce upload
      </button>
      <button type="button" onClick={() => feedback.announce("")}>
        Clear announcement
      </button>
      <button type="button" onClick={() => showSuccess()}>
        Show default success
      </button>
      <button type="button" onClick={() => showSuccess(1_200)}>
        Show custom success
      </button>
      <button type="button" onClick={() => showSuccess(undefined, "Upload complete.")}>
        Show second success
      </button>
      <button
        type="button"
        onClick={() => showSuccess(undefined, `Success ${ids.length + 1}.`)}
      >
        Show sequenced success
      </button>
      <button
        type="button"
        onClick={() => {
          const id = ids.at(-1);
          if (id) feedback.dismiss(id);
        }}
      >
        Dismiss latest
      </button>
      {removableTriggerVisible ? (
        <button
          type="button"
          onClick={() => {
            showSuccess();
            setRemovableTriggerVisible(false);
          }}
        >
          Show and remove trigger
        </button>
      ) : null}
      <p aria-label="Returned feedback IDs">{ids.join(",")}</p>
    </>
  );
}

function renderFeedback() {
  return render(
    <FeedbackProvider>
      <FeedbackHarness />
    </FeedbackProvider>
  );
}

describe("FeedbackProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    if (vi.isFakeTimers()) {
      act(() => vi.runOnlyPendingTimers());
    }
    vi.useRealTimers();
  });

  it("keeps one named atomic polite application status mounted as announcements change", () => {
    renderFeedback();

    const status = screen.getByRole("status", { name: "Application announcements" });
    expect(status).toBeEmptyDOMElement();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(screen.getAllByRole("status")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Announce project" }));

    expect(status).toHaveTextContent("Project saved.");
    expect(screen.getByRole("status", { name: "Application announcements" })).toBe(status);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("ignores consecutive duplicate announcements but announces a different message", () => {
    renderFeedback();
    const status = screen.getByRole("status", { name: "Application announcements" });
    const observer = new MutationObserver(() => undefined);
    observer.observe(status, { childList: true, characterData: true, subtree: true });

    fireEvent.click(screen.getByRole("button", { name: "Announce project" }));
    const firstMutationCount = observer.takeRecords().length;
    expect(firstMutationCount).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Announce project" }));
    expect(observer.takeRecords()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Announce upload" }));
    expect(status).toHaveTextContent("Upload complete.");
    expect(observer.takeRecords().length).toBeGreaterThan(0);
    observer.disconnect();
  });

  it("clears without announcing and resets deduplication for a future event", () => {
    renderFeedback();
    const status = screen.getByRole("status", { name: "Application announcements" });

    fireEvent.click(screen.getByRole("button", { name: "Announce project" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear announcement" }));
    expect(status).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Announce project" }));
    expect(status).toHaveTextContent("Project saved.");
  });

  it("returns monotonic success IDs, announces once, and keeps toast cards non-live", () => {
    renderFeedback();
    const status = screen.getByRole("status", { name: "Application announcements" });
    const observer = new MutationObserver(() => undefined);
    observer.observe(status, { childList: true, characterData: true, subtree: true });

    fireEvent.click(screen.getByRole("button", { name: "Show default success" }));

    expect(screen.getByLabelText("Returned feedback IDs")).toHaveTextContent("feedback-1");
    expect(status).toHaveTextContent("Project saved. Your changes are ready.");
    const announcementMutationCount = observer.takeRecords().length;
    expect(announcementMutationCount).toBeGreaterThan(0);
    const notifications = screen.getByRole("region", { name: "Notifications" });
    const toastTitle = within(notifications).getByText("Project saved.");
    expect(toastTitle.closest('[role="status"]')).toBeNull();
    expect(toastTitle.closest('[role="alert"]')).toBeNull();
    expect(toastTitle.closest("[aria-live]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show default success" }));
    expect(screen.getByLabelText("Returned feedback IDs")).toHaveTextContent(
      "feedback-1,feedback-2"
    );
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it("keeps the toast dismiss control at least 44px in both dimensions", () => {
    const style = document.createElement("style");
    style.textContent = primitivesCss;
    document.head.append(style);

    try {
      renderFeedback();
      fireEvent.click(screen.getByRole("button", { name: "Show default success" }));

      const dismiss = screen.getByRole("button", {
        name: "Dismiss Project saved."
      });
      const computed = window.getComputedStyle(dismiss);

      expect(Number.parseFloat(computed.minBlockSize)).toBeGreaterThanOrEqual(44);
      expect(Number.parseFloat(computed.minInlineSize)).toBeGreaterThanOrEqual(44);
    } finally {
      style.remove();
    }
  });

  it("removes success toasts after the default or custom duration", () => {
    renderFeedback();

    fireEvent.click(screen.getByRole("button", { name: "Show default success" }));
    expect(screen.getByRole("button", { name: "Dismiss Project saved." })).toBeVisible();

    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByRole("button", { name: "Dismiss Project saved." })).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("button", { name: "Dismiss Project saved." })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show custom success" }));
    act(() => vi.advanceTimersByTime(1_199));
    expect(screen.getByRole("button", { name: "Dismiss Project saved." })).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("button", { name: "Dismiss Project saved." })).not.toBeInTheDocument();
  });

  it("dismisses only the named toast and clears its timer", () => {
    renderFeedback();
    fireEvent.click(screen.getByRole("button", { name: "Show default success" }));
    fireEvent.click(screen.getByRole("button", { name: "Show second success" }));
    expect(screen.getByRole("button", { name: "Dismiss Project saved." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Dismiss Upload complete." })).toBeVisible();
    expect(vi.getTimerCount()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss latest" }));

    expect(screen.getByRole("button", { name: "Dismiss Project saved." })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Dismiss Upload complete." })).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("caps visible success cards at three by dismissing the oldest card", () => {
    renderFeedback();

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Show sequenced success" }));
    }

    expect(screen.queryByRole("button", { name: "Dismiss Success 1." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss Success 2." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Dismiss Success 3." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Dismiss Success 4." })).toBeVisible();
    expect(screen.getByLabelText("Returned feedback IDs")).toHaveTextContent(
      "feedback-1,feedback-2,feedback-3,feedback-4"
    );
    expect(vi.getTimerCount()).toBe(3);
  });

  it("does not move focus when showing feedback and restores the creation origin after pointer dismissal", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderFeedback();
    const trigger = screen.getByRole("button", { name: "Show default success" });

    await user.click(trigger);
    expect(trigger).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Dismiss Project saved." }));
    expect(screen.queryByRole("button", { name: "Dismiss Project saved." })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("restores the creation origin after keyboard dismissal", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderFeedback();
    const trigger = screen.getByRole("button", { name: "Show default success" });
    await user.click(trigger);
    const dismiss = screen.getByRole("button", { name: "Dismiss Project saved." });
    dismiss.focus();

    await user.keyboard("{Enter}");

    expect(dismiss).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("restores the creation origin when an automatically expiring toast owns focus", () => {
    renderFeedback();
    const trigger = screen.getByRole("button", { name: "Show default success" });
    trigger.focus();
    fireEvent.click(trigger);
    screen.getByRole("button", { name: "Dismiss Project saved." }).focus();

    act(() => vi.advanceTimersByTime(5_000));

    expect(screen.queryByRole("button", { name: "Dismiss Project saved." })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("restores the creation origin when the focused oldest toast is evicted", () => {
    renderFeedback();
    const trigger = screen.getByRole("button", { name: "Show sequenced success" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    screen.getByRole("button", { name: "Dismiss Success 1." }).focus();

    fireEvent.click(trigger);

    expect(screen.queryByRole("button", { name: "Dismiss Success 1." })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("focuses the labelled notification region when the creation origin disconnected", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderFeedback();
    await user.click(screen.getByRole("button", { name: "Show and remove trigger" }));
    const dismiss = screen.getByRole("button", { name: "Dismiss Project saved." });
    dismiss.focus();

    await user.keyboard("{Enter}");

    expect(screen.getByRole("region", { name: "Notifications" })).toHaveFocus();
  });

  it("clears pending toast timers when the provider unmounts", () => {
    const { unmount } = renderFeedback();
    fireEvent.click(screen.getByRole("button", { name: "Show default success" }));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("throws a clear developer error outside the provider", () => {
    function OutsideConsumer() {
      useFeedback();
      return null;
    }

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<OutsideConsumer />)).toThrow(
      "useFeedback must be used within a FeedbackProvider."
    );
  });
});
