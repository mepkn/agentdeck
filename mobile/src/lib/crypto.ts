import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { b64, fromUtf8, unb64, utf8 } from "@/lib/b64";

// Must match desktop/internal/remote/crypto.go: X25519, HKDF-SHA256, then
// XChaCha20-Poly1305 with the sender and recipient relay IDs as associated data.

const HKDF_INFO = utf8("agentdeck-e2e-v1");
export const AUTH_PREFIX = "agentdeck-relay-v1:";

/** This phone's keys: an Ed25519 seed for the relay, an X25519 key for messages. */
export type Identity = { sign: string; box: string };

export function newIdentity(): Identity {
  return { sign: b64(randomBytes(32)), box: b64(x25519.utils.randomSecretKey()) };
}

export function relayId(id: Identity): string {
  return b64(ed25519.getPublicKey(unb64(id.sign)));
}

export function boxPublic(id: Identity): string {
  return b64(x25519.getPublicKey(unb64(id.box)));
}

/** Signs the relay's challenge. */
export function signChallenge(id: Identity, nonce: string): string {
  const msg = new Uint8Array([...utf8(AUTH_PREFIX), ...unb64(nonce)]);
  return b64(ed25519.sign(msg, unb64(id.sign)));
}

function sharedKey(priv: Uint8Array, peer: Uint8Array): Uint8Array {
  return hkdf(sha256, x25519.getSharedSecret(priv, peer), undefined, HKDF_INFO, 32);
}

const aad = (from: string, to: string) => utf8(`${from}>${to}`);

export function seal(id: Identity, peerBox: string, from: string, to: string, plain: string): string {
  const priv = unb64(id.box);
  const nonce = randomBytes(24);
  const c = xchacha20poly1305(sharedKey(priv, unb64(peerBox)), nonce, aad(from, to)).encrypt(utf8(plain));
  return JSON.stringify({ k: b64(x25519.getPublicKey(priv)), n: b64(nonce), c: b64(c) });
}

/** Decrypts a message; throws if it was not sealed by peerBox for us. */
export function open(id: Identity, peerBox: string, from: string, to: string, data: string) {
  const e = JSON.parse(data) as { k: string; n: string; c: string };
  if (e.k !== peerBox) throw new Error("message from an unknown key");
  const nonce = unb64(e.n);
  const plain = xchacha20poly1305(sharedKey(unb64(id.box), unb64(peerBox)), nonce, aad(from, to)).decrypt(unb64(e.c));
  return { nonce: e.n, plain: fromUtf8(plain) };
}
