import { describe, expect, it } from "vitest";
import { splitAtNow } from "./pastSplit";

const now = 1_000_000;

describe("splitAtNow (D11)", () => {
  it("an event entirely in the past is all past", () => {
    expect(splitAtNow(now - 500, now - 100, now)).toEqual({ past: [now - 500, now - 100], future: null });
  });

  it("an event ending exactly at Now is all past", () => {
    expect(splitAtNow(now - 500, now, now)).toEqual({ past: [now - 500, now], future: null });
  });

  it("an event entirely in the future is all future", () => {
    expect(splitAtNow(now, now + 100, now)).toEqual({ past: null, future: [now, now + 100] });
  });

  it("an event spanning Now splits exactly at Now", () => {
    const s = splitAtNow(now - 300, now + 700, now);
    expect(s).toEqual({ past: [now - 300, now], future: [now, now + 700] });
    expect(s.past![1] - s.past![0] + (s.future![1] - s.future![0])).toBe(1000);
  });
});
