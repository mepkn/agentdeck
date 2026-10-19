// Base64url without padding, as Go's base64.RawURLEncoding writes it.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function b64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63].map((v) => ALPHABET[v]);
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join("");
  }
  return out;
}

export function unb64(s: string): Uint8Array {
  s = s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (s.length % 4 === 1) throw new Error("bad base64");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const c = s[i + j];
      const v = c === undefined ? 0 : LOOKUP.get(c);
      if (v === undefined) throw new Error("bad base64");
      n = (n << 6) | v;
    }
    const bytes = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (let j = 0; j < Math.min(3, s.length - i - 1); j++) out[o++] = bytes[j];
  }
  return out;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// Hermes may lack TextDecoder, so this decodes by hand. Bad bytes become U+FFFD.
export function fromUtf8(b: Uint8Array): string {
  const codes: number[] = [];
  for (let i = 0; i < b.length;) {
    const c = b[i++];
    const need = c < 0x80 ? 0 : c >= 0xf0 && c < 0xf8 ? 3 : c >= 0xe0 ? 2 : c >= 0xc2 && c < 0xe0 ? 1 : -1;
    let cp = need === 0 ? c : need === 3 ? c & 7 : need === 2 ? c & 15 : c & 31;
    let ok = need >= 0;
    for (let j = 0; ok && j < need; j++, i++) {
      if (i >= b.length || (b[i] & 0xc0) !== 0x80) ok = false;
      else cp = (cp << 6) | (b[i] & 63);
    }
    codes.push(ok ? cp : 0xfffd);
  }
  let out = "";
  for (let i = 0; i < codes.length; i += 4096) out += String.fromCodePoint(...codes.slice(i, i + 4096));
  return out;
}
