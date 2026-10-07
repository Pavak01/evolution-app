// Generates every Evolution logo asset from one master design (concept "I ·
// Snap, refined", chosen 2026-10-06): viewfinder corners framing a receipt
// marked with an E. Run from anywhere:  node branding/generate.mjs
// Uses the backend's sharp to rasterise. Outputs into mobile/assets/.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, "../backend/package.json"))("sharp");
const out = (f) => path.join(here, "../mobile/assets", f);

const BLUE = "#2f566f", ORANGE = "#d0703f", CARD = "#fff9f1", CREAM = "#f5ede1";
const teeth = (x0, x1, y, depth, n) => {
  const w = (x1 - x0) / n; let d = "";
  for (let i = n - 1; i >= 0; i--) d += ` L${(x0 + i * w + w / 2).toFixed(1)} ${y + depth} L${(x0 + i * w).toFixed(1)} ${y}`;
  return d;
};
const receipt = `M392 322 H632 V662${teeth(392, 632, 662, 34, 5)} Z`;
const corners = ["M262 382 V262 H382", "M642 262 H762 V382", "M762 642 V762 H642", "M382 762 H262 V642"];
const eBars = `<rect x="450" y="382" width="50" height="220"/><rect x="450" y="382" width="132" height="48" rx="6"/><rect x="450" y="468" width="104" height="48" rx="6"/><rect x="450" y="554" width="132" height="48" rx="6"/>`;

// The mark alone (no background), in colour or one flat colour.
const mark = ({ mono = null } = {}) => `
<g fill="none" stroke="${mono ?? ORANGE}" stroke-width="62" stroke-linecap="round" stroke-linejoin="round">${corners.map((d) => `<path d="${d}"/>`).join("")}</g>
${mono
  ? `<mask id="e"><rect width="1024" height="1024" fill="#fff"/><g fill="#000">${eBars}</g></mask><path d="${receipt}" fill="${mono}" mask="url(#e)"/>`
  : `<path d="${receipt}" fill="${CARD}"/><g fill="${BLUE}">${eBars}</g>`}`;

// Scale the mark about the centre (adaptive icons need it inside the safe zone).
const scaled = (inner, s) => `<g transform="translate(512,512) scale(${s}) translate(-512,-512)">${inner}</g>`;
const svg = (inner, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${inner}</svg>`;

const files = {
  // Master, kept as SVG for print / web.
  "../../branding/evolution-logo.svg": svg(`<rect width="1024" height="1024" fill="${BLUE}"/>${mark()}`),
  // Standard icon: full-bleed square (launchers apply their own mask).
  "icon.png": svg(`<rect width="1024" height="1024" fill="${BLUE}"/>${mark()}`),
  // Android adaptive foreground: transparent, mark kept inside the 61% safe circle.
  "adaptive-icon.png": svg(scaled(mark(), 0.68)),
  // Android 13+ themed icons: one flat colour, the system tints it.
  "adaptive-icon-monochrome.png": svg(scaled(mark({ mono: "#ffffff" }), 0.68)),
  // In-app logo and splash: rounded tile with transparent corners.
  "logo.png": svg(`<rect width="1024" height="1024" rx="230" fill="${BLUE}"/>${mark()}`),
  "splash-icon.png": svg(`<rect width="1024" height="1024" rx="230" fill="${BLUE}"/>${mark()}`)
};
for (const [name, content] of Object.entries(files)) {
  if (name.endsWith(".svg")) fs.writeFileSync(out(name), content);
  else await sharp(Buffer.from(content)).png().toFile(out(name));
}
// Play Store listing icon: 512x512, no transparency.
fs.mkdirSync(out("store"), { recursive: true });
await sharp(Buffer.from(files["icon.png"])).resize(512, 512).flatten({ background: BLUE }).png().toFile(out("store/play-store-icon-512.png"));
await sharp(Buffer.from(files["logo.png"])).resize(48, 48).png().toFile(out("favicon.png"));

// Long-press app-icon shortcuts (Android adaptive foregrounds; the blue
// background is set in app.json). Glyphs kept well inside the safe zone.
const shortcutIcons = {
  "shortcut-receipt.png": svg(scaled(`
    <rect x="272" y="372" width="480" height="340" rx="56" fill="${CARD}"/>
    <path d="M412 372 L452 312 H572 L612 372 Z" fill="${CARD}"/>
    <circle cx="512" cy="542" r="104" fill="${BLUE}"/>
    <circle cx="512" cy="542" r="62" fill="${ORANGE}"/>
    <circle cx="684" cy="430" r="20" fill="${ORANGE}"/>`, 0.62)),
  "shortcut-income.png": svg(scaled(`
    <text x="512" y="700" font-family="Helvetica, Arial" font-size="560" font-weight="700" fill="${CARD}" text-anchor="middle">£</text>
    <rect x="300" y="760" width="424" height="40" rx="20" fill="${ORANGE}"/>`, 0.62))
};
for (const [name, content] of Object.entries(shortcutIcons)) await sharp(Buffer.from(content)).png().toFile(out(name));
console.log("Generated:", Object.keys(shortcutIcons).join(", "));

// Play Store feature graphic: 1024x500, no transparency. Logo tile, name and
// strapline on the blue, with two soft background circles (a faint cream one —
// the app's orange circle turns muddy grey over blue).
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="${BLUE}"/>
  <circle cx="1010" cy="-10" r="170" fill="${CREAM}" opacity="0.08"/>
  <circle cx="90" cy="470" r="210" fill="#2b5f5a" opacity="0.5"/>
  <g transform="translate(96,110) scale(0.2734)"><rect width="1024" height="1024" rx="230" fill="#24465b"/>${mark()}</g>
  <text x="420" y="215" font-family="Helvetica, Arial" font-size="92" font-weight="700" fill="${CARD}">Evolution</text>
  <text x="424" y="285" font-family="Helvetica, Arial" font-size="38" fill="${CREAM}">Snap receipts. Log income.</text>
  <text x="424" y="335" font-family="Helvetica, Arial" font-size="38" fill="${CREAM}">Know what to put aside for tax.</text>
  <rect x="424" y="372" width="96" height="8" rx="4" fill="${ORANGE}"/>
</svg>`;
await sharp(Buffer.from(feature)).flatten({ background: BLUE }).png().toFile(out("store/feature-graphic-1024x500.png"));
console.log("Generated: store/feature-graphic-1024x500.png");
console.log("Generated:", [...Object.keys(files), "store/play-store-icon-512.png", "favicon.png"].join(", "));
