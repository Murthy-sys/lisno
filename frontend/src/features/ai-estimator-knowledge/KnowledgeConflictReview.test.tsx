import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KnowledgeConflictReview } from "./KnowledgeConflictReview";

describe("KnowledgeConflictReview Pricing projection", () => {
  it("shows descriptive Specifications and separate price lineage without private Pricing metadata", async () => {
    render(
      <KnowledgeConflictReview
        sectionKey="pricing"
        localVersion={2}
        serverVersion={3}
        payload={{
          technicalDescription: "Private technical description",
          internalVendorNotes: "Private vendor instructions",
          unknownPricingMetadata: "Private compatibility value",
          specifications: [
            {
              id: "private-legacy-specification-id",
              name: "Legacy finish",
              description: "Legacy guidance"
            },
            {
              id: "private-canonical-specification-id",
              name: "Inspection required",
              description: "Confirm after installation",
              type: "checkbox",
              options: ["Definition-only option"],
              value: false,
              internalDefinitionMetadata: "Private definition value"
            },
            {
              id: "private-zero-specification-id",
              name: "Tolerance",
              type: "number",
              options: [],
              value: "0"
            }
          ],
          priceEntries: [
            {
              operation: "reference",
              priceEntryId: "private-price-entry-id",
              priceVersionId: "private-price-version-id",
              internalVendorNotes: "Private row note",
              priceVersion: {
                specificationId: "private-canonical-specification-id",
                vendorId: "private-vendor-id",
                versionNumber: 0,
                inputAmountPaise: 0,
                reviewRequired: false,
                privateVersionMetadata: "Private price metadata"
              }
            }
          ]
        }}
        masters={{}}
        relationshipBaskets={[]}
        relationshipItems={[]}
      />
    );

    const review = screen.getByRole("region", { name: "Latest Pricing server version" });
    expect(review).toHaveTextContent("Legacy finish");
    expect(review).toHaveTextContent("Legacy guidance");
    expect(review).toHaveTextContent("Inspection required");
    expect(review).toHaveTextContent("Confirm after installation");
    expect(review).toHaveTextContent("Specification 1 · Specification nameLegacy finish");
    expect(review).toHaveTextContent("Specification 1 · Brief descriptionLegacy guidance");
    expect(review).toHaveTextContent("Specification 2 · Specification nameInspection required");
    expect(review).toHaveTextContent("Specification 2 · Brief descriptionConfirm after installation");
    expect(review).not.toHaveTextContent("Specification 2 · Value");
    expect(review).not.toHaveTextContent("Specification 3 · Value");
    expect(review).toHaveTextContent("Price 1 · OperationReference");
    expect(review).toHaveTextContent("Price 1 · SpecificationInspection required");
    expect(review).toHaveTextContent("Price 1 · Version Number0");
    expect(review).toHaveTextContent(/₹\s?0\.00/u);
    expect(review).toHaveTextContent("Price 1 · Review RequiredNo");
    expect(review).toHaveTextContent("Unavailable value");

    for (const privateValue of [
      "Private technical description",
      "Private vendor instructions",
      "Private compatibility value",
      "private-legacy-specification-id",
      "private-canonical-specification-id",
      "private-zero-specification-id",
      "private-price-entry-id",
      "private-price-version-id",
      "private-vendor-id",
      "Definition-only option",
      "checkbox",
      "number",
      "Private definition value",
      "Private row note",
      "Private price metadata"
    ]) {
      expect(review).not.toHaveTextContent(privateValue);
    }
    expect(review.querySelector("pre")).toBeNull();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("omits Pricing rows that contain only private identity metadata", () => {
    render(
      <KnowledgeConflictReview
        sectionKey="pricing"
        localVersion={4}
        serverVersion={5}
        payload={{
          specifications: [{ id: "private-empty-specification-id" }],
          priceEntries: [{
            priceEntryId: "private-empty-price-id",
            priceVersionId: "private-empty-version-id"
          }]
        }}
        masters={{}}
        relationshipBaskets={[]}
        relationshipItems={[]}
      />
    );

    const review = screen.getByRole("region", { name: "Latest Pricing server version" });
    expect(within(review).getByText("No configured values are available in the latest server version.")).toBeVisible();
    expect(review).not.toHaveTextContent("private-empty-specification-id");
    expect(review).not.toHaveTextContent("private-empty-price-id");
    expect(review).not.toHaveTextContent("private-empty-version-id");
  });
});

describe("KnowledgeConflictReview Advanced Mode projection", () => {
  it("groups source-specific component definitions and hides answers and raw identities", async () => {
    render(
      <KnowledgeConflictReview
        sectionKey="advanced"
        localVersion={7}
        serverVersion={8}
        payload={{
          modeConfigurations: [{
            id: "private-pmc-configuration-id",
            modeKind: "pmc",
            fields: [{
              id: "private-pmc-component-id",
              type: "text",
              label: "PMC mark",
              options: [],
              value: "private PMC answer"
            }]
          }, {
            id: "private-sub-vendor-configuration-id",
            modeKind: "execution",
            executionSource: "sub_vendor",
            fields: [{
              id: "private-sub-vendor-component-id",
              type: "dropdown",
              label: "Installation stage",
              options: ["Preparation", "Installation"],
              value: "private Sub-Vendor answer"
            }]
          }, {
            id: "private-in-house-configuration-id",
            modeKind: "execution",
            executionSource: "in_house",
            fields: [{
              id: "private-in-house-component-id",
              type: "checkbox",
              label: "Supervisor required",
              options: [],
              value: false
            }]
          }, {
            id: "private-recovery-configuration-id",
            modeKind: "execution",
            fields: [{
              id: "private-recovery-component-id",
              type: "textarea",
              label: "Historical note",
              options: [],
              value: "private recovery answer"
            }]
          }]
        }}
        masters={{}}
        relationshipBaskets={[]}
        relationshipItems={[]}
      />
    );

    const review = screen.getByRole("region", { name: "Latest Advanced server version" });
    expect(review).toHaveTextContent("PMC · Component 1 · Component labelPMC mark");
    expect(review).toHaveTextContent("PMC · Component 1 · Component typeText field");
    expect(review).toHaveTextContent(
      "Execution · Sub-Vendor · Component 1 · Component labelInstallation stage"
    );
    expect(review).toHaveTextContent(
      "Execution · Sub-Vendor · Component 1 · Allowed optionsPreparation, Installation"
    );
    expect(review).toHaveTextContent(
      "Execution · In-house · Component 1 · Component labelSupervisor required"
    );
    expect(review).toHaveTextContent("Mode recovery 1 · Component 1 · Component labelHistorical note");

    for (const privateValue of [
      "private PMC answer",
      "private Sub-Vendor answer",
      "private recovery answer",
      "private-pmc-configuration-id",
      "private-pmc-component-id",
      "private-sub-vendor-configuration-id",
      "private-sub-vendor-component-id",
      "private-in-house-configuration-id",
      "private-in-house-component-id",
      "private-recovery-configuration-id",
      "private-recovery-component-id"
    ]) {
      expect(review).not.toHaveTextContent(privateValue);
    }
    expect(review).not.toHaveTextContent("Value");

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });
});
