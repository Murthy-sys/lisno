import "dotenv/config";

import mongoose from "mongoose";

import { loadDevelopmentEnvironment } from "../src/config/development-env.js";
import { UserModel } from "../src/models/User.js";

const env = loadDevelopmentEnvironment();
await mongoose.connect(env.MONGODB_URI);
try {
  const result = await UserModel.updateOne(
    { emailNormalized: "sales@lisno.example" },
    {
      $setOnInsert: {
        _id: "user-estimator-sales",
        name: "Priya Sharma",
        email: "sales@lisno.example",
        emailNormalized: "sales@lisno.example",
        mobile: null,
        address: null,
        passwordHash:
          "$2b$10$7EqJtq98hPqEX7fNZaFWoOhqP8D5iEyOH6v9mJEkjEBlrptHw28.O",
        role: "estimator_sales",
        active: true,
        managerId: null,
        authorizedClientIds: [],
        title: "Estimator / Sales"
      }
    },
    { upsert: true }
  );
  process.stdout.write(
    `${result.upsertedCount === 1 ? "ESTIMATOR_SALES_CREATED" : "ESTIMATOR_SALES_ALREADY_PRESENT"}\n`
  );
} finally {
  await mongoose.disconnect();
}
