import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { executionFixture, executionPageFixture } from "../execution/executionTestFixtures";
import { VendorWorkProgressPanel } from "./VendorWorkProgressPanel";
vi.mock("../../auth/AuthProvider",() => ({ useAuth: () => ({ user:{id:"site-one",role:"site_manager"},authorization:{role:"site_manager",permissions:[]} }) }));
vi.mock("../execution/ExecutionLiveProvider",() => ({useExecutionConnection:() => "polling"}));
beforeEach(() => server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({data:executionPageFixture()}))));
describe("project execution tracker", () => {
  it("uses backend counts and keeps assignments with the same Main Line separate", async () => {
    const page = executionPageFixture([executionFixture,{...executionFixture,id:"work-two",vendorId:"vendor-two",vendorName:"Second vendor",orderNumber:"PO-200",progress:75}]);
    page.counts = {...page.counts,open:27,missing:9};
    server.use(http.get("/api/v1/projects/project-one/execution",() => HttpResponse.json({data:page})));
    renderWithQuery(<VendorWorkProgressPanel projectId="project-one" />);
    expect(await screen.findByText("Second vendor")).toBeVisible();
    expect(screen.getByText("27")).toBeVisible();expect(screen.getByText("9")).toBeVisible();
    expect(screen.getAllByRole("button",{name:/Open Oak wall panelling/})).toHaveLength(2);
    expect(screen.getByText("Refreshing every 15 seconds")).toBeVisible();
    expect(screen.queryByRole("button",{name:"Reporting schedule"})).not.toBeInTheDocument();
  });
  it("sends the exact submission id and version when the Site Manager verifies", async () => {
    const work = {...executionFixture,status:"awaiting_verification" as const,progress:100,allowedActions:["verify" as const,"request_changes" as const],submission:{id:"submission-one",version:4,note:"Installation finished",submittedAt:"2026-10-08T10:00:00Z",imageIds:[]}};
    const writes: unknown[]=[];
    server.use(http.get("/api/v1/execution/work/work-one",() => HttpResponse.json({data:work})),http.get("/api/v1/execution/work/work-one/history",() => HttpResponse.json({data:{items:[],total:0,limit:20,offset:0}})),http.post("/api/v1/projects/project-one/execution/work-one",async ({request}) => { writes.push(await request.json());return HttpResponse.json({data:{...work,version:5,allowedActions:[],status:"site_verified"}}); }));
    const user = userEvent.setup();renderWithQuery(<VendorWorkProgressPanel projectId="project-one" />);
    await user.click(await screen.findByRole("button",{name:/Open Oak wall panelling/}));
    await user.click(await screen.findByRole("button",{name:"Verify completion"}));
    await waitFor(() => expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({action:"verify",expectedVersion:4,submissionId:"submission-one"});
  });
  it("renders loading and empty states", async () => {
    server.use(http.get("/api/v1/projects/project-one/execution",() => HttpResponse.json({data:executionPageFixture([])})));
    renderWithQuery(<VendorWorkProgressPanel projectId="project-one" />);
    expect(screen.getByText("Loading Main Line assignments…")).toBeVisible();
    expect(await screen.findByText("No issued Main Line work is available here yet.")).toBeVisible();
  });
  it("renders scoped permission failure without stale project rows", async () => {
    server.use(http.get("/api/v1/projects/project-one/execution",() => HttpResponse.json({error:{code:"FORBIDDEN",message:"Denied"}},{status:403})));
    renderWithQuery(<VendorWorkProgressPanel projectId="project-one" />);
    expect(await screen.findByText("You no longer have access to this execution tracker.")).toBeVisible();
    expect(screen.queryByText("Oak wall panelling")).not.toBeInTheDocument();
  });
});
