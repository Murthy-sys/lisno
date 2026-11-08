import type { EstimatePdfInput } from "../estimate-pdf.service.js";
import type { EstimateProposalMetadata } from "../../domain/estimate-proposal.js";
import { proposalPayments } from "../../domain/estimate-proposal.js";
import { ProposalDocument, page, palette } from "./document.js";
import { dateLabel, money, sectionLetter, type ProposalGroup } from "./content.js";

type Input = EstimatePdfInput & { proposal: EstimateProposalMetadata };
const measure = (pdf: ProposalDocument, text: string, width: number, size: number, lineHeight: number, font: "body" | "medium" | "heading" = "body") => pdf.lines(text, width, size, font).length * lineHeight;
function fitted(pdf: ProposalDocument, text: string, x: number, y: number, width: number, height: number, size: number, color: string = palette.ink) {
  let fontSize = size;
  while (fontSize > 6.5 && measure(pdf, text, width, fontSize, fontSize * 1.35) > height) fontSize -= .5;
  if (measure(pdf, text, width, fontSize, fontSize * 1.35) > height) throw new TypeError("A proposal identity field is too long to lay out safely.");
  return pdf.text(text, x, y, width, fontSize, { color, lineHeight: fontSize * 1.35 });
}

interface FlowBlock { title: string; body: string; }
/** Exceptional long frozen terms use readable continuation pages instead of being
 * clipped into the reference's fixed editorial columns. */
function flowSections(pdf: ProposalDocument, eyebrow: string, title: string, blocks: readonly FlowBlock[]) {
  let y = 0;
  const next = (continued = false) => { pdf.addPage(); pdf.heading(eyebrow, `${title}${continued ? ", continued" : ""}`); y = 139; };
  next();
  for (const block of blocks) {
    const titleLines = pdf.lines(block.title, page.widthInside, 11, "medium");
    if (y + titleLines.length * 16 + 30 > page.bottom) next(true);
    y += pdf.text(block.title, page.left, y, page.widthInside, 11, { font: "medium", lineHeight: 16 }) + 8;
    for (const line of pdf.lines(block.body, page.widthInside, 9, "body")) {
      if (y + 14 > page.bottom) next(true);
      pdf.line(line, page.left, y, page.widthInside, 9, { color: palette.muted }); y += 14;
    }
    y += 13; pdf.rule(page.left, y - 5, page.widthInside);
  }
}

export function cover(pdf: ProposalDocument, input: Input) {
  pdf.addPage(false); pdf.rect(0, 0, page.width, page.height, palette.ink);
  pdf.photo("cover-living", 0, 0, page.width, 540);
  const fade = pdf.doc.linearGradient(0, 342, 0, 548).stop(0, palette.ink, 0).stop(.45, palette.ink, .45).stop(1, palette.ink, 1);
  pdf.doc.rect(0, 342, page.width, 207).fill(fade);
  const topFade = pdf.doc.linearGradient(0, 0, 0, 180).stop(0, palette.ink, .35).stop(1, palette.ink, 0);
  pdf.doc.rect(0, 0, page.width, 180).fill(topFade);
  pdf.logo(page.left, 45, 116);
  pdf.line("INTERIOR DESIGN & BUILD", 345, 57, 199, 7.2, { color: palette.white, spacing: 2, align: "right" });
  pdf.label("Estimate & proposal", page.left, 579, 350, palette.goldLight);
  pdf.text("A home,\nthoughtfully made.", page.left, 607, 440, 37, { font: "heading", color: palette.white, lineHeight: 44 });
  pdf.rule(page.left, 721, 62, palette.goldLight, 1.3);
  const fields = [ ["Prepared for", input.lead.clientName], ["Project", input.lead.projectName], ["Reference", input.proposal.reference], ["Date", dateLabel(input.proposal.issuedAt)] ];
  fields.forEach(([label, value], index) => {
    const x = page.left + index * 128;
    pdf.label(label, x, 746, 113, palette.goldLight);
    fitted(pdf, value, x, 761, 113, 60, 9.3, palette.white);
  });
  pdf.line("COVER: A COMPLETED LISNO RESIDENCE", 265, fields.some(([, value]) => value.length > 100) ? 825 : 808, 279, 6, { color: palette.faint, spacing: 1.1, align: "right" });
}

export function welcome(pdf: ProposalDocument, input: Input, total: number) {
  pdf.addPage();
  pdf.label("Welcome", page.left, page.top);
  fitted(pdf, `Dear ${input.lead.clientName},`, page.left, 85, 312, 60, 24);
  const paragraphs = [
    `Thank you for meeting us. Your home at ${input.lead.projectName} is about to start its next chapter, and we are glad to be part of it.`,
    "This estimate sets out the scope we will build, what it costs, how payments are staged and how the project will run, so you can plan with confidence before the design work begins.",
    "Once you confirm, our designers will measure the site, build a concept with you and develop every unit in 2D and 3D. The sizes here will be refined against the final design and agreed with you before anything goes into production.",
    "We look forward to designing your home with you."
  ];
  let y = 142;
  for (const paragraph of paragraphs) y += pdf.text(paragraph, page.left, y, 285, 10, { lineHeight: 18 }) + 15;
  y += 8;
  pdf.text("Warm regards,", page.left, y, 285, 10); y += 18;
  pdf.text(`Team ${input.proposal.terms.company.name.replace(/ Pvt Ltd$/u, "")}`, page.left, y, 285, 10, { font: "medium" }); y += 20;
  pdf.text(`Prepared by ${input.proposal.preparedBy}`, page.left, y, 285, 8.7, { color: palette.muted });
  pdf.photo("welcome-detail", 368, 136, 176, 426);
  pdf.line("FROM OUR COMPLETED WORK", 368, 570, 176, 6.4, { color: palette.faint, spacing: 1.4 });
  const cells = [ [String(input.proposal.terms.designWorkingDays), "WORKING DAYS\nFOR DESIGN"], [String(input.proposal.terms.executionWorkingDays), "WORKING DAYS\nFOR EXECUTION"], [String(input.proposal.terms.paymentStages.length), "PAYMENT\nSTAGES"], [money(total), "PROJECT PRICE\nINCLUDING GST"] ];
  const bandY = Math.max(676, y + 42);
  if (bandY + 104 > 790) { pdf.addPage(); pdf.heading("Welcome", "Your project at a glance"); }
  const actualY = bandY + 104 > 790 ? 155 : bandY;
  pdf.rect(page.left, actualY, page.widthInside, 104, palette.ink);
  cells.forEach(([value, label], index) => {
    const x = page.left + index * page.widthInside / 4;
    if (index) pdf.vertical(x, actualY, 104);
    let size = index === 3 ? 23 : 29;
    while (pdf.lines(value, page.widthInside / 4 - 27, size, "heading").length > 1 && size > 7) size -= .5;
    pdf.text(value, x + 16, actualY + 20, page.widthInside / 4 - 27, size, { font: "heading", color: palette.goldLight, lineHeight: 29 });
    pdf.text(label, x + 16, actualY + 61, page.widthInside / 4 - 26, 6.6, { color: palette.white, spacing: 1.2, lineHeight: 11 });
  });
}

export function scope(pdf: ProposalDocument, groups: ProposalGroup[]) {
  const pages = Math.max(1, Math.ceil(groups.length / 6));
  for (let chunk = 0; chunk < pages; chunk++) {
    pdf.addPage();
    pdf.heading("What's included", chunk ? "Scope of work, continued" : "Scope of work", "Everything Lisno designs, builds and installs in your home, area by area. The detailed estimate follows.");
    let y = 178;
    const rows = groups.slice(chunk * 6, chunk * 6 + 6);
    if (!rows.length) pdf.text("The selected scope is recorded in the approved estimate. No item details are available in this view.", page.left, y + 12, page.widthInside, 10, { color: palette.muted });
    for (let offset = 0; offset < rows.length; offset += 3) {
      const row = rows.slice(offset, offset + 3);
      const titleSizes = row.map(group => {
        let size = 12;
        while (size > 6.5 && measure(pdf, group.title, 140, size, size * 1.35, "medium") > 100) size -= .5;
        return size;
      });
      const heights = row.map((group, index) => 57 + measure(pdf, group.title, 140, titleSizes[index], titleSizes[index] * 1.35, "medium") + 40);
      const height = Math.max(116, ...heights);
      pdf.rule(page.left, y, page.widthInside, offset === 0 ? palette.ink : palette.rule);
      row.forEach((group, index) => {
        const x = page.left + index * page.widthInside / 3;
        if (index) pdf.vertical(x, y, height);
        const contentX = x + (index ? 15 : 0), width = page.widthInside / 3 - 24;
        pdf.label(String(chunk * 6 + offset + index + 1).padStart(2, "0"), contentX, y + 19, width);
        const titleHeight = pdf.text(group.title, contentX, y + 39, width, titleSizes[index], { font: "medium", lineHeight: titleSizes[index] * 1.35 });
        pdf.text(`${group.lines.length} selected ${group.lines.length === 1 ? "item" : "items"}. Specifications, quantities and prices are listed in the detailed estimate.`, contentX, y + 46 + titleHeight, width, 8.9, { color: palette.muted, lineHeight: 13 });
      });
      y += height;
    }
    pdf.rule(page.left, y, page.widthInside);
    if (chunk === pages - 1) {
      const photoY = Math.max(449, y + 28);
      if (photoY + 280 <= page.bottom) {
        pdf.photo("scope-kitchen", page.left, photoY, 270, 280);
        pdf.rect(346, photoY, 198, 280, palette.white, palette.rule);
        pdf.label("Your selected scope", 363, photoY + 22, 164);
        pdf.text("Made for your home", 363, photoY + 47, 162, 19, { font: "heading", lineHeight: 24 });
        pdf.text("The detailed estimate records the selected work and its saved specifications. Items outside that scope are not part of Lisno's price unless expressly included.\n\nFinal measurements and finishes are agreed during design. Any addition or change is quoted for your approval.", 363, photoY + 84, 162, 9, { color: palette.muted, lineHeight: 14.3 });
      }
    }
  }
}

export function investment(pdf: ProposalDocument, input: Input, groups: ProposalGroup[], totals: { subtotal: number; gst: number; total: number; roundOff: number }) {
  pdf.addPage(); pdf.heading("Investment", "Your project price");
  let y = 138;
  pdf.label("Area", 74, y, 160, palette.faint); pdf.line("VISIBLE SCOPE (₹)", 184, y, 110, 6.7, { spacing: 1, color: palette.faint, align: "right" });
  y += 16; pdf.rule(page.left, y, 244, palette.ink);
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const height = Math.max(31, measure(pdf, group.title, 137, 9.5, 14) + 16);
    if (y + height > 450) {
      pdf.addPage(); pdf.heading("Investment", "Area summary, continued"); y = 144;
    }
    pdf.text(sectionLetter(i), page.left, y + 11, 18, 8.5, { font: "medium", color: palette.gold });
    pdf.text(group.title, 74, y + 10, 137, 9.5, { lineHeight: 14 });
    pdf.text(money(group.amountPaise, false), 213, y + 10, 81, 9.5, { align: "right" });
    y += height; pdf.rule(page.left, y, 244);
  }
  y += 12;
  pdf.text("Estimate subtotal", 74, y, 137, 9.5, { font: "medium" }); pdf.text(money(totals.subtotal, false), 211, y, 83, 9.5, { font: "medium", align: "right" });
  const panelX = 323, panelY = 137, panelW = 221;
  const roundOffHeight = totals.roundOff ? 29 : 0;
  pdf.rect(panelX, panelY, panelW, 207 + roundOffHeight, palette.ink);
  pdf.label("Your project price", panelX + 19, panelY + 23, panelW - 38, palette.goldLight);
  fitted(pdf, money(totals.total), panelX + 19, panelY + 49, panelW - 38, 57, 28, palette.white);
  const entries: Array<[string, number]> = [["Subtotal", totals.subtotal], ["GST", totals.gst]];
  if (totals.roundOff) entries.push(["Round off", totals.roundOff]);
  entries.push(["Total payable", totals.total]);
  entries.forEach(([label, value], index) => {
    const rowY = panelY + 106 + index * 29;
    const final = index === entries.length - 1;
    const amount = label === "Round off" ? `${value < 0 ? "-" : "+"}${money(Math.abs(value))}` : money(value, final);
    pdf.rule(panelX + 19, rowY - 7, panelW - 38, final ? palette.goldLight : "#4e4763");
    pdf.text(label, panelX + 19, rowY, 84, 9, { color: palette.white, font: final ? "medium" : "body" });
    pdf.text(amount, panelX + 102, rowY, panelW - 121, 9, { color: palette.white, align: "right", font: final ? "medium" : "body" });
  });
  pdf.text(groups.reduce((sum, group) => sum + BigInt(group.amountPaise), 0n) === BigInt(totals.subtotal) ? "This price applies to the selected scope above. Payment stages are calculated on the total payable including GST. Any changes are quoted separately for your approval." : "Area subtotals cover the item details in this view. The project price is the recorded total for the complete estimate, including GST. Payment stages use that full total.", panelX, panelY + 222 + roundOffHeight, panelW, 8.6, { color: palette.muted, lineHeight: 12.6 });
  pdf.photo("price-living", 0, 507, page.width, 284);
}

export function payments(pdf: ProposalDocument, input: Input, total: number) {
  const stages = proposalPayments(total, input.proposal.terms.paymentStages);
  if (stages.some(stage => measure(pdf, stage.trigger, 270, 7.2, 11) + measure(pdf, stage.description, 270, 8.6, 13) > 450)) {
    flowSections(pdf, "Payments", "Payment schedule", stages.map(stage => ({ title: `${stage.basisPoints / 100}% · ${stage.title} · ${money(stage.amountPaise)}`, body: `${stage.trigger}\n${stage.description}\nPayment due within ${input.proposal.terms.paymentDueWorkingDays} working days.` })));
    return;
  }
  pdf.addPage();
  pdf.heading("Payments", "Payment schedule", `Five stages, each tied to a clear milestone. Amounts are on the project price of ${money(total)}.`);
  let x = page.left;
  const colors = [palette.pale, palette.ink, "#302750", "#50466f", palette.goldLight];
  stages.forEach((stage, index) => {
    const width = page.widthInside * stage.basisPoints / 10000;
    pdf.rect(x, 162, width - (index === 4 ? 0 : 2), 32, colors[index]);
    pdf.text(`${stage.basisPoints / 100}%`, x + 7, 172, width - 12, 7, { color: index === 0 || index === 4 ? palette.ink : palette.white }); x += width;
  });
  let y = 219; pdf.rule(page.left, y, page.widthInside, palette.ink);
  stages.forEach((stage, index) => {
    const titleH = measure(pdf, stage.title, 270, 11.3, 16, "medium");
    const triggerH = measure(pdf, stage.trigger.toUpperCase(), 270, 7.2, 11);
    const descriptionH = measure(pdf, stage.description, 270, 8.6, 13);
    const height = Math.max(83, 29 + titleH + triggerH + descriptionH);
    if (y + height > page.bottom - 45) { pdf.addPage(); pdf.heading("Payments", "Payment schedule, continued"); y = 145; }
    pdf.text(String(index + 1).padStart(2, "0"), page.left, y + 25, 23, 6.7, { color: palette.faint, spacing: 1 });
    pdf.text(`${stage.basisPoints / 100}%`, 91, y + 15, 64, 26, { font: "heading" });
    pdf.text(stage.title, 170, y + 19, 255, 11.3, { font: "medium", lineHeight: 16 });
    pdf.text(stage.trigger.toUpperCase(), 170, y + 23 + titleH, 270, 7.2, { color: palette.gold, spacing: 1.1, lineHeight: 11 });
    pdf.text(stage.description, 170, y + 28 + titleH + triggerH, 270, 8.6, { color: palette.muted, lineHeight: 13 });
    pdf.text(money(stage.amountPaise), 435, y + 22, 109, 11, { font: "medium", align: "right" });
    y += height; pdf.rule(page.left, y, page.widthInside);
  });
  pdf.text(`Each payment is due within ${input.proposal.terms.paymentDueWorkingDays} working days of its milestone. A delayed payment moves the timeline by the same number of days.`, page.left, y + 17, page.widthInside, 8.1, { color: palette.muted, lineHeight: 13 });
}

export function workflow(pdf: ProposalDocument, input: Input) {
  if (input.proposal.terms.workflow.some(phase => phase.steps.reduce((height, step) => height + measure(pdf, step, 100, 8.1, 11.5) + 10, 0) > 230) || input.proposal.terms.changeReasons.some(reason => measure(pdf, reason.body, 143, 8.4, 12.8) > 75)) {
    flowSections(pdf, "How we work", "From first sketch to handover", [...input.proposal.terms.workflow.map(phase => ({ title: `${phase.title} · ${phase.timing}`, body: phase.steps.join("\n") })), ...input.proposal.terms.changeReasons]);
    return;
  }
  pdf.addPage();
  pdf.heading("How we work", "From first sketch to handover", "Four phases, with your sign-off at each step. Execution begins once the production drawings are signed and stage 02 is received.");
  const top = 178, col = page.widthInside / 4;
  pdf.rule(page.left, top, page.widthInside, palette.ink);
  let maxY = top;
  input.proposal.terms.workflow.forEach((phase, index) => {
    const x = page.left + index * col, contentX = x + (index ? 12 : 0), width = col - 23;
    if (index) pdf.vertical(x, top, 219);
    pdf.text(String(index + 1).padStart(2, "0"), contentX, top + 14, 26, 22, { font: "heading", color: palette.gold });
    pdf.text(phase.timing.toUpperCase(), contentX + 34, top + 16, width - 34, 6.5, { color: palette.ink, spacing: .7, align: "right", lineHeight: 9 });
    let y = top + 53;
    y += pdf.text(phase.title, contentX, y, width, 10.6, { font: "medium", lineHeight: 15 }) + 15;
    for (const step of phase.steps) {
      const h = pdf.text(step, contentX, y, width, 8.1, { color: palette.muted, lineHeight: 11.5 }); y += h + 5;
      pdf.rule(contentX, y, width); y += 5;
    }
    maxY = Math.max(maxY, y);
  });
  const bottom = Math.max(428, maxY + 28);
  if (bottom + 295 > page.bottom) { pdf.addPage(); pdf.heading("Changes during the project", "Why a change moves the timeline"); }
  const y = bottom + 295 > page.bottom ? 145 : bottom;
  pdf.rule(page.left, y, page.widthInside);
  pdf.photo("workflow-wardrobe", page.left, y + 26, 165, 273);
  pdf.label("Changes during the project", 241, y + 28, 303);
  pdf.text("Why a change moves the timeline", 241, y + 49, 303, 18, { font: "heading", lineHeight: 24 });
  let rowY = y + 87;
  for (let index = 0; index < input.proposal.terms.changeReasons.length; index += 2) {
    const pair = input.proposal.terms.changeReasons.slice(index, index + 2); let height = 0;
    pair.forEach((reason, offset) => {
      const x = 241 + offset * 160;
      const titleH = pdf.text(reason.title, x, rowY, 143, 9.6, { font: "medium", lineHeight: 14 });
      const bodyH = pdf.text(reason.body, x, rowY + titleH + 5, 143, 8.4, { color: palette.muted, lineHeight: 12.8 });
      height = Math.max(height, titleH + bodyH + 20);
    });
    rowY += height;
  }
  pdf.text("Extra time from changes you approve is not a delay in execution; it is the time those changes need.", 241, rowY + 6, 303, 8.3, { color: palette.muted, lineHeight: 13 });
}

export function exclusions(pdf: ProposalDocument, input: Input) {
  const rows = input.proposal.terms.exclusions;
  if (rows.some(row => measure(pdf, row.body, 195, 8.5, 13) > 460)) { flowSections(pdf, "Clarity", "What's not included", rows); return; }
  pdf.addPage();
  pdf.heading("Clarity", "What's not included", "These defaults apply unless expressly included in the detailed estimate. The selected scope and its saved specifications always take precedence.");
  let y = 178;
  pdf.rule(page.left, y, page.widthInside, palette.ink);
  for (let i = 0; i < rows.length; i += 2) {
    const pair = rows.slice(i, i + 2);
    const height = Math.max(...pair.map(row => 27 + measure(pdf, row.title, 195, 10.3, 14, "medium") + measure(pdf, row.body, 195, 8.5, 13)), 72);
    if (y + height > page.bottom) { pdf.addPage(); pdf.heading("Clarity", "Exclusions, continued"); y = 145; }
    pair.forEach((row, offset) => {
      const x = page.left + offset * 261;
      pdf.text(String(i + offset + 1).padStart(2, "0"), x, y + 14, 24, 16, { font: "heading", color: palette.gold });
      const titleH = pdf.text(row.title, x + 30, y + 16, 195, 10.3, { font: "medium", lineHeight: 14 });
      pdf.text(row.body, x + 30, y + 23 + titleH, 195, 8.5, { color: palette.muted, lineHeight: 13 });
      pdf.rule(x, y + height, 232);
    });
    y += height;
  }
}

export function terms(pdf: ProposalDocument, input: Input) {
  const materialHeight = input.proposal.terms.materials.reduce((height, row) => height + Math.max(measure(pdf, row.area, 111, 8.4, 13), measure(pdf, row.specification, 147, 8.6, 13, "medium")) + 14, 33);
  if (materialHeight > 600 || input.proposal.terms.clauses.some(row => measure(pdf, row.body, 232, 8.4, 13) > 460)) {
    flowSections(pdf, "Fine print", "Terms & specifications", [...input.proposal.terms.clauses.map(clause => ({ ...clause, body: clause.id === "validity" ? `Valid until ${dateLabel(input.proposal.validUntil, true)}. ${clause.body}` : clause.body })), ...input.proposal.terms.materials.map(row => ({ title: row.area, body: row.specification }))]);
    return;
  }
  pdf.addPage(); pdf.heading("Fine print", "Terms & specifications");
  let y = 137; pdf.rule(page.left, y, page.widthInside, palette.ink);
  const clauses = input.proposal.terms.clauses;
  for (let i = 0; i < clauses.length; i += 2) {
    const pair = clauses.slice(i, i + 2).map(clause => ({ ...clause, body: clause.id === "validity" ? `This estimate is valid until ${dateLabel(input.proposal.validUntil, true)}. ${clause.body}` : clause.body }));
    const height = Math.max(...pair.map(row => 23 + measure(pdf, row.title, 232, 10, 14, "medium") + measure(pdf, row.body, 232, 8.4, 13)), 68);
    if (y + height > page.bottom) { pdf.addPage(); pdf.heading("Fine print", "Terms, continued"); y = 145; }
    pair.forEach((row, offset) => {
      const x = page.left + offset * 261;
      const titleH = pdf.text(row.title, x, y + 18, 232, 10, { font: "medium", lineHeight: 14 });
      pdf.text(row.body, x, y + 23 + titleH, 232, 8.4, { color: palette.muted, lineHeight: 13 });
    });
    y += height;
  }
  y += 24;
  const materialRows = input.proposal.terms.materials;
  const materialHeights = materialRows.map(row => Math.max(measure(pdf, row.area, 111, 8.4, 13), measure(pdf, row.specification, 147, 8.6, 13, "medium")) + 14);
  const boxHeight = Math.max(180, materialHeights.reduce((a, b) => a + b, 0) + 33);
  if (y + boxHeight > page.bottom) { pdf.addPage(); pdf.heading("Material standards", "What goes into your home"); y = 145; }
  pdf.rect(page.left, y, page.widthInside, boxHeight, palette.white, palette.rule);
  pdf.label("Material standards", 71, y + 22, 168);
  pdf.text("What goes into your home", 71, y + 44, 158, 17, { font: "heading", lineHeight: 22 });
  pdf.text("The listed standards apply unless the detailed estimate specifies otherwise. Finishes are shown to you during design.", 71, y + 77, 155, 8.2, { color: palette.muted, lineHeight: 13 });
  let rowY = y + 21;
  materialRows.forEach((row, index) => {
    pdf.text(row.area, 253, rowY + 5, 111, 8.4, { color: palette.muted, lineHeight: 13 });
    pdf.text(row.specification, 376, rowY + 5, 147, 8.6, { font: "medium", lineHeight: 13 });
    rowY += materialHeights[index];
    if (index < materialRows.length - 1) pdf.rule(253, rowY, 270);
  });
}

export function acceptance(pdf: ProposalDocument, input: Input, total: number) {
  pdf.addPage(false);
  pdf.heading("Acceptance", "Let's begin", "Signing below confirms the scope, price and payment schedule in this estimate. Our design team is assigned once the booking advance is received.");
  pdf.rule(page.left, 248, 226, palette.ink);
  pdf.rule(317, 248, 227, palette.ink);
  fitted(pdf, input.lead.clientName, page.left, 258, 226, 35, 10);
  pdf.label("Client · signature & date", page.left, 288, 226, palette.faint);
  fitted(pdf, input.proposal.signatoryName, 317, 258, 227, 35, 10);
  pdf.label(`For ${input.proposal.terms.company.name} · signature & date`, 317, 288, 227, palette.faint);
  const booking = proposalPayments(total, input.proposal.terms.paymentStages)[0];
  pdf.rect(page.left, 317, page.widthInside, 41, palette.pale);
  pdf.text(`${booking.title} (stage 01)`, 71, 332, 300, 8.6, { color: palette.gold });
  pdf.text(money(booking.amountPaise), 390, 332, 136, 10.3, { font: "medium", align: "right" });
  pdf.photo("closing-kitchen", 0, 438, 204, page.height - 438);
  pdf.rect(204, 438, page.width - 204, page.height - 438, palette.ink);
  pdf.logo(243, 481, 107);
  pdf.text("We don't just design spaces.\nWe build them, end to end.", 243, 540, 304, 20, { font: "heading", color: palette.white, lineHeight: 23 });
  const company = input.proposal.terms.company;
  const details = [["Call", company.phone], ["Email", company.email], ["Web", `${company.website} · ${company.social}`], ["Studio", company.studioAddress]];
  let y = 715;
  for (const [label, value] of details) {
    pdf.label(label, 243, y, 50, palette.goldLight);
    y += pdf.text(value, 297, y - 1, 246, 9, { color: palette.white, lineHeight: 13 }) + 8;
  }
}
