import type { MobileRuntime } from "../../runtime/createRuntime";
import { parseEstimateRequirements, submitRequirementCommand } from "./estimateRequirementsApi";
import { requirementFixture, requirementsFixture } from "../estimate-authoring/__tests__/requirementsFixtures";
it("validates project/request identities and strips confidential data from the client DTO", () => {
 const parsed = parseEstimateRequirements({ ...requirementsFixture, vendorCostPaise: 999999, mainLines: [{ ...requirementsFixture.mainLines[0], vendorRate: 80000, internalMargin: 42 }] }, "project-one");
 expect(parsed).not.toHaveProperty("vendorCostPaise"); expect(parsed.mainLines?.[0]).not.toHaveProperty("vendorRate");
 expect(() => parseEstimateRequirements(requirementsFixture, "project-two")).toThrow(); expect(() => parseEstimateRequirements({ ...requirementsFixture, requirements: [{ ...requirementFixture, projectId: "project-two" }] }, "project-one")).toThrow();
 expect(() => parseEstimateRequirements({ ...requirementsFixture, requirements: [requirementFixture, requirementFixture] }, "project-one")).toThrow();
});
it("sends stable requirement and collection versions and rejects unadvanced acknowledgements", async () => {
 const post = jest.fn().mockResolvedValue({ ...requirementsFixture, requirementsVersion: 4, estimateVersion: 8, requirements: [{ ...requirementFixture, version: 3, status: "included", lineItemIds: ["saved-line-one"] }] });
 const runtime = { api: { authenticated: { post } } } as unknown as MobileRuntime; const command = { action: "resolve" as const, id: "request-one", input: { expectedRequirementsVersion: 3, expectedVersion: 2, status: "included" as const, lineItemIds: ["saved-line-one"], reason: "Included" } };
 await submitRequirementCommand(runtime, "project-one", command); expect(post).toHaveBeenCalledWith("/projects/project-one/estimate-requirements/request-one/resolve", command.input);
 post.mockResolvedValue(requirementsFixture); await expect(submitRequirementCommand(runtime, "project-one", command)).rejects.toThrow();
});
