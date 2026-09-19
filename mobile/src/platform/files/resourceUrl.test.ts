import { InvalidResourcePathError, resolveConfiguredResourceUrl } from "./resourceUrl";

describe("configured resource URLs", () => {
  const base = "https://api.example.test/api/v1";

  it("keeps requests relative to the configured versioned API base", () => {
    expect(resolveConfiguredResourceUrl(base, "/projects/p-1/document?download=1")).toBe(
      "https://api.example.test/api/v1/projects/p-1/document?download=1"
    );
    expect(resolveConfiguredResourceUrl(base, "/api/v1/projects/p-1/document")).toBe(
      "https://api.example.test/api/v1/projects/p-1/document"
    );
  });

  it.each([
    "https://evil.example/file",
    "//evil.example/file",
    "/../admin",
    "/%2e%2e/admin",
    "/projects/%2F%2Fevil.example/file",
    "/projects\\escape",
    "/projects/file#secret"
  ])("rejects host replacement or traversal path %s", (path) => {
    expect(() => resolveConfiguredResourceUrl(base, path)).toThrow(
      InvalidResourcePathError
    );
  });
});
