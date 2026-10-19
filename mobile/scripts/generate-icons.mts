// Draws the agentdeck mark (a green terminal card on a darker one), as in desktop/build/appicon.png.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

// Usage: npm run icons  (writes into assets/images)
const OUT = process.argv[2] ?? "assets/images";
const BG = "#1a1b1f";
const BACK = "#2e2f37";
const GREEN = "#34d399";
const INK = "#0b2c1f";

const cards = `<rect x="318" y="254" width="438" height="330" rx="64" fill="${BACK}"/>
  <rect x="268" y="344" width="488" height="412" rx="76" fill="${GREEN}"/>
  <path d="M383 474 L455 550 L383 626" fill="none" stroke="${INK}" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M512 640 L640 640" stroke="${INK}" stroke-width="52" stroke-linecap="round"/>`;

function mark(scale = 1, body = cards): string {
  return `<g transform="translate(512 512) scale(${scale}) translate(-512 -505)">${body}</g>`;
}

const mono = cards.replaceAll(BACK, "#fff").replaceAll(GREEN, "#fff").replaceAll(INK, "#000");

const svgs: Record<string, [size: number, body: string]> = {
  "icon.png": [1024, `<rect width="1024" height="1024" fill="${BG}"/>` + mark(1.15)],
  "android-icon-background.png": [1024, `<rect width="1024" height="1024" fill="${BG}"/>`],
  // Adaptive icons are cropped to the centre ~66%, so the mark is scaled down.
  "android-icon-foreground.png": [1024, mark(0.8)],
  "android-icon-monochrome.png": [
    1024,
    `<mask id="m">${mark(0.8, mono)}</mask><rect width="1024" height="1024" fill="#fff" mask="url(#m)"/>`,
  ],
  "splash-icon.png": [1024, mark(1.15)],
  // Status bar icon: white on transparent, Android uses only its alpha.
  "notification-icon.png": [
    96,
    `<mask id="m">${mark(1.15, mono)}</mask><rect width="1024" height="1024" fill="#fff" mask="url(#m)"/>`,
  ],
  "favicon.png": [48, `<rect width="1024" height="1024" fill="${BG}"/>` + mark(1.15)],
};

for (const [name, [size, body]] of Object.entries(svgs)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(`${OUT}/${name}`, png);
  console.log(name, size);
}
