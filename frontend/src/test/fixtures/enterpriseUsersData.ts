// Synthetic records reused from features/admin/UserDirectoryPage.test.tsx. No runtime test imports.
export const admin = {
  id: "user-admin-meera",
  name: "Meera Admin",
  email: "meera@lisno.example",
  role: "admin" as const
};

export const superAdmin = {
  id: "user-super-admin",
  name: "Sana Super Admin",
  email: "sana@lisno.example",
  role: "super_admin" as const
};

export const designer = {
  id: "user-designer-arun",
  name: "Arun Patel",
  email: "arun@lisno.example",
  role: "designer" as const,
  active: true,
  version: 3,
  title: "Senior Designer",
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z"
};

export const directoryRows = [
  {
    ...superAdmin,
    active: true,
    version: 1,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z"
  },
  {
    ...admin,
    active: true,
    version: 2,
    createdAt: "2026-06-02T09:00:00.000Z",
    updatedAt: "2026-08-02T09:00:00.000Z"
  },
  designer,
  {
    id: "user-client-maya",
    name: "Maya Client",
    email: "maya@client.example",
    role: "client" as const,
    active: true,
    version: 2,
    createdAt: "2026-06-04T09:00:00.000Z",
    updatedAt: "2026-08-04T09:00:00.000Z"
  }
];
