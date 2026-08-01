import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

export async function startMongoReplicaSet() {
  const replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ args: ["--setParameter", "enableTestCommands=1"] }]
  });
  await mongoose.connect(replicaSet.getUri(), { autoIndex: false });
  return {
    uri: replicaSet.getUri(),
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
