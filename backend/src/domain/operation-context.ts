import { AsyncLocalStorage } from "node:async_hooks";

import { AuthorizationConfigurationError } from "./authorization.js";
import {
  HUMAN_JWT_OPERATIONS,
  type HumanJwtOperation,
  type HumanJwtOperationKey
} from "./route-operations.js";

export type ActiveHumanOperation = Readonly<{
  key: HumanJwtOperationKey;
  operation: HumanJwtOperation;
}>;

const operationStorage = new AsyncLocalStorage<ActiveHumanOperation>();

export function runWithHumanOperation<T>(
  key: HumanJwtOperationKey,
  callback: () => T
): T {
  const operation = HUMAN_JWT_OPERATIONS[key];
  if (!operation) {
    throw new AuthorizationConfigurationError(
      `Unregistered human operation: ${String(key)}`
    );
  }
  return operationStorage.run(Object.freeze({ key, operation }), callback);
}

export function currentHumanOperation(): ActiveHumanOperation {
  const context = operationStorage.getStore();
  if (!context) {
    throw new AuthorizationConfigurationError(
      "A registered human operation is required."
    );
  }
  return context;
}
