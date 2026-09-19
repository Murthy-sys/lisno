export function splitStableIds(value: string, requiredId?: string): readonly string[] {
  const values = value.split(/[\s,]+/u).map((item) => item.trim()).filter(Boolean);
  if (requiredId) values.unshift(requiredId);
  return Object.freeze([...new Set(values)]);
}

export function validSchedule(start: string, end: string): boolean {
  const first = new Date(start);
  const last = new Date(end);
  return !Number.isNaN(first.getTime()) && !Number.isNaN(last.getTime()) && last >= first;
}

export function validBudgetRange(minimum: string, maximum: string): boolean {
  const min = Number(minimum);
  const max = Number(maximum);
  return Number.isFinite(min) && min >= 0 && Number.isFinite(max) && max >= min;
}
