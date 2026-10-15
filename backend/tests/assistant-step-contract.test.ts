import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assistantStepRequestSchema, assistantStepResponseSchema } from "../src/contracts/assistant-step.js";

const fixtures = JSON.parse(readFileSync(new URL("../../contracts/assistant-step-fixtures.json", import.meta.url), "utf8")) as Record<"requests" | "responses", Array<{name: string; valid: boolean; value: unknown}>>;
describe("shared Node/Python step fixtures", () => {
  for (const [kind, schema] of [["requests", assistantStepRequestSchema], ["responses", assistantStepResponseSchema]] as const) {
    it.each(fixtures[kind])(`${kind}: $name`, ({valid, value}) => expect(schema.safeParse(value).success).toBe(valid));
  }
});
