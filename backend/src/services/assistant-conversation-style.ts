import type { AssistantGeneratedResult } from "../contracts/project-chat-assistant.js";
import { isSocialMessage } from "./ask-lisno-project-resolution.js";

type Answer = Omit<AssistantGeneratedResult, "freshness">;
type Tone = "frustration" | "concern" | "confusion" | "urgency";
type ToneSignal = Tone | "reset" | null;
const normalize = (value: string) => value.normalize("NFKC").replace(/[‘’]/gu, "'").trim().replace(/\s+/gu, " ");
const greetingPrefix = /^(?:hi|hello|hey|namaste|namaskaram|thanks|thank you|good (?:morning|afternoon|evening))(?: lisno(?: ai)?)?[,!.]+\s*/iu;
// Whitespace is safe only after the complete message has passed the whole-social grammar.
const socialGreetingPrefix = /^(?:(?:hi|hello|hey)(?: there)?|namaste|namaskaram|thanks|thank you|good ?(?:morning|afternoon|evening))(?: lisno(?: ai)?)?(?:[,!.]+\s*|\s+)(?:and\s+)?/iu;
const explicitTone = /^(?:i(?:'m| am) (?:(?:really|very|so) )?(frustrated|upset|unhappy|worried|concerned|confused)|this is (urgent|frustrating))(?=$|[,!.:;?])/iu;
const socialTone = /^(?:i(?:'m| am) (?:(?:really|very|so) )?(frustrated|upset|unhappy|worried|concerned|confused)|this is (urgent|frustrating))(?=$|[\s,!.:;?])/iu;
const negatedTone = /^(?:(?:actually|no)[,!.:;?]+\s*)?(?:i(?:'m| am) (?:(?:really|very|so) )?(?:not|no longer) (?:(?:really|very|so) )?(?:frustrated|upset|unhappy|worried|concerned|confused)|this (?:is (?:not|no longer)|isn't) (?:(?:really|very|so) )?(?:urgent|frustrating))\b/iu;
const socialReplies = new Set([
  "Hello! I can help with your project's progress, timelines, and published estimates. What would you like to know?",
  "You're welcome. I can help with your project details and published estimates.",
  "Goodbye. I'm here when you need help with your project.",
  "I'm sorry this has been frustrating. Tell me what happened with your project so I can help."
]);

/** The account name is trusted identity data, but still untrusted display text. */
export function assistantFirstName(value: string | null | undefined): string | null {
  if (!value || value.length > 160 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)) return null;
  const trimmed = value.trim();
  if (!/^[\p{L}\p{M}'’ -]+$/u.test(trimmed)) return null;
  const first = trimmed.split(/ +/u)[0]!;
  return first.length <= 40 && /^\p{L}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)*$/u.test(first) ? first : null;
}

function toneFor(message: string): ToneSignal {
  let text = normalize(message);
  const wholeSocial = isSocialMessage(message);
  for (let index = 0; index < 3; index++) {
    const stripped = text.replace(wholeSocial ? socialGreetingPrefix : greetingPrefix, "");
    if (stripped === text) break;
    text = stripped;
  }
  // A correction cancels older tone evidence; a neutral business fragment does not.
  if (negatedTone.test(text)) return "reset";
  const match = (wholeSocial ? socialTone : explicitTone).exec(text);
  if (!match) return null;
  const word = (match[1] ?? match[2])!.toLowerCase();
  if (word === "urgent") return "urgency";
  if (word === "worried" || word === "concerned") return "concern";
  if (word === "confused") return "confusion";
  return "frustration";
}

function acknowledgment(tone: Tone, name: string | null): string {
  const address = name ? `, ${name}` : "";
  if (tone === "concern") return `I hear your concern${address}.`;
  if (tone === "confusion") return `I can help clarify${address}.`;
  if (tone === "urgency") return "I understand this is urgent.";
  return `I'm sorry this has been frustrating${address}.`;
}

/** Call only after source/identity checks. This changes wording, never business evidence. */
export function styleAssistantConversation<T extends Answer>(answer: T, input: {
  messages: readonly string[];
  accountName?: string | null;
}): T {
  const name = assistantFirstName(input.accountName);
  const latestTone = [...input.messages].reverse().map(toneFor).find(value => value !== null) ?? null;
  const tone = latestTone === "reset" ? null : latestTone;
  const narrative = answer.narrative ?? [];
  const socialOnly = input.messages.length > 0 && input.messages.every(isSocialMessage);
  const fixedSocial = socialOnly && answer.kind === "no_answer" && !answer.facts.length && !answer.candidates.length
    && !answer.commercial && !answer.projectPricing && !answer.missingInputs.length && narrative.length === 1
    && narrative[0]!.factIds.length === 0 && socialReplies.has(narrative[0]!.text);

  if (fixedSocial) {
    let text = narrative[0]!.text;
    if (tone) text = `${acknowledgment(tone, name)} What would you like to know about your project?`;
    else if (name && text.startsWith("Hello!")) text = text.replace(/^Hello!/, `Hello, ${name}!`);
    else if (name && text.startsWith("You're welcome.")) text = text.replace(/^You're welcome\./, `You're welcome, ${name}.`);
    return text === narrative[0]!.text ? answer : {...answer, narrative: [{text, factIds: []}]};
  }
  if (!tone) return answer;
  if (answer.kind === "no_answer" && !narrative.length && !answer.facts.length && !answer.missingInputs.length && !answer.commercial && !answer.projectPricing) return answer;
  const text = acknowledgment(tone, name);
  // Do not drop fact paragraphs or exceed the existing four-paragraph/1,000-character bounds.
  if (narrative.length < 4) return {...answer, narrative: [{text, factIds: []}, ...narrative]};
  if (narrative.length === 4 && `${text} ${narrative[0]!.text}`.length <= 1_000) {
    return {...answer, narrative: [{...narrative[0]!, text: `${text} ${narrative[0]!.text}`}, ...narrative.slice(1)]};
  }
  return answer;
}
