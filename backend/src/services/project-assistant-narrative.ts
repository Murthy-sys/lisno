import type { AssistantFact, AssistantGeneratedResult } from "../contracts/project-chat-assistant.js";
import { AssistantFailure } from "../domain/project-chat-assistant.js";

type Narrative = NonNullable<AssistantGeneratedResult["narrative"]>;
const normalized = (value: string) => value.normalize("NFKC").toLowerCase();
const fail = () => { throw new AssistantFailure("ASSISTANT_INVALID_OUTPUT"); };
const numericValues = (value: string) => normalized(value).match(/\d+(?:[.,]\d+)*(?:\s*%)?/gu) ?? [];
const money = /[₹$€£¥]|\b(?:inr|usd|rupees?|paise|rs\.?|dollars?)\b/iu;
const moneyClaim = /\b(?:costs?|prices?|charges?|totals?|amounts?|budgets?|pay|payments?)\b.{0,35}\b(?:\d|zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|lakh|crore|million)\b/iu;
const unsafeText = /<[^>]*>|https?:\/\/|www\.|\]\(|```|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u202A-\u202E\u2066-\u2069]/u;
const operationalPromise = /\b(?:i|we)(?:['’]ve| have|['’]ll| will)?\s+(?:(?:already|now)\s+)?(?:alert(?:ed)?|notif(?:y|ied)|contact(?:ed)?|email(?:ed)?|call(?:ed)?|approv(?:e|ed)|chang(?:e|ed)|updat(?:e|ed)|schedul(?:e|ed)|guarantee|promise|ensure|make sure)\b/iu;
const qualifications = /\b(?:not|pending|awaiting|unconfirmed|proposed|needs?|requested|reported)\b/iu;
const relativeDates = /\b(?:today|tomorrow|yesterday|next (?:week|month|year)|this (?:week|month|year))\b/giu;
// "Today" in a complete social help question is not a schedule claim. Remove
// only that question for date validation; another date in the paragraph stays checked.
const socialHelpToday = /(?:^|[.!?]\s+)(?:how can i help(?: you)?(?: with your project)? today|what can i help you with today|what would you like (?:help with|to know) today)\?(?=\s|$)/giu;
const spelledValues = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|million)\s+(?:percent|per cent|days?|weeks?|months?|years?|rupees?|dollars?)\b/giu;
const spelledAmounts = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(?:hundred|thousand|lakh|crore|million)\b/giu;
const affirmativeStates = /\b(?:is|are|was|were|has been|have been|now|already)\s+(?:fully\s+)?(confirmed|verified|approved|accepted|complete(?:d)?|finished)\b/giu;

/**
 * Reference and high-risk-value checks complement the model's grounding instructions.
 * These checks deliberately do not claim to prove arbitrary natural-language entailment.
 * Invalid narrative is rejected, never quietly repaired into a different factual answer.
 */
export function validateAssistantNarrative(narrative: Narrative | undefined, selectedFacts: AssistantFact[]): Narrative | undefined {
  if (narrative === undefined) return undefined; // Old persisted/test providers stay readable.
  if (narrative.length > 4 || narrative.reduce((size, row) => size + row.text.length, 0) > 2_000) fail();
  const facts = new Map(selectedFacts.map(fact => [fact.id, fact]));
  const rendered = narrative.map(paragraph => {
    if (paragraph.factIds.some(id => !facts.has(id))) throw new AssistantFailure("ASSISTANT_UNKNOWN_SOURCE");
    const references = [...new Set(paragraph.factIds)].map(id => facts.get(id)!);
    const evidence = references.map(fact => `${fact.label}: ${fact.value}`).join("\n");
    const body = paragraph.text.trim().replace(/\{\{fact:([^{}]+)\}\}/gu, (_match, id: string) => {
      const fact = references.find(row => row.id === id);
      if (!fact) throw new AssistantFailure("ASSISTANT_UNKNOWN_SOURCE");
      return fact.value;
    });
    if (/\{\{|\}\}/u.test(body)) fail();
    if (!body || body.length > 1_000 || unsafeText.test(body) || money.test(body) || moneyClaim.test(body) || operationalPromise.test(body)) fail();
    // The provider never receives commercial amounts. Do not allow copied/guessed
    // amounts from Client messages to escape through the unrestricted prose channel.
    const verifiedNumbers = new Set(numericValues(evidence));
    if (numericValues(body).some(value => !verifiedNumbers.has(value))) fail();
    if ([...(body.replace(socialHelpToday, "").match(relativeDates) ?? []), ...(body.match(spelledValues) ?? []), ...(body.match(spelledAmounts) ?? [])].some(value => !normalized(evidence).includes(normalized(value)))) fail();
    for (const claim of body.matchAll(affirmativeStates)) {
      const state = normalized(claim[1]);
      const supports = references.some(fact => {
        const value = normalized(fact.value);
        return value.includes(state) && !/\b(?:not|pending|awaiting|unconfirmed|proposed|reported|submitted|needs?|unavailable)\b/u.test(value);
      });
      if (!supports) fail();
    }
    if (!references.length && /\b(?:your|the|this)\s+(?:project|work|schedule|timeline|completion|handover)\s+(?:is|has|will|was|starts?|ends?|finishes?)\b/iu.test(body)) fail();
    // Source strings distinguish reports/proposals from verified outcomes. Keep those
    // qualifications attached when narrating these facts, even when values coincide.
    for (const fact of references) {
      const source = normalized(`${fact.label}: ${fact.value}`);
      if (/vendor reported progress|% reported/u.test(source) && !/\b(?:reported|reports?|vendor)\b/iu.test(body)) fail();
      if (/proposed schedule|awaiting confirmation/u.test(source) && !/\b(?:proposed|unconfirmed|awaiting confirmation|not (?:yet )?confirmed|pending confirmation)\b/iu.test(body)) fail();
      if (/not a (?:final )?project handover (?:promise|commitment)/u.test(source) && /\b(?:handover|hand over)\b/iu.test(body) && !/\b(?:not|unconfirmed|no confirmed)\b/iu.test(body)) fail();
      if (/verification is pending|not yet verified|needs (?:correction|review)|needs verification|not available|unavailable/u.test(source) && !qualifications.test(body) && !/\b(?:unavailable|cannot|can't|couldn't|aren't|isn't|don't|doesn't|no current|no confirmed)\b/iu.test(body)) fail();
    }
    // Unsupported actor names after responsibility claims are not accepted merely
    // because another unrelated fact was cited in the same paragraph.
    const namedActor = body.match(/\b(?:assigned to|responsible person is|handled by|managed by)\s+([A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*){0,3})/u)?.[1];
    if (namedActor && !normalized(evidence).includes(normalized(namedActor))) fail();
    return {text: body, factIds: references.map(fact => fact.id)};
  });
  if (rendered.reduce((size, row) => size + row.text.length, 0) > 2_000) fail();
  return rendered;
}
