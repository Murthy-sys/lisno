type RecordedEstimateTax = { subtotalPaise: number; gstPaise: number };

const rate = 18n, percentage = 100n;

/** Unit rates use the current estimate tax, rounded to the nearest paise. */
export function estimatePriceIncludingGst(netPaise: number | null | undefined): number | null {
  if (typeof netPaise !== "number" || !Number.isSafeInteger(netPaise) || netPaise < 0) return null;
  const net = BigInt(netPaise);
  const gross = net + (net * rate + percentage / 2n) / percentage;
  return gross <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(gross) : null;
}

function checkedAmount(amount: number): bigint {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError("Invalid estimate amount in paise.");
  return BigInt(amount);
}

/** Allocate the rounded estimate tax in source order so displayed lines sum to the recorded gross. */
export function allocateEstimatePayables(netAmountsPaise: readonly number[], recorded?: RecordedEstimateTax): number[] {
  let numerator = rate, denominator = percentage;
  if (recorded) {
    const net = checkedAmount(recorded.subtotalPaise), tax = checkedAmount(recorded.gstPaise);
    if ((net * numerator + denominator / 2n) / denominator !== tax) {
      if (net === 0n) throw new RangeError("Tax on an empty estimate cannot be allocated.");
      numerator = tax;
      denominator = net;
    }
  }
  let cumulativeNet = 0n, previousTax = 0n;
  return netAmountsPaise.map(amount => {
    const net = checkedAmount(amount);
    cumulativeNet += net;
    const tax = (cumulativeNet * numerator + denominator / 2n) / denominator;
    const payable = net + tax - previousTax;
    if (payable > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Tax-inclusive amount exceeds the supported range.");
    previousTax = tax;
    return Number(payable);
  });
}
