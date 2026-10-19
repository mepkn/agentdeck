import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";
import { b64, fromUtf8, unb64, utf8 } from "@/lib/b64";
import { boxPublic, newIdentity, open, relayId, seal, signChallenge, type Identity } from "@/lib/crypto";
import { parsePairCode } from "@/lib/pairing";

// Produced by desktop/internal/remote's seal and ed25519.Sign (keys of all 1s, 2s and 3s).
const go = {
  macPub: "pOCSkrZRwni5dyxWn1-puxPZBrRqtoyd-dwrRAn4ogk",
  phoneBox: "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI",
  data: '{"k":"pOCSkrZRwni5dyxWn1-puxPZBrRqtoyd-dwrRAn4ogk","n":"ViGqX2hlEUNAe017FEKJX2e1Eh8FSq-D","c":"A34jSpsEVmE5g0w8sVTXv7E5gPu9iyIn-t91xVR-3xMd-w"}',
  signSeed: "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM",
  signPub: "7UkoxijRwsbq6QM4kFmVYSlZJzpcY_k2NsFGFKyHN9E",
  sig: "9EESk5ptfUpkL8ZdnJsdHItOErLHey1c5qucF07QgPzE_Btequ1PIoK1Mr4JVSgyJgN7_Zgsjrt4G_a6QOIWCQ",
};

describe("b64", () => {
  it("round-trips every length", () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      expect(unb64(b64(b))).toEqual(b);
    }
    expect(b64(utf8("hi?>"))).toBe("aGk_Pg");
  });
});

describe("crypto", () => {
  it("opens a message sealed by the Mac", () => {
    const phone: Identity = { sign: go.signSeed, box: go.phoneBox };
    expect(open(phone, go.macPub, "MAC", "PHONE", go.data).plain).toBe('{"hello":"wörld"}');
    expect(() => open(phone, go.macPub, "MAC", "OTHER", go.data)).toThrow();
  });

  it("signs the relay challenge like Go", () => {
    const id: Identity = { sign: go.signSeed, box: go.phoneBox };
    expect(relayId(id)).toBe(go.signPub);
    expect(signChallenge(id, b64(new Uint8Array([1, 2, 3])))).toBe(go.sig);
  });

  it("round-trips between two identities", () => {
    const a = newIdentity();
    const b = newIdentity();
    const data = seal(a, boxPublic(b), "A", "B", "secret");
    expect(open(b, boxPublic(a), "A", "B", data).plain).toBe("secret");
    expect(() => open(b, boxPublic(b), "A", "B", data)).toThrow();
    expect(ed25519.getPublicKey(unb64(a.sign))).toHaveLength(32);
  });
});

describe("parsePairCode", () => {
  const d = b64(utf8(JSON.stringify({ r: "wss://relay.example/relay", i: "ID", k: "KEY", s: "SECRET", n: "Studio" })));

  it("reads the link and the bare value", () => {
    const want = { relay: "wss://relay.example/relay", id: "ID", box: "KEY", secret: "SECRET", name: "Studio" };
    expect(parsePairCode(`agentdeck://pair?d=${d}`)).toEqual(want);
    expect(parsePairCode(` ${d} `)).toEqual(want);
  });

  it("rejects anything else", () => {
    expect(parsePairCode("https://example.com")).toBeNull();
    expect(parsePairCode(b64(utf8('{"r":"http://x","i":"a","k":"b","s":"c"}')))).toBeNull();
  });
});

describe("utf8", () => {
  it("decodes what it encodes", () => {
    const s = "héllo wörld — 日本 🎉";
    expect(fromUtf8(utf8(s))).toBe(s);
  });
});
