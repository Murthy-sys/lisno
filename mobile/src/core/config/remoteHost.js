"use strict";

function isDisallowedRemoteHost(hostname) {
  const lower = hostname.toLowerCase();
  const canonical =
    lower.startsWith("[") && lower.endsWith("]")
      ? lower.slice(1, -1)
      : lower;
  const ipv4Loopback = /^127(?:\.\d{1,3}){3}$/u.test(canonical);
  const mappedIpv4Loopback = /^::ffff:7f[0-9a-f]{2}:/u.test(canonical);

  return (
    canonical === "localhost" ||
    ipv4Loopback ||
    mappedIpv4Loopback ||
    canonical === "0.0.0.0" ||
    canonical === "::1" ||
    canonical.endsWith(".localhost") ||
    canonical.endsWith(".invalid")
  );
}

module.exports = { isDisallowedRemoteHost };
