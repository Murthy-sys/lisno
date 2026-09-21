import {
  SWIPE_REPLY_COMMIT_DISTANCE,
  SWIPE_REPLY_COMMIT_VELOCITY,
  SWIPE_REPLY_INTENT_DISTANCE,
  SWIPE_REPLY_MAX_TRANSLATION,
  SWIPE_REPLY_VELOCITY_MIN_DISTANCE,
  clampSwipeReplyTranslation,
  isSwipeReplyIntent,
  shouldCommitSwipeReply,
  type SwipeReplyRelease
} from "./swipeReply";

function release(overrides: Partial<SwipeReplyRelease> = {}): SwipeReplyRelease {
  return {
    deltaX: 0,
    deltaY: 0,
    velocityX: 0,
    velocityY: 0,
    endState: "released",
    ...overrides
  };
}

describe("swipe reply intent", () => {
  it("claims either horizontal direction at the exact intent boundary", () => {
    expect(isSwipeReplyIntent({ deltaX: SWIPE_REPLY_INTENT_DISTANCE, deltaY: 0 })).toBe(true);
    expect(isSwipeReplyIntent({ deltaX: -SWIPE_REPLY_INTENT_DISTANCE, deltaY: 0 })).toBe(true);
    expect(isSwipeReplyIntent({ deltaX: SWIPE_REPLY_INTENT_DISTANCE - 0.01, deltaY: 0 })).toBe(false);
    expect(isSwipeReplyIntent({ deltaX: -(SWIPE_REPLY_INTENT_DISTANCE - 0.01), deltaY: 0 })).toBe(false);
  });

  it("requires strict horizontal dominance", () => {
    expect(isSwipeReplyIntent({ deltaX: 20, deltaY: 19.99 })).toBe(true);
    expect(isSwipeReplyIntent({ deltaX: -20, deltaY: -19.99 })).toBe(true);
    expect(isSwipeReplyIntent({ deltaX: 20, deltaY: 20 })).toBe(false);
    expect(isSwipeReplyIntent({ deltaX: 20, deltaY: -21 })).toBe(false);
  });

  it("rejects non-finite movement", () => {
    expect(isSwipeReplyIntent({ deltaX: Number.NaN, deltaY: 0 })).toBe(false);
    expect(isSwipeReplyIntent({ deltaX: 20, deltaY: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe("swipe reply translation", () => {
  it("clamps both directions symmetrically and preserves travel inside the bound", () => {
    expect(clampSwipeReplyTranslation(SWIPE_REPLY_MAX_TRANSLATION + 20)).toBe(SWIPE_REPLY_MAX_TRANSLATION);
    expect(clampSwipeReplyTranslation(-(SWIPE_REPLY_MAX_TRANSLATION + 20))).toBe(-SWIPE_REPLY_MAX_TRANSLATION);
    expect(clampSwipeReplyTranslation(31)).toBe(31);
    expect(clampSwipeReplyTranslation(-31)).toBe(-31);
  });

  it("returns the resting translation for invalid movement", () => {
    expect(clampSwipeReplyTranslation(Number.NaN)).toBe(0);
    expect(clampSwipeReplyTranslation(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("swipe reply release", () => {
  it("commits either direction at the exact distance boundary", () => {
    expect(shouldCommitSwipeReply(release({ deltaX: SWIPE_REPLY_COMMIT_DISTANCE }))).toBe(true);
    expect(shouldCommitSwipeReply(release({ deltaX: -SWIPE_REPLY_COMMIT_DISTANCE }))).toBe(true);
    expect(shouldCommitSwipeReply(release({ deltaX: SWIPE_REPLY_COMMIT_DISTANCE - 0.01 }))).toBe(false);
    expect(shouldCommitSwipeReply(release({ deltaX: -(SWIPE_REPLY_COMMIT_DISTANCE - 0.01) }))).toBe(false);
  });

  it("commits an intentional same-direction horizontal fling after the smaller minimum distance", () => {
    expect(shouldCommitSwipeReply(release({
      deltaX: SWIPE_REPLY_VELOCITY_MIN_DISTANCE,
      velocityX: SWIPE_REPLY_COMMIT_VELOCITY,
      velocityY: 0.1
    }))).toBe(true);
    expect(shouldCommitSwipeReply(release({
      deltaX: -SWIPE_REPLY_VELOCITY_MIN_DISTANCE,
      velocityX: -SWIPE_REPLY_COMMIT_VELOCITY,
      velocityY: -0.1
    }))).toBe(true);
  });

  it("rejects velocity fallback below its distance or velocity boundaries", () => {
    expect(shouldCommitSwipeReply(release({
      deltaX: SWIPE_REPLY_VELOCITY_MIN_DISTANCE - 0.01,
      velocityX: 2
    }))).toBe(false);
    expect(shouldCommitSwipeReply(release({
      deltaX: SWIPE_REPLY_VELOCITY_MIN_DISTANCE,
      velocityX: SWIPE_REPLY_COMMIT_VELOCITY - 0.01
    }))).toBe(false);
  });

  it("rejects vertical, diagonal, opposing, and invalid velocity fallbacks", () => {
    expect(shouldCommitSwipeReply(release({ deltaX: 40, deltaY: 41, velocityX: 2, velocityY: 0 }))).toBe(false);
    expect(shouldCommitSwipeReply(release({ deltaX: 40, velocityX: 0.6, velocityY: 0.6 }))).toBe(false);
    expect(shouldCommitSwipeReply(release({ deltaX: 40, velocityX: -0.6, velocityY: 0 }))).toBe(false);
    expect(shouldCommitSwipeReply(release({ deltaX: 40, velocityX: Number.NaN, velocityY: 0 }))).toBe(false);
  });

  it("never commits cancelled or terminated input", () => {
    for (const endState of ["cancelled", "terminated"] as const) {
      expect(shouldCommitSwipeReply(release({
        deltaX: SWIPE_REPLY_MAX_TRANSLATION,
        velocityX: 2,
        endState
      }))).toBe(false);
    }
  });
});
