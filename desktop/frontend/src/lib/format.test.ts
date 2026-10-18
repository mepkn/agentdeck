import { describe, expect, it } from "vitest";
import { dotFor, timeAgo } from "./format";
import type { Info } from "./api";

const info = (p: Partial<Info>) => ({ status: "idle", unread: false, ...p }) as Info;

describe("dotFor", () => {
  it("maps status and unread to a dot", () => {
    expect(dotFor(info({ status: "waiting" }))).toBe("waiting");
    expect(dotFor(info({ status: "starting" }))).toBe("working");
    expect(dotFor(info({ status: "idle", unread: true }))).toBe("done");
    expect(dotFor(info({ status: "idle" }))).toBe("idle");
    expect(dotFor(info({ status: "asleep", unread: true }))).toBe("asleep");
  });
});

describe("timeAgo", () => {
  it("rounds to the largest unit", () => {
    const now = 1_000_000_000;
    expect(timeAgo(now - 10_000, now)).toBe("now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2d");
  });
});
