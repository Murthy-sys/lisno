import { z } from "zod";

export const CHAT_TYPING = {
  leaseMs: 8_000,
  refreshMs: 3_000,
  retentionMs: 60_000,
  requestLifetimeMs: 10_000,
  maxActiveComposers: 5,
  maxRetainedComposers: 20,
  maxProjectLeases: 100,
  maxActiveUpdatesPerWindow: 120,
  rateWindowMs: 60_000,
  deliveryBatchMs: 10,
  maxPendingDeliveries: 500,
  maxFrameBytes: 128 * 1024
} as const;

export const chatTypingSchema = z.object({
  composerId: z.string().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/),
  sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  typing: z.boolean()
}).strict();
