import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

export async function startMongoReplicaSet(databaseName?: string) {
  const replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ args: ["--setParameter", "enableTestCommands=1"] }]
  });
  const uri = databaseName
    ? replicaSet.getUri(databaseName)
    : replicaSet.getUri();
  await mongoose.connect(uri, { autoIndex: false });
  return {
    uri,
    admin: () => mongoose.connection.db!.admin(),
    async clear() {
      const collections = await mongoose.connection.db!.collections();
      await Promise.all(collections.map((collection) => collection.deleteMany({})));
    },
    async stop() {
      await mongoose.disconnect();
      await replicaSet.stop();
    }
  };
}
