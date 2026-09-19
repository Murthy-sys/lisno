export const SWIPE_REPLY_INTENT_DISTANCE = 12;
export const SWIPE_REPLY_MAX_TRANSLATION = 72;
export const SWIPE_REPLY_COMMIT_DISTANCE = 54;
export const SWIPE_REPLY_VELOCITY_MIN_DISTANCE = 24;
export const SWIPE_REPLY_COMMIT_VELOCITY = 0.5;

export interface SwipeReplyMovement {
  /** Horizontal travel in density-independent pixels. */
  readonly deltaX: number;
  /** Vertical travel in density-independent pixels. */
  readonly deltaY: number;
}

export type SwipeReplyEndState = "released" | "cancelled" | "terminated";

export interface SwipeReplyRelease extends SwipeReplyMovement {
  /** Horizontal release velocity in the gesture system's native units. */
  readonly velocityX: number;
  /** Vertical release velocity in the gesture system's native units. */
  readonly velocityY: number;
  readonly endState: SwipeReplyEndState;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function hasMatchingDirection(distance: number, velocity: number): boolean {
  return Math.sign(distance) === Math.sign(velocity);
}

/**
 * Returns true only after travel reaches the intent threshold and is more
 * horizontal than vertical. Equality remains unclaimed so transcript scrolling
 * and nested controls can keep ambiguous gestures.
 */
export function isSwipeReplyIntent({ deltaX, deltaY }: SwipeReplyMovement): boolean {
  if (!isFiniteNumber(deltaX) || !isFiniteNumber(deltaY)) return false;

  const horizontalDistance = Math.abs(deltaX);
  return horizontalDistance >= SWIPE_REPLY_INTENT_DISTANCE
    && horizontalDistance > Math.abs(deltaY);
}

/** Keeps visual travel symmetric and bounded in either direction. */
export function clampSwipeReplyTranslation(deltaX: number): number {
  if (!isFiniteNumber(deltaX)) return 0;
  return Math.max(-SWIPE_REPLY_MAX_TRANSLATION, Math.min(SWIPE_REPLY_MAX_TRANSLATION, deltaX));
}

/**
 * Commits only a released, horizontal-intent gesture. A full-distance drag
 * commits regardless of velocity. A shorter drag must travel at least 24 dp
 * and end with a horizontal, same-direction fling.
 */
export function shouldCommitSwipeReply(input: SwipeReplyRelease): boolean {
  if (input.endState !== "released" || !isSwipeReplyIntent(input)) return false;
  if (!isFiniteNumber(input.velocityX) || !isFiniteNumber(input.velocityY)) return false;

  const horizontalDistance = Math.abs(input.deltaX);
  if (horizontalDistance >= SWIPE_REPLY_COMMIT_DISTANCE) return true;

  return horizontalDistance >= SWIPE_REPLY_VELOCITY_MIN_DISTANCE
    && Math.abs(input.velocityX) >= SWIPE_REPLY_COMMIT_VELOCITY
    && Math.abs(input.velocityX) > Math.abs(input.velocityY)
    && hasMatchingDirection(input.deltaX, input.velocityX);
}
