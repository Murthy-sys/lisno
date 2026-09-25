const identityScope = { kind: "non_project", namespace: "identity" } as const;

export const EXPECTED_PROFILE_PHOTO_OPERATIONS = [
  { key: "PUT /auth/me/profile-photo", permission: "identity.self.profile_photo.manage", scope: identityScope, operationClass: "personal", superAdminBehavior: "self", availability: "baseline" },
  { key: "DELETE /auth/me/profile-photo", permission: "identity.self.profile_photo.manage", scope: identityScope, operationClass: "personal", superAdminBehavior: "self", availability: "baseline" },
  { key: "GET /users/:userId/profile-photo", permission: "identity.self.read", scope: identityScope, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" }
] as const;
