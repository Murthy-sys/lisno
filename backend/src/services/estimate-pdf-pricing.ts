import { allocateEstimatePayables } from "../domain/estimate-gst-presentation.js";
import type { EstimatePdfInput, EstimatePdfLine } from "./estimate-pdf.service.js";

export function recordedPaise(paise: number | null | undefined, rupees: number | null | undefined): number {
  const amount = paise ?? (rupees != null && rupees >= 0 ? Math.round(rupees * 100) : NaN);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError("The estimate needs a complete recorded amount.");
  return amount;
}

const indianIntegers = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export function formatPdfPaise(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new TypeError("The quotation has an invalid amount.");
  const amount = BigInt(paise), fraction = amount % 100n;
  return indianIntegers.format(amount / 100n) + (fraction ? `.${String(fraction).padStart(2, "0")}` : "");
}

export function estimatePdfTax(input: Pick<EstimatePdfInput, "subtotalPaise" | "subtotal" | "gstPaise" | "gst">) {
  return { subtotalPaise: recordedPaise(input.subtotalPaise, input.subtotal), gstPaise: recordedPaise(input.gstPaise, input.gst) };
}

/** A projected rendition carries only visible shares from the original snapshot allocation. */
export function pdfPayableAmounts(input: EstimatePdfInput, included: EstimatePdfLine[]) {
  const amounts = included.map(line => recordedPaise(line.amountPaise, line.amount));
  const allocated = input.includedPayablesPaise ?? allocateEstimatePayables(amounts, estimatePdfTax(input));
  if (allocated.length !== amounts.length || allocated.some((gross, index) => !Number.isSafeInteger(gross) || gross < amounts[index]!)) {
    throw new TypeError("The estimate has invalid tax-inclusive line amounts.");
  }
  return allocated;
}

export function vendorOnly(input: EstimatePdfInput) {
  const included = input.lineItems.filter(line => line.included);
  return included.length > 0 && included.every(line => line.pricingMode === "pmc" && line.pmcVendorPayable === true) &&
    included.reduce((sum, line) => sum + BigInt(recordedPaise(line.amountPaise, line.amount)), 0n) === BigInt(estimatePdfTax(input).subtotalPaise);
}
