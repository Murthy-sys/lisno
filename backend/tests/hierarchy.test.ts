import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { Role } from "../src/contracts/domain.js";
import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { SeedData, UserRecord } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const JWT_SECRET = "hierarchy-test-secret-with-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };

const users = {
  designer: ["user-designer-ananya", "designer"],
  manager: ["user-manager-aarav", "design_manager"],
  head: ["user-head", "design_head"]
} as const satisfies Record<string, readonly [string, Role]>;

function bearer([id, role]: readonly [string, Role]) {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

function manager(overrides: Partial<UserRecord>): UserRecord {
  return {
    ...structuredClone(demoSeedData.users[1]!),
    id: "user-manager-extra",
    name: "Zoey Patel",
    email: "zoey@lisno.example",
    emailNormalized: "zoey@lisno.example",
    mobile: null,
    role: "design_manager",
    active: true,
    managerId: null,
    ...overrides
  };
}

function setup(seed: SeedData = demoSeedData) {
  const repository = createMemoryRepository(structuredClone(seed));
  return createApp({ repository, auth });
}

describe("active manager directory", () => {
  it("is available only to designers", async () => {
    const app = setup();

    await request(app)
      .get("/api/v1/organization/managers")
      .set("Authorization", bearer(users.designer))
      .expect(200);
    await request(app)
      .get("/api/v1/organization/managers")
      .set("Authorization", bearer(users.manager))
      .expect(403);
    await request(app)
      .get("/api/v1/organization/managers")
      .set("Authorization", bearer(users.head))
      .expect(403);
  });

  it("searches active managers case-insensitively by name and email", async () => {
    const seed = structuredClone(demoSeedData);
    seed.users.push(
      manager({
        id: "user-manager-maya",
        name: "Maya Bose",
        email: "maya.bose@example.test",
        emailNormalized: "maya.bose@example.test",
        mobile: "+91 99887 76655"
      }),
      manager({
        id: "user-manager-inactive",
        name: "Maya Hidden",
        email: "hidden.maya@example.test",
        emailNormalized: "hidden.maya@example.test",
        active: false
      })
    );
    const app = setup(seed);

    const byName = await request(app)
      .get("/api/v1/organization/managers?search=mAyA")
      .set("Authorization", bearer(users.designer));
    const byEmail = await request(app)
      .get("/api/v1/organization/managers?search=BOSE%40EXAMPLE")
      .set("Authorization", bearer(users.designer));

    expect(byName.body.data.items).toEqual([
      {
        id: "user-manager-maya",
        name: "Maya Bose",
        email: "maya.bose@example.test",
        mobile: "+91 99887 76655"
      }
    ]);
    expect(byEmail.body.data.items).toEqual(byName.body.data.items);
  });

  it("returns a deterministically ordered, paginated public projection", async () => {
    const seed = structuredClone(demoSeedData);
    seed.users.push(
      manager({ id: "manager-z", name: "Zed", email: "zed@example.test" }),
      manager({ id: "manager-a", name: "Aardvark", email: "a@example.test" })
    );
    const app = setup(seed);

    const response = await request(app)
      .get("/api/v1/organization/managers?limit=2&offset=1")
      .set("Authorization", bearer(users.designer))
      .expect(200);

    expect(response.body.data).toEqual({
      items: [
        { id: "user-manager-aarav", name: "Aarav Mehta", email: "aarav@lisno.example" },
        { id: "user-manager-meera", name: "Meera Iyer", email: "meera@lisno.example" }
      ],
      pagination: { limit: 2, offset: 1, total: 4, hasMore: true }
    });
    for (const item of response.body.data.items) {
      expect(item).not.toHaveProperty("passwordHash");
      expect(item).not.toHaveProperty("active");
      expect(item).not.toHaveProperty("role");
      expect(item).not.toHaveProperty("managerId");
    }
  });

  it("enforces a maximum manager directory page size", async () => {
    const app = setup();

    const response = await request(app)
      .get("/api/v1/organization/managers?limit=51")
      .set("Authorization", bearer(users.designer));

    expect(response.status).toBe(400);
  });
});
