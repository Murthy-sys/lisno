import { ProposalDocument, page, palette } from "./document.js";
import { money, sectionLetter, type ProposalGroup } from "./content.js";

const cols = { number: 51, item: 75, unit: 343, quantity: 387, rate: 424, amount: 486 };
const descriptionWidth = 255;

/** Each row is measured before drawing. Oversized descriptions continue on fresh
 * pages with the row's money printed once, preserving searchable original text. */
export function details(pdf: ProposalDocument, groups: ProposalGroup[]) {
  let y = 0, pageIndex = 0;
  const newPage = () => {
    pdf.addPage();
    pdf.label("Estimate", page.left, 53);
    pdf.text(pageIndex++ ? "Detailed estimate, continued" : "Detailed estimate", page.left, 71, page.widthInside, 20, { font: "heading", lineHeight: 24 });
    pdf.text("Itemised scope, quantities and recorded prices. All amounts are in Indian rupees, excluding GST.", page.left, 101, page.widthInside, 8.5, { color: palette.muted, lineHeight: 13 });
    y = 128;
  };
  const groupHeader = (group: ProposalGroup, index: number, continued: boolean) => {
    const title = `${group.title}${continued ? " (continued)" : ""}`;
    const titleLines = pdf.lines(title, 387, 12, "medium");
    const amountHeight = pdf.lines(money(group.amountPaise, false), 69, 10, "medium").length * 14;
    const height = Math.max(25, titleLines.length * 15 + 10, amountHeight + 12);
    pdf.rect(page.left, y, 23, 23, palette.ink);
    pdf.text(sectionLetter(index), page.left, y + 6, 23, 8.3, { font: "medium", color: palette.white, align: "center" });
    pdf.text(title, 84, y + 3, 387, 12, { font: "medium", lineHeight: 15 });
    pdf.text(money(group.amountPaise, false), 475, y + 5, 69, 10, { font: "medium", align: "right", lineHeight: 14 });
    y += height;
    pdf.rule(page.left, y, page.widthInside, palette.ink);
    [ ["#", cols.number, 18], ["ITEM / DESCRIPTION", cols.item, descriptionWidth], ["UNIT", cols.unit, 35], ["QTY", cols.quantity, 28], ["RATE", cols.rate, 51], ["AMOUNT", cols.amount, 58] ].forEach(([label,x,width]) => pdf.text(String(label), Number(x), y + 8, Number(width), 6.2, { color: palette.faint, spacing: .8, align: label === "QTY" || label === "RATE" || label === "AMOUNT" ? "right" : "left" }));
    y += 22; pdf.rule(page.left, y, page.widthInside);
  };
  newPage();
  if (!groups.length) { pdf.text("No selected item details are available in this view.", page.left, y + 15, page.widthInside, 10, { color: palette.muted }); return; }
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const headerHeight = Math.max(25, pdf.lines(group.title, 387, 12, "medium").length * 15 + 10, pdf.lines(money(group.amountPaise, false), 69, 10, "medium").length * 14 + 12);
    if (y + headerHeight + 22 + 42 > page.bottom) newPage();
    groupHeader(group, gi, false);
    for (let ri = 0; ri < group.lines.length; ri++) {
      const row = group.lines[ri];
      const title = pdf.lines(row.title, descriptionWidth, 8.7, "medium");
      const description = row.description ? pdf.lines(row.description, descriptionWidth, 7.3) : [];
      const body = [...title.map(text => ({ text, title: true })), ...description.map(text => ({ text, title: false }))];
      const numeric = [ [row.unit, cols.unit, 35], [row.quantity, cols.quantity, 28], [row.rate, cols.rate, 51], [money(row.amountPaise, false), cols.amount, 58] ] as const;
      const numericHeight = Math.max(...numeric.map(([text,,width]) => pdf.lines(text, width, 8.1).length * 11));
      const rowHeight = Math.max(30, body.length * 9.5 + 12, numericHeight + 12);
      if (rowHeight <= 510 && y + rowHeight > page.bottom || y + 42 > page.bottom) { newPage(); groupHeader(group, gi, true); }
      let remaining = body, first = true;
      while (remaining.length) {
        const capacity = Math.max(1, Math.floor((page.bottom - y - 12) / 9.5));
        const take = remaining.slice(0, capacity);
        const height = Math.max(first ? numericHeight + 12 : 0, take.length * 9.5 + 12, 30);
        pdf.text(first ? String(ri + 1).padStart(2, "0") : "cont.", cols.number, y + 10, 20, 6.3, { color: palette.faint });
        take.forEach((line, i) => pdf.line(line.text, cols.item, y + 7 + i * 9.5, descriptionWidth, line.title ? 8.7 : 7.3, { font: line.title ? "medium" : "body", color: line.title ? palette.ink : palette.muted }));
        if (first) numeric.forEach(([text,x,width], index) => pdf.text(text, x, y + 10, width, 8.1, { align: index ? "right" : "left", font: index === 3 ? "medium" : "body", lineHeight: 11 }));
        y += height; pdf.rule(page.left, y, page.widthInside);
        remaining = remaining.slice(take.length); first = false;
        if (remaining.length) { newPage(); groupHeader(group, gi, true); }
      }
    }
    y += 20;
  }
}
