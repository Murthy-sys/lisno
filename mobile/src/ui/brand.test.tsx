import { render } from "@testing-library/react-native";

import { BrandLoader, StartupBrand } from "./brand";
import { colors } from "./tokens";

describe("Lisno startup branding", () => {
  it("exposes one meaningful loading announcement", async () => {
    const view = await render(<StartupBrand message="Restoring your workspace" reducedMotion />);
    expect(view.getByRole("progressbar", { name: "Restoring your workspace" })).toBeTruthy();
    expect(view.getByTestId("startup-brand")).toHaveStyle({ backgroundColor: colors.shell });
  });

  it("supports a static reduced-motion loader", async () => {
    const view = await render(<BrandLoader label="Loading projects" reducedMotion tone="dark" />);
    expect(view.getByRole("progressbar", { name: "Loading projects" })).toBeTruthy();
  });
});
