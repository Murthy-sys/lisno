/** Mongo counterpart of estimateTotalsReconcile for approved finance snapshots. */
export function financeTotalsReconcileExpression(subtotal: string, gst: string, total: string, roundOff: string): Record<string, unknown> {
  return { $cond: [
    { $eq: [{ $type: roundOff }, "missing"] },
    { $eq: [{ $add: [subtotal, gst] }, total] },
    { $cond: [
      { $isNumber: roundOff },
      { $and: [
        { $gte: [roundOff, -50] }, { $lte: [roundOff, 49] },
        { $eq: [roundOff, { $trunc: roundOff }] },
        { $eq: [{ $add: [subtotal, gst, roundOff] }, total] },
        { $eq: [{ $mod: [total, 100] }, 0] }
      ] },
      false
    ] }
  ] };
}

/** Absence is part of the immutable approval lineage, and differs from explicit zero. */
export function financeRoundOffMatchesExpression(actual: string, expected: string): Record<string, unknown> {
  return { $cond: [
    { $eq: [{ $type: expected }, "missing"] },
    { $eq: [{ $type: actual }, "missing"] },
    { $eq: [actual, expected] }
  ] };
}

/** A legacy effective revision must not inherit the initial revision's adjustment. */
export function effectiveFinanceBaselineExpression(bucket: string, effective: string): Record<string, unknown> {
  return { $cond: [
    { $eq: [{ $type: effective }, "object"] },
    { $mergeObjects: [
      { $arrayToObject: { $filter: { input: { $objectToArray: bucket }, as: "field", cond: { $ne: ["$$field.k", "approvedRoundOffPaise"] } } } },
      effective
    ] },
    bucket
  ] };
}
