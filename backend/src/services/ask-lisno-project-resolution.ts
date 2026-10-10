import type { AskLisnoProjectChoice, AskLisnoResolution } from "../contracts/ask-lisno.js";

export type ProjectName = AskLisnoProjectChoice;
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const contains = (text: string, name: string) => name.length > 0 && ` ${text} `.includes(` ${name} `);
const generic = /^(?:(?:my|our|the|this|that|a|any|current|your|all)\s+)*(?:my|our|the|this|that|a|any|current|your|all|project|projects|project status|project timeline|project progress|status|timeline|progress|estimate|work|it|completion|finish|cost|budget|account|email|profile|phone|support|help)$/;
const contextualWords = new Set("a an the my our this that current latest verified project projects status progress timeline budget estimate work it its they their when will would could can should what how why is are was were be been has have do does did doing going progressing of for in on to about me you show tell give check get please and or also then now today tomorrow yesterday update updates expected planned actual start end finish finished complete completed completion date dates due deadline running late delayed delay days left remaining cost price amount total more details information available painting hi hello hey thanks thank thankyou yes no not i m am really so very upset frustrated worried confused angry sorry again still keep asking unacceptable understand happening meant mean".split(" "));
const socialPhrase = "(?:(?:hi|hello|hey)(?: there| lisno| lisno ai)?|good (?:morning|afternoon|evening|night)|(?:thank you|thanks|thankyou)(?: very much| so much| a lot)?(?: for (?:your help|the help|the update|your update))?|many thanks|ok|okay|alright|got it|understood|noted|that helps|that s helpful|you re welcome|bye|goodbye|see you|how are you(?: doing)?|i(?: m| am) (?:(?:really|very|so) )?(?:upset|worried|confused|frustrated)|this is frustrating)";
const socialTurn = new RegExp(`^${socialPhrase}(?:(?: and)? ${socialPhrase})*$`);

/** Whole-message social turns only; a greeting must never hide a project question. */
export function isSocialMessage(message: string): boolean {
  const value = normalize(message);
  return socialTurn.test(value);
}

/** Hints are usable only for recognizable contextual wording, never arbitrary new subjects. */
function isContextualQuestion(message: string): boolean {
  const normalized = normalize(message);
  if (normalized && normalized.split(" ").every(word => contextualWords.has(word))) return true;
  const addition = /^(?:(?:can|could) you |please |i (?:want|would like) to )?(?:add|include|install)\s+(.+)$/i.exec(message.trim())?.[1];
  if (addition) {
    if (/\s+(?:to|in|for|at|on)\s+(?:my|our|this|that|current|the) project[?.!]*$/i.test(addition)) return true;
    if (!/\b(?:to|in|for|at|on|project)\b/i.test(addition)) return true;
  }
  // A quoted item after a price request is item context, not a project-name hint.
  return /^(?:what (?:is|would be) the )?(?:price|cost|quote) for ["“][^"”]+["”][?.!]*$/i.test(message.trim());
}

export function accountQuestion(message: string): boolean {
  return /\b(?:account|profile|email address|my email|my phone|my name|password|sign in|log in|contact support)\b/i.test(message)
    && !/\b(?:project|estimate|timeline|progress|completion|finish|budget)\b/i.test(message);
}

/** Only names from the current question may influence scope. History is never authority. */
function explicitName(message: string): string | null {
  const addition = /\b(?:add|addition|install|include|painting|ceiling|paint|cost of|price of|price for|quote for)\b/i.test(message);
  const quoted = message.match(/["“]([^"”]{1,160})["”]/u)?.[1];
  if (quoted && !addition) return quoted;
  const afterProject = message.match(/\bproject\s+(?:called\s+|named\s+)?(.+?)(?=\s+(?:status|progress|timeline|budget|estimate|is|will|has|and|or|finish|complete|please)\b|[?!.,;]|$)/i)?.[1];
  const statusClause = /^(?:(?:is|was|will be|has been|still|so|very|running)\s+)*(?:delayed|late|on time|complete(?:d)?|finished|doing|going|progressing)(?:\s+(?:today|yet|now))?$/i;
  if (afterProject && !statusClause.test(afterProject.trim()) && !/^(?:status|progress|timeline|budget|estimate|is|will|has|be|finish|complete|doing|going|information|details|related|team|name|names|cost|price|updates?|today|yet|now|please)$/i.test(afterProject.trim())) return afterProject.trim();
  if (addition) return null;
  const subject = message.match(/\b(?:about|status of|progress of|timeline (?:of|for)|estimate (?:of|for)|budget (?:of|for)|for)\s+(.+?)(?=\s+(?:project|status|progress|timeline|budget|estimate|is|will|has|please)\b|[?!.,;]|$)/i)?.[1];
  if (subject && !generic.test(normalize(subject))) return subject.trim();
  const beforeProject = message.match(/\b([\p{L}\p{N}-]+)\s+project\b/iu)?.[1];
  if (beforeProject && !generic.test(normalize(beforeProject))) return beforeProject.trim();
  const subjectQuestion = message.match(/\b(?:how is|how's|when will)\s+(.+?)(?=\s+(?:coming|doing|going|progressing|finish|complete|be ready)\b|[?!]|$)/i)?.[1];
  if (subjectQuestion && !generic.test(normalize(subjectQuestion))) return subjectQuestion.trim();
  const prefix = message.match(/^(.+?)\s+(?:progress|status|timeline|budget|estimate)\b/i)?.[1]
    ?.replace(/^(?:can you |could you |please )?(?:show|tell|give)(?: me)?\s+/i, "");
  if (prefix && !generic.test(normalize(prefix)) && !isContextualQuestion(prefix) && !/^(?:what is|what s|what is the|current verified|latest|verified)$/i.test(normalize(prefix))) return prefix.trim();
  return null;
}

export function clarification(question: string, choices: ProjectName[] = []): AskLisnoResolution {
  return {state: "clarification", project: null, question, choices: choices.slice(0, 5)};
}

export function resolveProjectName(input: {
  message: string; projects: ProjectName[]; modelName?: string | null;
  contextProjectId?: string | null; pageProjectId?: string | null; choiceProjectId?: string | null;
  complete: boolean;
}): AskLisnoResolution {
  if (isSocialMessage(input.message)) return {state: "account", project: null, question: null, choices: []};
  const message = normalize(input.message);
  const named = input.projects.filter(project => contains(message, normalize(project.name)));
  // A more specific complete name takes precedence over a shorter name contained in it.
  const exact = named.filter(project => !named.some(other => normalize(other.name) !== normalize(project.name) && contains(normalize(other.name), normalize(project.name))));
  if (exact.length > 1) {
    const chosen = exact.find(project => project.id === input.choiceProjectId);
    if (chosen) return resolved(chosen);
    return clarification("Which project would you like me to check first?", exact);
  }
  const extracted = explicitName(input.message);
  const requested = extracted && !generic.test(normalize(extracted)) ? extracted
    : input.modelName && contains(message, normalize(input.modelName)) && !generic.test(normalize(input.modelName)) ? input.modelName : null;
  if (requested) {
    const name = normalize(requested);
    const matches = input.projects.filter(project => normalize(project.name) === name);
    // Even a model-extracted name cannot shorten a longer named subject in the
    // question (for example "Cedar House Annex" to the owned "Cedar House").
    if (!extracted && matches.length) {
      const tail = message.slice(message.indexOf(name) + name.length).trim().split(" ")[0];
      if (tail && !contextualWords.has(tail)) return clarification("Could you confirm the full project name you mean?");
    }
    if (matches.length === 1) return resolved(matches[0]!);
    if (matches.length > 1) {
      const chosen = matches.find(project => project.id === input.choiceProjectId);
      return chosen ? resolved(chosen) : clarification("Which of these projects do you mean?", matches);
    }
    const partial = input.projects.filter(project => name.length >= 3 && contains(normalize(project.name), name));
    const chosen = partial.find(project => project.id === input.choiceProjectId);
    if (chosen) return resolved(chosen);
    // Partial names always require confirmation, so a near match cannot silently pick a project.
    return clarification(partial.length ? "Did you mean one of these projects?" : "I couldn't match that name to a project available to your account. Could you share the project name?", partial);
  }
  if (exact.length === 1) {
    if (exact[0]!.id === input.choiceProjectId) return resolved(exact[0]!);
    if (/\b(?:compare|versus)\b/i.test(input.message) || /\b(?:and|or)\s+(?!(?:when|what|how|why|where|its|it|is|will|has|can|please|status|progress|timeline|budget|estimate|finish|completion)\b)\p{L}/iu.test(input.message)) return clarification("Which project would you like me to check first?", exact);
    const residual = message.replace(normalize(exact[0]!.name), " ").trim();
    if (!residual || isContextualQuestion(residual)) return resolved(exact[0]!);
    // An explicit add-item target ends at the complete owned name, not a prefix.
    const name = normalize(exact[0]!.name);
    if (message.endsWith(name) && isContextualQuestion(`${message.slice(0, -name.length)}my project`)) return resolved(exact[0]!);
    return clarification("Could you confirm the full project name you mean?");
  }
  if (accountQuestion(input.message)) return {state: "account", project: null, question: null, choices: []};
  const choice = input.projects.find(project => project.id === input.choiceProjectId);
  if (choice) return resolved(choice);
  if (!isContextualQuestion(input.message)) return clarification("Which project would you like me to check? Please tell me its name.");
  const previous = input.projects.find(project => project.id === (input.contextProjectId ?? input.pageProjectId));
  if (previous) return resolved(previous);
  if (input.complete && input.projects.length === 1) return resolved(input.projects[0]!);
  if (!input.projects.length && input.complete) return {state: "account", project: null, question: null, choices: []};
  return clarification("Which project would you like me to check? Please tell me its name.");
}

function resolved(project: ProjectName): AskLisnoResolution {
  return {state: "resolved", project: {id: project.id, name: project.name}, question: null, choices: []};
}
