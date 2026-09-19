import { createIdempotencyKey, parseInrToPaise } from "./money";

describe("finance money boundary", () => {
  it.each([
    ["1", 100],
    ["1.2", 120],
    ["1.20", 120],
    ["250000.09", 25_000_009]
  ])("converts %s INR to integer paise once", (input, expected) => {
    expect(parseInrToPaise(input)).toBe(expected);
  });

  it.each(["", "0", "-1", "1.234", "1,000", "abc", " 0.00 "])("rejects invalid amount %s", (input) => {
    expect(parseInrToPaise(input)).toBeNull();
  });

  it("creates a stable-length request identity", () => {
    expect(createIdempotencyKey(1_700_000_000_000, 0.25)).toMatch(/^mobile-[a-z0-9]+-[a-z0-9]{8,}$/);
  });
});
