import PDFDocument from "pdfkit";
import { humanizeCategory } from "./categoryDisplay.js";

// The readable tax-year report (Export → "Tax year report (PDF)"). Built
// from exactly the same payload as the CSV export, so the two can never
// disagree; only the layout differs.

type ExportPayload = {
  tax_year: string;
  totals: { total_income: number; total_expenses: number; net_profit: number };
  planning_estimates_not_for_return: { estimated_income_tax: number; estimated_ni: number };
  self_assessment_sa103s_boxes: { box: string; label: string; total: number }[];
  pending_receipt_note: string | null;
  income_line_items: { source: string; period_start: string; period_end: string; received_date: string; total_amount: number; notes: string | null }[];
  expense_line_items: {
    occurred_at: string;
    category: string;
    sa103s_box: string;
    sa103s_box_label: string;
    total_amount: number;
    reimbursed_amount: number;
    net_deductible_amount: number;
    business_use_percent: number;
    counted_in_return: boolean;
    notes: string | null;
  }[];
};

export type ReportContext = {
  email: string;
  generatedAt: Date;
  lockedAt: string | null;
  niClass2: number;
  niClass4: number;
  totalToSetAside: number;
};

const BLUE = "#2f566f";
const ORANGE = "#d0703f";
const TEXT = "#2a1f17";
const MUTED = "#7b624d";
const RULE = "#e6d9c8";
const BAND = "#f5ede1";

const PAGE_MARGIN = 48;

// Matches the app (mobile/src/utils/money.ts): "£20,000.00", "-£147.97".
function gbp(amount: number): string {
  const pennies = Math.round(Math.abs(amount) * 100);
  const pounds = Math.floor(pennies / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount < 0 && pennies > 0 ? "-" : ""}£${pounds}.${String(pennies % 100).padStart(2, "0")}`;
}

function ukDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// The built-in PDF fonts only cover Western European characters; anything
// else (emoji, other scripts) in user-typed text would print as junk.
function safe(text: string | null | undefined): string {
  return (text ?? "").replace(/[^\x20-\x7e -ÿ£€–—‘’“”•…]/g, "").trim();
}

type Column = { header: string; width: number; align?: "left" | "right" };

export function buildTaxYearReportPdf(payload: ExportPayload, ctx: ReportContext): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true, info: { Title: `Evolution tax year report ${payload.tax_year}`, Author: "Evolution" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = PAGE_MARGIN;
  const width = doc.page.width - PAGE_MARGIN * 2;
  const bottom = () => doc.page.height - PAGE_MARGIN - 24; // room for the footer

  const ensureSpace = (needed: number): void => {
    if (doc.y + needed > bottom()) doc.addPage();
  };

  const heading = (text: string): void => {
    ensureSpace(60);
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(BLUE).text(text, left, doc.y);
    doc.moveTo(left, doc.y + 3).lineTo(left + 40, doc.y + 3).lineWidth(2).strokeColor(ORANGE).stroke();
    doc.moveDown(0.8);
  };

  // Label on the left, value on the right, light rule under each.
  const keyValue = (label: string, value: string, opts: { bold?: boolean; note?: string } = {}): void => {
    ensureSpace(22);
    const y = doc.y;
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10.5).fillColor(TEXT);
    doc.text(label, left, y, { width: width * 0.7 });
    const labelBottom = doc.y;
    doc.text(value, left, y, { width, align: "right" });
    doc.y = Math.max(labelBottom, doc.y);
    if (opts.note) doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(opts.note, left, doc.y, { width: width * 0.7 });
    doc.moveTo(left, doc.y + 4).lineTo(left + width, doc.y + 4).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.y += 8;
  };

  const table = (columns: Column[], rows: string[][], opts: { dim?: boolean[]; totalRow?: string[] } = {}): void => {
    const drawHeader = (): void => {
      const y = doc.y;
      doc.rect(left, y, width, 18).fill(BAND);
      let x = left;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(BLUE);
      for (const col of columns) {
        doc.text(col.header, x + 4, y + 5, { width: col.width - 8, align: col.align ?? "left", lineBreak: false });
        x += col.width;
      }
      doc.y = y + 22;
    };
    ensureSpace(44);
    drawHeader();
    const drawRow = (cells: string[], { bold = false, dim = false } = {}): void => {
      const font = (): void => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      };
      font();
      const heights = cells.map((cell, i) => doc.heightOfString(cell, { width: columns[i].width - 8 }));
      const rowHeight = Math.max(...heights) + 6;
      if (doc.y + rowHeight > bottom()) {
        doc.addPage();
        drawHeader();
        font(); // the header left the bold font set
      }
      const y = doc.y;
      let x = left;
      doc.fillColor(dim ? MUTED : TEXT);
      cells.forEach((cell, i) => {
        doc.text(cell, x + 4, y + 2, { width: columns[i].width - 8, align: columns[i].align ?? "left" });
        x += columns[i].width;
      });
      doc.moveTo(left, y + rowHeight).lineTo(left + width, y + rowHeight).lineWidth(0.5).strokeColor(RULE).stroke();
      doc.y = y + rowHeight + 2;
    };
    rows.forEach((cells, i) => drawRow(cells, { dim: opts.dim?.[i] }));
    if (opts.totalRow) drawRow(opts.totalRow, { bold: true });
  };

  // ── Header band ────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 92).fill(BLUE);
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#fff9f1").text("Evolution", left, 26);
  doc.font("Helvetica").fontSize(11).fillColor("#f5ede1").text(`Tax year report ${payload.tax_year} (6 April to 5 April)`, left, 56);
  doc.rect(left, 82, 40, 3).fill(ORANGE);
  doc.y = 110;

  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
  doc.text(`Account: ${safe(ctx.email)}`, left, doc.y);
  doc.text(`Produced: ${ukDate(ctx.generatedAt.toISOString())} at ${ctx.generatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`);
  doc.text(ctx.lockedAt ? `Status: locked as filed on ${ukDate(ctx.lockedAt)}` : "Status: not locked (figures can still change)");

  // ── Summary ────────────────────────────────────────────────────────────
  heading("Summary");
  keyValue("Total income", gbp(payload.totals.total_income));
  keyValue("Allowable expenses", gbp(payload.totals.total_expenses));
  keyValue("Net profit", gbp(payload.totals.net_profit), { bold: true });

  heading("Tax to set aside (estimate)");
  keyValue("Income tax", gbp(payload.planning_estimates_not_for_return.estimated_income_tax));
  keyValue("National Insurance Class 2", gbp(ctx.niClass2));
  keyValue("National Insurance Class 4", gbp(ctx.niClass4));
  keyValue("Total to set aside", gbp(ctx.totalToSetAside), { bold: true });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Planning estimates to help you put money aside. They are not figures for the return.", left, doc.y, { width });

  // ── SA103S boxes ───────────────────────────────────────────────────────
  heading("Self Assessment (SA103S) expense boxes");
  if (payload.self_assessment_sa103s_boxes.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("No allowable expenses recorded for this tax year.", left, doc.y);
  } else {
    const boxes = [...payload.self_assessment_sa103s_boxes].sort((a, b) => a.box.localeCompare(b.box, "en", { numeric: true }));
    table(
      [
        { header: "Box", width: width * 0.75 },
        { header: "Total", width: width * 0.25, align: "right" }
      ],
      boxes.map((b) => [b.label, gbp(b.total)]),
      { totalRow: ["Total allowable expenses", gbp(payload.totals.total_expenses)] }
    );
  }
  if (payload.pending_receipt_note) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(ORANGE).text(payload.pending_receipt_note.replace(" below", ""), left, doc.y, { width });
  }

  // ── Income ─────────────────────────────────────────────────────────────
  heading(`Income (${payload.income_line_items.length})`);
  if (payload.income_line_items.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("No income recorded for this tax year.", left, doc.y);
  } else {
    table(
      [
        { header: "Received", width: width * 0.14 },
        { header: "Who paid", width: width * 0.26 },
        { header: "Period", width: width * 0.26 },
        { header: "Notes", width: width * 0.18 },
        { header: "Amount", width: width * 0.16, align: "right" }
      ],
      payload.income_line_items.map((i) => [
        ukDate(i.received_date),
        safe(i.source),
        i.period_start === i.period_end ? ukDate(i.period_start) : `${ukDate(i.period_start)} to ${ukDate(i.period_end)}`,
        safe(i.notes),
        gbp(i.total_amount)
      ]),
      { totalRow: ["", "Total income", "", "", gbp(payload.totals.total_income)] }
    );
  }

  // ── Expenses, grouped by box ───────────────────────────────────────────
  heading(`Expenses (${payload.expense_line_items.length})`);
  if (payload.expense_line_items.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("No expenses recorded for this tax year.", left, doc.y);
  } else {
    const groups = new Map<string, { label: string; items: ExportPayload["expense_line_items"] }>();
    for (const item of payload.expense_line_items) {
      const group = groups.get(item.sa103s_box) ?? { label: item.sa103s_box_label, items: [] };
      group.items.push(item);
      groups.set(item.sa103s_box, group);
    }
    const columns: Column[] = [
      { header: "Date", width: width * 0.13 },
      { header: "Category", width: width * 0.19 },
      { header: "Notes", width: width * 0.22 },
      { header: "Paid", width: width * 0.12, align: "right" },
      { header: "Use", width: width * 0.09, align: "right" },
      { header: "Reimbursed", width: width * 0.12, align: "right" },
      { header: "Claimable", width: width * 0.13, align: "right" }
    ];
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
    for (const [, group] of sorted) {
      ensureSpace(70);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT).text(group.label, left, doc.y);
      doc.moveDown(0.3);
      const counted = group.items.filter((i) => i.counted_in_return).reduce((sum, i) => sum + i.net_deductible_amount, 0);
      table(
        columns,
        group.items.map((i) => [
          ukDate(i.occurred_at),
          safe(humanizeCategory(i.category)),
          i.counted_in_return ? safe(i.notes) : `${safe(i.notes)}${i.notes ? " " : ""}(awaiting receipt, not counted)`,
          gbp(i.total_amount),
          `${i.business_use_percent}%`,
          i.reimbursed_amount > 0 ? gbp(i.reimbursed_amount) : "",
          gbp(i.net_deductible_amount)
        ]),
        { dim: group.items.map((i) => !i.counted_in_return), totalRow: ["", "Subtotal", "", "", "", "", gbp(Math.round(counted * 100) / 100)] }
      );
      doc.moveDown(0.6);
    }
  }

  // ── Footer on every page ───────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // The footer sits inside the bottom margin; without this pdfkit would
    // treat it as overflow and start a new page.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - PAGE_MARGIN + 6;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text("Estimates to help you plan, not tax advice. You are responsible for your own tax return.", left, y, { width: width * 0.8, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left, y, { width, align: "right", lineBreak: false });
  }

  doc.end();
  return done;
}
