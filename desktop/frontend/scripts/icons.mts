// Renders the app and tray icons from SVG. Run `npm run icons`, then
// `wails3 task common:generate:icons` in desktop/ for icons.icns.
import sharp from "sharp";

const build = new URL("../../build/", import.meta.url);
const favicon = new URL("../public/favicon.svg", import.meta.url).pathname;
const tray = new URL("./tray.svg", import.meta.url).pathname;

// macOS icons sit inside the canvas with a margin.
const app = await sharp(favicon, { density: 1200 }).resize(824, 824).png().toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: app, left: 100, top: 100 }])
  .png()
  .toFile(new URL("appicon.png", build).pathname);

// Template image: black on transparent; the white strokes are cut out.
const { data, info } = await sharp(tray, { density: 600 }).resize(44, 44).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const light = (data[i] + data[i + 1] + data[i + 2]) / 3;
  data[i + 3] = Math.round((data[i + 3] * (255 - light)) / 255);
  data[i] = data[i + 1] = data[i + 2] = 0;
}
await sharp(data, { raw: info }).png().toFile(new URL("tray.png", build).pathname);
console.log("wrote build/appicon.png and build/tray.png");
