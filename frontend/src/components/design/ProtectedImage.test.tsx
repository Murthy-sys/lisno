import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { ProtectedImage } from "./ProtectedImage";

describe("ProtectedImage", () => {
  it("keeps a failed preview inside one bounded thumbnail cell", async () => {
    vi.spyOn(apiClient, "getBlob").mockRejectedValue(new Error("missing"));

    const { container } = render(
      <ProtectedImage source="/missing.png" alt="Puja thumbnail" className="client-estimate-drawing__thumbnail" />
    );

    await waitFor(() => expect(screen.getByRole("status")).toHaveAccessibleName("Puja thumbnail preview unavailable"));
    expect(container.querySelector("img")).toBeNull();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toHaveClass("client-estimate-drawing__thumbnail", "protected-image-fallback");
  });
});
