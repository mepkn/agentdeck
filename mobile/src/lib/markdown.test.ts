import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline } from "@/lib/markdown";

describe("parseBlocks", () => {
  it("reads tables, lists, code and paragraphs", () => {
    const md = [
      "`web/package.json` has 2 scripts:",
      "",
      "| Script | Command |",
      "|---|---|",
      "| dev | vite |",
      "| test | vitest run |",
      "",
      "- one",
      "- two",
      "```ts",
      "const a = 1;",
      "```",
      "## Done",
    ].join("\n");
    expect(parseBlocks(md)).toEqual([
      { kind: "para", text: "`web/package.json` has 2 scripts:" },
      {
        kind: "table",
        rows: [
          ["Script", "Command"],
          ["dev", "vite"],
          ["test", "vitest run"],
        ],
      },
      { kind: "list", ordered: false, items: ["one", "two"] },
      { kind: "code", text: "const a = 1;" },
      { kind: "heading", text: "Done" },
    ]);
  });
});

describe("parseInline", () => {
  it("splits code, bold and links", () => {
    expect(parseInline("a `b` **c** [d](https://e.f)")).toEqual([
      { text: "a " },
      { text: "b", code: true },
      { text: " " },
      { text: "c", bold: true },
      { text: " " },
      { text: "d", link: "https://e.f" },
    ]);
  });
});
