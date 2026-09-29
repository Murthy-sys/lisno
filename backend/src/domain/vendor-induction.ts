import { ApiError } from "../middleware/errors.js";
import type { VendorInductionAnswer, VendorInductionQuestion } from "../contracts/vendor-induction.js";

const invalid = (message: string, field?: string): never => { throw new ApiError(400, "VENDOR_INDUCTION_INVALID", message, field ? { [field]: message } : undefined); };
const keyPattern = /^[a-z][a-z0-9_]{0,63}$/u;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const optionsFor = (question: VendorInductionQuestion) => question.type === "yes_no"
  ? ["yes", "no"] : question.options.map(option => option.id);

export function validateVendorInductionQuestions(questions: readonly VendorInductionQuestion[], forPublication = false): VendorInductionQuestion[] {
  if (!Array.isArray(questions) || questions.length > 100 || forPublication && !questions.length) invalid("Add 1 to 100 questions before publishing.");
  const keys = new Set<string>();
  const ids = new Set<string>();
  const preceding = new Map<string, VendorInductionQuestion>();
  for (const [index, question] of questions.entries()) {
    const field = `questions.${index}`;
    if (!question || typeof question !== "object" || !idPattern.test(question.id) || !keyPattern.test(question.key)) invalid("Each question needs a stable ID and key.", field);
    if (ids.has(question.id) || keys.has(question.key.toLowerCase())) invalid("Question IDs and keys must be unique.", field);
    ids.add(question.id); keys.add(question.key.toLowerCase());
    if (!question.section?.trim() || question.section.length > 120 || !question.prompt?.trim() || question.prompt.length > 500 ||
      question.helpText !== null && (typeof question.helpText !== "string" || question.helpText.length > 1000) ||
      typeof question.required !== "boolean" || typeof question.enabled !== "boolean") invalid("Question text or settings are invalid.", field);
    if (!["short_text", "paragraph", "number", "yes_no", "single_choice", "multi_choice"].includes(question.type)) invalid("Choose a supported answer type.", field);
    const choice = question.type === "single_choice" || question.type === "multi_choice";
    if (!Array.isArray(question.options) || choice && (question.options.length < 2 || question.options.length > 12) ||
      !choice && question.options.length) invalid("Choice questions need 2 to 12 options; other answer types have no options.", field);
    const optionIds = new Set<string>(); const labels = new Set<string>();
    for (const option of question.options) {
      if (!idPattern.test(option.id) || !option.label?.trim() || option.label.length > 120 ||
        optionIds.has(option.id) || labels.has(option.label.trim().toLowerCase())) invalid("Choice options need unique IDs and labels.", field);
      optionIds.add(option.id); labels.add(option.label.trim().toLowerCase());
    }
    if (question.type === "number") {
      if (question.unit !== null && (typeof question.unit !== "string" || !question.unit.trim() || question.unit.length > 40)) invalid("Number unit is invalid.", field);
      if (question.min !== null && (!Number.isFinite(question.min) || question.min < 0) ||
        question.max !== null && (!Number.isFinite(question.max) || question.max < 0) ||
        question.min !== null && question.max !== null && question.max < question.min) invalid("Number bounds are invalid.", field);
    } else if (question.unit !== null || question.min !== null || question.max !== null) invalid("Only number questions may have units or bounds.", field);
    if (question.showIf) {
      const parent = preceding.get(question.showIf.questionId);
      if (!parent || !["yes_no", "single_choice", "multi_choice"].includes(parent.type) ||
        forPublication && !parent.enabled || !Array.isArray(question.showIf.optionIds) || !question.showIf.optionIds.length ||
        new Set(question.showIf.optionIds).size !== question.showIf.optionIds.length ||
        question.showIf.optionIds.some(value => !optionsFor(parent).includes(value))) invalid("Conditional display must use options from an earlier enabled choice question.", field);
    }
    preceding.set(question.id, question);
  }
  return questions.map(question => ({ ...question, section: question.section.trim(), prompt: question.prompt.trim(),
    helpText: question.helpText?.trim() || null, unit: question.unit?.trim() || null,
    options: question.options.map(option => ({ id: option.id, label: option.label.trim() })) }));
}

export function questionVisible(question: VendorInductionQuestion, answers: ReadonlyMap<string, VendorInductionAnswer["value"]>): boolean {
  if (!question.showIf) return true;
  const value = answers.get(question.showIf.questionId);
  if (value === undefined) return false;
  const selected = Array.isArray(value) ? value : typeof value === "boolean" ? [value ? "yes" : "no"] : [String(value)];
  return selected.some(optionId => question.showIf!.optionIds.includes(optionId));
}

export function validateVendorInductionAnswers(questions: readonly VendorInductionQuestion[], answers: readonly VendorInductionAnswer[]): VendorInductionAnswer[] {
  if (!Array.isArray(answers) || answers.length > questions.length) invalid("Answers do not match the sent questionnaire.");
  const provided = new Map<string, VendorInductionAnswer["value"]>();
  for (const [index, answer] of answers.entries()) {
    if (!answer || typeof answer.questionId !== "string" || provided.has(answer.questionId)) invalid("Each question may be answered once.", `answers.${index}`);
    provided.set(answer.questionId, answer.value);
  }
  if ([...provided.keys()].some(id => !questions.some(question => question.id === id))) invalid("An answer does not belong to this questionnaire.");
  const accepted = new Map<string, VendorInductionAnswer["value"]>();
  const normalized: VendorInductionAnswer[] = [];
  for (const [index, question] of questions.entries()) {
    const visible = questionVisible(question, accepted);
    const value = provided.get(question.id);
    if (!visible) {
      if (provided.has(question.id)) invalid("Hidden questions cannot be answered.", `answers.${index}`);
      continue;
    }
    if (value === undefined || value === null || value === "") {
      if (question.required) invalid("Answer this required question.", `answers.${index}`);
      continue;
    }
    let clean: VendorInductionAnswer["value"] = value;
    if (question.type === "short_text" || question.type === "paragraph") {
      if (typeof value !== "string" || !value.trim() || value.length > (question.type === "short_text" ? 240 : 4000)) invalid("Enter a valid text answer.", `answers.${index}`);
      clean = (value as string).trim();
    } else if (question.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || question.min !== null && value < question.min ||
        question.max !== null && value > question.max) invalid("Enter a number within the allowed range.", `answers.${index}`);
    } else if (question.type === "yes_no") {
      if (typeof value !== "boolean") invalid("Choose Yes or No.", `answers.${index}`);
    } else if (question.type === "single_choice") {
      if (typeof value !== "string" || !question.options.some(option => option.id === value)) invalid("Choose one listed option.", `answers.${index}`);
    } else if (question.type === "multi_choice") {
      if (!Array.isArray(value) || !value.length || value.length > question.options.length || new Set(value).size !== value.length ||
        value.some(item => typeof item !== "string" || !question.options.some(option => option.id === item))) invalid("Choose listed options without duplicates.", `answers.${index}`);
      clean = value;
    }
    accepted.set(question.id, clean);
    normalized.push({ questionId: question.id, value: clean });
  }
  return normalized;
}
