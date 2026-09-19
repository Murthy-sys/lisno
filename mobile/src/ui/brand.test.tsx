import { render } from "@testing-library/react-native";

import { BrandLoader, StartupBrand } from "./brand";

describe("Lisno startup branding", () => {
  it("exposes one meaningful loading announcement", async () => {
    const view = await render(<StartupBrand message="Restoring your workspace" reducedMotion />);
    expect(view.getByRole("progressbar", { name: "Restoring your workspace" })).toBeTruthy();
  });

  it("supports a static reduced-motion loader", async () => {
    const view = await render(<BrandLoader label="Loading projects" reducedMotion tone="dark" />);
    expect(view.getByRole("progressbar", { name: "Loading projects" })).toBeTruthy();
  });
});
