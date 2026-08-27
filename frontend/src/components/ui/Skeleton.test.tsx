import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it.each(["text", "circle", "block"] as const)(
    "renders the %s shape as a hidden visual",
    (shape) => {
      const { container } = render(<Skeleton shape={shape} />);
      const skeleton = container.firstElementChild;

      expect(skeleton).toHaveClass("ui-skeleton", `ui-skeleton--${shape}`);
      expect(skeleton).toHaveAttribute("aria-hidden", "true");
    }
  );

  it("cannot be given an accessible label by a caller", () => {
    const { container } = render(
      <Skeleton
        aria-hidden="false"
        aria-label="Loading project names"
        aria-labelledby="external-label"
      />
    );
    const skeleton = container.firstElementChild;

    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton).not.toHaveAttribute("aria-label");
    expect(skeleton).not.toHaveAttribute("aria-labelledby");
  });
});
