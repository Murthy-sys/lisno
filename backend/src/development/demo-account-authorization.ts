import { isIP } from "node:net";

const DEVELOPMENT_DATABASE_NAME = "lisno_demo" as const;
const DEVELOPMENT_BIND_HOST = "127.0.0.1" as const;
const capabilityMarker = Symbol("development-demo-authorization");

interface IssuedFacts {
  readonly databaseName: typeof DEVELOPMENT_DATABASE_NAME;
  readonly bindHost: typeof DEVELOPMENT_BIND_HOST;
}

const issuedCapabilities = new WeakMap<object, IssuedFacts>();

export type DevelopmentDemoAuthorization = Readonly<{
  databaseName: typeof DEVELOPMENT_DATABASE_NAME;
  bindHost: typeof DEVELOPMENT_BIND_HOST;
}> & { readonly __developmentDemoAuthorization: never };

export interface DevelopmentDemoConnectionContext {
  readonly connectedDatabaseName: string;
  readonly defaultConnection: object;
  readonly userModelConnection: object;
}

export function authorizeDevelopmentDemoStartup(
  runtime: { readonly NODE_ENV?: string },
  mongodbUri: string,
  bindHost: string
): DevelopmentDemoAuthorization {
  if (runtime.NODE_ENV !== "development") denyAuthorization();
  if (bindHost !== DEVELOPMENT_BIND_HOST) denyAuthorization();

  validateMongoTarget(mongodbUri);

  const capability = Object.freeze({
    databaseName: DEVELOPMENT_DATABASE_NAME,
    bindHost: DEVELOPMENT_BIND_HOST,
    [capabilityMarker]: true
  });
  issuedCapabilities.set(
    capability,
    Object.freeze({
      databaseName: DEVELOPMENT_DATABASE_NAME,
      bindHost: DEVELOPMENT_BIND_HOST
    })
  );
  return capability as unknown as DevelopmentDemoAuthorization;
}

export function assertDevelopmentDemoConnection(
  capability: DevelopmentDemoAuthorization,
  context: DevelopmentDemoConnectionContext
): void {
  const candidate = capability as unknown;
  if (typeof candidate !== "object" || candidate === null) {
    denyAuthorization();
  }

  const issuedFacts = issuedCapabilities.get(candidate);
  const markedCapability = candidate as Record<PropertyKey, unknown>;
  if (
    !issuedFacts ||
    markedCapability[capabilityMarker] !== true ||
    markedCapability.databaseName !== issuedFacts.databaseName ||
    markedCapability.bindHost !== issuedFacts.bindHost ||
    issuedFacts.databaseName !== DEVELOPMENT_DATABASE_NAME ||
    issuedFacts.bindHost !== DEVELOPMENT_BIND_HOST ||
    context.connectedDatabaseName !== issuedFacts.databaseName ||
    typeof context.defaultConnection !== "object" ||
    context.defaultConnection === null ||
    context.defaultConnection !== context.userModelConnection
  ) {
    denyAuthorization();
  }
}

export function isLoopbackRemoteAddress(
  value: string | null | undefined
): boolean {
  if (!value || value.includes("%")) return false;

  const ipv4 = parseIpv4(value);
  if (ipv4) return ipv4[0] === 127;

  const ipv6 = parseIpv6(value);
  if (!ipv6) return false;

  const isIpv6Loopback =
    ipv6.slice(0, 7).every((part) => part === 0) && ipv6[7] === 1;
  const isMappedIpv4Loopback =
    ipv6.slice(0, 5).every((part) => part === 0) &&
    ipv6[5] === 0xffff &&
    ipv6[6] >>> 8 === 127;

  return isIpv6Loopback || isMappedIpv4Loopback;
}

function validateMongoTarget(mongodbUri: string): void {
  const rawAuthority = /^mongodb:\/\/([^/?#]*)/.exec(mongodbUri)?.[1];
  if (
    !rawAuthority ||
    !/^(?:127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(rawAuthority)
  ) {
    denyAuthorization();
  }

  let target: URL;
  try {
    target = new URL(mongodbUri);
  } catch {
    denyAuthorization();
  }

  if (
    target.protocol !== "mongodb:" ||
    !["127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.username !== "" ||
    target.password !== "" ||
    target.hash !== ""
  ) {
    denyAuthorization();
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(target.pathname.slice(1));
  } catch {
    denyAuthorization();
  }
  if (databaseName !== DEVELOPMENT_DATABASE_NAME) denyAuthorization();
}

function parseIpv4(value: string): readonly number[] | undefined {
  if (isIP(value) !== 4) return undefined;
  return value.split(".").map(Number);
}

function parseIpv6(value: string): readonly number[] | undefined {
  if (isIP(value) !== 6) return undefined;

  let normalized = value.toLowerCase();
  if (normalized.includes(".")) {
    const finalColon = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4(normalized.slice(finalColon + 1));
    if (!ipv4) return undefined;
    normalized = `${normalized.slice(0, finalColon + 1)}${(
      (ipv4[0] << 8) |
      ipv4[1]
    ).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const omittedParts = 8 - left.length - right.length;
  if (
    (halves.length === 1 && omittedParts !== 0) ||
    (halves.length === 2 && omittedParts < 1)
  ) {
    return undefined;
  }

  return [
    ...left.map((part) => Number.parseInt(part, 16)),
    ...Array.from({ length: omittedParts }, () => 0),
    ...right.map((part) => Number.parseInt(part, 16))
  ];
}

function denyAuthorization(): never {
  throw new Error("Development demo startup is not authorized.");
}
