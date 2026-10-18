import { describe, expect, it } from "vitest";
import { OutputStream, fromBase64, stripReplies } from "./stream";

const b = (s: string) => new TextEncoder().encode(s);
const text = (chunks: Uint8Array[]) => chunks.map((c) => new TextDecoder().decode(c)).join("");

describe("OutputStream", () => {
  it("holds events until the snapshot and trims overlap", () => {
    const out: Uint8Array[] = [];
    const s = new OutputStream((x) => out.push(x));
    s.push({ start: 3, bytes: b("def") }); // already in the snapshot
    s.push({ start: 5, bytes: b("fgh") }); // overlaps by one byte
    s.snapshot(b("abcdef"), 6);
    s.push({ start: 8, bytes: b("ij") });
    expect(text(out)).toBe("abcdefghij");
  });
});

describe("helpers", () => {
  it("decodes base64 to bytes", () => {
    expect(text([fromBase64(btoa("hi"))])).toBe("hi");
  });
  it("drops terminal replies but keeps typing", () => {
    expect(stripReplies("a\x1b[12;40Rb\x1b]11;rgb:0000/0000/0000\x07c")).toBe("abc");
    expect(stripReplies("\x1b[A")).toBe("\x1b[A");
  });
});
