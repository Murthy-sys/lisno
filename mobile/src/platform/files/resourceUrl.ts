export class InvalidResourcePathError extends Error {
  readonly code = "INVALID_RESOURCE_PATH";

  constructor(message = "The resource path is not allowed.") {
    super(message);
    this.name = "InvalidResourcePathError";
  }
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new InvalidResourcePathError("The resource path contains invalid encoding.");
  }
}

export function resolveConfiguredResourceUrl(
  apiBaseUrl: string,
  relativePath: string
): string {
  if (!apiBaseUrl.trim()) throw new InvalidResourcePathError();
  if (
    !relativePath.trim() ||
    /^[a-z][a-z\d+.-]*:/iu.test(relativePath) ||
    relativePath.startsWith("//") ||
    relativePath.includes("\\") ||
    relativePath.includes("#")
  ) {
    throw new InvalidResourcePathError();
  }

  const [rawPath, rawQuery] = relativePath.split("?", 2);
  const path = rawPath?.startsWith("/") ? rawPath : `/${rawPath ?? ""}`;
  const withoutApiPrefix = path.replace(/^\/api\/v1(?=\/|$)/iu, "") || "/";
  const decodedSegments = withoutApiPrefix.split("/").map(decodePathSegment);
  if (
    decodedSegments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\") ||
        segment.includes("\u0000")
    )
  ) {
    throw new InvalidResourcePathError();
  }

  let base: URL;
  try {
    base = new URL(apiBaseUrl);
  } catch {
    throw new InvalidResourcePathError("The configured API base is invalid.");
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new InvalidResourcePathError("The configured API base is invalid.");
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new InvalidResourcePathError("The configured API base is invalid.");
  }

  const basePath = base.pathname.replace(/\/+$/u, "");
  const url = new URL(base.toString());
  url.pathname = `${basePath}${withoutApiPrefix}`.replace(/\/{2,}/gu, "/");
  url.search = rawQuery === undefined ? "" : `?${rawQuery}`;
  url.hash = "";

  if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`)) {
    throw new InvalidResourcePathError();
  }
  return url.toString();
}
