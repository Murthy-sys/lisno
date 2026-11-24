import { z } from "zod";
import { KNOWLEDGE_MODE_TIERS } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { SUB_BASKET_MARGIN_MODES } from "../domain/ai-estimator-knowledge-sub-basket-margins.js";
import { marginScopeKey, validMarginChange, validScope } from "../domain/ai-estimator-knowledge-margin-matrix.js";
import type { MarginPreviewInput } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";

const id = z.string().min(1).max(128).refine(value => value.trim() === value && value.length > 0);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const component = z.object({ basketId: id, subBasketId: id.nullable() }).strict();
const bound = z.enum(["minimumBps", "maximumBps"]);
const field = z.discriminatedUnion("mode", [
  z.object({ mode: z.enum(["pmc", "sub_vendor"]), key: z.literal("margin"), bound }).strict(),
  z.object({ mode: z.literal("in_house"), component, key: z.enum(["labor", "material"]), bound }).strict()
]);
export const marginEditsSchema = z.array(field).refine(fields => {
  const keys = fields.map(edit => JSON.stringify([edit.mode, edit.mode === "in_house" && edit.component, edit.key, edit.bound]));
  return new Set(keys).size === keys.length;
}, "Each edited margin field must be listed only once.");
const scope = z.object({
  tier: z.enum(KNOWLEDGE_MODE_TIERS),
  mode: z.enum(SUB_BASKET_MARGIN_MODES),
  component: component.optional()
}).strict();
const pair = z.object({
  key: z.enum(["margin", "labor", "material"]),
  minimumBps: z.number().int().min(0).max(9999),
  maximumBps: z.number().int().min(0).max(9999)
}).strict();
const change = scope.extend({ ranges: z.array(pair).min(1).max(2) });
const changes = z.array(change).min(1).refine(rows => {
  const keys = rows.map(marginScopeKey);
  return new Set(keys).size === keys.length;
}, "Each tier, mode and component can be edited once per decision.");
const edit = z.object({ kind: z.literal("edit"), changes }).strict();
const approve = z.object({
  kind: z.literal("approve"),
  candidate: scope.extend({ mainLineId: id }).refine(validScope, "Select a valid margin scope.")
}).strict();

export const inHouseScopeSchema = z.literal("sub_basket").optional();
function validateEditScope(input: MarginPreviewInput, ctx: z.RefinementCtx) {
  if (input.decision.kind !== "edit") return;
  input.decision.changes.forEach((row, index) => {
    if (!validMarginChange(row, input.inHouseScope)) ctx.addIssue({
      code: "custom", path: ["decision", "changes", index],
      message: "Enter valid margins for the selected tier and In-house scope."
    });
  });
}
export const marginPreviewSchema = z.object({
  versionToken: digest, inHouseScope: inHouseScopeSchema, decision: z.discriminatedUnion("kind", [edit, approve])
}).strict().superRefine(validateEditScope);
const commit = z.object({ versionToken: digest, reviewToken: digest, operationId: id, inHouseScope: inHouseScopeSchema }).strict();
export const marginDefaultsSchema = commit.extend({ decision: edit }).superRefine(validateEditScope);
export const marginApprovalSchema = commit.extend({ decision: approve });
