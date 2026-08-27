import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EstimateClientReviewSummary } from "../../api/types";
import { EstimateDeliveryStatus } from "./EstimateDeliveryStatus";

const review = (
  overrides: Partial<EstimateClientReviewSummary> = {}
): EstimateClientReviewSummary => ({
  id: "round-1",
  sendGeneration: 2,
  estimateVersion: 4,
  version: 3,
  deliveryStatus: "failed",
  deliveryAttemptCount: 1,
  deliveredAt: null,
  status: "pending",
  ...overrides
});

describe("EstimateDeliveryStatus", () => {
  it.each([
    {
      deliveryStatus: "sent" as const,
      liveRole: "status" as const,
      copy: "Email sent",
      deliveredAt: "2026-08-24T15:30:00.000Z",
      timestamp: "24 Aug 2026, 15:30",
      retryable: false
    },
    {
      deliveryStatus: "failed" as const,
      liveRole: "alert" as const,
      copy: "Email delivery failed",
      deliveredAt: null,
      timestamp: null,
      retryable: true
    },
    {
      deliveryStatus: "disabled" as const,
      liveRole: "alert" as const,
      copy: "Email unavailable",
      deliveredAt: null,
      timestamp: null,
      retryable: true
    },
    {
      deliveryStatus: "queued" as const,
      liveRole: "status" as const,
      copy: "Email queued",
      deliveredAt: null,
      timestamp: null,
      retryable: false
    }
  ])(
    "announces $deliveryStatus delivery with its persisted copy and exact action eligibility",
    async ({ deliveryStatus, liveRole, copy, deliveredAt, timestamp, retryable }) => {
      render(
        <EstimateDeliveryStatus
          review={review({ deliveryStatus, deliveredAt })}
          retrying={false}
          onRetry={vi.fn()}
        />
      );

      const delivery = screen.getByRole("region", { name: "Estimate email delivery" });
      expect(within(delivery).getByRole(liveRole)).toHaveTextContent(copy);
      if (timestamp) {
        expect(within(delivery).getByText(timestamp)).toBeVisible();
      } else {
        expect(within(delivery).queryByText("24 Aug 2026, 15:30")).not.toBeInTheDocument();
      }

      if (retryable) {
        expect(within(delivery).getByRole("button", { name: "Retry email" })).toBeEnabled();
      } else {
        expect(within(delivery).queryByRole("button", { name: "Retry email" })).not.toBeInTheDocument();
      }
    }
  );

  it("keeps the retry action disabled and accessibly busy while announcing its busy copy", async () => {
    render(
      <EstimateDeliveryStatus
        review={review()}
        retrying={true}
        onRetry={vi.fn()}
      />
    );

    const retry = screen.getByRole("button", { name: "Retry email" });
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute("aria-busy", "true");
    expect(retry).toHaveTextContent("Retrying email…");
  });

  it.each(["approved", "changes_requested"] as const)(
    "does not offer retry after the review is terminal with status %s",
    async (status) => {
      render(
        <EstimateDeliveryStatus
          review={review({ deliveryStatus: "failed", status })}
          retrying={false}
          onRetry={vi.fn()}
        />
      );

      const delivery = screen.getByRole("region", { name: "Estimate email delivery" });
      expect(within(delivery).getByRole("alert")).toHaveTextContent("Email delivery failed");
      expect(within(delivery).queryByRole("button", { name: "Retry email" })).not.toBeInTheDocument();
    }
  );

  it("requests one retry from the pending failed state", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <EstimateDeliveryStatus
        review={review()}
        retrying={false}
        onRetry={onRetry}
      />
    );

    await user.click(screen.getByRole("button", { name: "Retry email" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
