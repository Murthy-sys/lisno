import {
  EnvironmentConfigurationError,
  resolveEnvironmentConfiguration,
  resolveEnvironmentProfile,
  resolveEnvironmentUrl
} from "./environment";
import { EnvironmentManager } from "./environmentManager";

describe("environment configuration", () => {
  it.each([
    ["https://api.example.test", "https://api.example.test/api/v1"],
    ["https://api.example.test/", "https://api.example.test/api/v1"],
    ["https://api.example.test/api/v1", "https://api.example.test/api/v1"],
    [
      "https://api.example.test/api/v1/api/v1/",
      "https://api.example.test/api/v1"
    ]
  ])("normalizes %s to one versioned API base", (input, expected) => {
    expect(resolveEnvironmentUrl("remote", input).apiBaseUrl).toBe(expected);
  });

  it("defaults an absent or blank selector to Remote and rejects unsupported values", () => {
    expect(resolveEnvironmentProfile(undefined)).toBe("remote");
    expect(resolveEnvironmentProfile("  ")).toBe("remote");
    expect(resolveEnvironmentProfile("local")).toBe("local");
    expect(() => resolveEnvironmentProfile("staging")).toThrow(
      "EXPO_PUBLIC_API_ENV"
    );
  });

  it("rejects missing or placeholder selected Remote configuration", () => {
    expect(() => resolveEnvironmentConfiguration({})).toThrow(
      new EnvironmentConfigurationError(
        "EXPO_PUBLIC_REMOTE_API_URL is required when EXPO_PUBLIC_API_ENV=remote.",
        "remote"
      )
    );
    expect(() =>
      resolveEnvironmentUrl("remote", "https://api.example.invalid/api/v1")
    ).toThrow("deployed HTTPS host");
    expect(() => resolveEnvironmentUrl("remote", "http://api.example.test")).toThrow(
      "must use HTTPS"
    );
    expect(() =>
      resolveEnvironmentUrl("remote", "https://127.0.0.2")
    ).toThrow("deployed HTTPS host");
    expect(() =>
      resolveEnvironmentUrl("remote", "https://[::1]")
    ).toThrow("deployed HTTPS host");
    expect(() =>
      resolveEnvironmentUrl("remote", "https://[::ffff:127.0.0.1]")
    ).toThrow("deployed HTTPS host");
    expect(resolveEnvironmentUrl("remote", "https://127.example.test").host).toBe(
      "127.example.test"
    );
  });

  it("validates only the selected environment URL", () => {
    const remote = resolveEnvironmentConfiguration({
      selector: "remote",
      remoteUrl: "https://api.example.test",
      localUrl: "not a URL"
    });
    expect(remote).toMatchObject({
      selectedProfile: "remote",
      active: { profile: "remote", apiBaseUrl: "https://api.example.test/api/v1" }
    });

    const local = resolveEnvironmentConfiguration({
      selector: "local",
      localUrl: "http://10.0.2.2:3000",
      allowLocalHttp: true
    });
    expect(local).toMatchObject({
      selectedProfile: "local",
      active: { profile: "local", apiBaseUrl: "http://10.0.2.2:3000/api/v1" }
    });
  });

  it("names the selected URL variable when it is missing", () => {
    expect(() =>
      resolveEnvironmentConfiguration({ selector: "local", allowLocalHttp: true })
    ).toThrow("EXPO_PUBLIC_LOCAL_API_URL");
  });

  it("gates cleartext Local configuration to explicitly enabled builds", () => {
    expect(() =>
      resolveEnvironmentUrl("local", "http://10.0.2.2:3000")
    ).toThrow("LISNO_ALLOW_LOCAL_HTTP=1");
    expect(
      resolveEnvironmentUrl("local", "http://10.0.2.2:3000", {
        allowLocalHttp: true
      }).apiBaseUrl
    ).toBe("http://10.0.2.2:3000/api/v1");
  });

  it("rejects credentials, query strings, fragments, and host replacement inputs", () => {
    expect(() =>
      resolveEnvironmentUrl("remote", "https://user:pass@api.example.test")
    ).toThrow("cannot contain credentials");
    expect(() =>
      resolveEnvironmentUrl("remote", "https://api.example.test?tenant=other")
    ).toThrow("cannot contain credentials");
  });

  it("rejects Local selection in production without validating Remote first", () => {
    expect(() =>
      resolveEnvironmentConfiguration({
        selector: "local",
        localUrl: "https://local.example.test",
        production: true
      })
    ).toThrow("Production builds require EXPO_PUBLIC_API_ENV=remote");
  });

  it("exposes one immutable active environment snapshot", () => {
    const configuration = resolveEnvironmentConfiguration({
      remoteUrl: "https://api.example.test"
    });
    const manager = new EnvironmentManager(configuration.active);
    const snapshot = manager.getSnapshot();

    expect(snapshot).toEqual({
      environment: configuration.active,
      generation: 0,
      status: "ready"
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.active)).toBe(true);
  });
});
