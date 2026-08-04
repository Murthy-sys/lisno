import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it.each([
    [0, 0],
    [42, 42],
    [100, 100],
    [-8, 0],
    [132, 100],
  ])("bounds a value of %i to %i for assistive technology", (value, bounded) => {
    render(<ProgressBar value={value} />);

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    expect(progress).toHaveAttribute("aria-valuenow", String(bounded));
    expect(progress).toHaveAttribute("aria-label", `${bounded}% complete`);
  });

  it("uses supplied determinate label and value text", () => {
    render(<ProgressBar value={42} label="Design upload" valueText="42 of 100 files" />);

    const progress = screen.getByRole("progressbar", { name: "Design upload" });
    expect(progress).toHaveAttribute("aria-valuetext", "42 of 100 files");
  });

  it("describes indeterminate progress without a numeric value", () => {
    render(<ProgressBar label="Upload in progress" />);

    const progress = screen.getByRole("progressbar", { name: "Upload in progress" });
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(progress).toHaveClass("ui-progress--indeterminate");
  });

  // @ts-expect-error Indeterminate progress requires a caller-supplied stage label.
  const invalidIndeterminateProgress = <ProgressBar />;
  void invalidIndeterminateProgress;
});
