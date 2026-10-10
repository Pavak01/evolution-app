// Social media carousel: what lost receipts and unchased reimbursements
// cost a self-employed driver, and why Evolution fixes it. Run from
// anywhere:  node branding/social.mjs
// Outputs 1080x1350 PNGs (portrait, the best-performing feed size on
// Instagram, Facebook and LinkedIn) into mobile/assets/social/.
//
// Figures assume a basic-rate taxpayer: 20% income tax + 6% Class 4 NI,
// so £1 of allowable expense not claimed = 26p more tax.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, "../backend/package.json"))("sharp");
const outDir = path.join(here, "../mobile/assets/social");
fs.mkdirSync(outDir, { recursive: true });

const BLUE = "#2f566f", DEEP = "#24465b", ORANGE = "#d0703f", CARD = "#fff9f1", CREAM = "#f5ede1", TEAL = "#2b5f5a", FRAME = "#18303f";
const FONT = "Helvetica, Arial";
const W = 1080, H = 1350;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const logo = `data:image/png;base64,${fs.readFileSync(path.join(here, "../mobile/assets/logo.png")).toString("base64")}`;

// Shared frame: brand background, soft circles, logo + page dots, footnote.
function frame(page, inner, footnote = "") {
  const dots = [1, 2, 3, 4]
    .map((n, i) => `<circle cx="${W - 150 + i * 30}" cy="98" r="8" fill="${n === page ? ORANGE : CREAM}" opacity="${n === page ? 1 : 0.35}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BLUE}"/>
  <circle cx="${W + 60}" cy="-40" r="400" fill="${CREAM}" opacity="0.07"/>
  <circle cx="-120" cy="${H - 180}" r="480" fill="${TEAL}" opacity="0.5"/>
  <image x="80" y="62" width="72" height="72" href="${logo}"/>
  <text x="170" y="112" font-family="${FONT}" font-size="40" font-weight="700" fill="${CARD}">Evolution</text>
  ${dots}
  ${inner}
  ${footnote ? `<text x="80" y="${H - 60}" font-family="${FONT}" font-size="24" fill="${CREAM}" opacity="0.75">${esc(footnote)}</text>` : ""}
</svg>`;
}

const lines = (arr, x, y, size, gap, opts = {}) =>
  arr
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="${opts.weight ?? 700}" fill="${(opts.colors ?? [])[i] ?? opts.color ?? CARD}"${opts.anchor ? ` text-anchor="${opts.anchor}"` : ""}>${esc(l)}</text>`
    )
    .join("");

// A cream "receipt" card with rows of label / amount.
function receipt(x, y, w, rows, title) {
  const h = 110 + rows.length * 74;
  // Torn bottom edge: zigzag from the right corner back to the left.
  const n = 12, step = w / n;
  const teeth = Array.from({ length: n }, (_, i) => `L${x + w - i * step - step / 2} ${y + h + 22} L${x + w - (i + 1) * step} ${y + h}`).join(" ");
  return `
  <path d="M${x} ${y} H${x + w} V${y + h} ${teeth} Z" fill="${CARD}"/>
  <text x="${x + 40}" y="${y + 70}" font-family="${FONT}" font-size="34" font-weight="700" fill="${BLUE}">${esc(title)}</text>
  ${rows
    .map(
      ([label, amount, color], i) => `
  <text x="${x + 40}" y="${y + 140 + i * 74}" font-family="${FONT}" font-size="34" fill="#3a2a1f">${esc(label)}</text>
  <text x="${x + w - 40}" y="${y + 140 + i * 74}" font-family="${FONT}" font-size="34" font-weight="700" fill="${color ?? "#3a2a1f"}" text-anchor="end">${esc(amount)}</text>`
    )
    .join("")}`;
}

const slides = {
  // 1. The hook: forgetting receipts.
  "1-lost-receipts": frame(
    1,
    `${lines(["Forgot the receipt?", "You just paid"], 80, 290, 76, 92)}
     ${lines(["more tax."], 80, 474, 76, 92, { color: ORANGE })}
     ${receipt(
       80,
       560,
       920,
       [
         ["One £20 train ticket a week", "£20"],
         ["Over 46 working weeks", "£920"],
         ["Extra tax and NI you pay", "£239", ORANGE]
       ],
       "No receipt, no claim"
     )}
     ${lines(["Every £1 you can't claim costs you 26p."], 80, 1010, 40, 0, { weight: 400, color: CREAM })}
     ${lines(["Swipe →"], W - 80, 1010, 40, 0, { color: ORANGE, anchor: "end" })}`,
    "Basic-rate taxpayer: 20% income tax + 6% Class 4 NI. Estimates, not tax advice."
  ),

  // 2. Reimbursement that never arrives.
  "2-never-reimbursed": frame(
    2,
    `${lines(["“We'll pay you back.”"], 80, 290, 72, 0)}
     ${lines(["Did they?"], 80, 386, 72, 0, { color: ORANGE })}
     ${receipt(
       80,
       470,
       920,
       [
         ["Fare you paid", "£40.00"],
         ["Promised back", "£40.00"],
         ["Actually received", "£0.00", ORANGE]
       ],
       "Reimbursement: awaiting…"
     )}
     ${lines(
       ["Nobody chases it. Weeks pass.", "And because you expected it back,", "you never claimed it either."],
       80,
       1010,
       38,
       54,
       { weight: 400, color: CREAM }
     )}
     ${lines(["You lose the £40 and the tax relief."], 80, 1190, 40, 0, { color: CARD })}`,
    ""
  ),

  // 3. Partial reimbursement.
  "3-partial-reimbursement": frame(
    3,
    `${lines(["Paid back some of it?", "Claim the wrong amount"], 80, 290, 68, 84)}
     ${lines(["and HMRC can fine you."], 80, 458, 68, 0, { color: ORANGE })}
     ${receipt(
       80,
       540,
       920,
       [
         ["Fare you paid", "£40.00"],
         ["Firm paid you back", "−£15.00"],
         ["You can claim", "£25.00", TEAL],
         ["Claim the full £40?", "Over-claimed", ORANGE]
       ],
       "Partial reimbursement"
     )}
     ${lines(
       ["Over-claiming is an inaccurate return. HMRC", "can add a penalty of up to 30% of the tax."],
       80,
       1130,
       34,
       48,
       { weight: 400, color: CREAM }
     )}`,
    "HMRC penalty for careless errors: up to 30% of the extra tax. Not tax advice."
  ),

  // 4. Why Evolution.
  "4-evolution": frame(
    4,
    `${lines(["Evolution fixes all three."], 80, 270, 66, 0)}
     ${[
       ["Snap it the moment you pay", "Receipt stored with the expense. Nothing lost."],
       ["Mark it “awaiting reimbursement”", "It still counts until paid. Reminders to chase it."],
       ["Record what came back", "Only what you actually paid is claimed."],
       ["Know what to set aside", "Live UK tax and NI estimate, as you go."]
     ]
       .map(
         ([title, sub], i) => `
     <circle cx="112" cy="${386 + i * 158}" r="26" fill="${ORANGE}"/>
     <path d="M100 ${386 + i * 158} l9 10 l17 -20" stroke="${CARD}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <text x="164" y="${398 + i * 158}" font-family="${FONT}" font-size="42" font-weight="700" fill="${CARD}">${esc(title)}</text>
     <text x="164" y="${448 + i * 158}" font-family="${FONT}" font-size="32" fill="${CREAM}">${esc(sub)}</text>`
       )
       .join("")}
     <rect x="80" y="1030" width="920" height="150" rx="40" fill="${ORANGE}"/>
     ${lines(["Built for UK trade plate drivers"], W / 2, 1092, 40, 0, { anchor: "middle" })}
     ${lines(["Coming soon on Android"], W / 2, 1146, 34, 0, { anchor: "middle", weight: 400 })}`,
    "Evolution by APLC Commodities Ltd. Estimates, not tax advice."
  )
};

for (const [name, svg] of Object.entries(slides)) {
  await sharp(Buffer.from(svg)).flatten({ background: BLUE }).png().toFile(path.join(outDir, `${name}.png`));
}
console.log(`Generated in ${outDir}: ${Object.keys(slides).map((n) => `${n}.png`).join(", ")}`);
