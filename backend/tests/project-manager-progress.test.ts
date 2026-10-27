import { describe, it, expect } from "vitest";
import { approvedExecutionProgress, pmHealth, type PMProgressLine } from "../src/domain/project-manager/progress.js";
const allocation = (id: string, quantity: number, progress: number | null) => ({ id, quantity, progress, uom: "sqft", startDate: "2026-10-01", finishDate: "2026-10-10", siteVerified: false, clientAccepted: false });
const line = (id: string, netPaise: number, progress: number | null): PMProgressLine => ({ id, quantity: 100, netPaise, uom: "sqft", scope: "execution", allocations: [allocation(id,100,progress)] });
describe("approved execution progress",()=>{
 it("weights frozen approved net values and split quantities, keeping verification separate",()=>{
  const a=line("a",10000,50); a.allocations=[allocation("a1",25,100),allocation("a2",25,0)];
  const b=line("b",30000,100); b.allocations[0]!.clientAccepted=true;
  expect(approvedExecutionProgress([a,b],"approved-v1","2026-10-06")).toMatchObject({actual:81.3,planned:null,coveredLines:1,siteVerified:0,clientAccepted:1});
 });
 it("uses inclusive calendar dates and reaches 100 the next morning",()=>{
  expect(approvedExecutionProgress([line("a",100,0)],"v1","2026-10-01").planned).toBe(0);
  expect(approvedExecutionProgress([line("a",100,0)],"v1","2026-10-10").planned).toBe(90);
  expect(approvedExecutionProgress([line("a",100,0)],"v1","2026-10-11").planned).toBe(100);
 });
 it("rejects unknown progress, unknown scope, duplicate allocations and unit mismatch",()=>{
  expect(approvedExecutionProgress([line("a",100,null)],"v1","2026-10-06").actual).toBeNull();
  const unknown=line("a",100,0); unknown.scope="unknown";
  expect(approvedExecutionProgress([unknown],"v1","2026-10-06").actual).toBeNull();
  const duplicate=line("a",100,50); duplicate.allocations.push({...duplicate.allocations[0]!});
  expect(approvedExecutionProgress([duplicate],"v1","2026-10-06").actual).toBeNull();
  const unit=line("a",100,50); unit.allocations[0]!.uom="each";
  expect(approvedExecutionProgress([unit],"v1","2026-10-06").actual).toBeNull();
 });
 it("retains zero value coverage and explicit exceptions without inventing weights",()=>{
  const zero=line("zero",0,0); const excluded=line("excluded",900,0); excluded.exception="not_applicable";
  const external=line("external",100,0); external.exception="externally_fulfilled";
  expect(approvedExecutionProgress([zero,excluded,external],"v1","2026-10-06")).toMatchObject({actual:100,requiredLines:2,zeroValueLines:1});
  expect(approvedExecutionProgress([zero],"v1","2026-10-06").actual).toBeNull();
 });
 it("never calls missing inputs on track and retains observed critical precedence",()=>{
  const progress=approvedExecutionProgress([],null,"2026-10-06");
  expect(pmHealth({status:"active",critical:false,warning:false,progress,started:false,setup:true})).toBe("incomplete");
  expect(pmHealth({status:"active",critical:true,warning:false,progress,started:false,setup:true})).toBe("critical");
 });
});
