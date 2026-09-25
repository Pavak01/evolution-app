export type ParsedIncomeCsvRow = {
  invoiceNumber: string;
  // ISO (YYYY-MM-DD)
  date: string;
  totalAmount: number;
};

export type ParseIncomeCsvResult = {
  rows: ParsedIncomeCsvRow[];
  skippedCount: number;
  error: string | null;
};

const REQUIRED_COLUMNS = ["Invoice Date", "Invoice Number", "Total"];

// Quote-aware split for a single CSV line — handles "..." fields (with ""
// as an escaped quote inside one), which a plain .split(",") would break on.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

// DD/MM/YYYY only — the UK format this app's dates already assume
// throughout, confirmed by the real sample (21/09/2026 can't be MM/DD).
function parseUkDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Targets a fixed, known CSV shape (a self-billed invoice report export,
// e.g. Engineius) rather than arbitrary layouts — if the shape doesn't
// match, this reports an error instead of guessing at columns.
export function parseIncomeCsv(text: string): ParseIncomeCsvResult {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line)
    .filter((line, index, all) => !(line.trim() === "" && index === all.length - 1));

  // Excel's own separator hint line — not part of the actual data.
  const contentLines = lines[0]?.trim().toLowerCase().startsWith("sep=") ? lines.slice(1) : lines;

  const nonEmptyLines = contentLines.filter((line) => line.trim() !== "");
  if (nonEmptyLines.length === 0) {
    return { rows: [], skippedCount: 0, error: "This file is empty." };
  }

  const header = splitCsvLine(nonEmptyLines[0]);
  const columnIndex: Record<string, number> = {};
  header.forEach((name, index) => {
    columnIndex[name] = index;
  });

  const missing = REQUIRED_COLUMNS.filter((column) => !(column in columnIndex));
  if (missing.length > 0) {
    return {
      rows: [],
      skippedCount: 0,
      error: `This CSV doesn't look like a supported income report — missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`
    };
  }

  const rows: ParsedIncomeCsvRow[] = [];
  let skippedCount = 0;

  for (const line of nonEmptyLines.slice(1)) {
    const fields = splitCsvLine(line);
    const invoiceNumber = fields[columnIndex["Invoice Number"]]?.trim() ?? "";
    const date = parseUkDate(fields[columnIndex["Invoice Date"]] ?? "");
    const totalAmount = Number(fields[columnIndex["Total"]]);

    if (!invoiceNumber || !date || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      skippedCount += 1;
      continue;
    }

    rows.push({ invoiceNumber, date, totalAmount });
  }

  return { rows, skippedCount, error: null };
}
