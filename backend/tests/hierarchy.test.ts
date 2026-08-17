import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { Role } from "../src/contracts/domain.js";
import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository, SeedData, UserRecord } from "../src/repositories/types.js";
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
        { id: "manager-a", name: "Aardvark", email: "a@example.test" },
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

  it("applies manager directory defaults and coerces numeric pagination", async () => {
    const app = setup();
    const defaults = await request(app)
      .get("/api/v1/organization/managers")
      .set("Authorization", bearer(users.designer))
      .expect(200);
    const coerced = await request(app)
      .get("/api/v1/organization/managers?limit=1&offset=1")
      .set("Authorization", bearer(users.designer))
      .expect(200);

    expect(defaults.body.data.pagination).toMatchObject({ limit: 20, offset: 0 });
    expect(coerced.body.data.pagination).toMatchObject({ limit: 1, offset: 1 });
  });

  it.each([
    ["unknown query keys", "search=&unknown=true", "unknown"],
    ["a negative offset", "offset=-1", "offset"]
  ])("rejects %s", async (_label, query, field) => {
    const response = await request(setup())
      .get(`/api/v1/organization/managers?${query}`)
      .set("Authorization", bearer(users.designer));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { [field]: expect.any(String) }
    });
  });
});

describe("Organization KPI and Evaluation operations", () => {
  it("uses pageActiveDesigners for a Super Admin global team", async () => {
    const seed = structuredClone(demoSeedData);
    seed.users.push(manager({
      id: "user-super-admin",
      name: "Super Admin",
      email: "super-admin@lisno.example",
      emailNormalized: "super-admin@lisno.example",
      role: "super_admin"
    }));
    const base = createMemoryRepository(seed);
    let activeDesignerPages = 0;
    let managerDesignerPages = 0;
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        if (property === "pageActiveDesigners") {
          return async (pagination: { limit: number; offset: number }) => {
            activeDesignerPages += 1;
            const designers = (await target.listUsers())
              .filter((candidate) => candidate.active && candidate.role === "designer")
              .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
            return {
              items: designers.slice(pagination.offset, pagination.offset + pagination.limit),
              total: designers.length
            };
          };
        }
        if (property === "pageDesignersForManager") {
          return async (...args: Parameters<AppRepository["pageDesignersForManager"]>) => {
            managerDesignerPages += 1;
            return target.pageDesignersForManager(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const app = createApp({ repository, auth });

    const response = await request(app)
      .get("/api/v1/organization/team?limit=20&offset=0")
      .set("Authorization", bearer(["user-super-admin", "super_admin"]));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(4);
    expect(activeDesignerPages).toBe(1);
    expect(managerDesignerPages).toBe(0);
  });
});
