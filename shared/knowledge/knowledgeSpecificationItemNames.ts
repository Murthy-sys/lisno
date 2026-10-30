// The dependency-free implementation lives inside the backend build root so
// both clients and the server use identical rules without a runtime file copy.
export {
  SPECIFICATION_ITEM_NAME_MAX_LENGTH,
  normalizeSpecificationItemName,
  sanitizeSpecificationItemName,
  collectSpecificationItemNames,
  matchSpecificationItemNames
} from "../../backend/src/domain/knowledge-specification-item-names";
export type { SpecificationItemName } from "../../backend/src/domain/knowledge-specification-item-names";
