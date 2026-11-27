import {describe,it,expect} from "vitest";
import {lcDate,lcDigest,lcLocalDate,lcAddDays,lcPolicy,lcSum} from "../src/domain/procurement-lifecycle.js";
describe("procurement lifecycle boundaries",()=>{
  it("validates real calendar dates and preserves local dates at UTC boundaries",()=>{
    expect(lcDate.safeParse("2026-02-29").success).toBe(false);
    expect(lcDate.safeParse("2028-02-29").success).toBe(true);
    expect(lcLocalDate(new Date("2026-11-27T19:00:00Z"),"Asia/Kolkata")).toBe("2026-11-28");
    expect(lcAddDays("2026-12-31",1)).toBe("2027-01-01");
    expect(lcPolicy.safeParse({timezone:"invalid",reviewIntervalDays:7,inspectionCount:2}).success).toBe(false);
    expect(lcPolicy.safeParse({timezone:"Asia/Kolkata",reviewIntervalDays:8,inspectionCount:2}).success).toBe(false);
  });
  it("hashes equivalent command objects deterministically without ignoring changed arrays",()=>{
    expect(lcDigest({a:1,b:{d:2,c:3}})).toBe(lcDigest({b:{c:3,d:2},a:1}));
    expect(lcDigest({items:[1,2]})).not.toBe(lcDigest({items:[2,1]}));
  });
  it("rejects unsafe money instead of rounding or overflowing",()=>{
    expect(lcSum([980000,624750])).toBe(1604750);
    expect(()=>lcSum([0.5])).toThrow();expect(()=>lcSum([Number.MAX_SAFE_INTEGER,1])).toThrow();expect(()=>lcSum([-1])).toThrow();
  });
});
