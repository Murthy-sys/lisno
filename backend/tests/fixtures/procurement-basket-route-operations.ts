const workflow = { kind: "non_project", namespace: "project_workflow" } as const;
const finance = { kind: "non_project", namespace: "project_finance" } as const;
const personal = (key: string, permission: string) => ({ key, permission, scope: workflow,
  operationClass: "personal", superAdminBehavior: "deny_personal", availability: "project_workflow" });
const read = (key: string, permission: string) => ({ key, permission, scope: workflow,
  operationClass: "read", superAdminBehavior: "global_read", availability: "project_workflow" });
const admin = (key: string, permission: string) => ({ key, permission, scope: workflow,
  operationClass: "admin", superAdminBehavior: "admin_override", availability: "project_workflow" });

/** Explicit additions to the established protected route manifest. */
export const EXPECTED_PROCUREMENT_BASKET_OPERATIONS = [
  read("GET /admin/program-managers", "projects.procurement_identity.manage"),
  read("GET /admin/projects/:projectId/procurement-identity", "projects.procurement_identity.manage"),
  admin("PATCH /admin/projects/:projectId/procurement-identity", "projects.procurement_identity.manage"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/vendor-candidates", "procurement.purchase_orders.read"),
  personal("GET /procurement/projects/:projectId/baskets", "procurement.purchase_orders.read"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId", "procurement.purchase_orders.read"),
  personal("PUT /procurement/projects/:projectId/baskets/:basketId/base-rate", "procurement.purchase_orders.manage"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/enquiries", "procurement.purchase_orders.read"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries", "procurement.purchase_orders.manage"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId", "procurement.purchase_orders.read"),
  personal("PUT /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/dispatch", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/invitation-batches/preview", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/invitation-batches", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/resend-invitation", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/invitations/:vendorId/whatsapp-share-intent", "procurement.purchase_orders.manage"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/comparison", "procurement.purchase_orders.read"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/counteroffers", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/award-preview", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/awards", "procurement.purchase_orders.manage"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/awards/:awardId", "procurement.purchase_orders.read"),
  personal("PUT /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/awards/:awardId", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/awards/:awardId/withdraw", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/awards/:awardId/submit", "procurement.purchase_orders.manage"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/awards/:awardId/issue", "procurement.purchase_orders.manage"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/history", "procurement.purchase_orders.read"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/enquiries/:enquiryId/history/:revisionId", "procurement.purchase_orders.read"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/awards/:awardId/monitor", "procurement.purchase_orders.read"),
  personal("GET /procurement/projects/:projectId/baskets/:basketId/awards/:awardId/work-order.pdf", "procurement.purchase_orders.read"),
  personal("POST /procurement/projects/:projectId/baskets/:basketId/awards/:awardId/share-intent", "procurement.purchase_orders.manage"),
  read("GET /work-order-approvals", "procurement.work_order_approval.read"),
  read("GET /work-order-approvals/:awardId", "procurement.work_order_approval.read"),
  admin("POST /work-order-approvals/:awardId/decision", "procurement.work_order_approval.decide"),
  { key: "GET /finance/work-orders/:orderId/invoice-assessment", permission: "finance.vendor_invoice.manage", scope: finance,
    operationClass: "personal", superAdminBehavior: "deny_personal", availability: "project_finance" },
  { key: "GET /finance/projects/:projectId/work-orders", permission: "finance.vendor_invoice.manage", scope: finance,
    operationClass: "personal", superAdminBehavior: "deny_personal", availability: "project_finance" },
  { key: "POST /finance/work-orders/:orderId/invoice-assessment", permission: "finance.vendor_invoice.manage", scope: finance,
    operationClass: "personal", superAdminBehavior: "deny_personal", availability: "project_finance" },
  personal("PUT /procurement/vendors/:vendorId/service-city", "procurement.vendor_city.manage")
] as const;
