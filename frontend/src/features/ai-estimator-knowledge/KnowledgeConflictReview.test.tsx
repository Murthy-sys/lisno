import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KnowledgeConflictReview } from "./KnowledgeConflictReview";

describe("KnowledgeConflictReview Budgeting projection", () => {
  it("shows descriptive Specifications and business Budget values without private metadata", async () => {
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
                taxRuleId: "private-tax-rule-id",
                taxVersionId: "private-tax-version-id",
                versionNumber: 0,
                inputAmountPaise: 0,
                baseAmountPaise: 0,
                taxAmountPaise: 0,
                totalAmountPaise: 0,
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

    const review = screen.getByRole("region", { name: "Latest Budgeting server version" });
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
    expect(review).toHaveTextContent("Budget 1 · VendorUnavailable value");
    expect(review).toHaveTextContent("Budget 1 · Amount before GST₹0.00");
    expect(review).toHaveTextContent("Budget 1 · GST₹0.00");
    expect(review).toHaveTextContent("Budget 1 · Total including GST₹0.00");
    expect(review).toHaveTextContent(/₹\s?0\.00/u);
    expect(review).toHaveTextContent("Unavailable value");
    expect(review).not.toHaveTextContent("Operation");
    expect(review).not.toHaveTextContent("SpecificationInspection required");
    expect(review).not.toHaveTextContent("Version Number");
    expect(review).not.toHaveTextContent("Review Required");

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
      "private-tax-rule-id",
      "private-tax-version-id",
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

  it("omits Budgeting rows that contain only private identity metadata", () => {
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

    const review = screen.getByRole("region", { name: "Latest Budgeting server version" });
    expect(within(review).getByText("No configured values are available in the latest server version.")).toBeVisible();
    expect(review).not.toHaveTextContent("private-empty-specification-id");
    expect(review).not.toHaveTextContent("private-empty-price-id");
    expect(review).not.toHaveTextContent("private-empty-version-id");
  });
});

describe("KnowledgeConflictReview Mode Overview projection", () => {
  it("compares the resolved Priority label without exposing other Overview values or raw IDs", () => {
    render(
      <KnowledgeConflictReview
        sectionKey="overview"
        localVersion={4}
        serverVersion={5}
        payload={{
          priorityId: "private-priority-high-id",
          uomId: "private-uom-id",
          surfaceIds: ["private-surface-id"],
          hiddenCompatibility: "Private Overview value"
        }}
        overviewFields={["priorityId"]}
        masters={{
          priorities: [{
            id: "private-priority-high-id",
            masterType: "priorities",
            code: "HIGH",
            name: "High",
            description: null,
            displayOrder: 1,
            status: "active",
            semanticTier: "high",
            version: 1,
            createdById: "super-admin-1",
            updatedById: "super-admin-1",
            createdAt: "2026-09-02T08:00:00.000Z",
            updatedAt: "2026-09-02T08:00:00.000Z"
          }]
        }}
        relationshipBaskets={[]}
        relationshipItems={[]}
      />
    );

    const review = screen.getByRole("region", { name: "Latest Overview server version" });
    expect(review).toHaveTextContent("PriorityHigh");
    expect(review).not.toHaveTextContent("Unit of measure");
    expect(review).not.toHaveTextContent("Surfaces");
    expect(review).not.toHaveTextContent("private-priority-high-id");
    expect(review).not.toHaveTextContent("private-uom-id");
    expect(review).not.toHaveTextContent("Private Overview value");
  });

  it("uses the safe unavailable label when the saved Priority cannot be resolved", () => {
    render(
      <KnowledgeConflictReview
        sectionKey="overview"
        localVersion={4}
        serverVersion={5}
        payload={{ priorityId: "private-missing-priority-id" }}
        overviewFields={["priorityId"]}
        masters={{ priorities: [] }}
        relationshipBaskets={[]}
        relationshipItems={[]}
      />
    );

    const review = screen.getByRole("region", { name: "Latest Overview server version" });
    expect(review).toHaveTextContent("Unavailable priority");
    expect(review).not.toHaveTextContent("private-missing-priority-id");
  });

  it("scopes Surface conflict review and never exposes an unresolved stable ID", () => {
    render(
      <KnowledgeConflictReview
        sectionKey="overview"
        localVersion={8}
        serverVersion={9}
        payload={{
          surfaceIds: ["surface-wall", "private-missing-surface-id"],
          priorityId: "private-priority-id",
          hiddenCompatibility: "Private Overview value"
        }}
        overviewFields={["surfaceIds"]}
        masters={{
          surfaces: [{
            id: "surface-wall",
            masterType: "surfaces",
            code: "SURFACE_WALL",
            name: "Wall surface",
            description: null,
            displayOrder: 1,
            status: "active",
            version: 1,
            createdById: "super-admin-1",
            updatedById: "super-admin-1",
            createdAt: "2026-09-03T08:00:00.000Z",
            updatedAt: "2026-09-03T08:00:00.000Z"
          }]
        }}
        relationshipBaskets={[]}
        relationshipItems={[]}
      />
    );

    const review = screen.getByRole("region", { name: "Latest Overview server version" });
    expect(review).toHaveTextContent("SurfacesWall surface, Unavailable value");
    expect(review).not.toHaveTextContent("private-missing-surface-id");
    expect(review).not.toHaveTextContent("private-priority-id");
    expect(review).not.toHaveTextContent("Private Overview value");
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

describe("KnowledgeConflictReview Quantity slab projection", () => {
  it("resolves priced-slab Specification and UOM names supplied by Mode", () => {
    render(
      <KnowledgeConflictReview
        sectionKey="quantity-margin"
        localVersion={9}
        serverVersion={10}
        payload={{
          slabRates: [{
            id: "private-slab-id",
            specificationId: "private-spec-id",
            uomId: "private-uom-id",
            quantity: "12.5",
            unitRatePaise: 8_000
          }]
        }}
        specifications={[{ id: "private-spec-id", name: "Plywood" }]}
        masters={{
          uoms: [{
            id: "private-uom-id",
            masterType: "uoms",
            code: "SQFT",
            name: "Square foot",
            description: null,
            displayOrder: 0,
            status: "active",
            decimalScale: 2,
            version: 1,
            createdById: "super-admin-1",
            updatedById: "super-admin-1",
            createdAt: "2026-09-02T08:00:00.000Z",
            updatedAt: "2026-09-02T08:00:00.000Z"
          }]
        }}
        relationshipBaskets={[]}
        relationshipItems={[]}
      />
    );

    const review = screen.getByRole("region", { name: "Latest Quantity & margin server version" });
    expect(review).toHaveTextContent("Plywood");
    expect(review).toHaveTextContent("Square foot");
    expect(review).toHaveTextContent(/₹\s?80\.00/u);
    expect(review).not.toHaveTextContent("private-spec-id");
    expect(review).not.toHaveTextContent("private-uom-id");
    expect(review).not.toHaveTextContent("private-slab-id");
  });
});
