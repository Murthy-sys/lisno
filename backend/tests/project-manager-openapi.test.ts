import { describe, expect, it } from "vitest";
import { HUMAN_JWT_OPERATION_LIST, splitHumanOperationKey } from "../src/domain/route-operations.js";
import { openApiDocument, openApiPathForRoute } from "../src/openapi.js";

type Row = Record<string, any>;
const schemas = openApiDocument.components.schemas as Row;
const paths = openApiDocument.paths as Row;
describe("Project Manager OpenAPI contract", () => {
  it("documents every PM write body explicitly and preserves bodyless notification read", () => {
    for (const operation of HUMAN_JWT_OPERATION_LIST.filter(row => row.key.includes("/pm/") || row.key.includes("/project-manager/"))) {
      const { method, path } = splitHumanOperationKey(operation.key);
      const spec = paths[openApiPathForRoute(path)][method.toLowerCase()];
      expect(spec.tags).toContain("Project Manager"); expect(spec["x-lisno-permission"]).toBe(operation.permission);
      if (method !== "GET" && !path.endsWith("/read")) expect(spec.requestBody["x-lisno-schema-completeness"]).toBe("exact");
    }
    expect(paths["/project-manager/notifications/{notificationId}/read"].post.requestBody).toBeUndefined();
  });
  it("documents bounded independent pagination with exact total and unread count", () => {
    for (const name of ["vendors", "quality", "procurement", "selections", "client", "snagging"]) {
      const parameters = paths[`/projects/{projectId}/pm/${name}`].get.parameters;
      expect(parameters.filter((item: Row) => item.name === "limit")).toHaveLength(1);
      expect(parameters.find((item: Row) => item.name === "limit").schema.maximum).toBe(100);
    }
    expect(paths["/projects/{projectId}/pm/vendors"].get.parameters.find((item: Row) => item.name === "kind").schema.enum).toContain("vendor_notice");
    expect(schemas.PMNotificationPage.required).toContain("unreadTotal");
  });
  it("keeps approval, payment and compensation policy boundaries visible", () => {
    expect(schemas.PMCertificationCreate.description).toContain("consolidated Project Manager");
    expect(schemas.PMCertificationAction.description).toContain("not proof of payout");
    expect(schemas.PMBonus.description).toContain("not_configured");
    const ranking = schemas.PMLeaderboard.properties.items.items.properties;
    expect(Object.keys(ranking).sort()).toEqual(["id", "name", "rank", "role", "score"]);
    expect(schemas.PMQualitySave.description).toContain("immutable");
    expect(schemas.PMNoticeCreate.description).toContain("atomically");
  });
  it("documents evidence as authenticated binary download and multipart 201 upload", () => {
    const download = paths["/projects/{projectId}/pm/evidence/{evidenceId}"].get;
    expect(download.responses["200"].content["video/mp4"].schema.format).toBe("binary");
    expect(download.responses["200"].content["application/json"]).toBeUndefined();
    const upload = paths["/projects/{projectId}/pm/evidence/{entityId}"].post;
    expect(upload.requestBody.content["multipart/form-data"].schema.$ref).toBe("#/components/schemas/PMEvidenceUpload");
    expect(upload.responses).toHaveProperty("201"); expect(upload.responses).toHaveProperty("413"); expect(upload.responses).toHaveProperty("415");
  });
});
