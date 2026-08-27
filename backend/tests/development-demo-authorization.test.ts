import { describe, expect, it } from "vitest";

import {
  assertDevelopmentDemoConnection,
  authorizeDevelopmentDemoStartup,
  isLoopbackRemoteAddress,
  type DevelopmentDemoAuthorization
} from "../src/development/demo-account-authorization.js";

const DEMO_URI =
  "mongodb://127.0.0.1:27017/lisno_demo?replicaSet=rs0";

const authorize = (
  runtime: { NODE_ENV?: string } = { NODE_ENV: "development" },
  mongodbUri = DEMO_URI,
  bindHost = "127.0.0.1"
) => authorizeDevelopmentDemoStartup(runtime, mongodbUri, bindHost);

describe("development demo startup authorization", () => {
  it("authorizes the resolved development runtime and exact local target", () => {
    const capability = authorize();

    expect(capability).toMatchObject({
      databaseName: "lisno_demo",
      bindHost: "127.0.0.1"
    });
  });

  it("accepts an exact bracketed IPv6 Mongo loopback host", () => {
    expect(() =>
      authorize(
        { NODE_ENV: "development" },
        "mongodb://[::1]:27017/lisno_demo"
      )
    ).not.toThrow();
  });

  it.each([
    ["production runtime", { NODE_ENV: "production" }, DEMO_URI, "127.0.0.1"],
    ["test runtime", { NODE_ENV: "test" }, DEMO_URI, "127.0.0.1"],
    ["missing runtime", {}, DEMO_URI, "127.0.0.1"],
    [
      "SRV protocol",
      { NODE_ENV: "development" },
      "mongodb+srv://127.0.0.1/lisno_demo",
      "127.0.0.1"
    ],
    [
      "multiple Mongo hosts",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017,127.0.0.1:27018/lisno_demo",
      "127.0.0.1"
    ],
    [
      "Mongo credentials",
      { NODE_ENV: "development" },
      "mongodb://demo:secret@127.0.0.1:27017/lisno_demo",
      "127.0.0.1"
    ],
    [
      "hostname alias",
      { NODE_ENV: "development" },
      "mongodb://localhost:27017/lisno_demo",
      "127.0.0.1"
    ],
    [
      "different loopback address",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.2:27017/lisno_demo",
      "127.0.0.1"
    ],
    [
      "expanded IPv6 loopback spelling",
      { NODE_ENV: "development" },
      "mongodb://[0:0:0:0:0:0:0:1]:27017/lisno_demo",
      "127.0.0.1"
    ],
    [
      "remote Mongo address",
      { NODE_ENV: "development" },
      "mongodb://192.0.2.10:27017/lisno_demo",
      "127.0.0.1"
    ],
    [
      "missing database",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017",
      "127.0.0.1"
    ],
    [
      "wrong database",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017/lisno",
      "127.0.0.1"
    ],
    [
      "encoded extra database path",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017/lisno_demo%2Farchive",
      "127.0.0.1"
    ],
    [
      "non-empty URI fragment",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017/lisno_demo#other",
      "127.0.0.1"
    ],
    [
      "empty URI fragment delimiter",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017/lisno_demo#",
      "127.0.0.1"
    ],
    [
      "malformed query percent escape",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017/lisno_demo?x=%",
      "127.0.0.1"
    ],
    [
      "truncated query percent escape",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017/lisno_demo?x=%2",
      "127.0.0.1"
    ],
    [
      "malformed path percent escape",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.1:27017/lisno_demo%",
      "127.0.0.1"
    ],
    [
      "malformed authority percent escape",
      { NODE_ENV: "development" },
      "mongodb://127.0.0.%:27017/lisno_demo",
      "127.0.0.1"
    ],
    [
      "wildcard bind host",
      { NODE_ENV: "development" },
      DEMO_URI,
      "0.0.0.0"
    ],
    [
      "hostname bind host",
      { NODE_ENV: "development" },
      DEMO_URI,
      "localhost"
    ],
    [
      "IPv6 bind host",
      { NODE_ENV: "development" },
      DEMO_URI,
      "::1"
    ]
  ])("rejects %s", (_name, runtime, mongodbUri, bindHost) => {
    expect(() => authorize(runtime, mongodbUri, bindHost)).toThrow();
  });

  it("accepts only the issued capability object for the connected demo database", () => {
    const capability = authorize();
    const connection = {};

    expect(() =>
      assertDevelopmentDemoConnection(capability, {
        connectedDatabaseName: "lisno_demo",
        defaultConnection: connection,
        userModelConnection: connection
      })
    ).not.toThrow();

    const copiedCapability = {
      ...capability
    } as DevelopmentDemoAuthorization;
    expect(() =>
      assertDevelopmentDemoConnection(copiedCapability, {
        connectedDatabaseName: "lisno_demo",
        defaultConnection: connection,
        userModelConnection: connection
      })
    ).toThrow();

    const structuralCapability = {
      databaseName: "lisno_demo",
      bindHost: "127.0.0.1"
    } as DevelopmentDemoAuthorization;
    expect(() =>
      assertDevelopmentDemoConnection(structuralCapability, {
        connectedDatabaseName: "lisno_demo",
        defaultConnection: connection,
        userModelConnection: connection
      })
    ).toThrow();
  });

  it("rejects a connected database name that differs from the issued database", () => {
    const capability = authorize();
    const connection = {};

    expect(() =>
      assertDevelopmentDemoConnection(capability, {
        connectedDatabaseName: "lisno",
        defaultConnection: connection,
        userModelConnection: connection
      })
    ).toThrow();
  });

  it("rejects a User model owned by a different connection object", () => {
    expect(() =>
      assertDevelopmentDemoConnection(authorize(), {
        connectedDatabaseName: "lisno_demo",
        defaultConnection: {},
        userModelConnection: {}
      })
    ).toThrow();
  });
});

describe("direct socket loopback detection", () => {
  it.each([
    "127.0.0.1",
    "127.42.10.8",
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1"
  ])("accepts loopback address %s", (address) => {
    expect(isLoopbackRemoteAddress(address)).toBe(true);
  });

  it.each([
    ["remote IPv4", "192.0.2.10"],
    ["remote IPv6", "2001:db8::1"],
    ["missing", undefined],
    ["null", null],
    ["zone-suffixed", "::1%lo0"],
    ["malformed", "127.0.0.999"],
    ["hostname", "localhost"],
    ["spoofed forwarding chain", "192.0.2.10, 127.0.0.1"]
  ])("rejects %s remote-address input", (_name, address) => {
    expect(isLoopbackRemoteAddress(address)).toBe(false);
  });
});
