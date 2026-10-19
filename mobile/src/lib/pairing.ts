import { fromUtf8, unb64 } from "@/lib/b64";

/** The Mac this phone is paired with: the QR code's content. */
export type Mac = { relay: string; id: string; box: string; name: string };
export type PairCode = Mac & { secret: string };

/** Reads agentdeck://pair?d=… (or the bare d value) from the Mac's QR code. */
export function parsePairCode(text: string): PairCode | null {
  const s = text.trim();
  const m = /[?&]d=([A-Za-z0-9_-]+)/.exec(s);
  const d = m ? m[1] : /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
  if (!d) return null;
  try {
    const p = JSON.parse(fromUtf8(unb64(d))) as Record<string, unknown>;
    const { r, i, k, s: secret, n } = p;
    if (typeof r !== "string" || typeof i !== "string" || typeof k !== "string" || typeof secret !== "string") {
      return null;
    }
    if (!/^wss?:\/\//.test(r)) return null;
    return { relay: r, id: i, box: k, secret, name: typeof n === "string" && n ? n : "Mac" };
  } catch {
    return null;
  }
}
