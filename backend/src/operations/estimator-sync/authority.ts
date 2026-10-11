import { mongo } from "mongoose";
import { hash } from "./canonical.js";
import { SyncError } from "./contracts.js";

export function validateTargetUri(uri: string): void {
  let url: URL;
  try { url = new URL(uri); } catch { throw new SyncError("TARGET_NOT_ALLOWED"); }
  if (url.protocol !== "mongodb:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/lisno_demo" || url.hash || url.host.includes(",") ||
    url.searchParams.getAll("directConnection").some(value => value !== "true") ||
    url.searchParams.has("loadBalanced") || url.searchParams.has("srvServiceName") ||
    url.searchParams.getAll("readPreference").some(value => value !== "primary")) {
    throw new SyncError("TARGET_NOT_ALLOWED");
  }
}

export function connectionIdentity(uri: string): string {
  // Parsing through the driver supports SRV/multiple source hosts without exposing secrets.
  try {
    const client = new mongo.MongoClient(uri);
    const options = client.options;
    return hash({ hosts: options.srvHost ?? options.hosts.map(host => host.toString()).sort(), database: options.dbName, replicaSet: options.replicaSet ?? null });
  } catch { throw new SyncError("INVALID_CONNECTION_CONFIGURATION"); }
}

export function createTargetClient(uri: string): mongo.MongoClient {
  validateTargetUri(uri);
  try {
    // Refuse server discovery redirects: the only effective server is the allowlisted loopback endpoint.
    return new mongo.MongoClient(uri, { directConnection: true, readPreference: "primary", appName: "lisno-estimator-local-sync", serverSelectionTimeoutMS: 10_000 });
  } catch { throw new SyncError("INVALID_TARGET_CONFIGURATION"); }
}

export async function assertTargetTopology(client: mongo.MongoClient): Promise<void> {
  if (client.options.dbName !== "lisno_demo" || client.options.directConnection !== true ||
    client.options.hosts.length !== 1 || !["127.0.0.1", "localhost", "::1"].includes(client.options.hosts[0].host ?? "")) throw new SyncError("TARGET_NOT_ALLOWED");
  const hello = await client.db("admin").command({ hello: 1 });
  if (!hello.setName || hello.isWritablePrimary !== true || hello.maxWireVersion < 13) throw new SyncError("TARGET_REPLICA_SET_REQUIRED");
}
