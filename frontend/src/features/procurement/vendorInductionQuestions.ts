import type { VendorInductionQuestion, VendorInductionAnswer } from "../../../../shared/knowledge/vendorInduction";
import { vendorInductionQuestionVisible } from "../../../../shared/knowledge/vendorInduction";

export const answerTypeLabels: Record<VendorInductionQuestion["type"], string> = {
  short_text: "Short text", paragraph: "Paragraph", number: "Number", yes_no: "Yes or no",
  single_choice: "Choose one", multi_choice: "Choose multiple"
};

export const inductionId = () => globalThis.crypto?.randomUUID?.() ?? `induction_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const newQuestion = (section = "Capability"): VendorInductionQuestion => ({
  id: inductionId(), key: `question_${inductionId().replaceAll("-", "").slice(0, 12)}`,
  section, prompt: "", helpText: null, type: "short_text", enabled: true, required: true,
  options: [], unit: null, min: null, max: null, showIf: null
});

export function validateVendorInductionQuestions(questions: readonly VendorInductionQuestion[]): string | null {
  if (!questions.some((question) => question.enabled) || questions.length > 100) return "Add 1 to 100 enabled questions before saving the draft.";
  const ids = new Set<string>(); const keys = new Set<string>();
  for (const [index, question] of questions.entries()) {
    const number = index + 1;
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(question.id) || ids.has(question.id)) return `Question ${number} needs a unique identity.`;
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(question.key) || keys.has(question.key.toLowerCase())) return `Question ${number} needs a unique lowercase key starting with a letter.`;
    ids.add(question.id); keys.add(question.key.toLowerCase());
    if (!question.section.trim() || question.section.length > 120 || !question.prompt.trim() || question.prompt.length > 500 || question.helpText !== null && question.helpText.length > 1000) return `Question ${number} needs a valid section, prompt, and helpful note.`;
    if (question.type === "single_choice" || question.type === "multi_choice") {
      const labels = question.options.map((option) => option.label.trim().toLocaleLowerCase());
      const optionIds = question.options.map((option) => option.id);
      if (question.options.length < 2 || question.options.length > 12 || labels.some((label) => !label) || new Set(labels).size !== labels.length || new Set(optionIds).size !== optionIds.length || question.options.some((option) => option.label.length > 120 || !/^[A-Za-z0-9_-]{1,128}$/u.test(option.id))) return `Question ${number} needs 2 to 12 distinct options of at most 120 characters.`;
    } else if (question.options.length) return `Question ${number} can have options only for a choice answer.`;
    if (question.type === "number" && (question.unit !== null && (!question.unit.trim() || question.unit.length > 40) || question.min !== null && (!Number.isFinite(question.min) || question.min < 0) || question.max !== null && (!Number.isFinite(question.max) || question.max < 0) || question.max !== null && question.min !== null && question.max < question.min)) return `Question ${number} has invalid number limits or unit.`;
    if (question.type !== "number" && (question.unit !== null || question.min !== null || question.max !== null)) return `Question ${number} can use number limits only for a Number answer.`;
    if (question.showIf) {
      const parent = questions.slice(0, index).find((entry) => entry.id === question.showIf!.questionId);
      if (!parent || !parent.enabled || !["yes_no", "single_choice", "multi_choice"].includes(parent.type) || !question.showIf.optionIds.length || new Set(question.showIf.optionIds).size !== question.showIf.optionIds.length) return `Question ${number} has an invalid display condition.`;
      const allowed = parent.type === "yes_no" ? ["yes", "no"] : parent.options.map((option) => option.id);
      if (question.showIf.optionIds.some((value) => !allowed.includes(value))) return `Question ${number} has an unknown condition option.`;
    }
  }
  return null;
}

export function visibleVendorInductionAnswers(questions: readonly VendorInductionQuestion[], answers: readonly VendorInductionAnswer[]) {
  // Walk in published order so a hidden parent also hides its descendants.
  const visible: VendorInductionAnswer[] = [];
  for (const question of questions) {
    if (!question.enabled) continue;
    if (!vendorInductionQuestionVisible(question, visible)) continue;
    const answer = answers.find((entry) => entry.questionId === question.id);
    if (answer) visible.push(answer);
  }
  return visible;
}
