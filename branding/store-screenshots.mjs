// Play Store phone screenshots: frames real app screenshots in the Evolution
// style (blue, soft circles, headline above a phone). Run from anywhere:
//   node branding/store-screenshots.mjs              real screenshots
//   node branding/store-screenshots.mjs --preview D  placeholders into D
// Put raw phone screenshots (PNG/JPEG, straight off the phone) in
// branding/screenshots/ named as in SHOTS below. Outputs 1080x1920 (9:16) to
// mobile/assets/store/screenshots/, plus a feature graphic with a phone in it.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, "../backend/package.json"))("sharp");

const BLUE = "#2f566f", ORANGE = "#d0703f", CARD = "#fff9f1", CREAM = "#f5ede1", FRAME = "#18303f";
const FONT = "Helvetica, Arial";

// File name (without extension) → headline (one line per entry) and subline.
const SHOTS = [
  ["01-capture", ["Snap a receipt", "the moment you pay"], "Auto-fill reads it for you"],
  ["02-history", ["Every expense,", "receipt attached"], "Corrections voided, never lost"],
  ["03-summary", ["Know what to", "put aside for tax"], "Live UK tax and NI estimate"],
  ["04-income", ["Log income", "your way"], "Photo, PDF or a CSV report"],
  ["05-compare", ["Spot a duplicate?", "Compare, then void"], "Side by side, one tap"],
  ["06-widget", ["One tap from", "your home screen"], "Widget and app shortcuts"]
];

const args = process.argv.slice(2);
const previewDir = args[0] === "--preview" ? path.resolve(args[1] ?? ".") : null;
const rawDir = path.join(here, "screenshots");
const outDir = previewDir ?? path.join(here, "../mobile/assets/store/screenshots");
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function findRaw(name) {
  for (const ext of [".png", ".jpg", ".jpeg"]) {
    const p = path.join(rawDir, name + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// The screen as a data URI at the given width, or a labelled placeholder.
async function screen(name, width) {
  const raw = previewDir ? null : findRaw(name);
  if (raw) {
    const buf = await sharp(raw).resize({ width }).png().toBuffer();
    const { height } = await sharp(buf).metadata();
    return { href: `data:image/png;base64,${buf.toString("base64")}`, height };
  }
  const height = Math.round((width * 20) / 9);
  const ph = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${CREAM}"/>
    <rect width="100%" height="${Math.round(height * 0.11)}" fill="${BLUE}"/>
    <text x="50%" y="50%" font-family="${FONT}" font-size="34" fill="#8a7a66" text-anchor="middle">${name}.png</text></svg>`;
  return { href: `data:image/svg+xml;base64,${Buffer.from(ph).toString("base64")}`, height };
}

// Phone body with the screen inside, top-left at (x, y).
function phone(x, y, scr, width, { bezel = 20, radius = 78 } = {}) {
  const w = width + bezel * 2, h = scr.height + bezel * 2, id = `s${x}${y}`;
  return `
  <rect x="${x + 10}" y="${y + 18}" width="${w}" height="${h}" rx="${radius}" fill="#000" opacity="0.22"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${FRAME}"/>
  <clipPath id="${id}"><rect x="${x + bezel}" y="${y + bezel}" width="${width}" height="${scr.height}" rx="${radius - bezel}"/></clipPath>
  <image x="${x + bezel}" y="${y + bezel}" width="${width}" height="${scr.height}" href="${scr.href}" clip-path="url(#${id})" preserveAspectRatio="xMidYMin slice"/>`;
}

const made = [];
for (const [name, lines, sub] of SHOTS) {
  if (!previewDir && !findRaw(name)) continue;
  const W = 1080, H = 1920, sw = 640;
  const scr = await screen(name, sw);
  // Keep the whole phone on the canvas whatever the phone's aspect ratio.
  const maxScreen = H - 420 - 40 - 40;
  if (scr.height > maxScreen) scr.height = maxScreen;
  const px = (W - (sw + 40)) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BLUE}"/>
  <circle cx="${W + 40}" cy="-60" r="380" fill="${CREAM}" opacity="0.07"/>
  <circle cx="-80" cy="${H - 300}" r="460" fill="#2b5f5a" opacity="0.5"/>
  ${lines.map((l, i) => `<text x="${W / 2}" y="${150 + i * 92}" font-family="${FONT}" font-size="80" font-weight="700" fill="${CARD}" text-anchor="middle">${esc(l)}</text>`).join("")}
  <rect x="${W / 2 - 48}" y="${150 + lines.length * 92 - 50}" width="96" height="8" rx="4" fill="${ORANGE}"/>
  <text x="${W / 2}" y="${150 + lines.length * 92 + 20}" font-family="${FONT}" font-size="42" fill="${CREAM}" text-anchor="middle">${esc(sub)}</text>
  ${phone(px, 420, scr, sw)}
</svg>`;
  await sharp(Buffer.from(svg)).flatten({ background: BLUE }).png().toFile(path.join(outDir, `${name}.png`));
  made.push(`${name}.png`);
}

// Feature graphic with a phone, like the old Qbit one: name and strapline on
// the left, the capture screen on the right running off the bottom edge.
if (previewDir || findRaw("01-capture")) {
  const sw = 300, scr = await screen("01-capture", sw);
  const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <rect width="1024" height="500" fill="${BLUE}"/>
  <circle cx="900" cy="140" r="250" fill="${CREAM}" opacity="0.07"/>
  <circle cx="60" cy="500" r="210" fill="#2b5f5a" opacity="0.5"/>
  <image x="70" y="78" width="84" height="84" href="data:image/png;base64,${fs.readFileSync(path.join(here, "../mobile/assets/logo.png")).toString("base64")}"/>
  <text x="172" y="138" font-family="${FONT}" font-size="54" font-weight="700" fill="${CARD}">Evolution</text>
  <text x="70" y="250" font-family="${FONT}" font-size="50" font-weight="700" fill="${CARD}">Snap receipts.</text>
  <text x="70" y="312" font-family="${FONT}" font-size="50" font-weight="700" fill="${CARD}">Log income.</text>
  <text x="70" y="374" font-family="${FONT}" font-size="50" font-weight="700" fill="${ORANGE}">Know your tax.</text>
  <text x="72" y="426" font-family="${FONT}" font-size="26" fill="${CREAM}">For UK self-employed drivers</text>
  ${phone(640, 60, scr, sw, { bezel: 12, radius: 44 })}
</svg>`;
  const name = "feature-graphic-phone-1024x500.png";
  await sharp(Buffer.from(feature)).flatten({ background: BLUE }).png().toFile(path.join(previewDir ?? path.join(here, "../mobile/assets/store"), name));
  made.push(name);
}

console.log(made.length ? `Generated in ${outDir}: ${made.join(", ")}` : `No screenshots found in ${rawDir}`);
