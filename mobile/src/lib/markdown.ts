// A small block parser for chat Markdown: enough for what agents write.

export type Block =
  | { kind: "code"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "para"; text: string };

const row = (l: string) =>
  l
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "para", text: para.join("\n") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      out.push({ kind: "code", text: code.join("\n") });
    } else if (/^#{1,6}\s/.test(l)) {
      flush();
      out.push({ kind: "heading", text: l.replace(/^#+\s+/, "") });
    } else if (
      /^\s*\|.*\|\s*$/.test(l) &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "") &&
      lines[i + 1].includes("-")
    ) {
      flush();
      const rows = [row(l)];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(row(lines[i]));
      i--;
      out.push({ kind: "table", rows });
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      const ordered = /^\s*\d/.test(l);
      const items: string[] = [];
      for (; i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]); i++) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      }
      i--;
      out.push({ kind: "list", ordered, items });
    } else if (/^>\s?/.test(l)) {
      flush();
      out.push({ kind: "quote", text: l.replace(/^>\s?/, "") });
    } else if (/^\s*(-\s*){3,}$|^\s*(\*\s*){3,}$|^\s*(_\s*){3,}$/.test(l)) {
      flush();
      out.push({ kind: "rule" });
    } else if (!l.trim()) {
      flush();
    } else {
      para.push(l);
    }
  }
  flush();
  return out;
}

export type Span = { text: string; code?: boolean; bold?: boolean; italic?: boolean; link?: string };

/** Inline code, bold, italic and links. */
export function parseInline(src: string): Span[] {
  const out: Span[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\n]+\*)/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    const t = m[0];
    if (m[1]) out.push({ text: t.slice(1, -1), code: true });
    else if (m[2]) out.push({ text: t.slice(2, -2), bold: true });
    else if (m[3]) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      out.push({ text: label, link: href });
    } else out.push({ text: t.slice(1, -1), italic: true });
    last = m.index + t.length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}
